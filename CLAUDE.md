# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

VS Code extension + Claude Code MCP channel plugin. Users annotate code in VS Code with line-level comments, then submit them as structured reviews into a running Claude Code session via the Channels API.

## Build & Development

```bash
# All commands run from extension/
cd extension

npm run compile        # TypeScript → dist/
npm run watch          # dev mode with file watching
npm run local          # package VSIX + install locally + force reload
npm run publish        # publish to VS Code Marketplace (needs VSCE_PAT)
```

`npm run local` is the primary dev loop: it bundles the plugin, compiles TS, packages the VSIX, and installs it. After running, reload VS Code window (Cmd+Shift+P → "Reload Window") or fully quit and reopen.

To test the full flow, start Claude Code with:
```bash
claude --dangerously-load-development-channels server:code-review
```

## Architecture

Three components communicate via HTTP and MCP:

```
VS Code Extension (TypeScript)
    │
    │ HTTP POST /review (localhost)
    ▼
MCP Channel Server (Node.js, plugin/channel/server.js)
    │
    │ MCP notification (notifications/claude/channel)
    ▼
Claude Code session
```

**Extension** (`extension/src/`): Native VS Code comments UI (`vscode.comments` API). Collects annotations, formats them with code context (2 lines above/below, syntax highlighting), and POSTs markdown to the channel server.

**Channel Server** (`plugin/channel/server.js`): Spawned by Claude Code as an MCP server. Binds an HTTP port (47123-47132), registers itself in `/tmp/code-review-sessions.json`, receives review POSTs, and pushes them as channel events into Claude.

**Plugin** (`plugin/`): Packages the channel server with a slash command (`/connect-review`) and a SessionEnd cleanup hook. Auto-provisioned into `~/.claude/` by the extension on first activation (`claudeInstaller.ts`).

### Data flow

1. User clicks `+` in gutter → `commentController.ts` creates a `vscode.CommentThread`
2. User clicks Send → `reviewSubmitter.ts` calls `getAllComments()`, formats markdown with code context
3. Extension reads `/tmp/code-review-sessions.json`, health-checks ports, picks a session
4. HTTP POST to `http://127.0.0.1:{port}/review`
5. Channel server emits `notifications/claude/channel` → Claude receives `<channel source="code-review">`
6. Comments cleared from extension

### Key files

| File | Role |
|------|------|
| `extension.ts` | Entry point, command registration |
| `commentController.ts` | Comment threads, persistence to workspaceState, add/delete |
| `reviewSubmitter.ts` | Format review markdown, HTTP POST, session selection |
| `sessionRegistry.ts` | Read registry, health-check sessions, prune dead entries |
| `claudeInstaller.ts` | Auto-provision MCP server, slash command, cleanup hook |
| `plugin/channel/server.js` | MCP server, HTTP endpoints (`/health`, `/review`) |

### Build pipeline

`bundle-plugin.js` copies `plugin/channel/` and `plugin/commands/` into the extension directory so they're included in the VSIX. This runs as part of `vscode:prepublish`.

## Session registry

Channel servers register in `/tmp/code-review-sessions.json` with `{ port, pid, cwd, name, startedAt }`. The extension health-checks each entry (GET `/health`, 2s timeout) before showing the session picker. Dead entries are pruned lazily. The file is cleared on machine reboot.

## Comments persistence

Comments are persisted to VS Code `workspaceState` (key: `reviewComments`) on every add/delete. Restored on extension activation. Cleared after successful review submission.

## Constraints

- Channels API requires Claude Code v2.1.80+ and `claude.ai` login (not API key)
- `--dangerously-load-development-channels` flag required until Anthropic marketplace approval
- No automated tests — manual testing only
- No bidirectional communication (extension → Claude only)
- Session names from `--name`/`/rename` are not yet exposed to MCP servers
