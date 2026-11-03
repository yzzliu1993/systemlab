import { ConfigSchema } from '../config';
import { agentEnv, buildClaudeArgs } from './runClaude';

const config = ConfigSchema.parse({
  linearTeam: 'Team',
  repo: 'owner/repo',
  implement: { maxTurns: 10, timeoutMinutes: 5 },
});

describe('agentEnv', () => {
  it('移除 ANTHROPIC_API_KEY，確保使用訂閱方案', () => {
    const env = agentEnv({ ANTHROPIC_API_KEY: 'sk-x', ANTHROPIC_AUTH_TOKEN: 't', PATH: '/bin' });
    expect(env).toEqual({ PATH: '/bin' });
  });

  it('不修改傳入的物件', () => {
    const base = { ANTHROPIC_API_KEY: 'sk-x' };
    agentEnv(base);
    expect(base.ANTHROPIC_API_KEY).toBe('sk-x');
  });
});

describe('buildClaudeArgs', () => {
  it('使用 headless JSON 輸出、限定 MCP 與工具白名單', () => {
    const args = buildClaudeArgs(config, {
      prompt: 'p', cwd: '.', allowedTools: ['Read', 'Bash(npm run *)'], maxTurns: 7, timeoutMinutes: 1,
    });
    expect(args).toEqual(expect.arrayContaining(['-p', '--strict-mcp-config']));
    expect(args[args.indexOf('--output-format') + 1]).toBe('json');
    expect(args[args.indexOf('--max-turns') + 1]).toBe('7');
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('Read,Bash(npm run *)');
    expect(args).not.toContain('--resume');
  });

  it('工具白名單為空時不傳 --allowedTools', () => {
    const args = buildClaudeArgs(config, { prompt: 'p', cwd: '.', allowedTools: [], maxTurns: 1, timeoutMinutes: 1 });
    expect(args).not.toContain('--allowedTools');
  });

  it('有 session id 時加上 --resume', () => {
    const args = buildClaudeArgs(config, {
      prompt: 'p', cwd: '.', allowedTools: [], maxTurns: 1, timeoutMinutes: 1, resumeSessionId: 's1',
    });
    expect(args.slice(-2)).toEqual(['--resume', 's1']);
  });
});
