import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { chromium, test as playwrightBase } from '@playwright/test';
import type { Browser, BrowserContext } from '@playwright/test';
import { applyMocks, createMockTest } from '../src/playwright.js';
import type { PlaywrightMockScope } from '../src/playwright.js';
import { defineMockOverride, json, readRequestBody } from '../src/utils.js';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser?.close(); });

// A browser document and unmatched responses supplied locally: no HTTP server exists.
async function documentContext() {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).pathname === '/') {
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>QMock test</title>' });
    } else {
      await route.fulfill({ contentType: 'application/json', body: '{"fallback":true}' });
    }
  });
  return context;
}

describe('Playwright adapter without a server', () => {
  it('preserves custom test and worker fixture types', () => {
    const base = playwrightBase.extend<{ accountId: string }, { tenantId: number }>({
      accountId: async ({}, use) => { await use('account'); },
      tenantId: [async ({}, use) => { await use(42); }, { scope: 'worker' }],
    });
    const test = createMockTest(base);
    type Args = Parameters<Parameters<typeof test>[2]>[0];
    expectTypeOf<Args['accountId']>().toEqualTypeOf<string>();
    expectTypeOf<Args['tenantId']>().toEqualTypeOf<number>();
    expectTypeOf<Args['mockScope']>().toEqualTypeOf<PlaywrightMockScope>();
    expectTypeOf<Args['context']>().toEqualTypeOf<BrowserContext>();
  });

  it('executes async handlers and parameterized overrides with request bodies and response metadata', async () => {
    const context = await documentContext();
    try {
      const scenario = defineMockOverride({
        name: 'Failure',
        params: { message: { type: 'string', default: 'default' } },
        override: ({ message }) => ({
          'POST /api/order': (original) => json({ ...original, error: message }, 422),
        }),
      });
      const scope = await applyMocks(context, {
        configuration: { handlers: {
          'POST /api/order': async request => ({ body: await readRequestBody(request), query: request.url.searchParams.get('id') }),
          'GET /api/text': { kind: 'mock-response', status: 201, text: 'hello', headers: { 'x-example': 'test', 'Content-Type': 'text/plain' } },
          'GET /api/bytes': { kind: 'mock-response', data: new Uint8Array([0, 255, 127]) },
          'GET /api/cookies': { kind: 'mock-response', body: { ok: true }, headers: { 'Set-Cookie': ['first=one; Path=/', 'second=two; Path=/'] } },
        } },
        overrides: [{ override: scenario, params: { message: 'declined' } }],
      });
      const page = await context.newPage();
      await page.goto('http://qmock.invalid/');
      const order = await page.evaluate(async () => {
        const response = await fetch('/api/order?id=42', { method: 'POST', body: 'payload' });
        return { status: response.status, body: await response.json() };
      });
      expect(order).toEqual({ status: 422, body: { body: 'payload', query: '42', error: 'declined' } });
      expect(await page.evaluate(async () => {
        const response = await fetch('/api/text');
        return { status: response.status, header: response.headers.get('x-example'), text: await response.text() };
      })).toEqual({ status: 201, header: 'test', text: 'hello' });
      expect(await page.evaluate(async () => [...new Uint8Array(await (await fetch('/api/bytes')).arrayBuffer())])).toEqual([0, 255, 127]);
      await page.evaluate(async () => { await fetch('/api/cookies'); });
      expect((await context.cookies()).map(cookie => [cookie.name, cookie.value]).sort()).toEqual([['first', 'one'], ['second', 'two']]);
      await scope.dispose();
    } finally { await context.close(); }
  });

  it('isolates browser contexts and mutations, then restores existing routes on disposal', async () => {
    const contexts = await Promise.all([documentContext(), documentContext()]);
    try {
      const configuration = { handlers: { 'GET /api/user': { name: 'base' } } } as const;
      const scopes = await Promise.all(contexts.map(context => applyMocks(context, { name: 'same-name', configuration })));
      scopes[0]!.set({ 'GET /api/user': { name: 'first' } });
      scopes[1]!.set({ 'GET /api/user': { name: 'second' } });
      const pages = await Promise.all(contexts.map(context => context.newPage()));
      await Promise.all(pages.map(page => page.goto('http://qmock.invalid/')));
      const read = (index: number, path = '/api/user') => pages[index]!.evaluate(async path => (await fetch(path)).json(), path);
      expect(await Promise.all([read(0), read(1)])).toEqual([{ name: 'first' }, { name: 'second' }]);
      scopes[0]!.clear();
      expect(await read(0)).toEqual({ name: 'base' });
      expect(await read(1)).toEqual({ name: 'second' });
      expect(await read(0, '/unmatched')).toEqual({ fallback: true });
      scopes[0]!.set({ 'GET /api/user': null });
      expect(await read(0)).toEqual({ fallback: true });
      await scopes[1]!.dispose();
      await scopes[1]!.dispose();
      expect(await read(1)).toEqual({ fallback: true });
    } finally { await Promise.all(contexts.map(context => context.close())); }
  });

  it('supports page-level interception without changing another page', async () => {
    const context: BrowserContext = await documentContext();
    try {
      const first = await context.newPage();
      const second = await context.newPage();
      const scope = await applyMocks(first, { configuration: { handlers: { 'GET /api/user': { mocked: true } } } });
      await Promise.all([first.goto('http://qmock.invalid/'), second.goto('http://qmock.invalid/')]);
      const results = await Promise.all([first, second].map(page => page.evaluate(async () => (await fetch('/api/user')).json())));
      expect(results).toEqual([{ mocked: true }, { fallback: true }]);
      await scope.dispose();
    } finally { await context.close(); }
  });

  it('runs the automatic fixture in Playwright with no webServer configuration', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'qmock-playwright-'));
    const require = createRequire(import.meta.url);
    const playwrightModule = JSON.stringify(require.resolve('@playwright/test').replaceAll('\\', '/'));
    const adapterModule = JSON.stringify(fileURLToPath(new URL('../src/playwright.ts', import.meta.url)).replaceAll('\\', '/'));
    try {
      await mkdir(join(folder, 'src/mocks'), { recursive: true });
      await writeFile(join(folder, 'src/mocks/handlers.ts'), `
        const user: { name: string } = { name: 'base' };
        export default { handlers: { 'GET /api/user': user } };
      `);
      await writeFile(join(folder, 'playwright.config.ts'), `
        import { defineConfig } from ${playwrightModule};
        export default defineConfig({ testDir: '.', workers: 1, reporter: 'line', timeout: 10000 });
      `);
      await writeFile(join(folder, 'fixture.spec.ts'), `
        import { test as base, expect } from ${playwrightModule};
        import { createMockTest } from ${adapterModule};
        const custom = base.extend<{ accountId: string }, { tenantId: number }>({
          accountId: async ({}, use) => { await use('account'); },
          tenantId: [async ({}, use) => { await use(42); }, { scope: 'worker' }],
        });
        const test = createMockTest(custom);
        test.beforeEach(async ({ context }) => {
          await context.route('http://qmock.invalid/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Fixture</title>' }));
        });
        test('applies a scenario', async ({ page, mockScope, accountId, tenantId }) => {
          expect(accountId).toBe('account');
          expect(tenantId).toBe(42);
          mockScope.set({ 'GET /api/user': { name: 'scenario' } });
          await page.goto('http://qmock.invalid/');
          expect(await page.evaluate(async () => (await fetch('/api/user')).json())).toEqual({ name: 'scenario' });
        });
        test('starts the next test from base handlers', async ({ page }) => {
          await page.goto('http://qmock.invalid/');
          expect(await page.evaluate(async () => (await fetch('/api/user')).json())).toEqual({ name: 'base' });
        });
      `);
      const result = await promisify(execFile)(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '--config', join(folder, 'playwright.config.ts')], {
        cwd: folder, timeout: 30000, env: { ...process.env, FORCE_COLOR: '0' },
      });
      expect(result.stdout).toContain('2 passed');
    } finally { await rm(folder, { recursive: true, force: true }); }
  }, 40000);
});
