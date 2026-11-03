import { loadConfig, requireEnv } from './config';
import { GitHub } from './github/client';
import { Linear } from './linear/client';
import { runTicket, type PipelineResult } from './pipeline';
import { killAllChildren } from './proc';

const USAGE = '用法：npm run harness -- run <票號>   例：npm run harness -- run YOU-12';

const MESSAGES: Record<PipelineResult, string> = {
  awaiting_merge: '完成：Review 通過、CI 綠燈，等待你 merge',
  stopped: '已停止：需要人工介入，詳見 Linear 留言',
  skipped: '未處理',
  finalized: '已收尾：移除 awaiting-merge 標籤',
};

/**
 * Ctrl+C：終止 agent 與其他子行程後結束。handoff 已記錄執行中的 session，
 * 重新執行同一張票會接續，這次中斷不計入失敗次數（HARNESS_SPEC §6.2）。
 */
function handleInterrupt(): void {
  let interrupted = false;
  process.on('SIGINT', () => {
    if (interrupted) return;
    interrupted = true;
    console.log('\n收到中斷訊號，正在終止子行程……重新執行同一張票即可接續。');
    killAllChildren();
    process.exit(130);
  });
}

async function main(argv: string[]): Promise<number> {
  const [command, identifier] = argv;
  if (command !== 'run' || !identifier || !/^[A-Za-z]+-\d+$/.test(identifier)) {
    console.error(USAGE);
    return 2;
  }

  handleInterrupt();
  const config = loadConfig();
  const deps = {
    config,
    linear: new Linear(requireEnv('LINEAR_API_KEY'), config.linearTeam),
    github: new GitHub(config.repo),
  };
  const result = await runTicket(deps, identifier.toUpperCase());
  console.log(MESSAGES[result]);
  return result === 'stopped' ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
