# systemlab

React 19 + TypeScript + Vite 單頁應用。開發流程由 Claude Code 依 Linear 票推進（`/ticket`、`/next`、`/decompose`），規格見 `specs/HARNESS_SPEC.md`。

<!-- TODO(人填寫): 一到兩句說明這個產品是什麼、給誰用。 -->

## 指令

| 指令 | 用途 |
|---|---|
| `npm run verify` | **提交前必跑**：lint → 型別檢查 → 架構檢查 → 測試，與 CI 相同 |
| `npm run test` | 執行一次全部測試 |
| `npx vitest run <路徑>` | 只跑指定的測試檔 |
| `npm run dev` | 本機開發伺服器 |

## 架構分層

```
src/
  app/             應用程式組裝：路由、全域 provider
  components/      跨 feature 共用的 UI 元件
  features/        各功能的 UI 與邏輯（article-reader、game-arena、roadmap-view）
  domain/          純 TypeScript 領域邏輯（roadmap、game），不依賴 React
  stores/          zustand 狀態
  infrastructure/  storage（IndexedDB / idb）、workers（Web Worker / comlink）
  content/         靜態內容
  test/            測試共用設定
```

依賴規則（`npm run arch:check` 會強制檢查，違反即 CI 失敗）：
- `domain/` **不可** import `components/`、`features/`、`stores/`，也不可 import `react`。
- `infrastructure/` **不可** import `components/`、`features/`。

新邏輯優先放在 `domain/` 寫成純函式，UI 層只負責呼叫與呈現。

## 程式碼慣例

- import 使用 `@/` 別名指向 `src/`（例：`import { buildDag } from '@/domain/roadmap/dag'`）。
- `verbatimModuleSyntax` 已開啟：只用到型別時必須寫 `import type`。
- `erasableSyntaxOnly` 已開啟：**不可使用** `enum`、`namespace`、constructor 參數屬性（`constructor(private x)`）。用 union type 或 `as const` 物件取代 enum。
- `strict`、`noUnusedLocals`、`noUnusedParameters` 已開啟；未使用的參數以 `_` 開頭。
- 執行期資料驗證使用 `zod`；不可變更新使用 `immer`；className 組合使用 `clsx` + `tailwind-merge`。
- 樣式使用 Tailwind CSS v4。

## 測試慣例

- 測試檔與原始碼放在同一個資料夾：`foo.ts` → `foo.test.ts`，元件為 `Foo.tsx` → `Foo.test.tsx`。
- 測試環境為 happy-dom，`describe` / `it` / `expect` 為全域可用。
- `domain/` 的測試不可 render React 元件。
- 元件測試使用 `@testing-library/react` + `@testing-library/user-event`，以使用者可見的文字或 role 查詢，不用 class 或 test id 以外的實作細節。
- 網路請求以 `msw` mock，不可打真實的外部服務。
- 票上的測試情境（T1、T2…）每一個都要有對應測試，測試名稱以情境編號開頭：
  ```ts
  it('T2: 空陣列回傳空結果', () => { ... });
  ```

## Git 慣例

- 預設分支 `main`，禁止直接 push，一律經由 PR。
- 分支：`<type>/<team-key 小寫>-<number>/<slug>`，例：`feat/you-12/roadmap-dag-layout`。
  `type` ∈ `feat | fix | infr | refactor | docs | test`。
- Commit：`<type>(<票號>): <說明>`，例：`feat(YOU-12): add roadmap DAG layout`。
- PR 標題：`[YOU-12] <票標題>`；merge 方式為 squash merge。

## Harness 流程規則

完整流程見 `specs/HARNESS_SPEC.md` 與 `.claude/skills/`、`.claude/agents/`。

- **主 session**（執行 `/ticket`、`/next`、`/decompose` 時）負責 Linear 狀態、push、PR；產品程式碼交給 `implementer` subagent 寫，審查交給 `reviewer`。
- **任何時候都禁止**：merge PR、`git push --force`、直接 push 到 `main`、`git reset --hard`。
- **subagent 禁止**：改 Linear、push；修改 `.github/workflows/`、`.claude/`、`CLAUDE.md`、`specs/`、`package.json` 的依賴、各種設定檔（`tsconfig*`、`vite.config.ts`、`vitest.config.ts`、`.oxlintrc.json`、`.dependency-cruiser.cjs`）。需要時回傳 `blocked` 並說明原因。
- 只做票上明確寫到的範圍。規格不明確時採用最保守的做法（spec §8），並在 PR 內文的「假設」段落列出。
- agent 開的新票，內文開頭加上 `<!-- harness:created-by-agent source=<來源票號> -->`，並帶 `agent-proposed` 或 `spec-needed` 標籤。
- push 前 `npm run verify` 必須通過。
