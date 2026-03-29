#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as fs from 'fs'
import * as path from 'path'

const BASE_PORT = 47123
const MAX_PORT_ATTEMPTS = 10
const REGISTRY_PATH = '/tmp/code-review-sessions.json'
const SESSION_NAME = path.basename(process.cwd())

interface SessionEntry {
  port: number
  pid: number
  cwd: string
  name: string
  startedAt: string
}

// --- Session registry ---

function readRegistry(): SessionEntry[] {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'))
  } catch {
    return []
  }
}

function writeRegistry(entries: SessionEntry[]): void {
  const tmp = `${REGISTRY_PATH}.tmp.${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2))
  fs.renameSync(tmp, REGISTRY_PATH)
}

function registerSession(port: number): void {
  const entries = readRegistry()
  entries.push({
    port,
    pid: process.pid,
    cwd: process.cwd(),
    name: SESSION_NAME,
    startedAt: new Date().toISOString(),
  })
  writeRegistry(entries)
}

function deregisterSession(): void {
  try {
    const entries = readRegistry().filter((e) => e.pid !== process.pid)
    writeRegistry(entries)
  } catch {
    // Best-effort cleanup
  }
}

// --- MCP setup ---

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

// --- HTTP server with port discovery ---

let boundPort = -1

for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
  const port = BASE_PORT + i
  try {
    Bun.serve({
      port,
      hostname: '127.0.0.1',
      async fetch(req) {
        const url = new URL(req.url)

        if (req.method === 'GET' && url.pathname === '/health') {
          return Response.json({
            channel: 'code-review',
            pid: process.pid,
            name: SESSION_NAME,
          })
        }

        if (req.method === 'POST' && url.pathname === '/review') {
          const body = await req.text()
          if (!body.trim()) {
            return new Response('empty review', { status: 400 })
          }
          await mcp.notification({
            method: 'notifications/claude/channel',
            params: { content: body },
          })
          return new Response('ok')
        }

        return new Response('not found', { status: 404 })
      },
    })
    boundPort = port
    break
  } catch {
    // Port taken, try next
  }
}

if (boundPort === -1) {
  console.error(
    `No available port in range ${BASE_PORT}-${BASE_PORT + MAX_PORT_ATTEMPTS - 1}`,
  )
  process.exit(1)
}

// --- Session lifecycle ---

registerSession(boundPort)

const cleanup = () => deregisterSession()
process.on('exit', cleanup)
process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})
process.on('SIGINT', () => {
  cleanup()
  process.exit(0)
})
