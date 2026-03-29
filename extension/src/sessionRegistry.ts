import * as http from 'http';
import * as fs from 'fs';

const REGISTRY_PATH = '/tmp/code-review-sessions.json';

export interface Session {
  port: number;
  pid: number;
  cwd: string;
  name: string;
  startedAt: string;
}

function readRegistry(): Session[] {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function healthCheck(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port, path: '/health', timeout: 2000 },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.channel === 'code-review');
          } catch {
            resolve(false);
          }
        });
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function discoverSessions(): Promise<Session[]> {
  const entries = readRegistry();
  const results = await Promise.all(
    entries.map(async (entry) => ({
      entry,
      alive: await healthCheck(entry.port),
    })),
  );

  const alive = results.filter((r) => r.alive).map((r) => r.entry);

  // Prune dead entries from registry
  if (alive.length !== entries.length) {
    try {
      const tmp = `${REGISTRY_PATH}.tmp.${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(alive, null, 2));
      fs.renameSync(tmp, REGISTRY_PATH);
    } catch {
      // Best-effort
    }
  }

  return alive;
}
