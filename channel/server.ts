#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const PORT = Number(process.env.VSCODE_REVIEW_PORT ?? 47123)

const mcp = new Server(
  { name: 'vscode-review', version: '0.1.0' },
  {
    capabilities: { experimental: { 'claude/channel': {} } },
    instructions: [
      'Code review feedback from VS Code arrives as <channel source="vscode-review">.',
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
