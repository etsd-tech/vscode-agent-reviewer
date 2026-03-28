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
   claude --dangerously-load-development-channels server:vscode-review
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
| `vscodeReviewer.port`| `47123` | Port for the review channel server    |

Set `VSCODE_REVIEW_PORT` env var to match if you change the port.
