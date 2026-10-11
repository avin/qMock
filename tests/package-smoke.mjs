import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Run after building, through npm run test:package so npm_execpath is available.
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(path.join(os.tmpdir(), 'qmock-package-'));
const consumer = path.join(temporary, 'consumer');
const npmCli = process.env.npm_execpath;
assert(npmCli, 'Run this test with npm run test:package');
const npm = (args, cwd) => execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
try {
  const [packed] = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], root));
  const names = packed.files.map(file => file.path);
  for (const required of ['dist/index.js', 'dist/index.d.ts', 'dist/testing.js', 'dist/vitest.js', 'dist/playwright.js', 'dist/cypress.js', 'dist/cypressNode.js', 'dist/browser.js', 'dist/ui/index.html', 'dist/cli.js', 'skills/qmock/SKILL.md']) assert(names.includes(required), `Missing packaged ${required}`);
  assert.deepEqual([...new Set(names.filter(name => name.startsWith('skills/')).map(name => name.split('/')[1]))], ['qmock'], 'The package must contain one self-contained skill');
  assert(names.some(name => name.startsWith('dist/ui/assets/') && name.endsWith('.js')), 'No prebuilt dashboard JavaScript');
  assert(names.some(name => name.startsWith('dist/ui/assets/') && name.endsWith('.css')), 'No prebuilt dashboard CSS');
  assert(!names.some(name => name.startsWith('src/') || name.startsWith('ui/') || name.startsWith('tests/')), 'Source-only development files leaked into the package');

  mkdirSync(consumer);
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const requestedVite = process.env.QMOCK_VITE_VERSION;
  npm(['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', path.join(temporary, packed.filename), ...(requestedVite ? [`vite@${requestedVite}`] : [])], consumer);
  const installation = path.join(consumer, 'node_modules/@avinlab/qmock');
  const manifest = JSON.parse(readFileSync(path.join(installation, 'package.json'), 'utf8'));
  for (const name of ['react', 'react-dom', '@base-ui/react', '@dnd-kit/core', '@dnd-kit/sortable']) {
    assert(!manifest.dependencies?.[name] && !manifest.peerDependencies?.[name], `${name} must not be a runtime dependency`);
    assert(!existsSync(path.join(consumer, 'node_modules', name)), `${name} was installed in a production-only consumer`);
  }
  mkdirSync(path.join(consumer, 'src/mocks/overrides'), { recursive: true });
  writeFileSync(path.join(consumer, 'src/mocks/handlers.ts'), `import { defineMockConfiguration } from '@avinlab/qmock'; export default defineMockConfiguration({ handlers: { 'GET /api/demo': { ready: true } } });`);
  writeFileSync(path.join(consumer, 'src/mocks/overrides/failure.ts'), `import { defineMockOverride, json } from '@avinlab/qmock'; export default defineMockOverride({ name: 'Failure', params: { enabled: { type: 'boolean', default: true } }, override: params => ({ 'GET /api/demo': json({ failed: params.enabled }, 503) }) });`);
  writeFileSync(path.join(consumer, 'testing-smoke.mjs'), String.raw`
import assert from 'node:assert/strict';
import { createMockScope } from '@avinlab/qmock/testing';
import { createMockScope as createVitestScope } from '@avinlab/qmock/vitest';
import { applyMocks, createMockTest } from '@avinlab/qmock/playwright';
import { applyMocks as applyCypressMocks } from '@avinlab/qmock/cypress';
import { registerMocks } from '@avinlab/qmock/cypress/node';
const scope = await createMockScope();
assert.deepEqual(await (await scope.fetch('/api/demo')).json(), { ready: true });
scope.set({ 'GET /api/demo': { scoped: true } });
assert.deepEqual(await (await scope.fetch('/api/demo')).json(), { scoped: true });
scope.clear();
const vitestScope = await createVitestScope();
const original = globalThis.fetch;
await vitestScope.run(async () => {
  assert.deepEqual(await (await fetch('/api/demo')).json(), { ready: true });
});
assert.equal(globalThis.fetch, original);
assert.equal(typeof applyMocks, 'function');
assert.equal(typeof createMockTest, 'function');
assert.equal(typeof applyCypressMocks, 'function');
assert.equal(typeof registerMocks, 'function');
console.log('Server-free package adapters passed with default TypeScript handlers.');
`);
  execFileSync(process.execPath, ['testing-smoke.mjs'], { cwd: consumer, stdio: 'inherit' });
  writeFileSync(path.join(consumer, 'smoke.mjs'), String.raw`
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { apiMockPlugin } from '@avinlab/qmock';
import { flattenOverrideLeaves } from '@avinlab/qmock/catalog';
const server = await createServer({ root: process.cwd(), configFile: false, appType: 'custom', logLevel: 'silent', plugins: [apiMockPlugin()], optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const base = 'http://127.0.0.1:' + server.httpServer.address().port;
try {
  const request = (url, init) => fetch(base + url, init);
  assert.deepEqual(await (await request('/api/demo')).json(), { ready: true });
  const catalog = await (await request('/__apiMocks/overrides')).json();
  assert.equal(flattenOverrideLeaves(catalog.tree)[0].id, 'failure');
  const htmlResponse = await request('/__apiMock'); assert.equal(htmlResponse.status, 200); assert.match(htmlResponse.headers.get('content-type'), /text\/html/);
  const html = await htmlResponse.text(); assert.match(html, /<div id="root">/);
  const assets = [...html.matchAll(/(?:src|href)="(\/__apiMock\/assets\/[^" ]+)"/g)].map(match => match[1]); assert(assets.length >= 2);
  for (const url of assets) { const response = await request(url); assert.equal(response.status, 200); assert((await response.text()).length > 100); }
  assert.equal((await request('/__apiMock/assets/missing.js')).status, 404);
  assert.equal((await request('/__apiMock', { method: 'POST' })).status, 405);
  assert.equal((await request('/__apiMock/%2e%2e%2findex.js')).status, 404);
  const head = await request('/__apiMock', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
} finally { await server.close(); }
`);
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: consumer, stdio: 'inherit' });

  const cli = path.join(installation, 'dist/cli.js');
  execFileSync(process.execPath, [cli, 'install-skills'], { cwd: consumer, stdio: 'pipe' });
  const skill = path.join(consumer, '.agents/skills/qmock/SKILL.md');
  assert(existsSync(skill));
  assert.deepEqual(readdirSync(path.join(consumer, '.agents/skills')), ['qmock']);
  assert.equal(readFileSync(skill, 'utf8'), readFileSync(path.join(installation, 'skills/qmock/SKILL.md'), 'utf8'));
  assert(existsSync(path.join(consumer, '.agents/skills/qmock/agents/openai.yaml')));
  writeFileSync(skill, 'User customization must survive');
  const refused = spawnSync(process.execPath, [cli, 'install-skills'], { cwd: consumer, encoding: 'utf8' });
  assert.equal(refused.status, 1); assert.match(refused.stderr, /already exists/); assert.equal(readFileSync(skill, 'utf8'), 'User customization must survive');
  const customTarget = path.join(consumer, 'custom skills');
  execFileSync(process.execPath, [cli, 'install-skills', '--target', customTarget], { cwd: consumer, stdio: 'pipe' });
  assert(existsSync(path.join(customTarget, 'qmock/SKILL.md')));
  assert.deepEqual(readdirSync(customTarget), ['qmock']);
  const occupiedTarget = path.join(consumer, 'existing skills');
  mkdirSync(path.join(occupiedTarget, 'unrelated'), { recursive: true });
  writeFileSync(path.join(occupiedTarget, 'unrelated/SKILL.md'), 'Existing skill');
  execFileSync(process.execPath, [cli, 'install-skills', '--target', occupiedTarget], { cwd: consumer, stdio: 'pipe' });
  assert(existsSync(path.join(occupiedTarget, 'qmock/SKILL.md')));
  assert.equal(readFileSync(path.join(occupiedTarget, 'unrelated/SKILL.md'), 'utf8'), 'Existing skill');
  const invalid = spawnSync(process.execPath, [cli, 'install-skills', '--unknown'], { cwd: consumer, encoding: 'utf8' });
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /Usage/);

  writeFileSync(path.join(consumer, 'typecheck.ts'), `import { defineMockOverride, defineMockHandlers, json } from '@avinlab/qmock';
import { createMockScope } from '@avinlab/qmock/testing';
import { createMockScope as createVitestScope } from '@avinlab/qmock/vitest';
const scenario = defineMockOverride({ name: 'Error', params: { fail: { type: 'boolean', default: true } }, override: params => ({ 'GET /api/demo': json({ fail: params.fail }, 503) }) });
createMockScope({ overrides: [{ override: scenario, params: { fail: true } }] });
createVitestScope().then(scope => scope.run(async () => scope.fetch('/api/demo')));
defineMockHandlers({ 'POST /api/example': async request => json({ route: request.route, query: request.url.search }) });
defineMockOverride({ name: 'Typed params', params: { flag: { type: 'boolean', default: true }, text: { type: 'string', default: 'value' } }, override: params => {
  const flag: boolean = params.flag; const text: string = params.text;
  // @ts-expect-error String parameters must not widen to booleans.
  const invalid: boolean = params.text;
  return { 'GET /api/example': json({ flag, text }) };
} });`);
  execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', 'typecheck.ts'], { cwd: consumer, stdio: 'inherit' });
  const installedVite = JSON.parse(readFileSync(path.join(consumer, 'node_modules/vite/package.json'), 'utf8')).version;
  console.log(`Packed consumer smoke passed (Vite ${installedVite}): React-free install, public exports, real Vite API/dashboard assets, skills CLI and inferred TypeScript parameters.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
