import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { mockApiPlugin } from '../src/plugin.js';

export async function fixture(files: Record<string, string>, options: Parameters<typeof mockApiPlugin>[0] = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'qmock-test-'));
  for (const [name, source] of Object.entries(files)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  const server = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'silent',
    plugins: [mockApiPlugin(options)], optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 0 },
  });
  await server.listen();
  const base = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
  return { root, server, base,
    request: (url: string, init?: RequestInit) => fetch(base + url, init),
    close: async () => { await server.close(); rmSync(root, { recursive: true, force: true }); },
  };
}

export function put(value: unknown): RequestInit {
  return { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) };
}

export const baseHandlers = `export default { handlers: {
  'GET /api/demo': { message: 'base', count: 1 },
  'GET /existing': { source: 'base' },
  'GET /removed': { source: 'base' },
} };`;
