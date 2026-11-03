import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const HARNESS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = path.resolve(HARNESS_DIR, '..');

const AgentLimits = z.object({
  maxTurns: z.number().int().positive(),
  timeoutMinutes: z.number().positive(),
});

export const ConfigSchema = z.object({
  linearTeam: z.string().min(1),
  repo: z.string().regex(/^[^/]+\/[^/]+$/),
  baseBranch: z.string().default('main'),
  worktreeDir: z.string().default('../systemlab-agent'),
  claudePath: z.string().default('claude'),
  model: z.string().default('sonnet'),
  maxAttempts: z.number().int().positive().default(3),
  maxReviewRounds: z.number().int().positive().default(3),
  ciTimeoutMinutes: z.number().positive().default(20),
  implement: AgentLimits,
  review: AgentLimits.default({ maxTurns: 60, timeoutMinutes: 20 }),
  branchTypeByLabel: z.record(z.string(), z.string()).default({}),
  defaultBranchType: z.string().default('feat'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(file = path.join(HARNESS_DIR, 'harness.config.json')): Config {
  return ConfigSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

/** Absolute path of the git worktree the agents work in. */
export function worktreePath(config: Config): string {
  return path.resolve(REPO_ROOT, config.worktreeDir);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境變數 ${name} 未設定`);
  return value;
}
