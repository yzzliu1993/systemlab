---
name: decompose
description: 把一張 Backlog 票交給 decomposer subagent 拆成符合 Definition of Ready 的 Todo 子票（或改寫成單張 Todo 票），並在 Linear 建立子票與相依關係。
argument-hint: <票號，例如 YOU-16>
disable-model-invocation: true
---

# /decompose $ARGUMENTS

規格見 `specs/HARNESS_SPEC.md` §2.3、§4.1。Linear team：`Youzhuliu`。

## 1. 檢查

`mcp__linear__get_issue`（`includeRelations: true`）。以下情況停止並說明原因：
- 狀態不是 Backlog。
- 有 `decomposed`、`needs-human`、`spec-needed`、`agent-proposed`、`draft` 標籤。

## 2. 拆解

用 Agent 工具呼叫 `decomposer` subagent，交辦內容為票號、標題與完整內文。讀取回傳結尾的 json。

自己檢查每張票的 `description` 符合 Definition of Ready（有 `## 目標`、`## 範圍`、`## 驗收條件`、`## 測試情境` 且至少一列 `T<數字>`）。不符合 → 把問題交回 decomposer 修正一次；仍不符合就交給人（見下方）。

## 3. 寫入 Linear

**`mode: "split"`**
1. 先用 `mcp__linear__list_issues`（`parentId: <母票>`）確認沒有已建立的子票（中斷後重跑時避免重複）。已存在同標題的就沿用。
2. 依陣列順序建立子票：`mcp__linear__save_issue`，`team: "Youzhuliu"`、`state: "Todo"`、`parentId: <母票>`、`blockedBy`：把 `blocked_by` 的索引換成已建立的子票號；內文開頭加上 `<!-- harness:decomposed-from <母票> -->`。
3. 母票：`addLabels: ["decomposed"]`，狀態保持 Backlog；留言列出子票清單、拆解思路與 `questions`。

**`mode: "rewrite"`**
- 母票內文改為 `tickets[0].description`（原內文保留在最下方的 `## 原始描述` 段落），狀態設為 `Todo`，`addLabels: ["decomposed"]`。

**`questions` 非空**：每個問題用 `<!-- harness:created-by-agent source=<母票> -->` 標記開一張 Backlog 票、加 `spec-needed`（最多 3 張，先搜尋避免重複）。

## 交給人

`addLabels: ["needs-human"]`、`assignee: "me"`，留言說明原因。
