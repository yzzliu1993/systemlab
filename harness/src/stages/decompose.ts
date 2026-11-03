import { worktreePath } from '../config';
import { prepareWorktree } from '../git/worktree';
import { HandoffStore } from '../handoff';
import { LABELS } from '../linear/client';
import { log } from '../log';
import { loadPrompt, renderTemplate } from '../prompts';
import { checkTicket } from '../ticket';
import { describeFailure, runAgent, stopForHuman, type Deps, type StageContext } from './common';

export const DECOMPOSE_TOOLS = {
  allowed: [
    'Read', 'Glob', 'Grep', 'Bash(git log*)',
    'mcp__linear__get_issue', 'mcp__linear__list_issues', 'mcp__linear__save_issue',
  ],
  disallowed: ['Edit', 'Write', 'NotebookEdit'],
};

/** Decompose 只讀程式碼，在 worktree 中使用一個不會 push 的本機分支。 */
const DECOMPOSE_BRANCH = 'harness/decompose';
const MAX_CHILDREN = 8;

export type DecomposeResult = 'decomposed' | 'promoted' | 'stopped';

/**
 * Decompose 階段（HARNESS_SPEC §4.1）：把 Backlog 母票拆成符合 §2.3 的 Todo 子票。
 * 母票本身夠小時改寫母票內容並移到 Todo。
 */
export async function decompose(deps: Deps, identifier: string): Promise<DecomposeResult> {
  const { config, linear } = deps;
  const ticket = await linear.getTicket(identifier);
  const store = new HandoffStore(linear, ticket);
  const previous = await store.load();
  await store.init('');
  const ctx: StageContext = { deps, ticket, store };
  const cwd = worktreePath(config);
  const template = loadPrompt('decompose');
  let interrupted = previous?.inFlight?.stage === 'decompose' ? previous.inFlight : undefined;

  await linear.addLabel(ticket, LABELS.working);
  await store.save({ stage: 'decompose', nextStep: '拆解成子票' });
  log({ ticket: identifier, event: 'claim', stage: 'decompose' });

  for (let attempt = store.value!.attempt + 1; attempt <= config.maxAttempts; attempt++) {
    await prepareWorktree(cwd, DECOMPOSE_BRANCH, config.baseBranch);
    const prompt = renderTemplate(template, {
      baseBranch: config.baseBranch,
      team: config.linearTeam,
      identifier,
      title: ticket.title,
      url: ticket.url,
      description: ticket.description,
      maxChildren: MAX_CHILDREN,
    });
    const outcome = await runAgent(ctx, 'decompose', attempt, {
      prompt,
      cwd,
      allowedTools: DECOMPOSE_TOOLS.allowed,
      disallowedTools: DECOMPOSE_TOOLS.disallowed,
      maxTurns: config.decompose.maxTurns,
      timeoutMinutes: config.decompose.timeoutMinutes,
    }, interrupted && { sessionId: interrupted.sessionId, reason: 'harness 程式被中斷' });
    interrupted = undefined;

    if (outcome.kind !== 'ok') {
      await store.save({ attempt, lastError: describeFailure(outcome) });
      continue;
    }
    const result = outcome.result;
    if (result.status === 'blocked') {
      await stopForHuman(ctx, 'decompose', `母票需要釐清後才能拆解：\n\n${result.blocked_reason ?? result.summary}`);
      return 'stopped';
    }

    // 不拆：agent 已改寫母票內容，確認格式後移到 Todo。
    if (result.created_issues.length === 0) {
      const rewritten = await linear.getTicket(identifier);
      const check = checkTicket(rewritten.description);
      if (!check.ok) {
        await store.save({ attempt, lastError: `母票未拆解，但內容缺少：${check.missing.join('、')}` });
        continue;
      }
      await linear.setState(rewritten, 'Todo');
      await linear.removeLabel(rewritten, LABELS.working);
      await store.save({ stage: 'done', attempt: 0, inFlight: undefined, nextStep: '已移到 Todo', done: [result.summary] });
      await linear.comment(rewritten, `🧩 **不需拆解**，已改寫為可實作的格式並移到 Todo。\n\n${result.summary}`);
      log({ ticket: identifier, event: 'state_change', stage: 'decompose', status: 'promoted to Todo' });
      return 'promoted';
    }

    const problems: string[] = [];
    for (const childId of result.created_issues) {
      const child = await linear.getTicket(childId);
      if (child.stateName !== 'Todo') await linear.setState(child, 'Todo');
      const check = checkTicket(child.description);
      if (!check.ok) {
        problems.push(`${childId} 缺少：${check.missing.join('、')}`);
        await linear.addLabel(child, LABELS.needsHuman);
      }
    }

    await linear.addLabel(ticket, LABELS.decomposed);
    await linear.removeLabel(ticket, LABELS.working);
    await store.save({ stage: 'done', attempt: 0, inFlight: undefined, nextStep: '子票已建立', done: [result.summary] });
    const warning = problems.length ? `\n\n⚠️ 以下子票格式不完整，已加上 \`${LABELS.needsHuman}\`：\n${problems.map((p) => `- ${p}`).join('\n')}` : '';
    await linear.comment(ticket, `🧩 **已拆解成 ${result.created_issues.length} 張子票**\n\n${result.summary}${warning}`);
    log({ ticket: identifier, event: 'state_change', stage: 'decompose', status: `decomposed into ${result.created_issues.join(', ')}` });
    return 'decomposed';
  }

  await stopForHuman(ctx, 'decompose', `Decompose 已失敗 ${config.maxAttempts} 次。最後的錯誤：\n\n${store.value!.lastError ?? ''}`);
  return 'stopped';
}
