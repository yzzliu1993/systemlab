import { setTimeout as sleep } from 'node:timers/promises';
import type { Ticket } from '../linear/client';
import { log } from '../log';
import type { Deps } from './common';

export type UpdateBranchOutcome =
  | { kind: 'ready'; sha: string }
  /** 需要回到 Implement 處理（衝突或 CI 失敗），feedback 會交給 agent。 */
  | { kind: 'needs_fix'; feedback: string };

/**
 * Merge 前的收尾檢查（HARNESS_SPEC §5）：分支落後 base 時以 rebase 更新，
 * 並確認更新後的 head 通過 CI。
 */
export async function updateBranch(deps: Deps, ticket: Ticket, prUrl: string): Promise<UpdateBranchOutcome> {
  const { config, github } = deps;
  const id = ticket.identifier;

  let state = await github.pullRequestState(prUrl);
  if (state.mergeState === 'BEHIND') {
    const updated = await github.updateBranch(prUrl);
    log({ ticket: id, event: 'branch_update', stage: 'update_branch', status: updated.ok ? 'rebased' : 'failed',
      error: updated.ok ? undefined : updated.error });
    if (!updated.ok) {
      return { kind: 'needs_fix', feedback: conflictFeedback(config.baseBranch, updated.error) };
    }
    // update-branch 完成後 GitHub 需要幾秒才會反映新的 head。
    const before = state.headSha;
    for (let i = 0; i < 12 && state.headSha === before; i++) {
      await sleep(5_000);
      state = await github.pullRequestState(prUrl);
    }
  }

  if (state.mergeState === 'DIRTY') {
    return { kind: 'needs_fix', feedback: conflictFeedback(config.baseBranch, 'GitHub 回報 PR 與 base 有衝突') };
  }

  const ci = await github.waitForCi(state.headSha, config.ciTimeoutMinutes);
  log({ ticket: id, event: 'ci_result', stage: 'update_branch', status: ci.kind, sha: state.headSha,
    error: ci.kind === 'failure' ? ci.log : undefined });
  if (ci.kind === 'success') return { kind: 'ready', sha: state.headSha };
  return {
    kind: 'needs_fix',
    feedback: ci.kind === 'failure'
      ? `分支更新到最新的 \`${config.baseBranch}\` 後 CI 失敗，log 如下：\n\n\`\`\`\n${ci.log}\n\`\`\``
      : `分支更新後 CI 在 ${config.ciTimeoutMinutes} 分鐘內沒有跑完。`,
  };
}

function conflictFeedback(baseBranch: string, detail: string): string {
  return `分支與最新的 \`${baseBranch}\` 有衝突，無法自動更新（${detail}）。請 merge \`origin/${baseBranch}\` 並解決衝突。`;
}
