import * as vscode from 'vscode';
import { Session, discoverSessions } from './sessionRegistry';
import { formatSessionItems } from './sessionPicker';

const REFRESH_INTERVAL_MS = 5_000;

let statusItem: vscode.StatusBarItem;
let refreshTimer: ReturnType<typeof setInterval>;
let lastSessions: Session[] = [];

export function createStatusBar(context: vscode.ExtensionContext): void {
  statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusItem.command = 'vscodeReviewer.showSessions';
  context.subscriptions.push(statusItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeReviewer.showSessions', showSessions),
  );

  refresh();
  refreshTimer = setInterval(refresh, REFRESH_INTERVAL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(refreshTimer) });
}

async function refresh(): Promise<void> {
  lastSessions = await discoverSessions();
  const n = lastSessions.length;

  if (n === 0) {
    statusItem.text = '$(circle-slash) No Claude sessions';
    statusItem.tooltip = 'No Claude Code review sessions found';
  } else if (n === 1) {
    statusItem.text = `$(plug) ${lastSessions[0].name}`;
    statusItem.tooltip = lastSessions[0].cwd;
  } else {
    statusItem.text = `$(plug) ${n} Claude sessions`;
    statusItem.tooltip = lastSessions.map((s) => s.name).join(', ');
  }

  statusItem.show();
}

async function showSessions(): Promise<void> {
  await refresh();

  if (lastSessions.length === 0) {
    vscode.window.showInformationMessage(
      'No Claude Code sessions found. Start Claude Code with: claude --dangerously-load-development-channels server:code-review',
    );
    return;
  }

  await vscode.window.showQuickPick(formatSessionItems(lastSessions), {
    placeHolder: 'Active Claude Code sessions',
  });
}
