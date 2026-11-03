import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { run, runOrThrow } from '../proc';

const RunSchema = z.object({
  databaseId: z.number(),
  status: z.string(),
  conclusion: z.string().nullable().transform((v) => v ?? ''),
});

export type CiOutcome =
  | { kind: 'success'; runId: number }
  | { kind: 'failure'; runId: number; log: string }
  | { kind: 'timeout' };

const POLL_MS = 20_000;
const MAX_FAILED_LOG = 15_000;

export class GitHub {
  private readonly repo: string;

  constructor(repo: string) {
    this.repo = repo;
  }

  private gh(args: string[]): Promise<string> {
    return runOrThrow('gh', [...args, '--repo', this.repo]);
  }

  /** 等待指定 commit 的 CI 結束。CI 可能晚幾秒才出現，找不到時持續等待直到逾時。 */
  async waitForCi(sha: string, timeoutMinutes: number): Promise<CiOutcome> {
    const deadline = Date.now() + timeoutMinutes * 60_000;
    while (Date.now() < deadline) {
      const raw = await this.gh(['run', 'list', '--commit', sha, '--json', 'databaseId,status,conclusion', '--limit', '1']);
      const runs = z.array(RunSchema).parse(JSON.parse(raw));
      const latest = runs[0];
      if (latest?.status === 'completed') {
        if (latest.conclusion === 'success') return { kind: 'success', runId: latest.databaseId };
        return { kind: 'failure', runId: latest.databaseId, log: await this.failedLog(latest.databaseId) };
      }
      await sleep(POLL_MS);
    }
    return { kind: 'timeout' };
  }

  private async failedLog(runId: number): Promise<string> {
    const result = await run('gh', ['run', 'view', String(runId), '--log-failed', '--repo', this.repo]);
    const text = result.stdout || result.stderr;
    return text.length > MAX_FAILED_LOG ? text.slice(-MAX_FAILED_LOG) : text;
  }

  /** 分支目前開著的 PR URL；沒有時回傳 undefined。 */
  async findOpenPullRequest(head: string): Promise<string | undefined> {
    const url = await this.gh(['pr', 'list', '--head', head, '--state', 'open', '--json', 'url', '--jq', '.[0].url']);
    return url || undefined;
  }

  /** 已存在的 PR 直接回傳，不重複建立（HARNESS_SPEC §6.3）。 */
  async ensurePullRequest(input: { head: string; base: string; title: string; body: string }): Promise<string> {
    const existing = await this.findOpenPullRequest(input.head);
    if (existing) return existing;
    return this.gh(['pr', 'create', '--head', input.head, '--base', input.base, '--title', input.title, '--body', input.body]);
  }

  async commentOnPullRequest(prUrl: string, body: string): Promise<void> {
    await this.gh(['pr', 'comment', String(prNumberFromUrl(prUrl)), '--body', body]);
  }

  /**
   * 取得 PR 可否 merge 的狀態。GitHub 背景計算期間會回傳 UNKNOWN，稍等後重查。
   * 常見值：CLEAN（可 merge）、BEHIND（落後 base）、DIRTY（有衝突）、BLOCKED（必要檢查未通過或未跑完）。
   */
  async pullRequestState(prUrl: string): Promise<{ mergeState: string; headSha: string }> {
    const number = String(prNumberFromUrl(prUrl));
    for (let i = 0; i < 10; i++) {
      const raw = await this.gh(['pr', 'view', number, '--json', 'mergeStateStatus,headRefOid']);
      const pr = z.object({ mergeStateStatus: z.string(), headRefOid: z.string() }).parse(JSON.parse(raw));
      if (pr.mergeStateStatus !== 'UNKNOWN') return { mergeState: pr.mergeStateStatus, headSha: pr.headRefOid };
      await sleep(5_000);
    }
    throw new Error(`PR ${prUrl} 的 merge 狀態持續為 UNKNOWN`);
  }

  /** 以 rebase 方式把 base 的最新變更更新進 PR 分支（在 GitHub 上執行，不需本機 force push）。 */
  async updateBranch(prUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const result = await run('gh', ['pr', 'update-branch', String(prNumberFromUrl(prUrl)), '--rebase', '--repo', this.repo]);
    return result.code === 0 ? { ok: true } : { ok: false, error: (result.stderr || result.stdout).trim() };
  }
}

export function prNumberFromUrl(prUrl: string): number {
  const match = /\/pull\/(\d+)\/?$/.exec(prUrl.trim());
  if (!match) throw new Error(`無法從 PR URL 取得編號：${prUrl}`);
  return Number(match[1]);
}
