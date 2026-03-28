import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');
const SERVER_NAME = 'vscode-review';

export function ensureChannelRegistered(extensionPath: string): void {
  const serverScript = path.join(extensionPath, '..', 'channel', 'server.ts');

  let config: Record<string, unknown> = {};
  try {
    const raw = fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf-8');
    config = JSON.parse(raw);
  } catch {
    // File doesn't exist or invalid JSON — start fresh
  }

  const mcpServers = (config.mcpServers ?? {}) as Record<string, unknown>;
  const existing = mcpServers[SERVER_NAME] as
    | { command?: string; args?: string[] }
    | undefined;

  const expectedArgs = [serverScript];

  if (
    existing &&
    existing.command === 'bun' &&
    JSON.stringify(existing.args) === JSON.stringify(expectedArgs)
  ) {
    return; // Already registered and up to date
  }

  mcpServers[SERVER_NAME] = {
    command: 'bun',
    args: expectedArgs,
  };
  config.mcpServers = mcpServers;

  fs.writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}
