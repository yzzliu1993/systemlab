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

  /** 已存在的 PR 直接回傳，不重複建立（HARNESS_SPEC §6.3）。 */
  async ensurePullRequest(input: { head: string; base: string; title: string; body: string }): Promise<string> {
    const existing = await this.gh(['pr', 'list', '--head', input.head, '--state', 'open', '--json', 'url', '--jq', '.[0].url']);
    if (existing) return existing;
    return this.gh(['pr', 'create', '--head', input.head, '--base', input.base, '--title', input.title, '--body', input.body]);
  }
}
