import path from 'node:path';
import { HARNESS_DIR, type Config } from '../config';
import { run } from '../proc';
import { extractAgentResult, parseClaudeOutput, type AgentResult, type ClaudeOutput } from './result';

export interface ClaudeRunOptions {
  prompt: string;
  cwd: string;
  allowedTools: string[];
  disallowedTools?: string[];
  maxTurns: number;
  timeoutMinutes: number;
  resumeSessionId?: string;
}

export type ClaudeRunOutcome =
  | { kind: 'ok'; output: ClaudeOutput; result: AgentResult }
  | { kind: 'timeout'; stderr: string }
  | { kind: 'failed'; error: string; output?: ClaudeOutput }
  /** Agent 正常結束，只有結果 JSON 格式不符；可用 --resume 請它重新輸出。 */
  | { kind: 'bad_result'; error: string; output: ClaudeOutput };

const RESULT_FIX_TURNS = 3;

function resultFixPrompt(error: string): string {
  return [
    '你最後輸出的結果 JSON 無法解析，錯誤如下：',
    '',
    error,
    '',
    '不要再修改任何程式碼或執行任何指令。只需要依照原本要求的格式，重新輸出一個 ```json 區塊。',
    '`summary`、`next_step` 必須是字串；`created_issues`、`assumptions` 必須是字串陣列。',
  ].join('\n');
}

/** 子行程的環境變數：移除 API key，確保使用訂閱方案而非按量計費（HARNESS_SPEC §9）。 */
export function agentEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;
  return env;
}

export function buildClaudeArgs(config: Config, options: ClaudeRunOptions): string[] {
  const args = [
    '-p',
    '--output-format', 'json',
    '--model', config.model,
    '--max-turns', String(options.maxTurns),
    '--mcp-config', path.join(HARNESS_DIR, 'mcp.json'),
    '--strict-mcp-config',
  ];
  if (options.allowedTools.length) args.push('--allowedTools', options.allowedTools.join(','));
  if (options.disallowedTools?.length) args.push('--disallowedTools', options.disallowedTools.join(','));
  if (options.resumeSessionId) args.push('--resume', options.resumeSessionId);
  return args;
}

/** 以 headless 模式執行 claude，prompt 由 stdin 傳入以避開命令列長度與轉義問題。 */
export async function runClaude(config: Config, options: ClaudeRunOptions): Promise<ClaudeRunOutcome> {
  const result = await run(config.claudePath, buildClaudeArgs(config, options), {
    cwd: options.cwd,
    input: options.prompt,
    env: agentEnv(),
    timeoutMs: options.timeoutMinutes * 60_000,
  });
  if (result.timedOut) return { kind: 'timeout', stderr: result.stderr };

  const output = parseClaudeOutput(result.stdout);
  if (!output.ok) return { kind: 'failed', error: `${output.error}\n${result.stderr}`.trim() };
  if (output.value.is_error || output.value.subtype !== 'success') {
    return {
      kind: 'failed',
      error: `claude 結束狀態 ${output.value.subtype}：${output.value.result ?? ''}`,
      output: output.value,
    };
  }

  const agentResult = extractAgentResult(output.value.result);
  if (!agentResult.ok) return { kind: 'bad_result', error: agentResult.error, output: output.value };
  return { kind: 'ok', output: output.value, result: agentResult.value };
}

/**
 * 執行 agent；若只是結果格式錯誤，接續同一個 session 請它重新輸出一次，
 * 避免為了格式問題把整個任務重做（實際案例：YOU-10 第 1 次嘗試）。
 */
export async function runClaudeWithResultFix(config: Config, options: ClaudeRunOptions): Promise<ClaudeRunOutcome> {
  const first = await runClaude(config, options);
  if (first.kind !== 'bad_result') return first;
  const fixed = await runClaude(config, {
    ...options,
    prompt: resultFixPrompt(first.error),
    allowedTools: [],
    disallowedTools: undefined,
    maxTurns: RESULT_FIX_TURNS,
    timeoutMinutes: 5,
    resumeSessionId: first.output.session_id,
  });
  return fixed.kind === 'ok' ? fixed : first;
}
