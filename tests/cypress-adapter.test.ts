import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { applyMocks, setupMocks } from '../src/cypress.js';
import { createResolvedMockScope } from '../src/browserScope.js';
import { json, readFormData, readRequestBody } from '../src/utils.js';
import type { CypressMockScope } from '../src/cypress.js';
import type { MockConfiguration } from '../src/utils.js';

type Reply = { statusCode: number; headers: Record<string, string | string[]>; body: Buffer };
type Incoming = {
  method: string; url: string; headers: Record<string, string>; body?: unknown;
  reply: (response: Omit<Reply, 'body'> & { body: ArrayBuffer }) => void;
  on(event: 'before:response', listener: (response: { headers: Record<string, string | string[]> }) => void): void;
};
let handlers: Array<(request: Incoming) => Promise<void>>;
let task: ReturnType<typeof vi.fn>;

beforeEach(() => {
  handlers = [];
  task = vi.fn(() => Promise.resolve({ code: `var qmockDefinitions = {
    configuration: {handlers: {'GET /api/user': {name: 'default'}}},
    overrides: { 'user/failure': {name: 'Failure', params: {message: {type: 'string', default: 'error'}},
      override: ({message}) => ({'GET /api/user': {kind:'mock-response',status:503,body:{error:message}}})}}
  };` }));
  vi.stubGlobal('Cypress', { Buffer });
  vi.stubGlobal('cy', {
    task,
    intercept: vi.fn((_pattern: string, handler: (request: Incoming) => Promise<void>) => {
      handlers.push(handler);
      return Promise.resolve();
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

async function request(path: string, options: Partial<Incoming> = {}) {
  let response: Reply | undefined;
  const responseListeners: Array<(response: { headers: Record<string, string | string[]> }) => void> = [];
  const incoming: Incoming = {
    method: 'GET', url: `http://app.invalid${path}`, headers: {}, ...options,
    reply(value) {
      expect(value.body).toBeInstanceOf(ArrayBuffer);
      expect(Object.values(value.headers).every(header => typeof header === 'string')).toBe(true);
      response = { ...value, body: Buffer.from(value.body) };
      for (const listener of responseListeners) listener(response);
    },
    on(_event, listener) { responseListeners.push(listener); },
  };
  // Cypress evaluates matching route handlers in reverse registration order.
  for (const handler of handlers.toReversed()) {
    await handler(incoming);
    if (response) break;
  }
  return response;
}
function install(configuration: MockConfiguration, extra = {}) {
  return applyMocks({ configuration, ...extra }) as unknown as Promise<CypressMockScope>;
}

describe('Cypress browser adapter', () => {
  it('preserves original intercepted headers that browser Request would filter', async () => {
    const scope = createResolvedMockScope({ handlers: {
      'GET /credentials': request => ({ cookie: request.raw.headers.cookie, host: request.raw.headers.host }),
    } });
    const response = await scope.handle(new Request('http://app.invalid/credentials'), {
      Cookie: 'session=test', Host: 'app.invalid',
    });
    expect(await response!.json()).toEqual({ cookie: 'session=test', host: 'app.invalid' });
  });
  it('rejects invalid scope configuration and cancels in-flight browser handlers', async () => {
    expect(() => createResolvedMockScope({ handlers: {} }, { name: '' })).toThrow('Mock scope name must not be empty');
    expect(() => createResolvedMockScope({} as MockConfiguration)).toThrow('Mock configuration must have a handlers object');
    const scope = createResolvedMockScope({ handlers: { 'GET /slow': () => new Promise(() => {}) } });
    const controller = new AbortController();
    const response = scope.handle(new Request('http://app.invalid/slow', { signal: controller.signal }));
    controller.abort(new Error('cancelled'));
    await expect(response).rejects.toThrow('cancelled');
    await expect(scope.handle(new Request('http://app.invalid/slow', { signal: controller.signal }))).rejects.toThrow('cancelled');
  });

  it('loads the default configuration through one queued task and resolves override IDs with parameters', async () => {
    await (applyMocks({ overrides: [{ id: 'user/failure', params: { message: 'declined' } }] }) as unknown as Promise<CypressMockScope>);
    const response = await request('/api/user');
    expect(task).toHaveBeenCalledExactlyOnceWith('qmock:load', null, { log: false });
    expect(response?.statusCode).toBe(503);
    expect(JSON.parse(response!.body.toString())).toEqual({ error: 'declined' });
    await request('/api/user');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('uses base handlers by default and reports unknown IDs', async () => {
    await (applyMocks() as unknown as Promise<CypressMockScope>);
    expect(JSON.parse((await request('/api/user'))!.body.toString())).toEqual({ name: 'default' });
    await expect(Promise.resolve(applyMocks({ overrides: ['missing'] }))).rejects.toThrow('Mock override not found: missing');
  });

  it('evaluates imported async handlers and overrides without a Node task', async () => {
    await install({ handlers: {
      'POST /api/user': async incoming => ({ text: await readRequestBody(incoming), query: incoming.url.searchParams.get('id') }),
      'POST /api/form': async incoming => ({ value: (await readFormData(incoming)).get('value') }),
    } }, {
      overrides: [{ override: {
        name: 'User', params: { enabled: { type: 'boolean', default: true } },
        override: ({ enabled }: { enabled: boolean }) => ({ 'POST /api/user': (body: Record<string, unknown>) => json({ ...body, enabled }, 201) }),
      }, params: { enabled: false } }],
    });
    const response = await request('/api/user?id=42', { method: 'POST', body: { name: 'Taylor' }, headers: { 'content-type': 'application/json' } });
    expect(response?.statusCode).toBe(201);
    expect(JSON.parse(response!.body.toString())).toEqual({ text: '{"name":"Taylor"}', query: '42', enabled: false });
    const form = await request('/api/form', { method: 'POST', body: 'value=hello%20world' });
    expect(JSON.parse(form!.body.toString())).toEqual({ value: 'hello world' });
    const parsedForm = await request('/api/form', { method: 'POST', body: { value: ['hello world', 'again'] }, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(JSON.parse(parsedForm!.body.toString())).toEqual({ value: 'hello world' });
    expect(task).not.toHaveBeenCalled();
  });

  it('preserves response text, bytes, headers, multiple cookies and bodyless responses', async () => {
    await install({ handlers: {
      'GET /text': { kind: 'mock-response', text: 'hello', status: 202, headers: { 'x-example': 'yes' } },
      'GET /bytes': { kind: 'mock-response', data: new Uint8Array([0, 255, 127]) },
      'GET /cookies': { kind: 'mock-response', body: {}, headers: { 'Set-Cookie': ['first=one; Path=/', 'second=two; Path=/'] } },
      'GET /empty': { kind: 'mock-response', status: 204, body: { ignored: true } },
      'HEAD /head': { text: 'ignored' },
    } });
    expect(await request('/text')).toMatchObject({ statusCode: 202, headers: { 'x-example': 'yes', 'content-type': 'text/plain; charset=utf-8' }, body: Buffer.from('hello') });
    expect((await request('/bytes'))?.body).toEqual(Buffer.from([0, 255, 127]));
    expect((await request('/cookies'))?.headers['set-cookie']).toEqual(['first=one; Path=/', 'second=two; Path=/']);
    expect((await request('/empty'))?.body.length).toBe(0);
    expect((await request('/head', { method: 'HEAD' }))?.body.length).toBe(0);
  });

  it('passes binary request bytes to raw async iteration', async () => {
    await install({ handlers: { 'POST /bytes': async ({ raw }) => {
      const bytes: number[] = [];
      for await (const chunk of raw) bytes.push(...chunk);
      return { bytes };
    } } });
    const response = await request('/bytes', { method: 'POST', body: Buffer.from([0, 255, 127]) });
    expect(JSON.parse(response!.body.toString())).toEqual({ bytes: [0, 255, 127] });
  });

  it('resolves exact and wildcard routes and lets unmatched or disabled requests reach other intercepts', async () => {
    const earlier = vi.fn(async (incoming: Incoming) => incoming.reply({ statusCode: 200, headers: {}, body: Uint8Array.from(Buffer.from('fallback')).buffer }));
    handlers.push(earlier);
    const scope = await install({ handlers: { 'GET /api/*': { source: 'wildcard' }, 'GET /api/user': { source: 'exact' } } });
    expect(JSON.parse((await request('/api/user'))!.body.toString())).toEqual({ source: 'exact' });
    expect(JSON.parse((await request('/api/other'))!.body.toString())).toEqual({ source: 'wildcard' });
    scope.set({ 'GET /api/user': null });
    expect((await request('/api/user'))?.body.toString()).toBe('fallback');
    expect((await request('/unmatched'))?.body.toString()).toBe('fallback');
    expect(earlier).toHaveBeenCalledTimes(2);
  });

  it('restores initial patches on clear and disables its own handler on disposal', async () => {
    const scope = await install({ handlers: { 'GET /user': { name: 'base' } } }, { patches: { 'GET /user': { name: 'initial' } } });
    scope.set({ 'GET /user': { name: 'changed' } });
    expect(JSON.parse((await request('/user'))!.body.toString())).toEqual({ name: 'changed' });
    scope.clear();
    expect(JSON.parse((await request('/user'))!.body.toString())).toEqual({ name: 'initial' });
    scope.dispose();
    scope.dispose();
    expect(await request('/user')).toBeUndefined();
  });

  it('installs fresh scopes through setup hooks and disposes them after each test', async () => {
    let start!: () => unknown;
    let finish!: () => void;
    vi.stubGlobal('beforeEach', (callback: () => unknown) => { start = callback; });
    vi.stubGlobal('afterEach', (callback: () => void) => { finish = callback; });
    setupMocks({ configuration: { handlers: { 'GET /user': { name: 'base' } } } });
    await start();
    expect(await request('/user')).toBeDefined();
    finish();
    expect(await request('/user')).toBeUndefined();
    await start();
    expect(await request('/user')).toBeDefined();
    finish();
  });
});
