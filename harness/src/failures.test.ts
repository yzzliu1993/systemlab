import { classifyFailure, parseQuotaReset, QUOTA_FALLBACK_MS, withRetry } from './failures';

describe('classifyFailure', () => {
  it.each([
    'Claude AI usage limit reached|1793750400',
    "You've hit your limit · resets 3pm (Asia/Taipei)",
    '5-hour limit reached ∙ resets 2am',
  ])('T3: 額度訊息分類為 quota：%s', (message) => {
    expect(classifyFailure(message)).toBe('quota');
  });

  it.each([
    'gh: HTTP 502: Bad Gateway',
    'read ECONNRESET',
    'API Error: 529 {"type":"overloaded_error"}',
    'fetch failed',
  ])('T4: 網路與伺服器錯誤分類為 transient：%s', (message) => {
    expect(classifyFailure(message)).toBe('transient');
  });

  it.each([
    'agent 結果不是合法 JSON',
    'npm run harness:verify 失敗：2 tests failed',
  ])('T5: 一般失敗分類為 deterministic：%s', (message) => {
    expect(classifyFailure(message)).toBe('deterministic');
  });
});

describe('parseQuotaReset', () => {
  const now = new Date(2026, 10, 4, 10, 0); // 2026-11-04 10:00 本機時間
  const minute = 60_000;

  it('T3: Unix 秒格式', () => {
    expect(parseQuotaReset('usage limit reached|1793750400', now).getTime()).toBe(1793750400 * 1000 + minute);
  });

  it('T3: 當天稍晚的時間', () => {
    expect(parseQuotaReset('resets 3pm', now)).toEqual(new Date(2026, 10, 4, 15, 1));
  });

  it('T3: 時間已過則為隔天', () => {
    expect(parseQuotaReset('resets at 9:30 am', now)).toEqual(new Date(2026, 10, 5, 9, 31));
  });

  it('T3: 12am 是午夜', () => {
    expect(parseQuotaReset('resets 12am', now)).toEqual(new Date(2026, 10, 5, 0, 1));
  });

  it('T3: 含日期的每週上限', () => {
    expect(parseQuotaReset('Weekly limit reached ∙ resets Nov 6, 3pm', now)).toEqual(new Date(2026, 10, 6, 15, 1));
  });

  it('T3: 解析不到時預設暫停 30 分鐘', () => {
    expect(parseQuotaReset('usage limit reached', now).getTime()).toBe(now.getTime() + QUOTA_FALLBACK_MS);
  });
});

describe('withRetry', () => {
  const noSleep = () => Promise.resolve();

  it('T4: 暫時性錯誤重試後成功', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('HTTP 502');
        return 'ok';
      },
      { delaysMs: [1, 1, 1], sleep: noSleep },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('T4: 超過重試次數後拋出最後的錯誤', async () => {
    let calls = 0;
    const failing = () => {
      calls++;
      return Promise.reject(new Error('ECONNRESET'));
    };
    await expect(withRetry(failing, { delaysMs: [1, 1], sleep: noSleep })).rejects.toThrow('ECONNRESET');
    expect(calls).toBe(3);
  });

  it('T5: 確定性錯誤不重試', async () => {
    let calls = 0;
    const failing = () => {
      calls++;
      return Promise.reject(new Error('找不到 Linear 狀態'));
    };
    await expect(withRetry(failing, { delaysMs: [1, 1], sleep: noSleep })).rejects.toThrow('找不到');
    expect(calls).toBe(1);
  });
});
