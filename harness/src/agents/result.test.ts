import { extractAgentResult, parseClaudeOutput } from './result';

const claudeOutput = (result: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result,
    session_id: 'abc',
    num_turns: 3,
    duration_ms: 1000,
    ...extra,
  });

describe('parseClaudeOutput', () => {
  it('解析 claude -p --output-format json 的輸出', () => {
    const parsed = parseClaudeOutput(`${claudeOutput('hi')}\n`);
    expect(parsed).toMatchObject({ ok: true, value: { session_id: 'abc', num_turns: 3 } });
  });

  it('前面有其他輸出時取最後一行', () => {
    expect(parseClaudeOutput(`warning: something\n${claudeOutput('hi')}`).ok).toBe(true);
  });

  it('非 JSON 輸出回傳錯誤', () => {
    expect(parseClaudeOutput('Error: not logged in')).toMatchObject({ ok: false });
  });
});

describe('extractAgentResult', () => {
  it('T1: 取最後一個 json 區塊並補上預設值', () => {
    const text = '說明\n```json\n{"status":"blocked","summary":"舊的"}\n```\n完成\n```json\n{"status":"done","summary":"新增 dag"}\n```';
    expect(extractAgentResult(text)).toEqual({
      ok: true,
      value: { status: 'done', summary: '新增 dag', next_step: '', created_issues: [], assumptions: [] },
    });
  });

  it('summary 為陣列時轉成條列字串（YOU-10 實際案例）', () => {
    const result = extractAgentResult('```json\n{"status":"done","summary":["新增 dag.ts","新增測試"]}\n```');
    expect(result).toMatchObject({ ok: true, value: { summary: '- 新增 dag.ts\n- 新增測試' } });
  });

  it('T3: 最後輸出不是合法 JSON 時回傳格式錯誤', () => {
    const result = extractAgentResult('```json\n{status: done}\n```');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('不是合法 JSON');
  });

  it('T3: status 不在允許的值內時回傳欄位錯誤', () => {
    const result = extractAgentResult('```json\n{"status":"finished","summary":"x"}\n```');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('欄位不符');
  });

  it('T3: 沒有輸出時回傳錯誤', () => {
    expect(extractAgentResult(undefined).ok).toBe(false);
  });
});
