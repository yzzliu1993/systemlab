---
name: ticket
description: 處理一張 Linear 票：讀票 → 開 branch → implementer 實作 → 本地驗證 → push 開 PR → In Review → 等 CI → reviewer 審查 → 等人 merge。中斷後重跑會從實際狀態接續。
argument-hint: <票號，例如 YOU-20>
disable-model-invocation: true
---

# /ticket $ARGUMENTS

你是 orchestrator，負責推進流程與**驗證**結果；寫程式交給 `implementer`、審查交給 `reviewer` subagent。subagent 說「完成」不算數，要你自己確認（verify 通過、CI 綠燈）才推進狀態。完整規格見 `specs/HARNESS_SPEC.md`。

票號：`$ARGUMENTS`（以下稱 `<ID>`，`<id>` 為小寫，例如 `you-20`）。Linear team：`Youzhuliu`；repo：`yzzliu1993/systemlab`。

## 0. 讀票與檢查

1. `mcp__linear__get_issue`（`includeRelations: true`）取得票。
2. 下列情況**停止**，說明原因，不做任何變更：
   - 有 `needs-human`、`spec-needed`、`agent-proposed`、`draft` 標籤。
   - 狀態是 Backlog（提示改用 `/decompose`）、Done、Canceled。
   - 有 blocked-by 的票還沒 Done。
   - 狀態是 In Review 且有 `awaiting-merge`（已在等人 merge）。
3. 狀態是 Todo 時檢查 Definition of Ready：內文要有 `## 目標`、`## 範圍`、`## 驗收條件`、`## 測試情境`（表格至少一列 `T<數字>`）。缺少時：加 `needs-human` 標籤、指派給 `me`、留言列出缺少的段落，然後停止。

## 1. 判斷從哪裡接續

依實際狀態決定，不依賴記憶：

```bash
git fetch origin --prune
git ls-remote --heads origin "*/<id>/*"
gh pr list --state all --search "head:<id>" --json number,state,headRefName,url,headRefOid
```

| 實際狀態 | 從哪一步開始 |
|---|---|
| 沒有遠端 branch | 2（新 branch） |
| 有 branch、沒有 PR | 2（切到既有 branch）→ 3 |
| PR 已 merged | 9（收尾） |
| PR 開著，最新 commit 的 CI 失敗 | 5 失敗處理 |
| PR 開著，最新 commit 尚無 harness review | 5 → 6 |
| PR 開著，harness review 對最新 commit 是 `changes_requested` | 7（重工） |
| PR 開著，harness review 對最新 commit 是 `approve`，但沒有 `awaiting-merge` | **人工退件**：讀取該 review 之後人留的 PR 留言與 review comment（`gh pr view <n> --comments`、`gh api repos/yzzliu1993/systemlab/pulls/<n>/comments`），當作「必須修正」→ 7 |

harness review 的辨識方式：PR 留言開頭為 `<!-- harness:review round=<N> sha=<commit> verdict=<approve|changes_requested> -->`（`gh pr view <n> --json comments`）。round 數 = 已有的 harness review 數。

## 2. 準備 branch

1. 工作目錄必須乾淨（`git status --porcelain` 為空）；不乾淨就停止並告訴使用者，不要 stash 或丟棄。
2. 新 branch：`<type>/<id>/<slug>`。`type` 依標籤：Bug→`fix`、Feature→`feat`、Improvement→`refactor`，其他預設 `feat`；`slug` 為票標題的英文短語（小寫、連字號、最多 5 個字）。
   ```bash
   git switch -c <branch> origin/main
   ```
   既有 branch：`git switch <branch> && git pull --ff-only`。
3. 票若在 Todo：`mcp__linear__save_issue` 設 `state: "In Progress"`、`assignee: "me"`。
4. 更新進度留言（見「進度留言」）。

## 3. 實作

用 Agent 工具呼叫 `implementer` subagent，交辦內容包含：
- 票號、branch 名稱、票的完整內文。
- 重工時：「必須修正」清單或 CI 失敗 log（截取關鍵段落）。

讀取回傳結尾的 json：
- `blocked` → 跳到「交給人」，原因用 `blocked_reason`。
- `done` → 繼續。保留 `summary`、`assumptions`、`tests`、`proposals`。

## 4. 驗證、push、開 PR

1. 自己跑一次 `npm run verify`（不信任 subagent 的回報）。失敗 → 把錯誤輸出交給 implementer 重做，計為一次失敗。
2. 確認有新的 commit（`git log origin/main..HEAD --oneline` 非空），且 `git status --porcelain` 乾淨。
3. `git push -u origin <branch>`（**禁止** `--force`）。
4. 還沒有 PR 時建立：
   ```bash
   gh pr create --base main --head <branch> --title "[<ID>] <票標題>" --body-file <暫存檔>
   ```
   內文包含：Linear 票連結、驗收條件 checklist、implementer 的 `summary`、測試情境對應（`tests`）、`## 假設`（`assumptions`，沒有就寫「無」），結尾加 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`。暫存檔放在 scratchpad 或系統暫存目錄，不要放進 repo。
5. `mcp__linear__save_issue` 設 `state: "In Review"`（Linear 的 PR 連動也會做，這裡再設一次確保正確）。

## 5. 等 CI

```bash
gh run list --branch <branch> --commit $(git rev-parse HEAD) --json databaseId,status,conclusion
gh run watch <databaseId> --exit-status
```

剛 push 時 run 可能還沒出現，等 15 秒再查。`gh run watch` 用 Bash 的 timeout 600000。

- 綠燈 → 6。
- 失敗 → `gh run view <id> --log-failed`，若錯誤看起來是 CI 不穩（網路、runner 問題）先 `gh run rerun <id>` 一次；否則票設回 `In Progress`，把 log 交給 implementer（回到 3），計為一次失敗。

## 6. Review

用 Agent 工具呼叫 `reviewer` subagent，交辦內容：票號、票的完整內文、PR 編號、round 數，第 2 輪以後附上一輪 review 的「必須修正」。

把 reviewer 的 markdown 貼到 PR（`gh pr comment <n> --body-file <暫存檔>`），開頭第一行加上：

```
<!-- harness:review round=<N> sha=<git rev-parse HEAD> verdict=<verdict> -->
## 🤖 Harness Review（第 <N> 輪）
```

- `approve` → 8。
- `changes_requested` → 7。

## 7. 重工

1. 票設回 `In Progress`。
2. 若 PR 落後 main 或有衝突，在交辦內容中要求 implementer 先 `git merge origin/main`。
3. 把「必須修正」交給 implementer → 回到 3（之後 4 會 push 到同一個 PR）。

## 8. 等待 merge

1. 檢查 `gh pr view <n> --json mergeStateStatus`：
   - `BEHIND` → `gh pr update-branch <n> --rebase`，接著 `git fetch origin` 並 `git switch --detach origin/main`（本機 branch 已和遠端分歧，不要 pull），等新的 head 通過 CI（5 的指令，以 `gh pr view <n> --json headRefOid` 取得 sha）。
   - `DIRTY`（衝突）→ 7，要求 implementer `git merge origin/main` 解衝突。
2. `mcp__linear__save_issue`：`state: "In Review"`、`addLabels: ["awaiting-merge"]`、`assignee: "me"`。
3. Linear 留言：「✅ Review 通過、CI 綠燈，等待你 merge：<PR 連結>。不同意的話在 PR 留言並移除 `awaiting-merge`，再執行 `/ticket <ID>`。」
4. `git switch main && git pull --ff-only`。

## 9. 收尾（PR 已 merged）

- 移除 `awaiting-merge`（`removeLabels`）；狀態不是 Done 就設為 Done。
- 進度留言改寫為最終摘要（review 輪數、失敗次數）。
- `git switch main && git pull --ff-only`，刪除本機 branch（`git branch -d <branch>`）。

## 熔斷與交給人

- 同一張票確定性失敗（含進度留言「失敗紀錄」中先前執行留下的次數；人移除 `needs-human` 後歸零）（verify 失敗、CI 失敗、implementer 回傳格式錯誤）累計 **3 次**，或 harness review 累計 **3 輪** `changes_requested` → 交給人。
- 交給人：`addLabels: ["needs-human"]`、`assignee: "me"`、Linear 留言說明每次失敗的原因摘要與下一步建議；狀態不動；`git switch main`。
- 人處理完移除 `needs-human` 後，重新執行 `/ticket <ID>` 會從實際狀態接續。

## 衍生票

implementer / reviewer 的 `proposals` 以及 `assumptions` 中需要人確認的項目，依 `specs/HARNESS_SPEC.md` §8 開票：
- 先用 `mcp__linear__list_issues`（`query`）搜尋相似票，有就留言補充。
- 新票內文開頭加 `<!-- harness:created-by-agent source=<ID> -->`，並帶上 `agent-proposed` 或 `spec-needed` 標籤。
- 每次執行最多開 3 張。

## 進度留言

在票上維護**一則**以 `<!-- harness:progress -->` 開頭的留言（`mcp__linear__list_comments` 找到既有的 id，用 `mcp__linear__save_comment` 的 `id` 更新；沒有才新增）。在 2、4、6、8 與交給人時更新：

```markdown
<!-- harness:progress -->
**Harness 進度**
| 項目 | 內容 |
|---|---|
| 階段 | implement / ci / review / awaiting_merge / done / needs_human |
| Branch | `<branch>` |
| PR | #<n> |
| Review 輪數 | <N> |
| 失敗紀錄 | 1. … |
| 下一步 | … |
```

## 禁止

- `gh pr merge`、`git push --force`、直接 push 到 `main`、`git reset --hard`。
- 自己寫或修改產品程式碼（交給 implementer）。
- 在規格之外改變票的狀態。
