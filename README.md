<p align="center">
  <img src="https://raw.githubusercontent.com/etsd-tech/vscode-agent-reviewer/master/docs/banner.png" alt="Code Review for Claude Code" width="400" />
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=ETSD.agent-code-reviewer"><img src="https://img.shields.io/badge/Install%20in-VS%20Code-007ACC?logo=visual-studio-code&logoColor=white&style=for-the-badge" alt="Install in VS Code" /></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=ETSD.agent-code-reviewer"><img src="https://img.shields.io/visual-studio-marketplace/v/ETSD.agent-code-reviewer?style=for-the-badge&label=version" alt="Version" /></a>
</p>

# Code Review for Claude Code

Native code review UI for Claude Code. Annotate code in VS Code and push line-level feedback directly into a running Claude Code session via the Channels API.

<video src="https://github.com/etsd-tech/vscode-agent-reviewer/raw/master/docs/demo.mp4" controls width="100%"></video>

## How it works

1. Claude Code modifies files in your project
2. You review the changes in VS Code and add comments on specific lines
3. You click **Send Review to Claude Code** — your comments are formatted with code context and sent to Claude
4. Claude receives structured feedback and addresses each comment

The extension auto-provisions the Claude Code integration on activation (MCP server, slash command, cleanup hook) — no manual config needed.

> **Channels are experimental.** This extension relies on the Claude Code [Channels API](https://code.claude.com/docs/en/channels-reference), which is in research preview. Claude Code must be launched with the `--dangerously-load-development-channels` flag to enable custom channels. This flag requirement will go away once Anthropic approves the channel (via marketplace review or org `allowedChannelPlugins`). The VS Code extension handles all setup — there is no separate Claude Code plugin to install.

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) v2.1.80+

> Note: Channels require a `claude.ai` login. API key and Anthropic Console authentication do not support channels.

## Quick Install

1. Install the extension:

   <a href="vscode:extension/ETSD.agent-code-reviewer"><img src="https://img.shields.io/badge/Install%20in-VS%20Code-007ACC?logo=visual-studio-code&logoColor=white" alt="Install in VS Code" /></a>

   *Or from the command line:* `code --install-extension ETSD.agent-code-reviewer`

2. Start Claude Code with the review channel enabled:

   ```bash
   claude --dangerously-load-development-channels server:code-review
   ```

   `server:code-review` tells Claude Code to activate the `code-review` MCP server (auto-registered by the extension) as a channel. The `--dangerously-load-development-channels` flag is required while channels remain in research preview.

That's it. The extension auto-configures the MCP server, slash command, and cleanup hook on first activation.

## Development Install

If you want to build from source:

```bash
git clone https://github.com/etsd-tech/vscode-agent-reviewer.git
cd vscode-agent-reviewer

# Install channel server dependencies
cd plugin/channel && npm install && cd ../..

# Build and launch the extension
cd extension && npm install && npm run compile
code --extensionDevelopmentPath=$(pwd)
```

## Starting a review session

Start Claude Code with the development channel enabled:

```bash
claude --dangerously-load-development-channels server:code-review
```

The status bar in VS Code (bottom-right) shows connected sessions. Once you see your session appear, you're ready to review.

## Usage

1. Click the `+` icon in any line gutter to add a review comment
2. Type your feedback and press the checkmark (or Ctrl+Enter) to confirm
3. Repeat across as many files and lines as needed
4. Click the **Send** icon ($(send)) in the editor title bar to submit
5. If multiple Claude Code sessions are running, pick the target from the dropdown
6. Claude receives your review and addresses each comment

### Clearing comments

Click the **Trash** icon in the editor title bar to discard all pending comments without submitting.

## Multi-session support

Each Claude Code session with the channel enabled registers itself in a shared session registry. The extension discovers all alive sessions via health checks and lets you pick which one to send to.

The session picker shows:

- **Project name** (derived from the working directory)
- **Start time** (to distinguish multiple sessions in the same project)
- **Port** and **full path** for disambiguation

> Claude Code session names (`--name` / `/rename`) are not yet exposed to MCP servers. When that lands, the picker will show real session names automatically.

## Configuration

| Setting                  | Default | Description                          |
|--------------------------|---------|--------------------------------------|
| `vscodeReviewer.basePort`| `47123` | Starting port for session discovery  |

## Architecture

Three components:

- **MCP Channel Server** (`plugin/channel/server.ts`) — Bun process spawned by Claude Code. Binds an HTTP port, receives review POSTs from VS Code, and pushes them as channel events into the Claude Code session.
- **VS Code Extension** (`extension/`) — Provides native comment UI via `vscode.comments`. Collects annotations, formats them with code context, and POSTs to the active channel server.
- **Claude Code Plugin** (`plugin/`) — Packages the channel server with hooks and commands. Auto-provisioned by the extension into `~/.claude/`.

### Session registry

Each channel server writes its entry (port, PID, cwd, name, start time) to `/tmp/code-review-sessions.json`. The extension health-checks registered ports before showing the picker, pruning any dead entries. The registry is cleared automatically on reboot.

## Constraints

- Channels API is in research preview (Claude Code v2.1.80+)
- Requires `claude.ai` login (not API key / Console auth)
- Team/Enterprise orgs must enable `channelsEnabled` in managed settings
- Development channels require `--dangerously-load-development-channels` until submitted to the Anthropic marketplace
