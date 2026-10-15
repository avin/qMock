// @vitest-environment jsdom
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockScope } from '../src/vitest.js';
import { json, readRequestBody } from '../src/utils.js';

function xhr(url: string, options: { method?: string; body?: string; type?: XMLHttpRequestResponseType } = {}) {
  return new Promise<XMLHttpRequest>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(options.method ?? 'GET', url);
    request.responseType = options.type ?? 'json';
    request.setRequestHeader('x-test', 'value');
    request.onload = () => resolve(request);
    request.onerror = () => reject(new Error('XHR failed'));
    request.send(options.body);
  });
}

const configuration = { handlers: { 'GET /api/user': { name: 'Default' } } } as const;
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});

async function realServer() {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'x-test');
    response.end(request.method === 'OPTIONS' ? '' : Buffer.concat(chunks).toString() || 'real');
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  return `http://127.0.0.1:${address.port}`;
}

describe('Vitest XMLHttpRequest adapter', () => {
  it('intercepts relative and absolute URLs and restores the constructor', async () => {
    const original = globalThis.XMLHttpRequest;
    const scope = await createMockScope({ configuration });
    await scope.run(async () => {
      expect((await xhr('/api/user')).response).toEqual({ name: 'Default' });
      expect((await xhr('http://localhost:3000/api/user')).response).toEqual({ name: 'Default' });
      expect(await (await fetch('/api/user')).json()).toEqual({ name: 'Default' });
    });
    expect(globalThis.XMLHttpRequest).toBe(original);
    await expect(scope.run(() => { throw new Error('failed'); })).rejects.toThrow('failed');
    expect(globalThis.XMLHttpRequest).toBe(original);
  });

  it('preserves bodies, headers, query, status, response headers and overrides', async () => {
    const scope = await createMockScope({ configuration: { handlers: {
      'POST /echo': async request => json({ body: await readRequestBody(request),
        header: request.raw.headers['x-test'] as string, query: request.url.searchParams.get('q') }, 201),
    } }, patches: { 'POST /echo': body => ({ ...body, patched: true }) } });
    await scope.run(async () => {
      const response = await xhr('/echo?q=yes', { method: 'POST', body: 'hello' });
      expect(response.status).toBe(201);
      expect(response.getResponseHeader('content-type')).toContain('application/json');
      expect(response.response).toEqual({ body: 'hello', header: 'value', query: 'yes', patched: true });
    });
  });

  it('isolates overlapping and nested runs and lets unscoped requests pass through', async () => {
    const base = await realServer();
    const first = await createMockScope({ configuration });
    const second = await createMockScope({ configuration, patches: { 'GET /api/user': { name: 'Second' } } });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const one = first.run(async () => {
      await gate;
      await second.run(async () => {
        expect((await xhr('/api/user')).response).toEqual({ name: 'Second' });
      });
      return (await xhr('/api/user')).response;
    });
    const two = second.run(async () => { await gate; return (await xhr('/api/user')).response; });
    expect((await xhr(`${base}/api/user`, { type: 'text' })).responseText).toBe('real');
    release();
    expect(await Promise.all([one, two])).toEqual([{ name: 'Default' }, { name: 'Second' }]);
  });

  it('preserves uploads when unmatched or disabled routes pass through', async () => {
    const base = await realServer();
    const scope = await createMockScope({ configuration: { handlers: { 'POST /disabled': true } },
      patches: { 'POST /disabled': null } });
    await scope.run(async () => {
      for (const route of ['/unmatched', '/disabled']) {
        expect((await xhr(`${base}${route}`, { method: 'POST', body: 'untouched', type: 'text' })).responseText).toBe('untouched');
      }
    });
  });

  it('does not intercept detached work after its run ends', async () => {
    const base = await realServer();
    const expired = await createMockScope({ configuration });
    const active = await createMockScope({ configuration });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let detached!: Promise<XMLHttpRequest>;
    await expired.run(() => {
      detached = gate.then(() => xhr(`${base}/api/user`, { type: 'text' }));
    });
    await active.run(async () => {
      release();
      expect((await detached).responseText).toBe('real');
      expect((await xhr('/api/user')).response).toEqual({ name: 'Default' });
    });
  });

  it('supports text and binary responses and the XHR event lifecycle', async () => {
    const scope = await createMockScope({ configuration: { handlers: {
      'GET /text': { kind: 'mock-response', text: 'ready' },
      'GET /bytes': { kind: 'mock-response', data: new Uint8Array([0, 255]) },
    } } });
    await scope.run(async () => {
      expect((await xhr('/text', { type: 'text' })).responseText).toBe('ready');
      const binary = await xhr('/bytes', { type: 'arraybuffer' });
      expect([...new Uint8Array(binary.response)]).toEqual([0, 255]);
      const request = new XMLHttpRequest();
      const states: number[] = [];
      const events: string[] = [];
      request.onreadystatechange = () => states.push(request.readyState);
      for (const event of ['loadstart', 'load', 'loadend']) request.addEventListener(event, () => events.push(event));
      request.open('GET', '/text');
      await new Promise<void>(resolve => { request.addEventListener('loadend', () => resolve()); request.send(); });
      expect(states).toEqual([1, 2, 3, 4]);
      expect(events).toEqual(['loadstart', 'load', 'loadend']);
    });
  });

  it.each(['abort', 'timeout'] as const)('handles %s during a pending mock without a late load', async event => {
    let started!: () => void;
    let release!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const scope = await createMockScope({ configuration: { handlers: {
      'GET /slow': async () => { started(); await gate; return true; },
    } } });
    await scope.run(async () => {
      const request = new XMLHttpRequest();
      request.open('GET', '/slow');
      const events: string[] = [];
      for (const name of ['abort', 'timeout', 'load', 'loadend']) request.addEventListener(name, () => events.push(name));
      if (event === 'timeout') request.timeout = 30;
      const ended = new Promise<void>(resolve => request.addEventListener('loadend', () => resolve()));
      request.send();
      await ready;
      if (event === 'abort') request.abort();
      try { await ended; }
      finally { release(); }
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(request.status).toBe(0);
      expect(events).toEqual([event, 'loadend']);
    });
  });
});
