# HARNESS_SPEC v3：Linear × GitHub × Claude Code 開發流程

> v3 改為 **Claude Code 原生架構**：Claude Code 主 session 擔任 orchestrator，透過 Linear MCP 讀票與改狀態，
> 用 `.claude/agents/` 的 subagent 實作、審查、拆解；流程步驟寫在 `.claude/skills/`。
> v2 的 TypeScript orchestrator（`harness/`、`claude -p`）已移除（YOU-19）。

---

## 0. 目標與非目標

**目標**
- Linear 票從 Backlog 到 In Review 由 Claude Code 推進，人只在指定關卡介入（按 merge、回答問題）。
- 中斷（關掉 session、額度用完、電腦重開）後重新執行同一個指令，會從**實際狀態**（git branch、PR、CI、Linear）接續。
- 規格不明確時採最保守做法並開票問人，而不是猜。

**非目標**
- 多張票平行開發。
- 無人值守的背景常駐程式（需要時用 Claude Code 的 `/loop`，session 必須開著）。
- 部署 / Release。

---

## 1. 角色分工

| 元件 | 是什麼 | 負責 | 不負責 |
|---|---|---|---|
| **主 session**（orchestrator） | 你開的 Claude Code session，執行 `/ticket`、`/next`、`/decompose` | 讀票、改 Linear 狀態與標籤、開 branch、**驗證** subagent 結果、push、開 PR、等 CI、貼 review、開衍生票 | 寫產品程式碼、merge |
| **implementer** | `.claude/agents/implementer.md` | 在 branch 上實作與寫測試、跑 `npm run verify`、commit | push、PR、Linear |
| **reviewer** | `.claude/agents/reviewer.md` | 唯讀審查 diff 是否滿足驗收條件與測試情境 | 修改任何東西 |
| **decomposer** | `.claude/agents/decomposer.md` | 唯讀探索 repo，提出子票拆解 | 建票（由主 session 建） |
| **CI** | GitHub Actions `verify` job | `npm ci && npm run verify` | — |
| **人** | 你 | 開票、決定 `agent-proposed`、回答 `spec-needed`、處理 `needs-human`、**按 merge** | — |

> 核心規則：**subagent 產出結果，主 session 驗證後才推進狀態**。implementer 說完成不算數，主 session 自己跑 verify、等 CI 綠燈。
> Subagent 有獨立 context，實作與審查的大量讀檔不會塞滿主 session；reviewer 看不到 implementer 的思路，審查才獨立。

---

## 2. Linear 設定

### 2.1 狀態
`Backlog → Todo → In Progress → In Review → Done`（另有 `Canceled`）

### 2.2 標籤
| 標籤 | 意義 | 誰加 |
|---|---|---|
| `draft` | 還在寫，不要拆解 | 人 |
| `decomposed` | 已拆解，不再重複拆 | 主 session |
| `awaiting-merge` | Review 通過、CI 綠燈，等人 merge | 主 session |
| `needs-human` | 卡住，需要人處理；流程會跳過此票 | 主 session |
| `spec-needed` | 規格不明確的提問票 | 主 session |
| `agent-proposed` | agent 提出的想法 / 範圍外的 bug | 主 session |

（v2 的 `agent:working` 不再使用，可在 Linear 刪除。）

### 2.3 票券格式（Definition of Ready）
Todo 票必須包含以下段落，缺少時主 session 不實作，加 `needs-human`：

```markdown
## 目標
## 範圍 / 不在範圍內
## 驗收條件
- [ ] ...（每一條都要可被測試驗證）
## 測試情境
| # | 情境 | 前提（Given） | 操作（When） | 預期結果（Then） | 測試類型 |
|---|---|---|---|---|---|
| T1 | 正常流程 | ... | ... | ... | unit / component |
| T2 | 邊界值 | ... | ... | ... | unit |
| T3 | 錯誤處理 | ... | ... | ... | unit |
## 相依票券（blocked by）
```

- 每條驗收條件至少對應一個測試情境；情境至少涵蓋正常流程、邊界值、錯誤處理各一。
- 每個情境都要有測試，名稱以情境編號開頭（`it('T2: 空陣列回傳空結果', ...)`），reviewer 以此對照。

---

## 3. 流程

```
Backlog ──/decompose──▶ decomposer 提案 ──▶ 主 session 建子票到 Todo（母票加 decomposed）

Todo ──/ticket──▶ In Progress ──implementer──▶ verify ──▶ push ──▶ 開 PR ──▶ In Review
                     ▲                                                       │
                     │                                              等 CI ───┤
                     │   CI 失敗 / reviewer 退件 / 人工退件                    │
                     └───────────────────────────────────────── reviewer ◀──┘
                                                                     │ approve
                                                                     ▼
                                                awaiting-merge ──人按 merge──▶ Done
```

步驟細節以 `.claude/skills/ticket/SKILL.md` 為準。

### 3.1 指令
| 指令 | 用途 |
|---|---|
| `/ticket YOU-n` | 處理一張票到 awaiting-merge；重跑會從實際狀態接續 |
| `/next` | 收尾已 merge 的票，再依 §3.3 挑一張票處理 |
| `/decompose YOU-n` | 拆解一張 Backlog 票 |
| `/loop 10m /next` | 定時執行 `/next`（session 開著時有效） |

### 3.2 狀態變更
- Linear 的 GitHub integration：PR 開啟 → In Review、PR merged → Done（Team Settings → Workflow → Pull request automations）。
- 其他轉換由主 session 用 Linear MCP（`save_issue`）執行：Todo → In Progress、開 PR 後再設一次 In Review、退件回 In Progress、標籤與留言。

### 3.3 `/next` 選票順序
1. 收尾：有 `awaiting-merge` 但已 Done / Canceled 的票，移除標籤。
2. 中斷的票：In Progress 且有 `<!-- harness:progress -->` 留言。
3. 人工退件：In Review、沒有 `awaiting-merge`、有進度留言。
4. Todo：blocked-by 都已 Done；priority Urgent → Low，None 最後；同 priority 舊的先。
5. Backlog：沒有 `decomposed`、最後更新超過 30 分鐘、不是 agent 開的票。

一律跳過 `needs-human`、`spec-needed`、`agent-proposed`、`draft`。

### 3.4 通知
需要你處理時（`awaiting-merge`、`needs-human`），主 session 把票**指派給你**並留言。

### 3.5 暫停與介入
- 暫停 `/next`：建立 `.harness/PAUSE`（只會做收尾）。刪除即恢復。
- 不同意 review 結論：在 PR 留言並移除 `awaiting-merge`，再執行 `/ticket YOU-n`（或等 `/next`），會帶著你的意見重工。
- 你可以手動 push 到 agent 的 branch；接續時以遠端為準。

---

## 4. Subagents

| Subagent | 工具 | model | maxTurns |
|---|---|---|---|
| implementer | Read, Edit, Write, Glob, Grep, Bash | sonnet | 150 |
| reviewer | Read, Glob, Grep, Bash（只用唯讀 git 指令） | sonnet | 60 |
| decomposer | Read, Glob, Grep | sonnet | 40 |

- 每個 subagent 的最後一則訊息以 json 區塊結尾（格式見各自的定義檔），主 session 依此判斷下一步。
- Linear 只由主 session 操作，subagent 不呼叫 Linear 工具。
- 禁止事項（寫在 `CLAUDE.md` 與 subagent 定義，建議另以 `.claude/settings.json` 的 `permissions.deny` 強制）：`gh pr merge`、`git push --force`、push 到 `main`、`git reset --hard`。

---

## 5. Git / GitHub

- 預設分支 `main`；branch `<type>/<you-n>/<slug>`；commit `<type>(YOU-n): <說明>`；PR 標題 `[YOU-n] <票標題>`。
- CI：push 時執行 `npm run verify`（job `verify` 為 branch protection 必要檢查，要求與 main 同步）。
- PR 在第一次 push 後就開（票跟著進 In Review），之後的 CI 結果與 review 都在同一個 PR。
- Merge 前落後 main：`gh pr update-branch --rebase`，等新 head 的 CI；衝突則由 implementer `git merge origin/main` 解決。
- **人工關卡 = 人按 squash merge**（同一個 GitHub 帳號無法 approve 自己的 PR，review 以 PR 留言呈現）。

---

## 6. 中斷接續

不另存狀態檔，接續時以實際狀態判斷（`/ticket` 步驟 1）：

| 來源 | 用途 |
|---|---|
| 遠端 branch / PR | 程式碼與 PR 是否存在 |
| `gh run` | 最新 commit 的 CI 結果 |
| PR 上的 `<!-- harness:review round=N sha=… verdict=… -->` 留言 | review 輪數、最新 commit 是否已審查、結論 |
| Linear 標籤 | `awaiting-merge`、`needs-human` |
| Linear 上的 `<!-- harness:progress -->` 留言 | 給人看的進度、失敗紀錄（熔斷計數依據） |

- 本機紀錄：Claude Code 的對話紀錄（`claude --resume` 可回到之前的 session）。
- 額度用完：session 會停下，額度恢復後重新執行同一個指令即可接續。
- implementer 只 commit 不 push，中斷時已 commit 的進度在本機 branch；未 commit 的修改留在工作目錄，重跑前需先處理（工作目錄必須乾淨）。

---

## 7. 熔斷

- 同一張票確定性失敗（verify 失敗、CI 失敗、subagent 回傳錯誤）累計 **3 次**，或 review 退件 **3 輪** → 加 `needs-human`、指派給你、留言說明失敗歷程，狀態不動。
- 你處理完移除 `needs-human` 後重跑，失敗次數歸零。

---

## 8. 開新票規則

| 情境 | 開到哪 | 標籤 | 原票怎麼辦 |
|---|---|---|---|
| 規格不明確（預設） | Backlog | `spec-needed` | 用最保守的做法完成，PR「假設」段落列出假設與票號 |
| 規格不明確，且不存在保守做法 | Todo | `spec-needed` | implementer 回傳 `blocked` → 原票 `needs-human`，blocked by 新票 |
| 範圍外的 enhancement / 重構 | Backlog | `agent-proposed` | 不影響 merge |
| 範圍外的 bug | Todo | `agent-proposed` | 不影響 merge |

「最保守的做法」：只做票上寫到的範圍；不改既有公開介面；不新增套件、不改設定檔與資料格式；多種解讀選改動最小的。以上都無法滿足時才算「不存在保守做法」。

防止爆量與辨識：
- 建立前先 `list_issues` 搜尋相似票，有就留言補充。每次執行最多開 3 張。
- agent 開的票內文開頭加 `<!-- harness:created-by-agent source=YOU-n -->`，並一定帶 `agent-proposed` 或 `spec-needed`。
- `agent-proposed` / `spec-needed` 的票不會被自動處理；你移除標籤後才會進入流程。

---

## 9. 專案結構

```
.claude/
  agents/
    implementer.md
    reviewer.md
    decomposer.md
  skills/
    ticket/SKILL.md      # /ticket
    next/SKILL.md        # /next
    decompose/SKILL.md   # /decompose
.github/workflows/ci.yml
CLAUDE.md                # 專案規範（subagent 也會讀）
.harness/PAUSE           # 本機暫停開關（gitignore）
```

---

## 10. 執行環境

| 項目 | 決定 |
|---|---|
| 執行位置 | 本機 Windows 11，在 repo 目錄開 Claude Code |
| 工作目錄 | 主 session 在 repo 目錄直接切 branch；執行前工作目錄必須乾淨 |
| 觸發 | 手動 `/ticket`、`/next`；需要時 `/loop` |
| Claude 計費 | Pro 訂閱；subagent 用 sonnet，主 session 用你選的模型 |
| Merge | 人工 |

### 10.1 一次性設定
1. Linear 標籤（§2.2）、PR automations（§3.2）、GitHub integration 連結 repo。
2. Claude Code 已連上 Linear MCP（`/mcp` 可確認）。
3. `gh auth login`。
4. 建議：Linear 關閉 GitHub issue 同步；開啟「子票全部完成時自動關閉母票」。
