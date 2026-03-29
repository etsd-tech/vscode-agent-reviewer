#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from 'http'
import { readFileSync, writeFileSync, renameSync } from 'fs'
import { basename } from 'path'

const BASE_PORT = 47123
const MAX_PORT_ATTEMPTS = 10
const REGISTRY_PATH = '/tmp/code-review-sessions.json'
const SESSION_NAME = basename(process.cwd())

// --- Session registry ---

function readRegistry() {
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'))
  } catch {
    return []
  }
}

function writeRegistry(entries) {
  const tmp = `${REGISTRY_PATH}.tmp.${process.pid}`
  writeFileSync(tmp, JSON.stringify(entries, null, 2))
  renameSync(tmp, REGISTRY_PATH)
}

function registerSession(port) {
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

function deregisterSession() {
  try {
    const entries = readRegistry().filter((e) => e.pid !== process.pid)
    writeRegistry(entries)
  } catch {
    // Best-effort cleanup
  }
}

// --- Request handler ---

function collectBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
  })
}

function createHandler(mcp) {
  return async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ channel: 'code-review', pid: process.pid, name: SESSION_NAME }))
      return
    }

    if (req.method === 'POST' && req.url === '/review') {
      const body = await collectBody(req)
      if (!body.trim()) {
        res.writeHead(400)
        res.end('empty review')
        return
      }
      await mcp.notification({
        method: 'notifications/claude/channel',
        params: { content: body },
      })
      res.writeHead(200)
      res.end('ok')
      return
    }

    res.writeHead(404)
    res.end('not found')
  }
}

// --- Port discovery ---

function tryListen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening)
      if (err.code === 'EADDRINUSE') resolve(false)
      else reject(err)
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolve(true)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

// --- Main ---

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

const httpServer = createServer(createHandler(mcp))
let boundPort = -1

for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
  const port = BASE_PORT + i
  if (await tryListen(httpServer, port)) {
    boundPort = port
    break
  }
}

if (boundPort === -1) {
  console.error(`No available port in range ${BASE_PORT}-${BASE_PORT + MAX_PORT_ATTEMPTS - 1}`)
  process.exit(1)
}

// --- Session lifecycle ---

registerSession(boundPort)

const cleanup = () => deregisterSession()
process.on('exit', cleanup)
process.on('SIGTERM', () => { cleanup(); process.exit(0) })
process.on('SIGINT', () => { cleanup(); process.exit(0) })
