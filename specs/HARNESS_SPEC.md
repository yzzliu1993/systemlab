# HARNESS_SPEC v2：Linear × GitHub × Claude Code 自動開發流程

> 本文件是給 Claude Code 實作 harness 用的規格書。實作時以本文件為準；
> 若本文件有不明確或矛盾之處，**不要自行假設**，依 §8 開立 `spec-needed` 票券。

---

## 0. 目標與非目標

**目標**
- Linear 票券從 Backlog 到 Done 的流程，由 agent 自動推進，人只在指定關卡介入。
- 任何外部中斷（斷線、額度用完、電腦重開、CI 不穩）後，流程能從 **handoff 紀錄**接續，而不是重做或卡死。
- 規範不明確時，系統會「開票問人」，而不是猜。

**非目標（v1 不做）**
- 多張票平行開發（v1 一次只處理一張票，見 §10 Phase 5）。
- 自動修改 `CLAUDE.md` 的自我進化流程。
- 部署 / Release。

---

## 1. 角色分工原則

| 元件 | 是什麼 | 負責 | 不負責 |
|---|---|---|---|
| **Orchestrator** | `harness/src` 的 Node/TS 常駐程式（確定性程式碼） | 輪詢 Linear、認領票、原生連動以外的狀態變更（§3.2）、呼叫 agent、等 CI、開 PR、寫 handoff、重試與熔斷 | 寫程式、判斷程式品質、merge |
| **Agent** | `claude -p` 子行程 | 拆票、實作、測試、review、開衍生票 | **不得改 Linear 狀態、不得 merge、不得 force push** |
| **CI** | GitHub Actions | 跑 `npm run harness:verify` | — |
| **人** | 你 | 開 Backlog 票、決定 `agent-proposed` 要不要做、回答 `spec-needed`、處理 `needs-human`、**按 merge** | — |

> 核心規則：**agent 產出結果，orchestrator 驗證結果後才推進狀態。**
> 例如 Implement agent 說「做完了」不算數，要 orchestrator 確認 branch 已 push、CI 綠燈，才把票移到 In Review。

---

## 2. Linear 設定

### 2.1 狀態（沿用現有）
`Backlog → Todo → In Progress → In Review → Done`（另有 `Canceled`）

### 2.2 標籤（新增）
| 標籤 | 意義 | 誰加 |
|---|---|---|
| `draft` | 還在寫，暫時不要拆解 | 人（選用） |
| `decomposed` | 已拆解完成，不再重複拆 | orchestrator |
| `agent:working` | 正在被 agent 處理（認領鎖） | orchestrator |
| `awaiting-merge` | Review 通過、CI 綠燈，等人按 merge | orchestrator |
| `needs-human` | 流程卡住，需要人處理；orchestrator 會跳過此票 | orchestrator |
| `spec-needed` | 規格或 harness 邊界不明確的提問票 | agent |
| `agent-proposed` | agent 提出的新想法 / enhancement | agent |

### 2.3 票券格式（Definition of Ready）
Todo 票必須包含以下段落，缺少的票 orchestrator 不認領，直接加 `needs-human`：

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

- 每條驗收條件至少對應一個測試情境。
- 測試情境至少涵蓋：正常流程、邊界值、錯誤／例外處理各一。
- Decompose agent 產生的子票必須填好測試情境；人手動開的 Todo 票也適用同樣規則。
- Implement agent 必須為每個情境寫出對應測試，測試名稱以情境編號開頭（例：`it('T2: 空陣列回傳空結果', ...)`），方便 Review 對照。

---

## 3. 狀態機

```
         人開的票（非 agent-proposed）
Backlog ──────────────────────────────▶ [Decompose agent] ──▶ 產生子票到 Todo
                                                               （母票保留在 Backlog，加 decomposed，關聯子票）

Todo ──認領──▶ In Progress ──[Implement agent]──▶ push branch ──▶ 等 CI
                   ▲                                              │
                   │                                   CI 綠 ──▶ 開 PR ──▶ In Review
                   │                                   CI 紅 ──▶ 回 Implement（帶 CI log）
                   │
                   │ changes requested（帶 review 意見）
                   │
In Review ──[Review agent]──▶ approve ──▶ rebase main + 等 CI ──▶ 通知人 ──▶ 人按 squash merge ──▶ Done
```

### 3.1 各轉換的條件

| 轉換 | 觸發條件 | 執行者 |
|---|---|---|
| Backlog → 拆解 | 沒有 `agent-proposed` / `spec-needed` / `draft` / `decomposed` / `needs-human` 標籤，且票最後編輯時間已超過 30 分鐘（避免拆到還在寫的票） | orchestrator 呼叫 Decompose |
| Todo → In Progress | 符合 §2.3、所有 blocked-by 票已 Done、目前沒有 `agent:working` 的票（v1 一次一張；`awaiting-merge` 的票不佔名額） | orchestrator（並加 `agent:working`） |
| In Progress → In Review | branch 已 push、CI 綠燈、PR 已建立 | orchestrator |
| In Review → In Progress | Review agent 回傳 `changes_requested` | orchestrator |
| In Review → 等待 merge | Review agent 回傳 `approve`、rebase 後 CI 綠燈 | orchestrator（移除 `agent:working`、加 `awaiting-merge`、把票指派給你） |
| In Review → Done | 人按 merge | Linear 原生連動；orchestrator 偵測到後移除 `awaiting-merge` |
| 任何 → 加 `needs-human` | 熔斷（§7）或 agent 回傳 `blocked` | orchestrator |

### 3.2 狀態變更的方式
狀態推進以 **Linear 的 GitHub integration 原生連動**為主（Linear → Team Settings → Workflow → Pull request automations），依分支名稱中的票號自動連結：

| GitHub 事件 | Linear 狀態 | 誰觸發事件 |
|---|---|---|
| PR 開啟 | In Review（Linear 預設為 In Progress，需在設定中改為 In Review） | orchestrator 在 CI 綠燈後開 PR |
| PR merged | Done | 人按 merge |

> 實測（YOU-8）：只 push 分支不會觸發狀態變更；Linear 是在 PR 開啟時才連結分支。

原生連動做不到的轉換，由 orchestrator 用 `@linear/sdk` 直接呼叫 Linear API：
- Todo → In Progress（認領當下）
- In Progress → In Review（開 PR 後再設定一次，原生連動設定錯誤時仍能保持正確）
- In Review → In Progress（Review 退件）
- 標籤增減、handoff 留言

> 為什麼 orchestrator 不用 MCP：MCP 是給 Claude session 用的工具，orchestrator 是一般程式，不能直接呼叫。若要經由 MCP 改狀態，就得多啟動一次 `claude -p`，會浪費訂閱額度。且 orchestrator 本來就需要 Linear API 來輪詢票券，改狀態只是多一個呼叫。
> Agent **可以**透過 MCP 改狀態，但規範上禁止（見 §1），以確保狀態只在驗證後才推進。

### 3.3 Todo 認領順序
1. Linear priority（Urgent → Low，None 最後）
2. 同 priority 依建立時間，舊的先

### 3.4 通知你的方式
需要你處理時（`awaiting-merge`、`needs-human`、卡住原票的 `spec-needed`），orchestrator 會**把票指派給你**並留言說明，你會收到 Linear 的通知。
你處理完後把指派人清掉（或移除 `needs-human`），orchestrator 就會接手。

### 3.5 暫停與取消
- 暫停整個系統：在 repo 根目錄建立 `.harness/PAUSE` 檔案；orchestrator 會在目前的 agent 結束後停止認領新票，刪除檔案即恢復。
- 取消單一張票：把票移到 `Canceled`；orchestrator 偵測到後終止該票的 agent、保留 branch 不刪。
- 你手動 push 到 agent 的 branch 是允許的；orchestrator 恢復時以遠端 branch 最新 commit 為準（§6.2）。

---

## 4. Agents

所有 agent 以 `claude -p` 執行，共通參數：

```
<prompt> | claude -p \
  --output-format json \
  --model sonnet \
  --max-turns <見設定> \
  --mcp-config harness/mcp.json --strict-mcp-config \
  --allowedTools "<白名單>" --disallowedTools "<黑名單>"
```

- Prompt 由 `harness/prompts/<agent>.md` 模板加上票券內容組成，經 stdin 傳入（避開 Windows 命令列長度與轉義問題）。
- 權限一律用 `--allowedTools` 白名單控制。**不使用 `--permission-mode plan` 或 `default`**：無頭模式下沒有人能按允許，`default` 會讓需要權限的工具全部被拒；`plan` 則會擋掉寫入。
- prompt 模板放在 `harness/prompts/`。
- 每個 agent **最後一則訊息必須是 §4.6 的 JSON 結果**，orchestrator 以 zod 驗證；格式不符視為失敗。

### 4.1 Decompose
- 輸入：Backlog 票內容、repo 結構、`CLAUDE.md`。
- 做什麼：唯讀探索 repo，把母票拆成符合 §2.3 的子票，用 Linear MCP 建立到 Todo，設定 blocked-by 關係。
- 限制：一張母票最多產生 8 張子票；建立前先搜尋避免重複。
- 子票大小：一張子票應能在一次 Implement 執行內完成（約 300 行以內的變更）。
- 母票本身已經夠小時不拆：agent 把母票內容改寫成 §2.3 格式（補上測試情境），回傳 `done` 並在 summary 說明；orchestrator 檢查格式通過後把母票移到 Todo。
- 結束後 orchestrator 對母票加 `decomposed`，確保不會重複拆解。
- 白名單：`Read, Glob, Grep, mcp__linear__get_issue, mcp__linear__list_issues, mcp__linear__save_issue`

### 4.2 Implement
- 輸入：票內容、handoff 紀錄（若是接續）、上一輪 review 意見或 CI log（若有）。
- 做什麼：在 branch 上實作與寫測試，本地跑 `npm run harness:verify` 通過後 commit 並 push。
- 每完成一個有意義的步驟就 commit + push（WIP 也可以），確保中斷時程式碼不會遺失。
- 白名單：`Read, Glob, Grep, Edit, Write, Bash(npm run *), Bash(npx vitest *), Bash(git status*), Bash(git diff*), Bash(git add *), Bash(git commit *), Bash(git push origin <branch>), mcp__linear__get_issue, mcp__linear__save_issue, mcp__linear__save_comment`
- 禁止：`git push --force`、改 `main`、改 `.github/workflows/`、改 `harness/`、新增或升級套件（需要時回傳 `blocked`）。

### 4.3 Review
- 輸入：票內容（含驗收條件）、PR diff、CI 結果。
- 做什麼：獨立 context 審查。逐條確認驗收條件有對應的實作，且 §2.3 的每個測試情境（T1、T2…）都有對應的測試；缺任何一個即回傳 `changes_requested`。
- 意見以 PR review comment 留下（`gh pr review`）。
- 白名單：`Read, Glob, Grep, Bash(gh pr diff *), Bash(gh pr view *), Bash(gh pr review *), Bash(npm run harness:verify), mcp__linear__get_issue, mcp__linear__list_issues, mcp__linear__save_issue`
- **不做 merge**。拿到 `approve` 後，orchestrator 在 PR 留言貼上 review 摘要，並在 Linear 留言通知「等待人工 merge」，由人按 merge（見 §5）。

### 4.4 開衍生票的規則（所有 agent 共用）
見 §8。

### 4.5 模型與上限（預設值，可在設定檔調整）
| Agent | max-turns | 逾時 |
|---|---|---|
| Decompose | 40 | 15 分 |
| Implement | 120 | 60 分 |
| Review | 60 | 20 分 |

### 4.6 Agent 結果格式
```json
{
  "status": "done | changes_requested | approve | blocked",
  "summary": "做了什麼（給人看）",
  "next_step": "若中斷，下一步該做什麼",
  "created_issues": ["YOU-12"],
  "assumptions": ["規格不明確時採用的假設，會寫進 PR 內文"],
  "blocked_reason": "status=blocked 時必填"
}
```

---

## 5. Git / GitHub 規範

- 預設分支：`main`（不是 master）。
- 分支命名：沿用現有格式 `<type>/<team-key 小寫>-<number>/<slug>`，例：`infr/you-6/set-up-testing-framwork`。`type` ∈ `feat | fix | infr | refactor | docs | test`。
- Commit 訊息需包含票號，例：`feat(YOU-12): add roadmap DAG layout`。
- CI：`.github/workflows/ci.yml`，在任何分支 push 時執行 `npm ci && npm run harness:verify`（job 名稱 `verify`，branch protection 以此為必要檢查）。只用 push 觸發即可：PR 的檢查狀態取自 head commit，不需另外以 `pull_request` 觸發，避免同一個 commit 跑兩次。Node 版本以 `.nvmrc` 為準。
- PR 標題：`[YOU-12] <票標題>`，內文附上票連結與驗收條件 checklist。
- Merge：squash merge，merge 後刪除分支。
- Merge 前一律 rebase 到最新 `main` 並重跑 CI；rebase 衝突 → 回到 Implement 解衝突（計入失敗次數）。
- Branch protection（`main`）：要求 CI 綠燈、禁止直接 push、**不設定「需要 approve 數」**。
- **人工關卡 = 人按 merge**：agent 用的是你自己的 GitHub 帳號，GitHub 不允許 approve 自己的 PR，所以人工審核的方式是由你親自按 squash merge，而不是按 approve。orchestrator 偵測到 PR merged 後收尾（移除 `awaiting-merge`、handoff 改寫為最終摘要、刪分支）。
- 你若不同意 Review 的結論：在 PR 留下 review comment，並移除 `awaiting-merge` 標籤，orchestrator 會把它當成一次退件，帶著你的意見回到 Implement。
- 格式化：專案目前沒有 formatter。v1 不做自動排版；若之後加入，需在 `package.json` 新增 `format` / `format:check` script，並只作用在 `src/`、`harness/`。

---

## 6. Handoff（中斷接續）

### 6.1 Handoff 紀錄
每張處理中的票，在 Linear 上維護**一則**由 orchestrator 編輯的留言（以 `<!-- harness:handoff -->` 開頭辨識，每次更新是編輯同一則，不新增留言），內容：

```yaml
# 位置：程式碼在哪
branch: feat/you-12/roadmap-dag-layout
last_commit: a1b2c3d
pr: 34

# 進度：做到哪
stage: implement          # decompose | implement | wait_ci | review | rebase | awaiting_merge
done:
  - 新增 dag.ts 與 layout 演算法
  - T1、T2 測試通過
next_step: 補 T3（循環偵測）的測試

# 錯誤：失敗了什麼（只放摘要，完整內容見本機 log）
attempt: 2                # 這個 stage 第幾次嘗試（熔斷依據）
last_error: "T3 測試失敗：有循環時預期拋出 CycleError，實際無限遞迴"
error_history:
  - "1: tsc 失敗：dag.ts 第 42 行型別錯誤"
log: .harness/logs/2026-11-04.jsonl

# 接續：怎麼接回去
session_id: 7f3e...       # 最後一次 claude -p 的 session，可用 --resume
heartbeat: 2026-11-04T10:32:00Z
```

- **權威來源 = Linear handoff 留言 + 遠端 git branch**。本機 `.harness/state/<ticket>.json` 只是快取（`.harness/` 加入 `.gitignore`）。
- 錯誤摘要每則限 200 字，`error_history` 最多保留最近 5 筆。
- 寫入時機：每個 stage 開始、agent 結束、CI 結果出來、每 5 分鐘 heartbeat。
- 票到 Done 後，handoff 留言改寫為最終摘要（總嘗試次數、耗時），保留在票上作為紀錄。
- `session_id` 對應的完整對話存在本機 `~/.claude/projects/`，只有這台電腦能 `--resume`；換電腦時改用開新 session 並帶入 handoff。

### 6.2 恢復流程
Orchestrator 啟動時與每次輪詢時：
1. 找出有 `agent:working` 的票。
2. 若 heartbeat 超過 `staleAfterMinutes`（預設 15 分）且沒有活著的子行程 → 視為中斷。
3. 讀 handoff 紀錄，**先比對實際狀態**（branch 是否存在、`last_commit` 是否在遠端、PR 是否已開、CI 是否已跑完），以實際狀態為準修正 stage。
4. 從該 stage 接續：
   - 有 `session_id` 且未過期 → `claude -p --resume <session_id>` 並附「你被中斷了，請從 next_step 繼續」。
   - 否則開新 session，prompt 帶入整份 handoff 紀錄。

### 6.3 冪等性
每個步驟執行前先檢查是否已完成（branch 已存在就不重開、PR 已存在就不重建、已 merge 就直接標 Done），讓「重跑」永遠安全。

### 6.4 失敗分類
| 類型 | 例子 | 處理 | 計入失敗次數 |
|---|---|---|---|
| 暫時性 | 網路錯誤、API 429/529、GitHub/Linear 5xx | 指數退避重試（1→2→4→8 分，最多 5 次） | 否 |
| 額度 | Claude 訂閱用量上限（Pro 方案有每 5 小時的額度窗口，另有每週上限） | 從 `claude -p` 輸出辨識用量上限訊息，解析重置時間；**暫停整個 orchestrator** 直到重置，期間只更新 heartbeat | 否 |
| 電腦休眠 / 關機 | 本機執行的必然狀況 | 重啟後依 §6.2 恢復；子行程在休眠中被斷掉視同逾時，但不計入失敗次數 | 否 |
| CI 不穩 | 同一 commit 重跑一次就過 | 自動重跑一次 CI | 否 |
| 確定性 | 測試失敗、review 退件、rebase 衝突、agent 輸出格式錯 | 帶錯誤資訊回到對應 stage | **是** |
| 逾時 | 超過 §4.5 時間 | 終止子行程，從 handoff 接續 | 是 |

---

## 7. 熔斷

- 同一張票、同一個 stage，確定性失敗累計 **3 次** → 熔斷。
- Review 退件累計 **3 次** → 熔斷。
- 熔斷時：停止處理此票、移除 `agent:working`、加 `needs-human`、在 Linear 留言說明失敗歷程（每次的原因摘要），狀態保持不動。
- 人處理完後移除 `needs-human`，orchestrator 會從 handoff 接續並把失敗次數歸零。

---

## 8. 開新票規則

| 情境 | 開到哪 | 標籤 | 原票怎麼辦 |
|---|---|---|---|
| 規格或 harness 邊界不明確（**預設處理方式**） | Backlog | `spec-needed` | 採用最保守的做法完成，PR 內文「假設」段落列出每個假設與對應的 `spec-needed` 票號 |
| 規格不明確，且**不存在保守做法**（見下方） | Todo | `spec-needed` | agent 回傳 `blocked` → 原票加 `needs-human`，blocked by 新票 |
| Review 發現的 enhancement / 重構想法 | Backlog | `agent-proposed` | 不影響 merge |
| Review 發現的 bug（不在本票範圍） | Todo | `agent-proposed` | 不影響 merge |

「最保守的做法」定義：
- 只做票上明確寫到的範圍，不順手擴充功能。
- 不改既有的公開介面（export 的函式、型別、元件 props）。
- 不新增套件、不改設定檔、不改資料格式或儲存結構。
- 多種解讀時，選改動最小、之後最容易修改的那一種。
- 若以上任何一條都無法滿足（例如票本身就要求新增套件），才算「不存在保守做法」。

防止票券爆量：
- 建立前先用 `list_issues` 搜尋相似標題，有就留言補充，不重開。
- 每次 agent 執行最多開 3 張票。
- `agent-proposed` 的 Backlog 票**不會**被自動拆解。你看過覺得要做，移除 `agent-proposed` 標籤即可，下一輪就會被拆解。
- 所有 agent 開的票都要在內文附上來源票號與發現的情境。

**標籤強制檢查**：agent 透過 MCP 開票時用的是你的 Linear 帳號，所以 Linear 上「建立者」都是你，無法用建立者區分人開的票和 agent 開的票。因此：
- agent 開的票內文開頭必須有 `<!-- harness:created-by-agent source=YOU-12 -->`。
- 每次 agent 執行結束後，orchestrator 查詢執行期間新建立的票，凡是有此標記、或出現在 agent 結果 `created_issues` 裡的票，若缺少 `agent-proposed` / `spec-needed` 標籤就自動補上 `agent-proposed`。
- 執行期間新建、但既沒有標記也不在 `created_issues` 裡的票，視為你自己開的，不處理。

---

## 9. 專案結構

```
harness/
  src/
    index.ts              # CLI 進入點（npm run harness -- run <票號>）           [Phase 1]
    config.ts             # 讀取並以 zod 驗證 harness.config.json                 [Phase 1]
    log.ts                # §9 每日 jsonl log                                     [Phase 1]
    proc.ts               # 子行程執行、逾時終止整個行程樹                        [Phase 1]
    prompts.ts            # prompt 模板載入與變數替換                             [Phase 1]
    ticket.ts             # §2.3 票券格式檢查、§5 分支命名                        [Phase 1]
    agents/result.ts      # claude 輸出與 §4.6 agent 結果解析                     [Phase 1]
    agents/runClaude.ts   # spawn claude -p、移除 API key、組參數                 [Phase 1]
    git/worktree.ts       # §11.2 agent worktree 準備、遠端分支查詢               [Phase 1]
    linear/client.ts      # Linear API（@linear/sdk）                             [Phase 1]
    github/client.ts      # gh CLI 包裝：等 CI、取失敗 log、開 PR                 [Phase 1]
    stages/implement.ts   # Implement 流程                                        [Phase 1]
    stages/review.ts      # Review 流程                                           [Phase 2]
    handoff.ts            # §6 handoff 讀寫與恢復                                 [Phase 3]
    failures.ts           # §6.4 失敗分類、§7 熔斷                                [Phase 3]
    loop.ts               # 主迴圈：恢復 → 認領 → 推進                            [Phase 4]
  prompts/
    implement.md                                                                  [Phase 1]
    review.md                                                                     [Phase 2]
    decompose.md                                                                  [Phase 4]
  mcp.json                # agent 用的 Linear MCP 設定
  harness.config.json     # team、repo、worktree 位置、模型、上限
tsconfig.harness.json     # harness 的型別檢查設定（納入 tsc -b）
.github/workflows/ci.yml
.harness/                 # 本機快取與 log，加入 .gitignore
CLAUDE.md                 # 專案規範（架構分層、測試慣例、禁止事項）
```

- `harness/` 與 `src/` 互不相依（dependency-cruiser 檢查）。harness 測試在 vitest 的 `harness` project 以 node 環境執行。

- Orchestrator 自己呼叫 Linear / GitHub 時用 API（`@linear/sdk`、`gh` CLI），**不透過 MCP**；MCP 只給 agent 用。
- 祕密資訊（`LINEAR_API_KEY`、`GH_TOKEN`）只從環境變數讀取，不寫進設定檔或 log。
- Claude 使用訂閱方案登入（`claude` 已登入的帳號）。orchestrator 啟動子行程時**必須移除 `ANTHROPIC_API_KEY` 環境變數**，否則 `claude -p` 會改用 API key 按量計費。
- Log 以**日期**分檔：`.harness/logs/YYYY-MM-DD.jsonl`（例：`2026-11-04.jsonl`），所有票共用同一天的檔案，每行一筆事件：
  ```json
  {"ts":"2026-11-04T10:32:00Z","ticket":"YOU-12","stage":"implement","attempt":2,"event":"agent_end","status":"done","durationSec":840,"turns":57,"sessionId":"7f3e...","error":null}
  ```
  - 事件種類：`claim`、`agent_start`、`agent_end`、`ci_result`、`state_change`、`error`、`circuit_break`、`quota_pause`、`resume`。
  - CI 失敗的完整 log 與 agent 最後的輸出也寫在 `error` / `output` 欄位（截斷至 20KB）。
  - Agent 的完整對話不另存，用 `sessionId` 到 `~/.claude/projects/` 查。
  - 用票號查詢：`grep '"YOU-12"' .harness/logs/*.jsonl`。
  - 保留 30 天，orchestrator 啟動時清掉更舊的檔案。
- `harness/` 的程式碼需有 vitest 測試，至少涵蓋 `stateMachine`、`handoff` 恢復、`failures` 分類；Linear / GitHub / claude 子行程以 mock 取代。

---

## 10. 實作分期

| Phase | 內容 | 完成標準 |
|---|---|---|
| 0 | `CLAUDE.md`、`ci.yml`、`main` branch protection、Linear 標籤 | PR 會自動跑 `harness:verify` |
| 1 | `runClaude` + Implement：手動指定一張票，跑到 PR 建立、票到 In Review | 一張真實票走完 |
| 2 | Review agent + merge + 退件迴圈 | 一張票從 Todo 走到 Done；退件能回到 Implement |
| 3 | Handoff 與恢復、失敗分類、熔斷 | 在 Implement 中途砍掉 orchestrator，重啟後能接續完成 |
| 4 | 輪詢自動認領 + Decompose | 你在 Backlog 開一張票，無人介入可產生子票並開始實作 |
| 5（之後） | 多票平行（git worktree）、自我進化（覆盤 → `CLAUDE.md` PR） | — |

每個 Phase 完成前**不開始下一個 Phase**。

---

## 11. 執行環境與已定案事項

| 項目 | 決定 |
|---|---|
| Merge 關卡 | 人工按 merge（§5） |
| 執行位置 | 本機 Windows 11，`npm run harness` 前景執行 |
| 觸發方式 | 輪詢，間隔 60 秒，不使用 webhook |
| Claude 計費 | Pro 訂閱（20 美元），共用你平常使用 Claude 的額度 |

### 11.1 Pro 訂閱下的額度策略
- 一次只處理一張票（不平行）。
- 預設使用 Sonnet；`--max-turns` 依 §4.5 設定，避免單一 agent 耗盡額度窗口。
- 每次 agent 執行的耗時與 turn 數記錄在當天 log 的 `agent_end` 事件（§9），作為之後調整上限的依據。
- 可設定「保留額度」：`harness.config.json` 的 `activeHours`（例如只在晚上與你不用電腦時執行），避免和你自己使用 Claude 搶額度。

### 11.2 本機執行注意事項
- 執行期間需關閉 Windows 自動休眠，或接受休眠後由 §6.2 恢復。
- 終止子行程需終止整個行程樹（Windows 上 `claude` 可能再啟動子行程），使用 `taskkill /T /F` 或等效套件。
- `claude -p` 會讀取你的使用者層級設定與 MCP；agent 使用 `--strict-mcp-config` 只載入 `harness/mcp.json`，避免載入不相關的 MCP。
- **Agent 在獨立的 git worktree 工作**：orchestrator 從 repo 主目錄（固定在 `main`）執行，agent 一律在 `../systemlab-agent/` worktree 裡切分支、改程式。
  原因：如果 agent 在 orchestrator 所在的目錄切換分支，`harness/` 的原始碼會跟著變動，orchestrator 等於在執行中被換掉程式碼。
  這也讓你可以在主目錄照常開發，不會和 agent 互相干擾。

### 11.3 Linear 一次性設定（Phase 0）
1. 建立 §2.2 的標籤。
2. Team Settings → Workflow → Pull request automations：「On PR open」設為 In Review、「On PR merge」設為 Done。
3. 建立 Personal API key（Settings → Security & access），設成環境變數 `LINEAR_API_KEY`，給 orchestrator 使用。
4. 確認 GitHub integration 已連結 `yzzliu1993/systemlab`。
