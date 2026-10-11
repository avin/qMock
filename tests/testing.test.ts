import { afterEach, describe, expect, it } from 'vitest';
import { createMockScope } from '../src/testing.js';
import { apiMockPlugin } from '../src/plugin.js';
import { defineMockConfiguration, defineMockHandlers, defineMockOverride, json, readFormData, readRequestBody } from '../src/utils.js';
import { Readable } from 'node:stream';
import type { MockRequest } from '../src/utils.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanup.splice(0).map(close => close())); });
describe('public testing helpers', () => {
  it('isolates same-name scopes, replaces patches and restores initial scenarios on clear', async () => {
    const configuration = defineMockConfiguration({ handlers: { 'GET /api/demo': { count: 1 } } });
    const scope = await createMockScope({ configuration, name: 'scenario', patches: { 'GET /api/demo': { count: 2 } } });
    const other = await createMockScope({ configuration, name: 'scenario' });
    scope.set({ 'GET /api/demo': { count: 3 }, 'GET /new': { added: true } });
    expect(await (await scope.fetch('/api/demo')).json()).toEqual({ count: 3 });
    expect(await (await other.fetch('/api/demo')).json()).toEqual({ count: 1 });
    scope.set({ 'GET /api/demo': { count: 4 } });
    await expect(scope.fetch('/new')).rejects.toThrow('No mock response');
    scope.clear();
    expect(await (await scope.fetch('/api/demo')).json()).toEqual({ count: 2 });
    const generated = await createMockScope({ configuration }); expect(generated.name).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('loads default TypeScript handlers and tsconfig aliases without a server', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'qmock-core-')); cleanup.push(() => rm(root, { recursive: true, force: true }));
    await mkdir(path.join(root, 'src/mocks'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
    await writeFile(path.join(root, 'tsconfig.json'), '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}');
    await writeFile(path.join(root, 'src/data.ts'), 'export const name: string = "Loaded";');
    await writeFile(path.join(root, 'src/mocks/handlers.ts'), 'import { name } from "@/data"; export default { handlers: { "GET /api/demo": { name } } };');
    const scope = await createMockScope({ root });
    expect(await (await scope.fetch('/api/demo')).json()).toEqual({ name: 'Loaded' });
    const explicit = await createMockScope({ root, configuration: 'src/mocks/handlers.ts' });
    expect(await (await explicit.fetch('/api/demo')).json()).toEqual({ name: 'Loaded' });
    await expect(createMockScope({ root, configuration: 'missing.ts' })).rejects.toThrow(path.join(root, 'missing.ts'));
  });
  it.each(['', '   '])('rejects an invalid scope name %j', async name => {
    await expect(createMockScope({ name, configuration: { handlers: {} } })).rejects.toThrow(TypeError);
  });
  it('orders parameterized overrides and supports wildcard, disabled and added routes', async () => {
    const first = defineMockOverride({ name: 'First', params: { tag: { type: 'string', default: 'A' }, enabled: { type: 'boolean', default: true } }, override: ({ tag, enabled }) => ({
      'GET /api/*': body => ({ ...body, sequence: enabled ? tag : '' }),
      'GET /added': json(null),
    }) });
    const second = defineMockOverride({ name: 'Second', override: () => ({ 'GET /api/*': body => ({ ...body, sequence: `${body?.sequence}B` }) }) });
    const scope = await createMockScope({ configuration: { handlers: {
      'GET /api/*': { sequence: '', stable: true }, 'GET /api/exact': { exact: true },
    } }, overrides: [{ override: first, params: { tag: 'X', enabled: true } }, second] });
    expect(await (await scope.fetch('/api/child?q=1')).json()).toEqual({ sequence: 'XB', stable: true });
    expect(await (await scope.fetch('/api/exact')).json()).toEqual({ exact: true });
    expect(await (await scope.fetch('/added')).json()).toBeNull();
    scope.set({ 'GET /api/*': null });
    expect(await scope.handle(new Request('http://any/api/child'))).toBeUndefined();
    scope.clear();
    expect(await (await scope.fetch('/api/child')).json()).toEqual({ sequence: 'XB', stable: true });
  });
  it('does not let mutating modifiers contaminate shared static handlers', async () => {
    const configuration = { handlers: { 'GET /': { count: 0 } } } as const;
    const scope = await createMockScope({ configuration, patches: { 'GET /': body => { body!.count = Number(body!.count) + 1; return body; } } });
    expect(await (await scope.fetch('/')).json()).toEqual({ count: 1 });
    expect(await (await scope.fetch('/')).json()).toEqual({ count: 1 });
    expect(configuration.handlers['GET /']).toEqual({ count: 0 });
  });
  it('preserves request method, headers, query and body helper behavior', async () => {
    const scope = await createMockScope({ configuration: { handlers: {
      'POST /echo': async request => json({ method: request.raw.method!, header: request.raw.headers['x-value'] as string, query: request.url.searchParams.get('q'), body: await readRequestBody(request) }, 201),
      'POST /form': async request => ({ name: (await readFormData(request)).get('name') }),
    } } });
    const response = await scope.fetch('/echo?q=test', { method: 'POST', body: '{"value":1}', headers: { 'x-value': 'yes' } });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ method: 'POST', header: 'yes', query: 'test', body: '{"value":1}' });
    expect(await (await scope.fetch('/form', { method: 'POST', body: 'name=Jane+Doe' })).json()).toEqual({ name: 'Jane Doe' });
  });
  it('serializes text, bytes, empty and HEAD responses correctly', async () => {
    const scope = await createMockScope({ configuration: { handlers: {
      'GET /text': { kind: 'mock-response', text: 'Ready', headers: { 'x-demo': 'ok' } },
      'GET /bytes': { kind: 'mock-response', data: new Uint8Array([0, 255]), text: 'ignored' },
      'GET /empty': json({ ignored: true }, 204), 'HEAD /text': json({ ignored: true }),
    } } });
    const text = await scope.fetch('/text'); expect(await text.text()).toBe('Ready'); expect(text.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect([...new Uint8Array(await (await scope.fetch('/bytes')).arrayBuffer())]).toEqual([0, 255]);
    expect(await (await scope.fetch('/empty')).text()).toBe('');
    expect(await (await scope.fetch('/text', { method: 'HEAD' })).text()).toBe('');
  });
  it('reports invalid configurations and honors aborted requests', async () => {
    await expect(createMockScope({ configuration: { handlers: [] } as never })).rejects.toThrow('handlers object');
    const scope = await createMockScope({ configuration: { handlers: { 'GET /': true } } });
    const signal = AbortSignal.abort(new Error('Cancelled'));
    await expect(scope.fetch('/', { signal })).rejects.toThrow('Cancelled');
  });
  it('leaves unmatched request bodies untouched for adapter fall-through', async () => {
    const scope = await createMockScope({ configuration: { handlers: {} } });
    const request = new Request('http://any/unmatched', { method: 'POST', body: 'untouched' });
    expect(await scope.handle(request)).toBeUndefined();
    expect(request.bodyUsed).toBe(false);
    expect(await request.text()).toBe('untouched');
  });
  it('rejects an in-flight request immediately when it is aborted', async () => {
    let started!: () => void;
    let release!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const scope = await createMockScope({ configuration: { handlers: {
      'GET /slow': async () => { started(); await gate; return { complete: true }; },
    } } });
    const controller = new AbortController();
    const response = scope.fetch('/slow', { signal: controller.signal });
    await ready;
    controller.abort(new Error('Request cancelled'));
    try { await expect(response).rejects.toThrow('Request cancelled'); }
    finally { release(); }
  });
  it.each([0, -1, 0.5, Infinity, NaN])('rejects an invalid request size %s', maxBodyBytes => {
    expect(() => apiMockPlugin({ maxBodyBytes })).toThrow(TypeError);
  });
  it('keeps typed definitions unchanged and creates JSON envelopes', () => {
    const handlers = { 'GET /': { ok: true } } as const;
    const config = { handlers };
    const override = { name: 'Test', params: { enabled: { type: 'boolean' as const, default: false } }, override: () => ({}) };
    expect(defineMockHandlers(handlers)).toBe(handlers); expect(defineMockConfiguration(config)).toBe(config); expect(defineMockOverride(override)).toBe(override);
    expect(json(null, 404)).toEqual({ kind: 'mock-response', body: null, status: 404 });
  });
  it('reads streamed request bodies and URL-encoded forms including repeated keys', async () => {
    const request = (chunks: string[]) => ({ raw: Readable.from(chunks) }) as unknown as MockRequest;
    expect(await readRequestBody(request(['hello', ' ', 'world']))).toBe('hello world');
    const form = await readFormData(request(['name=Jane+Doe&tag=one&', 'tag=two&encoded=%26']));
    expect(form.get('name')).toBe('Jane Doe'); expect(form.getAll('tag')).toEqual(['one', 'two']); expect(form.get('encoded')).toBe('&');
  });
});
