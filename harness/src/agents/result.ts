import { z } from 'zod';

/** `claude -p --output-format json` 的輸出（只取用到的欄位）。 */
const ClaudeOutputSchema = z.object({
  type: z.literal('result'),
  subtype: z.string(),
  is_error: z.boolean(),
  result: z.string().optional(),
  session_id: z.string(),
  num_turns: z.number(),
  duration_ms: z.number(),
});

export type ClaudeOutput = z.infer<typeof ClaudeOutputSchema>;

/** Agent 最後一則訊息必須輸出的結果（HARNESS_SPEC §4.6）。 */
export const AgentResultSchema = z.object({
  status: z.enum(['done', 'changes_requested', 'approve', 'blocked']),
  summary: z.string(),
  next_step: z.string().default(''),
  created_issues: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  blocked_reason: z.string().optional(),
});

export type AgentResult = z.infer<typeof AgentResultSchema>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseClaudeOutput(stdout: string): Parsed<ClaudeOutput> {
  const lastLine = stdout.trim().split(/\r?\n/).pop() ?? '';
  try {
    const parsed = ClaudeOutputSchema.safeParse(JSON.parse(lastLine));
    return parsed.success
      ? { ok: true, value: parsed.data }
      : { ok: false, error: `claude 輸出格式不符：${parsed.error.message}` };
  } catch {
    return { ok: false, error: `claude 輸出不是 JSON：${lastLine.slice(0, 500)}` };
  }
}

/** 取 agent 回覆中最後一個 ```json 區塊；沒有區塊時嘗試整段當 JSON。 */
export function extractAgentResult(text: string | undefined): Parsed<AgentResult> {
  if (!text) return { ok: false, error: 'agent 沒有輸出任何文字' };
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  const candidate = blocks.length > 0 ? blocks[blocks.length - 1][1] : text;
  let json: unknown;
  try {
    json = JSON.parse(candidate.trim());
  } catch {
    return { ok: false, error: 'agent 結果不是合法 JSON（需以 ```json 區塊輸出）' };
  }
  const parsed = AgentResultSchema.safeParse(json);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: `agent 結果欄位不符：${parsed.error.message}` };
}
