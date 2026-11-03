import { spawn, spawnSync } from 'node:child_process';

export interface RunOptions {
  cwd?: string;
  input?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** 只給固定參數的 `.cmd` 指令使用（Windows 上 `.cmd` 必須經由 shell 執行）。 */
  shell?: boolean;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** 終止整個行程樹；Windows 上子行程會再開子行程，只 kill 父行程不夠。 */
function killTree(pid: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      process.kill(pid, 'SIGKILL');
    }
  }
}

const activeChildren = new Set<number>();

/** 終止所有仍在執行的子行程（Ctrl+C 時呼叫）。 */
export function killAllChildren(): void {
  for (const pid of activeChildren) killTree(pid);
  activeChildren.clear();
}

/** 執行指令（不經過 shell，參數不會被轉義破壞）。 */
export function run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      detached: process.platform !== 'win32',
      windowsHide: true,
      shell: options.shell ?? false,
    });
    const pid = child.pid;
    if (pid !== undefined) activeChildren.add(pid);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));

    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            if (child.pid !== undefined) killTree(child.pid);
          }, options.timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      if (pid !== undefined) activeChildren.delete(pid);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (pid !== undefined) activeChildren.delete(pid);
      resolve({ code, stdout, stderr, timedOut });
    });

    if (options.input !== undefined) child.stdin.end(options.input, 'utf8');
    else child.stdin.end();
  });
}

/** 執行指令，失敗時丟出含 stderr 的錯誤，成功時回傳去除前後空白的 stdout。 */
export async function runOrThrow(command: string, args: string[], options: RunOptions = {}): Promise<string> {
  const result = await run(command, args, options);
  if (result.code !== 0) {
    throw new Error(`${command} ${args.join(' ')} 失敗（exit ${result.code}）：${result.stderr.trim() || result.stdout.trim()}`);
  }
  return result.stdout.trim();
}
