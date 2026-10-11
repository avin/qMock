import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

// Run after building with npm run test:playwright-compat. Reuse an installed browser.
const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
assert(npmCli, 'Run this test with npm run test:playwright-compat');
const version = process.env.QMOCK_PLAYWRIGHT_VERSION ?? '1.30.0';
const browserPath = chromium.executablePath();
assert(existsSync(browserPath), 'Install Chromium before running the compatibility check');
const temporary = mkdtempSync(path.join(tmpdir(), 'qmock-playwright-compat-'));
const consumer = path.join(temporary, 'consumer');
const environment = { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1', QMOCK_CHROMIUM_PATH: browserPath, FORCE_COLOR: '0' };
const npm = (args, cwd) => execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', env: environment, stdio: ['ignore', 'pipe', 'pipe'] });

try {
  const [packed] = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], root));
  mkdirSync(consumer);
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', path.join(temporary, packed.filename), `@playwright/test@${version}`, '@types/node@24'], consumer);
  const installedVersion = JSON.parse(readFileSync(path.join(consumer, 'node_modules/@playwright/test/package.json'), 'utf8')).version;
  assert.equal(installedVersion, version, 'npm must preserve the requested Playwright version');
  mkdirSync(path.join(consumer, 'src/mocks'), { recursive: true });
  writeFileSync(path.join(consumer, 'src/mocks/handlers.ts'), `
import { defineMockConfiguration, readRequestBody } from '@avinlab/qmock';
export default defineMockConfiguration({ handlers: {
  'GET /api/user': { name: 'base' },
  'POST /api/order': async request => ({ text: await readRequestBody(request), token: request.raw.headers['x-token'] }),
  'GET /api/text': { kind: 'mock-response', status: 201, text: 'hello', headers: { 'x-example': 'test' } },
  'GET /api/cookies': { kind: 'mock-response', body: { ok: true }, headers: { 'Set-Cookie': ['first=one; Path=/', 'second=two; Path=/'] } },
} });
`);
  writeFileSync(path.join(consumer, 'direct.mjs'), `
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { applyMocks } from '@avinlab/qmock/playwright';
const browser = await chromium.launch({ executablePath: process.env.QMOCK_CHROMIUM_PATH });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).pathname === '/'
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Compatibility</title>' })
    : route.fulfill({ contentType: 'application/json', body: '{"fallback":true}' }));
  const scope = await applyMocks(context);
  const page = await context.newPage();
  await page.goto('http://qmock.invalid/');
  assert.deepEqual(await page.evaluate(async () => (await fetch('/api/user')).json()), { name: 'base' });
  assert.deepEqual(await page.evaluate(async () => (await fetch('/api/order', { method: 'POST', headers: { 'x-token': 'sample' }, body: 'payload' })).json()), { text: 'payload', token: 'sample' });
  assert.deepEqual(await page.evaluate(async () => {
    const response = await fetch('/api/text');
    return { status: response.status, header: response.headers.get('x-example'), text: await response.text() };
  }), { status: 201, header: 'test', text: 'hello' });
  await page.evaluate(async () => { await fetch('/api/cookies'); });
  assert.deepEqual((await context.cookies()).map(cookie => [cookie.name, cookie.value]).sort(), [['first', 'one'], ['second', 'two']]);
  scope.set({ 'GET /api/user': { name: 'scenario' } });
  assert.deepEqual(await page.evaluate(async () => (await fetch('/api/user')).json()), { name: 'scenario' });
  scope.clear();
  assert.deepEqual(await page.evaluate(async () => (await fetch('/api/user')).json()), { name: 'base' });
  assert.deepEqual(await page.evaluate(async () => (await fetch('/unmatched')).json()), { fallback: true });
  await scope.dispose();
  await scope.dispose();
  assert.deepEqual(await page.evaluate(async () => (await fetch('/api/user')).json()), { fallback: true });
  await context.close();
} finally { await browser.close(); }
console.log('Direct packaged Playwright adapter passed.');
`);
  execFileSync(process.execPath, ['direct.mjs'], { cwd: consumer, env: environment, stdio: 'inherit', timeout: 30000 });

  writeFileSync(path.join(consumer, 'playwright.config.ts'), `
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', workers: 1, reporter: 'line', timeout: 10000,
  use: { serviceWorkers: 'block', launchOptions: { executablePath: process.env.QMOCK_CHROMIUM_PATH } } });
`);
  mkdirSync(path.join(consumer, 'tests'));
  writeFileSync(path.join(consumer, 'tests/fixture.spec.ts'), `
import { test as base, expect } from '@playwright/test';
import { createMockTest } from '@avinlab/qmock/playwright';
const custom = base.extend<{ accountId: string }, { tenantId: number }>({
  accountId: async ({}, use) => { await use('account'); },
  tenantId: [async ({}, use) => { await use(42); }, { scope: 'worker' }],
});
const test = createMockTest(custom);
test.beforeEach(async ({ context }) => {
  await context.route('http://qmock.invalid/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Fixture</title>' }));
});
test('uses default handlers and custom fixtures', async ({ page, mockScope, accountId, tenantId }) => {
  expect(accountId).toBe('account'); expect(tenantId).toBe(42);
  mockScope.set({ 'GET /api/user': { name: 'scenario' } });
  await page.goto('http://qmock.invalid/');
  expect(await page.evaluate(async () => (await fetch('/api/user')).json())).toEqual({ name: 'scenario' });
});
test('starts the next test with base handlers', async ({ page }) => {
  await page.goto('http://qmock.invalid/');
  expect(await page.evaluate(async () => (await fetch('/api/user')).json())).toEqual({ name: 'base' });
});
`);
  execFileSync(process.execPath, [path.join(consumer, 'node_modules/@playwright/test/cli.js'), 'test'], { cwd: consumer, env: environment, stdio: 'inherit', timeout: 30000 });

  writeFileSync(path.join(consumer, 'types.ts'), `
import { test as base } from '@playwright/test';
import { applyMocks, createMockTest } from '@avinlab/qmock/playwright';
const custom = base.extend<{ accountId: string }, { tenantId: number }>({
  accountId: async ({}, use) => { await use('account'); },
  tenantId: [async ({}, use) => { await use(42); }, { scope: 'worker' }],
});
const test = createMockTest(custom);
test('consumer fixture types', async ({ accountId, tenantId, mockScope, page, context }) => {
  const account: string = accountId; const tenant: number = tenantId;
  const name: string = mockScope.name;
  mockScope.set({ 'GET /api/user': { account, tenant, name } });
  // @ts-expect-error Custom worker fixture types must remain precise.
  const invalid: string = tenantId;
  await mockScope.dispose();
  await page.goto('/');
  const scope = await applyMocks(context);
  await scope.dispose();
});
`);
  // Old Playwright's declarations use legacy namespaces rejected by TypeScript 6.
  // Consumer expressions still undergo strict checking, including the expected type error.
  execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2023', 'types.ts'], { cwd: consumer, env: environment, stdio: 'inherit', timeout: 30000 });
  console.log(`Packaged Playwright ${installedVersion} compatibility passed: browser interception, default TypeScript handlers, automatic fixtures and strict public declaration types.`);
} finally {
  const resolvedTemporary = path.resolve(temporary);
  assert(resolvedTemporary.startsWith(path.resolve(tmpdir()) + path.sep + 'qmock-playwright-compat-'), 'Refusing to clean an unexpected path');
  rmSync(resolvedTemporary, { recursive: true, force: true });
}
