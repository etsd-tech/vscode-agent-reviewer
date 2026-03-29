# VS Code Review Channel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a VS Code extension + MCP channel server that lets users annotate code in VS Code and push structured review feedback into a running Claude Code session.

**Architecture:** Two-component monorepo — a Bun MCP channel server that receives HTTP POSTs and pushes them as channel events, and a VS Code extension that provides native comment UI and submits reviews to that server.

**Tech Stack:** TypeScript, Bun, `@modelcontextprotocol/sdk`, VS Code Extension API (`vscode.comments`)

---

### Task 1: Initialize the monorepo and channel server package

**Files:**
- Create: `package.json` (root workspace)
- Create: `channel/package.json`
- Create: `channel/tsconfig.json`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "vscode-agent-review",
  "private": true,
  "workspaces": ["channel", "extension"]
}
```

- [ ] **Step 2: Create channel/package.json**

```json
{
  "name": "code-review-channel",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1"
  }
}
```

- [ ] **Step 3: Create channel/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["bun-types"]
  },
  "include": ["*.ts"]
}
```

- [ ] **Step 4: Install dependencies**

Run: `cd channel && bun install`
Expected: `bun.lock` created, `node_modules/` populated

- [ ] **Step 5: Commit**

```bash
git init
git add package.json channel/package.json channel/tsconfig.json channel/bun.lock
git commit -m "chore: init monorepo with channel server package"
```

---

### Task 2: Implement the MCP channel server

**Files:**
- Create: `channel/server.ts`

- [ ] **Step 1: Write a smoke test script**

Create `channel/test-server.sh`:

```bash
#!/bin/bash
# Start server in background, POST a review, check it doesn't crash
PORT=47199
VSCODE_REVIEW_PORT=$PORT bun channel/server.ts &
SERVER_PID=$!
sleep 1

# POST a test review
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:$PORT/review \
  -H "Content-Type: text/plain" \
  -d "# Test Review")

kill $SERVER_PID 2>/dev/null

if [ "$RESPONSE" = "200" ]; then
  echo "PASS: server accepted POST /review"
  exit 0
else
  echo "FAIL: expected 200, got $RESPONSE"
  exit 1
fi
```

```bash
chmod +x channel/test-server.sh
```

- [ ] **Step 2: Run smoke test to verify it fails**

Run: `bash channel/test-server.sh`
Expected: FAIL (server.ts doesn't exist yet)

- [ ] **Step 3: Write the channel server**

Create `channel/server.ts`:

```typescript
#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const PORT = Number(process.env.VSCODE_REVIEW_PORT ?? 47123)

const mcp = new Server(
  { name: 'code-review', version: '0.1.0' },
  {
    capabilities: { experimental: { 'claude/channel': {} } },
    instructions: [
      'Code review feedback from VS Code arrives as <channel source="code-review">.',
      'Each review contains line-level comments grouped by file, with code context.',
      'Address each comment: fix the issue, explain why you disagree, or ask for clarification.',
      'After addressing all comments, summarize what you changed.',
    ].join(' '),
  },
)

await mcp.connect(new StdioServerTransport())

Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  async fetch(req) {
    if (req.method !== 'POST' || new URL(req.url).pathname !== '/review') {
      return new Response('not found', { status: 404 })
    }
    const body = await req.text()
    if (!body.trim()) {
      return new Response('empty review', { status: 400 })
    }
    await mcp.notification({
      method: 'notifications/claude/channel',
      params: { content: body },
    })
    return new Response('ok')
  },
})
```

- [ ] **Step 4: Run smoke test to verify it passes**

Run: `bash channel/test-server.sh`
Expected: "PASS: server accepted POST /review"

- [ ] **Step 5: Commit**

```bash
git add channel/server.ts channel/test-server.sh
git commit -m "feat: add MCP channel server for VS Code reviews"
```

---

### Task 3: Scaffold the VS Code extension

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/src/extension.ts`
- Create: `extension/.vscodeignore`

- [ ] **Step 1: Create extension/package.json**

```json
{
  "name": "vscode-agent-review",
  "displayName": "Agent Review",
  "description": "Native code review UI for Claude Code — annotate code and push feedback via channels",
  "version": "0.1.0",
  "publisher": "local",
  "engines": {
    "vscode": "^1.90.0"
  },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "vscodeReviewer.submitReview",
        "title": "Submit Review",
        "icon": "$(send)"
      },
      {
        "command": "vscodeReviewer.clearComments",
        "title": "Clear Review Comments",
        "icon": "$(trash)"
      }
    ],
    "menus": {
      "editor/title": [
        {
          "command": "vscodeReviewer.submitReview",
          "group": "navigation"
        },
        {
          "command": "vscodeReviewer.clearComments",
          "group": "navigation"
        }
      ]
    },
    "configuration": {
      "title": "Agent Review",
      "properties": {
        "vscodeReviewer.port": {
          "type": "number",
          "default": 47123,
          "description": "Port for the review channel server"
        }
      }
    }
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/vscode": "^1.90.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create extension/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create extension/.vscodeignore**

```
src/**
tsconfig.json
node_modules/**
```

- [ ] **Step 4: Create stub extension/src/extension.ts**

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  vscode.window.showInformationMessage('Agent Review activated');
}

export function deactivate() {}
```

- [ ] **Step 5: Install dependencies and verify it compiles**

Run: `cd extension && npm install && npm run compile`
Expected: `dist/extension.js` created without errors

- [ ] **Step 6: Commit**

```bash
git add extension/
git commit -m "chore: scaffold VS Code extension"
```

---

### Task 4: Implement the Comment Controller

**Files:**
- Create: `extension/src/commentController.ts`
- Modify: `extension/src/extension.ts`

- [ ] **Step 1: Create extension/src/commentController.ts**

```typescript
import * as vscode from 'vscode';

export interface ReviewComment {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  body: string;
}

export class ReviewCommentController {
  private controller: vscode.CommentController;
  private threads: vscode.CommentThread[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.controller = vscode.comments.createCommentController(
      'code-review',
      'Code Review'
    );
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (
        document: vscode.TextDocument
      ): vscode.Range[] => {
        const lineCount = document.lineCount;
        return [new vscode.Range(0, 0, lineCount - 1, 0)];
      },
    };

    context.subscriptions.push(this.controller);

    context.subscriptions.push(
      vscode.commands.registerCommand(
        'vscodeReviewer.createComment',
        (reply: vscode.CommentReply) => {
          this.createComment(reply);
        }
      )
    );
  }

  private createComment(reply: vscode.CommentReply) {
    const thread = reply.thread;
    const comment: vscode.Comment = {
      body: reply.text,
      mode: vscode.CommentMode.Preview,
      author: { name: 'You' },
    };
    thread.comments = [...thread.comments, comment];
    if (!this.threads.includes(thread)) {
      this.threads.push(thread);
    }
  }

  getAllComments(): ReviewComment[] {
    const comments: ReviewComment[] = [];
    for (const thread of this.threads) {
      if (thread.comments.length === 0) continue;
      const filePath = thread.uri.fsPath;
      const lineStart = thread.range.start.line;
      const lineEnd = thread.range.end.line;
      const body = thread.comments
        .map((c) => (typeof c.body === 'string' ? c.body : c.body.value))
        .join('\n');
      comments.push({ filePath, lineStart, lineEnd, body });
    }
    return comments;
  }

  clearAll() {
    for (const thread of this.threads) {
      thread.dispose();
    }
    this.threads = [];
  }

  dispose() {
    this.clearAll();
    this.controller.dispose();
  }
}
```

- [ ] **Step 2: Wire the comment controller into extension.ts**

Replace `extension/src/extension.ts` with:

```typescript
import * as vscode from 'vscode';
import { ReviewCommentController } from './commentController';

let commentController: ReviewCommentController | undefined;

export function activate(context: vscode.ExtensionContext) {
  commentController = new ReviewCommentController(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeReviewer.clearComments', () => {
      commentController?.clearAll();
      vscode.window.showInformationMessage('Review comments cleared.');
    })
  );
}

export function deactivate() {
  commentController?.dispose();
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd extension && npm run compile`
Expected: No errors, `dist/commentController.js` and `dist/extension.js` created

- [ ] **Step 4: Commit**

```bash
git add extension/src/commentController.ts extension/src/extension.ts
git commit -m "feat: add comment controller with native VS Code comments API"
```

---

### Task 5: Implement the Review Submitter

**Files:**
- Create: `extension/src/reviewSubmitter.ts`
- Modify: `extension/src/extension.ts`

- [ ] **Step 1: Create extension/src/reviewSubmitter.ts**

```typescript
import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { ReviewComment, ReviewCommentController } from './commentController';

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
      (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Channel server returned ${res.statusCode}`));
        }
      }
    );
    req.on('error', (err) => {
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

export async function submitReview(
  commentController: ReviewCommentController
): Promise<void> {
  const comments = commentController.getAllComments();
  if (comments.length === 0) {
    vscode.window.showInformationMessage('No review comments to submit.');
    return;
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath ?? '/';

  const config = vscode.workspace.getConfiguration('vscodeReviewer');
  const port = config.get<number>('port', 47123);

  const body = formatReview(comments, workspaceRoot);

  try {
    await postReview(port, body);
    commentController.clearAll();
    vscode.window.showInformationMessage(
      `Review submitted (${comments.length} comment${comments.length > 1 ? 's' : ''}).`
    );
  } catch (err) {
    const msg =
      err instanceof Error && err.message.includes('ECONNREFUSED')
        ? 'Channel server not running. Start Claude Code with: claude --dangerously-load-development-channels server:code-review'
        : `Failed to submit review: ${err}`;
    vscode.window.showErrorMessage(msg);
  }
}
```

- [ ] **Step 2: Wire submit into extension.ts**

Replace `extension/src/extension.ts` with:

```typescript
import * as vscode from 'vscode';
import { ReviewCommentController } from './commentController';
import { submitReview } from './reviewSubmitter';

let commentController: ReviewCommentController | undefined;

export function activate(context: vscode.ExtensionContext) {
  commentController = new ReviewCommentController(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeReviewer.submitReview', () => {
      if (commentController) {
        submitReview(commentController);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeReviewer.clearComments', () => {
      commentController?.clearAll();
      vscode.window.showInformationMessage('Review comments cleared.');
    })
  );
}

export function deactivate() {
  commentController?.dispose();
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd extension && npm run compile`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add extension/src/reviewSubmitter.ts extension/src/extension.ts
git commit -m "feat: add review submitter with formatting and HTTP POST"
```

---

### Task 6: Implement the Channel Installer

**Files:**
- Create: `extension/src/channelInstaller.ts`
- Modify: `extension/src/extension.ts`

- [ ] **Step 1: Create extension/src/channelInstaller.ts**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');
const SERVER_NAME = 'code-review';

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
```

- [ ] **Step 2: Call installer from extension.ts activate**

Add to the top of the `activate` function in `extension/src/extension.ts`, after the `commentController` creation:

```typescript
import { ensureChannelRegistered } from './channelInstaller';
```

And inside `activate`, after `commentController = new ReviewCommentController(context);`:

```typescript
  try {
    ensureChannelRegistered(context.extensionPath);
  } catch (err) {
    console.warn('Failed to register channel server:', err);
  }
```

Full `extension/src/extension.ts` should now be:

```typescript
import * as vscode from 'vscode';
import { ReviewCommentController } from './commentController';
import { submitReview } from './reviewSubmitter';
import { ensureChannelRegistered } from './channelInstaller';

let commentController: ReviewCommentController | undefined;

export function activate(context: vscode.ExtensionContext) {
  commentController = new ReviewCommentController(context);

  try {
    ensureChannelRegistered(context.extensionPath);
  } catch (err) {
    console.warn('Failed to register channel server:', err);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeReviewer.submitReview', () => {
      if (commentController) {
        submitReview(commentController);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('vscodeReviewer.clearComments', () => {
      commentController?.clearAll();
      vscode.window.showInformationMessage('Review comments cleared.');
    })
  );
}

export function deactivate() {
  commentController?.dispose();
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd extension && npm run compile`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add extension/src/channelInstaller.ts extension/src/extension.ts
git commit -m "feat: auto-register MCP channel server in ~/.claude.json on activation"
```

---

### Task 7: End-to-end manual test

**Files:** None (testing only)

- [ ] **Step 1: Build the extension**

Run: `cd extension && npm run compile`

- [ ] **Step 2: Test the channel server standalone**

Run: `bash channel/test-server.sh`
Expected: "PASS: server accepted POST /review"

- [ ] **Step 3: Install and test the extension in VS Code**

Run: `cd extension && code --extensionDevelopmentPath=$(pwd)`
Expected: VS Code opens with the extension loaded. The "Submit Review" and "Clear Review Comments" buttons appear in the editor title bar.

- [ ] **Step 4: Verify comment UI works**

1. Open any file in the VS Code dev instance
2. Click on a line number gutter — a "+" icon or comment prompt should appear
3. Type a comment and submit it
4. Verify the comment thread appears on the line

- [ ] **Step 5: Test full flow with channel server**

In a separate terminal:
```bash
VSCODE_REVIEW_PORT=47123 bun channel/server.ts &
```

In VS Code: add a comment, click "Submit Review".
Expected: "Review submitted (1 comment)." notification appears.

Kill the test server:
```bash
kill %1
```

- [ ] **Step 6: Test error handling**

With the channel server NOT running, click "Submit Review" with a comment added.
Expected: Error notification about the channel server not running.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```

(Skip this step if no fixes were needed.)

---

### Task 8: Add README and finalize

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

```markdown
# Agent Review — VS Code Extension for Claude Code

Native code review UI for Claude Code. Annotate code in VS Code and push
line-level feedback directly into your running Claude Code session via the
Channels API.

## Prerequisites

- [Bun](https://bun.sh) installed
- Claude Code v2.1.80+
- claude.ai login (API key auth not supported for channels)

## Setup

1. **Install the extension:**

   ```bash
   cd extension && npm install && npm run compile
   ```

   Then open VS Code and run `Developer: Install Extension from Location...`
   pointing to the `extension/` directory. Or launch the dev host:

   ```bash
   code --extensionDevelopmentPath=$(pwd)/extension
   ```

2. **Install channel server dependencies:**

   ```bash
   cd channel && bun install
   ```

3. **Start Claude Code with the channel:**

   ```bash
   claude --dangerously-load-development-channels server:code-review
   ```

   The extension auto-registers the MCP server in `~/.claude.json` on
   first activation — no manual config needed.

## Usage

1. Claude Code makes changes to your code
2. Review the changes in VS Code (git diff view, file explorer, etc.)
3. Click on any line to add a review comment
4. Add as many comments as you want across any files
5. Click **Submit Review** (send icon) in the editor title bar
6. Claude receives your feedback and addresses each comment

## Configuration

| Setting              | Default | Description                    |
|----------------------|---------|--------------------------------|
| `vscodeReviewer.port`| `47123` | Port for the channel server    |

Set `VSCODE_REVIEW_PORT` env var to match if you change the port.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```
