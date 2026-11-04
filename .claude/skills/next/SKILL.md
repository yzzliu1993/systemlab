---
name: next
description: 從 Linear 挑出下一張該處理的票並處理到底（收尾已 merge 的票 → 接續中斷的票 → Todo → Backlog 拆解）。可搭配 /loop 定時執行。
disable-model-invocation: true
---

# /next

一次只處理**一張**票。規格見 `specs/HARNESS_SPEC.md` §3。Linear team：`Youzhuliu`。

## 0. 前置檢查

- repo 根目錄有 `.harness/PAUSE` 檔案 → 只做步驟 1 的收尾，回報「已暫停」後結束。
- 工作目錄不乾淨（`git status --porcelain` 非空）→ 回報後結束，不要動使用者的修改。

## 1. 收尾

`mcp__linear__list_issues`（team `Youzhuliu`、`label: "awaiting-merge"`）中狀態為 Done 或 Canceled 的票：移除 `awaiting-merge`，進度留言改寫為最終摘要。全部處理完再繼續。

## 2. 選票（依序，找到第一張就停）

跳過有 `needs-human`、`spec-needed`、`agent-proposed`、`draft` 標籤的票。

1. **中斷的票**：狀態 In Progress，且票上有 `<!-- harness:progress -->` 留言（沒有這則留言的 In Progress 票是人自己在做的，跳過）。
2. **人工退件**：狀態 In Review、沒有 `awaiting-merge`、有 `<!-- harness:progress -->` 留言。
3. **Todo**：狀態 Todo，所有 blocked-by 都已 Done（`get_issue` 的 `includeRelations: true`）。排序：priority 1→4，0（無）最後；同 priority 依建立時間，舊的先。
4. **Backlog 拆解**：狀態 Backlog，沒有 `decomposed` 標籤，最後更新時間超過 30 分鐘前（避免拆到還在寫的票），且內文**沒有** `<!-- harness:created-by-agent` 標記（agent 開的票不自動拆）。

## 3. 執行

- 1～3 → 依 `.claude/skills/ticket/SKILL.md` 的流程處理該票（等同 `/ticket <票號>`）。
- 4 → 依 `.claude/skills/decompose/SKILL.md` 的流程處理（等同 `/decompose <票號>`）。
- 沒有可處理的票 → 回報「目前沒有可處理的票」。

最後用一兩句話回報處理了哪張票與結果。

## 搭配 /loop

`/loop 10m /next` 每 10 分鐘執行一次；`/loop /next` 由 Claude 自行決定間隔。處理一張票可能超過間隔時間，下一輪會在這一輪結束後才開始。
