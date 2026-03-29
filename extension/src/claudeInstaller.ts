import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const CLAUDE_CONFIG = path.join(os.homedir(), '.claude.json');
const SERVER_NAME = 'code-review';

const HOOK_COMMAND =
  'node -e "const fs=require(\'fs\');const f=\'/tmp/code-review-sessions.json\';' +
  "try{const s=JSON.parse(fs.readFileSync(f,'utf8'));" +
  'const alive=s.filter(e=>{try{process.kill(e.pid,0);return true}catch{return false}});' +
  'fs.writeFileSync(f,JSON.stringify(alive,null,2))}catch{}"';

function resolveServerPath(extensionPath: string): string {
  const bundled = path.join(extensionPath, 'channel', 'server.ts');
  if (fs.existsSync(bundled)) return bundled;
  return path.join(extensionPath, '..', 'plugin', 'channel', 'server.ts');
}

function resolveCommandSource(extensionPath: string): string | null {
  const bundled = path.join(extensionPath, 'commands', 'connect-review.md');
  if (fs.existsSync(bundled)) return bundled;
  const dev = path.join(extensionPath, '..', 'plugin', 'commands', 'connect-review.md');
  if (fs.existsSync(dev)) return dev;
  return null;
}

function installMcpServer(serverPath: string): void {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(fs.readFileSync(CLAUDE_CONFIG, 'utf-8'));
  } catch {
    // Missing or invalid — start fresh
  }

  const mcpServers = (config.mcpServers ?? {}) as Record<string, unknown>;
  const existing = mcpServers[SERVER_NAME] as
    | { command?: string; args?: string[] }
    | undefined;

  if (
    existing?.command === 'bun' &&
    JSON.stringify(existing.args) === JSON.stringify([serverPath])
  ) {
    return;
  }

  mcpServers[SERVER_NAME] = { command: 'bun', args: [serverPath] };
  config.mcpServers = mcpServers;
  fs.writeFileSync(CLAUDE_CONFIG, JSON.stringify(config, null, 2) + '\n');
}

function installCommand(extensionPath: string): void {
  const src = resolveCommandSource(extensionPath);
  if (!src) return;

  const dest = path.join(CLAUDE_HOME, 'commands', 'connect-review.md');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function installHook(): void {
  const settingsPath = path.join(CLAUDE_HOME, 'settings.json');
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
  } catch {
    // Missing or invalid — start fresh
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  const sessionEnd = (hooks.SessionEnd ?? []) as Array<{
    hooks: Array<{ type: string; command: string }>;
  }>;

  const alreadyInstalled = sessionEnd.some((entry) =>
    entry.hooks?.some((h) =>
      h.command?.includes('code-review-sessions.json'),
    ),
  );
  if (alreadyInstalled) return;

  sessionEnd.push({
    hooks: [{ type: 'command', command: HOOK_COMMAND }],
  });
  hooks.SessionEnd = sessionEnd;
  settings.hooks = hooks;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export function ensureClaudeProvisioned(extensionPath: string): void {
  const serverPath = resolveServerPath(extensionPath);
  installMcpServer(serverPath);
  installCommand(extensionPath);
  installHook();
}
