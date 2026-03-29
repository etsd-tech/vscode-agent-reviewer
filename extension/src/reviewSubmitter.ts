import * as vscode from 'vscode';
import * as http from 'http';
import type { IncomingMessage } from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { ReviewComment, ReviewCommentController } from './commentController';
import { Session, discoverSessions } from './sessionRegistry';
import { formatSessionItems } from './sessionPicker';

const CONTEXT_LINES = 2;

function readFileLines(filePath: string): string[] | null {
  try {
    return fs.readFileSync(filePath, 'utf-8').split('\n');
  } catch {
    return null;
  }
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).slice(1);
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    rb: 'ruby', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    css: 'css', html: 'html', json: 'json', yaml: 'yaml',
    yml: 'yaml', md: 'markdown', sh: 'bash', zsh: 'bash',
  };
  return map[ext] ?? '';
}

function formatReview(comments: ReviewComment[], workspaceRoot: string): string {
  const byFile = new Map<string, ReviewComment[]>();
  for (const c of comments) {
    const existing = byFile.get(c.filePath) ?? [];
    existing.push(c);
    byFile.set(c.filePath, existing);
  }

  const sections: string[] = ['# Code Review\n'];

  for (const [filePath, fileComments] of byFile) {
    const relativePath = path.relative(workspaceRoot, filePath);
    sections.push(`## ${relativePath}\n`);

    const sorted = fileComments.sort((a, b) => a.lineStart - b.lineStart);
    const lines = readFileLines(filePath);
    const lang = detectLanguage(filePath);

    for (const comment of sorted) {
      const lineLabel =
        comment.lineStart === comment.lineEnd
          ? `Line ${comment.lineStart + 1}`
          : `Lines ${comment.lineStart + 1}-${comment.lineEnd + 1}`;
      sections.push(`### ${lineLabel}`);

      if (lines) {
        const ctxStart = Math.max(0, comment.lineStart - CONTEXT_LINES);
        const ctxEnd = Math.min(lines.length - 1, comment.lineEnd + CONTEXT_LINES);
        const codeLines: string[] = [];
        for (let i = ctxStart; i <= ctxEnd; i++) {
          const marker =
            i >= comment.lineStart && i <= comment.lineEnd ? '>' : ' ';
          const lineNum = String(i + 1).padStart(String(ctxEnd + 1).length);
          codeLines.push(`${lineNum} |${marker} ${lines[i]}`);
        }
        sections.push('```' + lang);
        sections.push(codeLines.join('\n'));
        sections.push('```');
      }

      sections.push(`**Comment:** ${comment.body}\n`);
    }
  }

  return sections.join('\n');
}

function postReview(port: number, body: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/review',
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      },
      (res: IncomingMessage) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Channel server returned ${res.statusCode}`));
        }
      }
    );
    req.on('error', (err: Error) => {
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

async function selectSession(): Promise<Session | undefined> {
  const sessions = await discoverSessions();

  if (sessions.length === 0) {
    vscode.window.showErrorMessage(
      'No Claude Code sessions found. Start Claude Code with: claude --dangerously-load-development-channels server:code-review'
    );
    return undefined;
  }

  if (sessions.length === 1) {
    return sessions[0];
  }

  const picked = await vscode.window.showQuickPick(formatSessionItems(sessions), {
    placeHolder: 'Select Claude Code session',
  });

  return picked?.session;
}

export async function submitReview(
  commentController: ReviewCommentController
): Promise<void> {
  const comments = commentController.getAllComments();
  if (comments.length === 0) {
    vscode.window.showInformationMessage('No review comments to submit.');
    return;
  }

  const session = await selectSession();
  if (!session) return;

  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath ?? '/';

  const body = formatReview(comments, workspaceRoot);

  try {
    await postReview(session.port, body);
    commentController.clearAll();
    vscode.window.showInformationMessage(
      `Review submitted (${comments.length} comment${comments.length > 1 ? 's' : ''}).`
    );
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to submit review: ${err}`);
  }
}
