import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../config';
import { run, runOrThrow } from '../proc';

const git = (cwd: string, ...args: string[]) => runOrThrow('git', args, { cwd });

/** 遠端分支的 commit SHA；分支不存在時回傳 undefined。 */
export async function remoteBranchSha(cwd: string, branch: string): Promise<string | undefined> {
  const out = await git(cwd, 'ls-remote', 'origin', `refs/heads/${branch}`);
  return out.split(/\s+/)[0] || undefined;
}

/**
 * 準備 agent 用的 worktree（HARNESS_SPEC §11.2）：
 * 不存在就建立；切到目標分支（遠端已有就接續，否則從 base 開新分支）；清掉未提交的殘留。
 */
export async function prepareWorktree(
  dir: string,
  branch: string,
  baseBranch: string,
  options: { keepLocalChanges?: boolean } = {},
): Promise<void> {
  if (!existsSync(dir)) {
    await git(REPO_ROOT, 'fetch', 'origin', baseBranch);
    await git(REPO_ROOT, 'worktree', 'add', '--detach', dir, `origin/${baseBranch}`);
  }
  await git(dir, 'fetch', 'origin');
  // 接續中斷的 session 時保留尚未 commit 的修改，否則 agent 的進度會被清掉。
  if (options.keepLocalChanges && (await git(dir, 'branch', '--show-current')) === branch) {
    await ensureDependencies(dir);
    return;
  }
  const start = (await remoteBranchSha(dir, branch)) ? `origin/${branch}` : `origin/${baseBranch}`;
  await git(dir, 'checkout', '-B', branch, start);
  await git(dir, 'reset', '--hard', start);
  await git(dir, 'clean', '-fd');
  await ensureDependencies(dir);
}

/** package-lock.json 有變動才重新 `npm ci`。 */
async function ensureDependencies(dir: string): Promise<void> {
  const lockHash = createHash('sha256').update(readFileSync(path.join(dir, 'package-lock.json'))).digest('hex');
  const marker = path.join(dir, 'node_modules', '.harness-lock-hash');
  if (existsSync(marker) && readFileSync(marker, 'utf8') === lockHash) return;
  const result = await run('npm', ['ci'], { cwd: dir, shell: process.platform === 'win32' });
  if (result.code !== 0) throw new Error(`npm ci 失敗：${result.stderr.slice(-2000)}`);
  writeFileSync(marker, lockHash);
}
