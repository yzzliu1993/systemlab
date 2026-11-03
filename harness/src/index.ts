import { loadConfig, requireEnv } from './config';
import { GitHub } from './github/client';
import { Linear } from './linear/client';
import { planNext, runLoop } from './loop';
import { runTicket, type PipelineResult } from './pipeline';
import { killAllChildren } from './proc';
import type { Deps } from './stages/common';
import { decompose } from './stages/decompose';

const USAGE = `用法：
  npm run harness -- loop               常駐輪詢，自動處理 Todo / Backlog / In Review
  npm run harness -- plan               只顯示下一張會處理的票，不執行
  npm run harness -- run <票號>         處理一張票（Todo / In Progress / In Review）
  npm run harness -- decompose <票號>   拆解一張 Backlog 票`;

const MESSAGES: Record<PipelineResult, string> = {
  awaiting_merge: '完成：Review 通過、CI 綠燈，等待你 merge',
  stopped: '已停止：需要人工介入，詳見 Linear 留言',
  skipped: '未處理',
  finalized: '已收尾：移除 harness 標籤',
  canceled: '票已取消，已終止 agent',
};

/**
 * Ctrl+C：終止 agent 與其他子行程後結束。handoff 已記錄執行中的 session，
 * 重新執行會接續，這次中斷不計入失敗次數（HARNESS_SPEC §6.2）。
 */
function handleInterrupt(onInterrupt: () => void): void {
  let interrupted = false;
  process.on('SIGINT', () => {
    if (interrupted) return;
    interrupted = true;
    console.log('\n收到中斷訊號，正在終止子行程……重新執行即可接續。');
    onInterrupt();
    killAllChildren();
    process.exit(130);
  });
}

function createDeps(): Deps {
  const config = loadConfig();
  return {
    config,
    linear: new Linear(requireEnv('LINEAR_API_KEY'), config.linearTeam),
    github: new GitHub(config.repo),
  };
}

const TICKET_ID = /^[A-Za-z]+-\d+$/;

async function main(argv: string[]): Promise<number> {
  const [command, identifier] = argv;
  const needsTicket = command === 'run' || command === 'decompose';
  if (!['run', 'decompose', 'loop', 'plan'].includes(command ?? '') || (needsTicket && !TICKET_ID.test(identifier ?? ''))) {
    console.error(USAGE);
    return 2;
  }

  const deps = createDeps();
  switch (command) {
    case 'plan': {
      const next = await planNext(deps, new Set());
      console.log(next ? `下一張：${next.identifier}（${next.kind}：${next.reason}）` : '目前沒有可處理的票');
      return 0;
    }
    case 'loop': {
      let stop = false;
      // Ctrl+C 直接結束時鎖檔會留下，但記錄的 pid 已不存在，下次啟動會自動接手。
      handleInterrupt(() => (stop = true));
      await runLoop(deps, () => stop);
      return 0;
    }
    case 'decompose': {
      handleInterrupt(() => undefined);
      const result = await decompose(deps, identifier!.toUpperCase());
      console.log(`拆解結果：${result}`);
      return result === 'stopped' ? 1 : 0;
    }
    default: {
      handleInterrupt(() => undefined);
      const result = await runTicket(deps, identifier!.toUpperCase());
      console.log(MESSAGES[result]);
      return result === 'stopped' ? 1 : 0;
    }
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
