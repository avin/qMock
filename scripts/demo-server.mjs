import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { apiMockPlugin } from '../dist/index.js';

const server = await createServer({
  root: fileURLToPath(new URL('../examples/basic', import.meta.url)),
  configFile: false,
  plugins: [apiMockPlugin({ stateFile: false })],
  server: { host: '127.0.0.1', port: 4178, strictPort: true },
});
await server.listen();
server.printUrls();

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => { await server.close(); process.exit(); });
}
