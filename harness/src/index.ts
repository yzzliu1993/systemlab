import { loadConfig, requireEnv } from './config';
import { GitHub } from './github/client';
import { Linear } from './linear/client';
import { runTicket, type PipelineResult } from './pipeline';

const USAGE = '用法：npm run harness -- run <票號>   例：npm run harness -- run YOU-12';

const MESSAGES: Record<PipelineResult, string> = {
  awaiting_merge: '完成：Review 通過、CI 綠燈，等待你 merge',
  stopped: '已停止：需要人工介入，詳見 Linear 留言',
  skipped: '未處理',
};

async function main(argv: string[]): Promise<number> {
  const [command, identifier] = argv;
  if (command !== 'run' || !identifier || !/^[A-Za-z]+-\d+$/.test(identifier)) {
    console.error(USAGE);
    return 2;
  }

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
