# VS Code Review Channel — Design Spec

## Problem

When Claude Code modifies files, the user reviews changes in VS Code's diff view but has no native way to send line-level feedback back to Claude. They must copy/paste or type comments manually into the terminal.

## Solution

A VS Code extension + MCP channel server that lets the user annotate code in VS Code and push structured review feedback directly into Claude Code's running session via the Channels API. Supports multiple concurrent Claude Code sessions with a session picker.

Distributed as a **Claude Code plugin** for easy installation.

## Architecture

### Overview

Three components:

1. **MCP Channel Server** — Bun process spawned by Claude Code. Receives HTTP POSTs from VS Code, pushes them as channel events into the Claude Code session.
2. **VS Code Extension** — Provides native comment UI (`vscode.comments`). Collects annotations, formats them with code context, and POSTs to the active channel server.
3. **Claude Code Plugin** — Packages the channel server with hooks and commands for installation via `/plugin install`.

### Project Structure

```
vscode-agent-review/
├── plugin/                         # Claude Code plugin
│   ├── .claude-plugin/
│   │   └── plugin.json            # plugin manifest
│   ├── .mcp.json                  # MCP server declaration
│   ├── commands/
│   │   └── connect-review.md      # /connect-review command
│   ├── hooks/
│   │   └── hooks.json             # SessionEnd cleanup hook
│   └── channel/
│       ├── server.ts              # MCP channel server
│       └── package.json
├── extension/                      # VS Code extension
│   ├── src/
│   │   ├── extension.ts           # activate/deactivate
│   │   ├── commentController.ts   # vscode.comments API
│   │   ├── reviewSubmitter.ts     # collect, format, POST
│   │   └── sessionRegistry.ts    # discover alive sessions
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

---

## Multi-Session Support

### Problem

Users may run multiple Claude Code sessions simultaneously (different projects, different tasks). Reviews must reach the intended session, not all of them.

### Design

Each channel server instance binds its own HTTP port. A shared registry file tracks all alive sessions. The VS Code extension reads this registry and routes reviews to the correct session.

### Port Discovery

1. Channel server starts at base port `47123`
2. Tries to bind `127.0.0.1:<port>`
3. If port is taken, increments by 1 and retries (up to 10 attempts)
4. Once bound, registers itself in the session registry

### Session Registry

**Location:** `/tmp/code-review-sessions.json`

- Tmp file ensures clean state on machine reboot
- Each entry contains:

```json
[
  {
    "port": 47123,
    "pid": 12345,
    "cwd": "/Users/alice/Projects/flares",
    "name": "flares",
    "startedAt": "2026-03-28T14:30:00Z"
  },
  {
    "port": 47124,
    "pid": 12346,
    "cwd": "/Users/alice/Projects/api-server",
    "name": "api-server",
    "startedAt": "2026-03-28T15:00:00Z"
  }
]
```

- `name` is derived from the last segment of `process.cwd()` (the project directory Claude Code runs in)
- `pid` is the channel server's own process ID
- File is locked during writes (atomic rename) to prevent corruption from concurrent access

### Session Lifecycle

**On startup:**
1. Channel server binds a port
2. Reads the registry, appends its entry, writes back
3. Registers `process.on('exit')`, `process.on('SIGTERM')`, `process.on('SIGINT')` handlers to remove its entry on shutdown (best-effort cleanup)

**On normal exit:**
- Exit handler removes the entry from the registry
- Port is freed by the OS

**On crash / `kill -9`:**
- Exit handler doesn't fire → stale entry remains in registry
- Cleaned up lazily by the VS Code extension's health check (see below)

**On machine reboot:**
- `/tmp/code-review-sessions.json` is gone → clean slate

### Health Check

The channel server exposes `GET /health`:

```json
{"channel": "code-review", "pid": 12345, "name": "flares"}
```

The VS Code extension pings every registered port before showing the session picker. Any port that:
- Doesn't respond (connection refused) → pruned
- Responds but not with `{"channel": "code-review", ...}` → pruned (port reused by unrelated process)

This is the **primary** cleanup mechanism. The exit handlers and hooks are best-effort supplements.

---

## MCP Channel Server

**File:** `plugin/channel/server.ts`

- Runtime: Bun
- Dependency: `@modelcontextprotocol/sdk`
- Declares `claude/channel` capability (one-way, no reply tool)
- Port: auto-discovered starting at `47123`, incrementing on conflict
- Binds to `127.0.0.1` only (localhost)

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/review` | Receives markdown review body, pushes as channel event |
| `GET` | `/health` | Returns JSON with channel identity, PID, and session name |

**Channel instructions** (added to Claude's system prompt):

> Code review feedback from VS Code arrives as `<channel source="code-review">`. Each review contains line-level comments grouped by file, with code context around each commented line. Address each comment: fix the issue, explain why you disagree, or ask for clarification. After addressing all comments, summarize what you changed.

---

## VS Code Extension

### Comment Controller

- ID: `code-review`, label: `Code Review`
- `commentingRangeProvider` enables comments on every line of every file
- `vscodeReviewer.createComment` command handles comment submission within the widget
- Tracks all active comment threads in memory
- Comments persist until submitted or manually cleared

### Submit Review (`vscodeReviewer.submitReview`)

- Exposed as a button in the Editor Title Menu (send icon)
- On trigger:
  1. Collects all comment threads across all open files
  2. If no comments exist → info notification, stop
  3. Reads the session registry, health-checks each entry
  4. If 0 alive sessions → error notification with setup instructions
  5. If 1 alive session → submit directly
  6. If multiple alive sessions → show VS Code Quick Pick:
     ```
     flares (port 47123)
     api-server (port 47124)
     ```
  7. User selects target session
  8. For each thread: reads the file, extracts commented line + 2 lines of surrounding context
  9. Formats as markdown grouped by file (see Review Output Format)
  10. POSTs to `http://127.0.0.1:<selected-port>/review`
  11. On success: clears all comment threads, shows "Review submitted (N comments)"
  12. On failure: shows error notification

### Clear Comments (`vscodeReviewer.clearComments`)

- Editor Title Menu button (trash icon)
- Disposes all comment threads, resets state

### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `vscodeReviewer.basePort` | number | `47123` | Starting port for session discovery scan |

---

## Review Output Format

What Claude receives as the `<channel>` event body:

```markdown
# Code Review

## src/auth.ts

### Line 42
```ts
40 |  const token = getToken();
41 |  if (!token) {
42 |>   return null;
43 |  }
```
**Comment:** This should throw an AuthError, not return null silently.

## src/utils.ts

### Lines 10-12
```ts
 9 | function parse(input: string) {
10 |>  const data = JSON.parse(input);
11 |>  return data;
12 | }
```
**Comment:** Add try/catch, this will blow up on malformed input.
```

- File paths are relative to the workspace root
- `>` marker indicates the commented line(s)
- Language identifier is inferred from file extension for syntax highlighting
- 2 lines of context above and below the commented range

---

## Claude Code Plugin

### Plugin Manifest

**File:** `plugin/.claude-plugin/plugin.json`

```json
{
  "name": "code-review",
  "description": "Push code review feedback from VS Code into your Claude Code session",
  "version": "0.1.0",
  "author": {
    "name": "Your Name"
  },
  "repository": "https://github.com/your-org/vscode-agent-review"
}
```

### MCP Server Declaration

**File:** `plugin/.mcp.json`

```json
{
  "mcpServers": {
    "code-review": {
      "command": "bun",
      "args": ["channel/server.ts"]
    }
  }
}
```

### Connect Review Command

**File:** `plugin/commands/connect-review.md`

```markdown
---
description: Make this session the active review target
allowed-tools: []
---

The code-review channel server for this session is already running.
This session is ready to receive code reviews from VS Code.

Tell the user their session is connected and ready to receive reviews.
```

### SessionEnd Cleanup Hook

**File:** `plugin/hooks/hooks.json`

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node -e \"const fs=require('fs');const f='/tmp/code-review-sessions.json';try{const s=JSON.parse(fs.readFileSync(f,'utf8'));const alive=s.filter(e=>{try{process.kill(e.pid,0);return true}catch{return false}});fs.writeFileSync(f,JSON.stringify(alive,null,2))}catch{}\""
          }
        ]
      }
    ]
  }
}
```

This hook fires when any Claude Code session ends. It reads the session registry and removes entries whose PID is no longer alive.

---

## Data Flow

### Single Session

```
User adds comments in VS Code
    ↓
User clicks "Submit Review"
    ↓
Extension collects comments, reads code context
    ↓
Extension reads /tmp/code-review-sessions.json
    ↓
Extension health-checks port → alive
    ↓
Extension POSTs markdown to http://127.0.0.1:47123/review
    ↓
Channel server receives POST
    ↓
Channel server emits notifications/claude/channel via MCP
    ↓
Claude receives <channel source="code-review"> with review
    ↓
Extension clears comment threads
```

### Multiple Sessions

```
User adds comments in VS Code
    ↓
User clicks "Submit Review"
    ↓
Extension reads /tmp/code-review-sessions.json
    ↓
Extension health-checks all registered ports
    ↓
Extension prunes dead entries
    ↓
Multiple alive → VS Code Quick Pick:
  ┌──────────────────────────┐
  │ Select Claude Code session │
  │                            │
  │  flares (47123)            │
  │  api-server (47124)        │
  └──────────────────────────┘
    ↓
User selects session
    ↓
Extension POSTs to selected port
    ↓
(same as single session from here)
```

---

## Installation & Usage

### Prerequisites

- [Bun](https://bun.sh) installed
- Claude Code v2.1.80+
- claude.ai login (API key auth not supported for channels)
- VS Code with the Agent Review extension installed

### Install the Plugin

```bash
# From a marketplace (when published):
/plugin install code-review@your-marketplace

# Or locally during development:
claude --plugin-dir ./plugin
```

### Start a Session with the Channel

```bash
# With plugin installed:
claude --channels plugin:code-review@your-marketplace

# During development:
claude --dangerously-load-development-channels server:code-review
```

### Review Workflow

1. Claude Code modifies files in your project
2. Review the changes in VS Code (git diff view, source control panel)
3. Click `+` on any line gutter to add a review comment
4. Submit the comment within the widget (Ctrl+Enter or checkmark button)
5. Repeat across as many files as needed
6. Click **Submit Review** (send icon) in the editor title bar
7. If multiple sessions are running, pick the target from the Quick Pick menu
8. Claude receives your feedback and addresses each comment

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No comments to submit | Info notification: "No review comments to submit" |
| No alive sessions | Error notification with setup instructions |
| Channel server rejects POST | Error notification with status code |
| Connection refused (port dead) | Entry pruned from registry, session removed from picker |
| Health check returns wrong identity | Entry pruned (port reused by unrelated process) |
| Registry file missing/corrupt | Treated as empty — no sessions available |
| All sessions die between registry read and POST | Connection refused → error notification |

---

## Security

- Channel server binds to `127.0.0.1` only — not accessible from the network
- No authentication on the HTTP endpoint (localhost-only, single-user)
- Registry file in `/tmp` — readable by the current user only (default OS permissions)
- No secrets stored anywhere
- Channel events are one-way — Claude cannot push data back through this channel

---

## Constraints

- Channels API is in research preview (Claude Code v2.1.80+)
- Requires `claude.ai` login (not API key / Console auth)
- Requires Bun installed for the channel server
- Uses only native VS Code UI (`vscode.comments`), no webviews
- Team/Enterprise orgs must enable `channelsEnabled` in managed settings
- During research preview, custom channel plugins require `--dangerously-load-development-channels` unless added to the org's `allowedChannelPlugins` or submitted to the official Anthropic marketplace

---

## Future Considerations

- **Two-way channel**: Claude could reply back through the channel to mark comments as resolved in VS Code
- **Diff-aware comments**: Show comments in VS Code's diff editor with before/after context
- **Review history**: Persist past reviews for reference
- **Plugin marketplace submission**: Submit to Anthropic's official marketplace to remove the `--dangerously-load-development-channels` requirement
