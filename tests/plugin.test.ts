import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { flattenOverrideLeaves } from '../src/overrideCatalog.js';
import { mockScopeHeader, testOverridePath } from '../src/testOverride.js';
import { baseHandlers, fixture, put } from './helpers.js';
import { build, preview } from 'vite';
import { apiMockPlugin } from '../src/plugin.js';

const overridesPath = '/__apiMocks/overrides';
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(close => close())); });
async function start(files: Record<string, string>, options?: Parameters<typeof fixture>[1]) {
  const project = await fixture({ 'src/mocks/handlers.ts': baseHandlers, ...files }, options);
  cleanup.push(project.close);
  return project;
}
const patch = (body: string) => `export default { name: 'Patch', override: () => (${body}) };`;

describe('real Vite middleware', () => {
  it('returns nested catalog metadata while excluding helpers, declarations, tests and empty groups', async () => {
    const app = await start({
      'src/mocks/overrides/payments/order/content.ts': `export const content = { name: 'Order content', description: 'Long order', params: {
        compact: { type: 'boolean', default: true }, variant: { type: 'string', default: 'short', options: ['short', 'long'] }
      }, override: () => ({}) };`,
      'src/mocks/overrides/_helpers/broken.ts': 'throw new Error("should not load")',
      'src/mocks/overrides/_hidden.ts': 'throw new Error("should not load")',
      'src/mocks/overrides/empty/example.test.ts': 'throw new Error("should not load")',
      'src/mocks/overrides/types.d.ts': 'declare const invalid: never;',
    });
    const result = await (await app.request(overridesPath)).json();
    expect(result.active).toEqual([]);
    expect(result.tree).toMatchObject([{ kind: 'group', id: 'payments', children: [{ id: 'payments/order' }] }]);
    expect(flattenOverrideLeaves(result.tree)).toEqual([{ kind: 'override', id: 'payments/order/content', name: 'Order content', description: 'Long order', params: [
      { key: 'compact', type: 'boolean', default: true },
      { key: 'variant', type: 'string', default: 'short', options: ['short', 'long'] },
    ] }]);
  });

  it('handles exact paths before wildcards, methods independently and query strings through request context', async () => {
    const app = await start({ 'src/mocks/handlers.ts': `export default { handlers: {
      'GET /items/*': async ({ route, url, raw }) => ({ route, path: url.pathname, q: url.searchParams.get('q'), header: raw.headers['x-probe'] }),
      'GET /items/special': { exact: true }, 'POST /items/special': { method: 'post' },
    } };` });
    expect(await (await app.request('/items/special?q=1')).json()).toEqual({ exact: true });
    expect(await (await app.request('/items/special', { method: 'POST' })).json()).toEqual({ method: 'post' });
    expect(await (await app.request('/items/42?q=hello', { headers: { 'x-probe': 'present' } })).json()).toEqual({ route: 'GET /items/*', path: '/items/42', q: 'hello', header: 'present' });
    expect((await app.request('/items/42', { method: 'POST' })).status).toBe(404);
    expect((await app.request('/unknown')).status).toBe(404);
  });

  it('sends JSON scalars, empty, text, custom headers, statuses and binary data', async () => {
    const app = await start({ 'src/mocks/handlers.ts': `export default { handlers: {
      'GET /null': null, 'GET /scalar': false, 'GET /array': [1, 'two'],
      'GET /empty': { kind: 'mock-response', status: 204 },
      'GET /text': { kind: 'mock-response', status: 201, text: 'hello', headers: { 'X-Custom': 'ok' } },
      'GET /binary': { kind: 'mock-response', data: new Uint8Array([0, 128, 255]), headers: { 'Content-Type': 'application/octet-stream' } },
      'GET /error': { kind: 'mock-response', status: 422, headers: { 'Content-Type': 'application/problem+json' }, body: { error: 'invalid' } },
    } };` });
    expect(await (await app.request('/null')).json()).toBeNull();
    expect(await (await app.request('/scalar')).json()).toBe(false);
    expect(await (await app.request('/array')).json()).toEqual([1, 'two']);
    const empty = await app.request('/empty'); expect(empty.status).toBe(204); expect(await empty.text()).toBe('');
    const text = await app.request('/text'); expect(text.status).toBe(201); expect(text.headers.get('x-custom')).toBe('ok'); expect(text.headers.get('content-type')).toContain('text/plain'); expect(await text.text()).toBe('hello');
    const binary = await app.request('/binary'); expect([...new Uint8Array(await binary.arrayBuffer())]).toEqual([0, 128, 255]);
    const error = await app.request('/error'); expect(error.status).toBe(422); expect(error.headers.get('content-type')).toBe('application/problem+json'); expect(await error.json()).toEqual({ error: 'invalid' });
  });

  it('adds, removes and modifies routes with asynchronous patches in active order', async () => {
    const app = await start({
      'src/mocks/overrides/first.ts': patch(`{ 'GET /existing': async body => ({ ...body, history: [...(body.history ?? []), 'first'] }), 'GET /added': () => ({ added: true }), 'GET /removed': null }`),
      'src/mocks/overrides/second.ts': patch(`{ 'GET /existing': async (body, context) => ({ ...body, history: [...(body.history ?? []), context.request.route] }), 'GET /added': () => undefined }`),
    });
    expect((await app.request(overridesPath, put({ active: [{ id: 'first' }, { id: 'second' }] }))).status).toBe(200);
    expect(await (await app.request('/existing')).json()).toEqual({ source: 'base', history: ['first', 'GET /existing'] });
    expect(await (await app.request('/added')).json()).toEqual({ added: true });
    expect((await app.request('/removed')).status).toBe(404);
    await app.request(overridesPath, put({ active: [{ id: 'second' }, { id: 'first' }] }));
    expect(await (await app.request('/existing')).json()).toEqual({ source: 'base', history: ['GET /existing', 'first'] });
  });

  it('keeps original status and headers when a modifier returns a JSON body', async () => {
    const app = await start({ 'src/mocks/handlers.ts': `export default { handlers: { 'GET /existing': { kind: 'mock-response', status: 202, headers: { 'X-Base': 'yes' }, body: { count: 1 } } } };`,
      'src/mocks/overrides/edit.ts': patch(`{ 'GET /existing': body => ({ count: body.count + 1 }) }`) });
    await app.request(overridesPath, put({ active: [{ id: 'edit' }] }));
    const response = await app.request('/existing');
    expect(response.status).toBe(202); expect(response.headers.get('x-base')).toBe('yes'); expect(await response.json()).toEqual({ count: 2 });
  });

  it('normalizes parameters, drops unknown ids, uses the last duplicate and retains disabled entries', async () => {
    const app = await start({ 'src/mocks/overrides/failure.ts': `export default { name: 'Failure', params: {
      enabled: { type: 'boolean', default: false }, status: { type: 'string', default: '503', options: ['503', '404'] }, message: { type: 'string', default: 'unavailable' }
    }, override: params => ({ 'GET /api/demo': { kind: 'mock-response', status: Number(params.status), body: params } }) };` });
    const response = await app.request(overridesPath, put({ active: [{ id: 'missing' }, { id: 'failure', params: { status: '404' } }, { id: 'failure', params: { enabled: 'yes', status: '200', extra: 1 }, isEnabled: false }] }));
    expect(await response.json()).toEqual({ active: [{ id: 'failure', params: { enabled: false, status: '503', message: 'unavailable' }, isEnabled: false }] });
    expect(await (await app.request('/api/demo')).json()).toEqual({ message: 'base', count: 1 });
    await app.request(overridesPath, put({ active: [{ id: 'failure', params: { enabled: true, status: '404', message: 'gone' } }] }));
    const failed = await app.request('/api/demo'); expect(failed.status).toBe(404); expect(await failed.json()).toEqual({ enabled: true, status: '404', message: 'gone' });
    expect(JSON.parse(readFileSync(path.join(app.root, '.mock-overrides.json'), 'utf8')).active[0].params.message).toBe('gone');
  });

  it('isolates parallel scopes, bypasses global overrides for scoped requests and deletes only the requested scope', async () => {
    const app = await start({ 'src/mocks/overrides/global.ts': patch(`{ 'GET /api/demo': { global: true } }`) });
    await app.request(overridesPath, put({ active: [{ id: 'global' }] }));
    const scoped = (scope: string, body: unknown) => app.request(testOverridePath, { ...put(body), headers: { 'content-type': 'application/json', [mockScopeHeader]: scope } });
    await Promise.all([scoped('first', { 'GET /api/demo': { isolated: 1 } }), scoped('second', { 'GET /api/demo': { isolated: 2 } })]);
    const request = (scope?: string) => app.request('/api/demo', scope ? { headers: { [mockScopeHeader]: scope } } : undefined).then(response => response.json());
    expect(await Promise.all([request('first'), request('second'), request(), request('unused')])).toEqual([{ isolated: 1 }, { isolated: 2 }, { global: true }, { message: 'base', count: 1 }]);
    await app.request(testOverridePath, { method: 'DELETE', headers: { [mockScopeHeader]: 'first' } });
    expect(await request('first')).toEqual({ message: 'base', count: 1 }); expect(await request('second')).toEqual({ isolated: 2 });
    await scoped('second', { 'GET /api/demo': null });
    expect((await app.request('/api/demo', { headers: { [mockScopeHeader]: 'second' } })).status).toBe(404);
  });

  it.each(['{', 'null', '{}', '{"active":{}}'])('rejects malformed active payload %s without changing state', async body => {
    const app = await start({});
    expect((await app.request(overridesPath, { method: 'PUT', body })).status).toBe(400);
    expect((await (await app.request(overridesPath)).json()).active).toEqual([]);
  });

  it('rejects scope overrides without a scope and malformed JSON', async () => {
    const app = await start({});
    expect((await app.request(testOverridePath, put({}))).status).toBe(400);
    expect((await app.request(testOverridePath, { method: 'PUT', headers: { [mockScopeHeader]: 'scope' }, body: '{' })).status).toBe(400);
    expect((await app.request(testOverridePath, { method: 'DELETE' })).status).toBe(200);
  });

  it('restores persisted overrides on a fresh Vite server', async () => {
    const files = { 'src/mocks/overrides/restore.ts': patch(`{ 'GET /api/demo': { persisted: true } }`) };
    const first = await start(files);
    await first.request(overridesPath, put({ active: [{ id: 'restore' }] }));
    const state = readFileSync(path.join(first.root, '.mock-overrides.json'), 'utf8');
    const second = await start({ ...files, '.mock-overrides.json': state });
    expect(await (await second.request('/api/demo')).json()).toEqual({ persisted: true });
    expect((await (await second.request(overridesPath)).json()).active).toEqual([{ id: 'restore', params: {}, isEnabled: true }]);
  });

  it('recovers from a malformed persisted state file', async () => {
    const app = await start({ '.mock-overrides.json': '{broken' });
    expect((await (await app.request(overridesPath)).json()).active).toEqual([]);
    expect(await (await app.request('/api/demo')).json()).toEqual({ message: 'base', count: 1 });
  });

  it('reloads changed handlers and discovers added and removed catalog modules without restarting Vite', async () => {
    const app = await start({ 'src/mocks/overrides/initial.ts': patch(`{}`) });
    await app.request('/api/demo');
    writeFileSync(path.join(app.root, 'src/mocks/handlers.ts'), `export default { handlers: { 'GET /api/demo': { reloaded: true } } };`);
    await expect.poll(async () => (await app.request('/api/demo')).json()).toEqual({ reloaded: true });
    writeFileSync(path.join(app.root, 'src/mocks/overrides/new.ts'), patch(`{ 'GET /api/demo': { newlyAdded: true } }`));
    await expect.poll(async () => flattenOverrideLeaves((await (await app.request(overridesPath)).json()).tree).map(leaf => leaf.id)).toEqual(['initial', 'new']);
    await app.request(overridesPath, put({ active: [{ id: 'new' }] }));
    expect(await (await app.request('/api/demo')).json()).toEqual({ newlyAdded: true });
    rmSync(path.join(app.root, 'src/mocks/overrides/new.ts'));
    await expect.poll(async () => (await (await app.request(overridesPath)).json()).active).toEqual([]);
    expect(await (await app.request('/api/demo')).json()).toEqual({ reloaded: true });
  });

  it('excludes mocks and dashboard from production output and the Vite preview server', async () => {
    const app = await start({ 'index.html': '<html><body>Production application</body></html>' });
    await build({ root: app.root, configFile: false, logLevel: 'silent', plugins: [apiMockPlugin()], build: { minify: false } });
    const html = readFileSync(path.join(app.root, 'dist/index.html'), 'utf8');
    expect(html).toContain('Production application'); expect(html).not.toContain('__apiMocks');
    expect(existsSync(path.join(app.root, 'dist/ui'))).toBe(false);
    const server = await preview({ root: app.root, configFile: false, appType: 'custom', logLevel: 'silent', plugins: [apiMockPlugin()], preview: { host: '127.0.0.1', port: 0 } });
    try {
      const address = server.httpServer.address() as import('node:net').AddressInfo;
      const base = `http://127.0.0.1:${address.port}`;
      expect((await fetch(base + '/__apiMocks/overrides')).status).toBe(404);
      expect((await fetch(base + '/__apiMocks')).status).toBe(404);
      expect((await fetch(base + '/api/demo')).status).toBe(404);
    } finally { await new Promise<void>((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve())); }
  });

  it('supports configured handler, override and persistence locations', async () => {
    const app = await start({
      'custom/handlers.ts': `export default { handlers: { 'GET /custom': { base: true } } };`,
      'custom/scenarios/change.ts': patch(`{ 'GET /custom': { custom: true } }`),
    }, { handlers: '/custom/handlers.ts', overrides: 'custom/scenarios', stateFile: 'custom/state.json' });
    await app.request(overridesPath, put({ active: [{ id: 'change' }] }));
    expect(await (await app.request('/custom')).json()).toEqual({ custom: true });
    expect(JSON.parse(readFileSync(path.join(app.root, 'custom/state.json'), 'utf8')).active[0].id).toBe('change');
    expect(existsSync(path.join(app.root, '.mock-overrides.json'))).toBe(false);
  });

  it('disables persistence while still applying active overrides in memory', async () => {
    const app = await start({ 'src/mocks/overrides/change.ts': patch(`{ 'GET /api/demo': { changed: true } }`), '.mock-overrides.json': '{"active":[{"id":"change"}]}' }, { stateFile: false });
    expect(await (await app.request('/api/demo')).json()).toEqual({ message: 'base', count: 1 });
    await app.request(overridesPath, put({ active: [{ id: 'change' }] }));
    expect(await (await app.request('/api/demo')).json()).toEqual({ changed: true });
    expect(readFileSync(path.join(app.root, '.mock-overrides.json'), 'utf8')).toBe('{"active":[{"id":"change"}]}');
  });

  it('does not activate edits when persistence fails', async () => {
    const app = await start({
      'src/mocks/overrides/change.ts': patch(`{ 'GET /api/demo': { changed: true } }`),
      'blocked': 'A file cannot be used as a state directory',
    }, { stateFile: 'blocked/state.json' });
    expect((await app.request(overridesPath, put({ active: [{ id: 'change' }] }))).status).toBe(500);
    expect((await (await app.request(overridesPath)).json()).active).toEqual([]);
    expect(await (await app.request('/api/demo')).json()).toEqual({ message: 'base', count: 1 });
    expect(readFileSync(path.join(app.root, 'blocked'), 'utf8')).toBe('A file cannot be used as a state directory');
  });

  it('bounds control request sizes and remains usable after an oversized payload', async () => {
    const app = await start({}, { maxBodyBytes: 32 });
    expect((await app.request(overridesPath, put({ active: [], padding: 'x'.repeat(100) }))).status).toBe(413);
    expect((await app.request(overridesPath, put({ active: [] }))).status).toBe(200);
    expect((await app.request(testOverridePath, { ...put({ 'GET /api/demo': { padding: 'x'.repeat(100) } }), headers: { [mockScopeHeader]: 'scope' } })).status).toBe(413);
  });

  it.each([null, [], 1, { 'bad route': {} }, { 'GET /api/demo': { kind: 'mock-response', status: 700 } }, { 'GET /api/demo': { kind: 'mock-response', status: 103 } },
    { 'GET /api/demo': { kind: 'mock-response', text: 1 } }, { 'GET /api/demo': { kind: 'mock-response', data: [1] } },
    { 'GET /api/demo': { kind: 'mock-response', headers: { 'X-Test': 'bad\r\nheader' } } },
    { 'GET /api/demo': { kind: 'mock-response', headers: { 'bad name': 'value' } } },
    { 'GET /api/demo': { kind: 'mock-response', headers: { 'X-Test': '\u0000invalid' } } },
    { 'GET /api/demo': { kind: 'mock-response', headers: { 'X-Test': '😀' } } },
  ])('rejects invalid inline override %j', async body => {
    const app = await start({});
    expect((await app.request(testOverridePath, { ...put(body), headers: { [mockScopeHeader]: 'scope' } })).status).toBe(400);
    expect(await (await app.request('/api/demo', { headers: { [mockScopeHeader]: 'scope' } })).json()).toEqual({ message: 'base', count: 1 });
  });

  it('rejects JSON numeric overflow in inline responses', async () => {
    const app = await start({});
    const response = await app.request(testOverridePath, { method: 'PUT', headers: { [mockScopeHeader]: 'scope' }, body: '{"GET /api/demo":{"value":1e999}}' });
    expect(response.status).toBe(400);
  });
});
