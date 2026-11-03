import { branchNameFor, checkTicket } from './ticket';

const complete = `## 目標

做一件事

## 範圍 / 不在範圍內

* 範圍：A

## 驗收條件

- [ ] 條件一

## 測試情境

| \\# | 情境 | 前提 | 操作 | 預期結果 | 類型 |
| -- | -- | -- | -- | -- | -- |
| T1 | 正常流程 | a | b | c | unit |
`;

describe('checkTicket', () => {
  it('T1: 段落齊全的票通過檢查', () => {
    expect(checkTicket(complete)).toEqual({ ok: true, missing: [] });
  });

  it('T2: 缺少測試情境段落時回報缺少的段落', () => {
    const withoutTests = complete.slice(0, complete.indexOf('## 測試情境'));
    expect(checkTicket(withoutTests)).toEqual({ ok: false, missing: ['測試情境'] });
  });

  it('T2: 有測試情境標題但沒有任何 T 編號列時不通過', () => {
    const emptyTable = complete.replace(/^\| T1 .*$/m, '');
    expect(checkTicket(emptyTable).missing).toEqual(['測試情境（至少一列 T1）']);
  });

  it('T2: 空白描述回報所有段落', () => {
    expect(checkTicket(undefined).missing).toEqual(['目標', '範圍', '驗收條件', '測試情境']);
  });
});

describe('branchNameFor', () => {
  const types = { Bug: 'fix', Feature: 'feat' };

  it('依標籤決定類型並去掉 Linear 分支名稱中的票號', () => {
    expect(branchNameFor('YOU-12', 'you-12-roadmap-dag-layout', ['Bug'], types, 'feat'))
      .toBe('fix/you-12/roadmap-dag-layout');
  });

  it('沒有對應標籤時使用預設類型', () => {
    expect(branchNameFor('YOU-9', 'you-9-harness-phase-1', [], types, 'infr')).toBe('infr/you-9/harness-phase-1');
  });

  it('Linear 分支名稱帶使用者前綴時只取最後一段', () => {
    expect(branchNameFor('YOU-3', 'youzhu/you-3-add-login', [], types, 'feat')).toBe('feat/you-3/add-login');
  });

  it('標題無法轉成英數字時使用 task', () => {
    expect(branchNameFor('YOU-4', 'you-4', [], types, 'feat')).toBe('feat/you-4/task');
  });
});
