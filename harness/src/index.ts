import { loadConfig, requireEnv } from './config';
import { GitHub } from './github/client';
import { Linear } from './linear/client';
import { runImplement } from './stages/implement';

const USAGE = '用法：npm run harness -- run <票號>   例：npm run harness -- run YOU-12';

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
  const outcome = await runImplement(deps, identifier.toUpperCase());
  console.log(outcome === 'pr_created' ? '完成：已建立 PR' : '已停止：需要人工介入，詳見 Linear 留言');
  return outcome === 'pr_created' ? 0 : 1;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
