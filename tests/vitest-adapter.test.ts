import { describe, expect, it, test, vi } from 'vitest';
import { createMockScope, withMocks, type VitestMockScope } from '../src/vitest.js';
import { defineMockOverride, json, readRequestBody } from '../src/utils.js';

const configuration = { handlers: { 'GET /api/user': { name: 'Default' } } } as const;

describe('Vitest fetch adapter', () => {
  it('intercepts relative and absolute requests and restores fetch after completion', async () => {
    const original = globalThis.fetch;
    const scope = await createMockScope({ name: 'profile', configuration });
    const result = await scope.run(async () => {
      expect(await (await fetch('/api/user')).json()).toEqual({ name: 'Default' });
      return (await fetch('https://app.example/api/user')).json();
    });
    expect(result).toEqual({ name: 'Default' });
    expect(globalThis.fetch).toBe(original);
  });

  it('isolates overlapping scopes while an unscoped request uses original fetch', async () => {
    const original = globalThis.fetch;
    const fallback = vi.fn<typeof fetch>().mockResolvedValue(new Response('real'));
    globalThis.fetch = fallback;
    try {
      const first = await createMockScope({ configuration, patches: { 'GET /api/user': { name: 'First' } } });
      const second = await createMockScope({ configuration, patches: { 'GET /api/user': { name: 'Second' } } });
      let release!: () => void;
      const barrier = new Promise<void>(resolve => { release = resolve; });
      const one = first.run(async () => {
        await barrier;
        return (await fetch('/api/user')).json();
      });
      const two = second.run(async () => {
        await barrier;
        return (await fetch('/api/user')).json();
      });
      expect(await (await fetch('https://outside.example/api/user')).text()).toBe('real');
      release();
      expect(await Promise.all([one, two])).toEqual([{ name: 'First' }, { name: 'Second' }]);
      expect(globalThis.fetch).toBe(fallback);
      expect(fallback).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('restores the outer scope after a nested scope throws', async () => {
    const original = globalThis.fetch;
    const outer = await createMockScope({ configuration });
    const inner = await createMockScope({ configuration, patches: { 'GET /api/user': { name: 'Inner' } } });
    await outer.run(async () => {
      await expect(inner.run(async () => {
        expect(await (await fetch('/api/user')).json()).toEqual({ name: 'Inner' });
        throw new Error('test failure');
      })).rejects.toThrow('test failure');
      expect(await (await fetch('/api/user')).json()).toEqual({ name: 'Default' });
    });
    expect(globalThis.fetch).toBe(original);
    await expect(outer.run(() => { throw new Error('outer failure'); })).rejects.toThrow('outer failure');
    expect(globalThis.fetch).toBe(original);
  });

  it('passes request bodies and headers to handlers and applies parameterized overrides', async () => {
    const override = defineMockOverride({
      name: 'Response status',
      params: { fail: { type: 'boolean', default: false } },
      override: ({ fail }) => ({ 'POST /api/echo': (body) => json(body ?? {}, fail ? 503 : 200) }),
    });
    const scope = await createMockScope({
      configuration: { handlers: {
        'POST /api/echo': async request => ({
          body: await readRequestBody(request),
          header: request.raw.headers['x-test'] as string,
        }),
      } },
      overrides: [{ override, params: { fail: true } }],
    });
    await scope.run(async () => {
      const response = await fetch(new Request('http://localhost/api/echo', {
        method: 'POST', body: 'hello', headers: { 'x-test': 'value' },
      }));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ body: 'hello', header: 'value' });
    });
  });

  it('preserves original request arguments and body for unmatched requests', async () => {
    const original = globalThis.fetch;
    const fallback = vi.fn<typeof fetch>().mockImplementation(async input => {
      return new Response(await (input as Request).text());
    });
    globalThis.fetch = fallback;
    try {
      const scope = await createMockScope({ configuration });
      const request = new Request('https://outside.example/upload', { method: 'POST', body: 'untouched' });
      await scope.run(async () => {
        expect(await (await fetch(request)).text()).toBe('untouched');
      });
      expect(fallback).toHaveBeenCalledWith(request, undefined);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('clears temporary patches after a failed callback', async () => {
    const scope = await createMockScope({ configuration });
    await expect(scope.run(async () => {
      await scope.set({ 'GET /api/user': { name: 'Temporary' } });
      expect(await (await fetch('/api/user')).json()).toEqual({ name: 'Temporary' });
      throw new Error('failed');
    })).rejects.toThrow('failed');
    await scope.run(async () => {
      expect(await (await fetch('/api/user')).json()).toEqual({ name: 'Default' });
    });
  });

  it('keeps temporary patches through nested runs of the same scope', async () => {
    const scope = await createMockScope({ configuration });
    await scope.run(async () => {
      await scope.set({ 'GET /api/user': { name: 'Nested' } });
      await scope.run(async () => {
        expect(await (await fetch('/api/user')).json()).toEqual({ name: 'Nested' });
      });
      expect(await (await fetch('/api/user')).json()).toEqual({ name: 'Nested' });
    });
    expect(await (await scope.fetch('/api/user')).json()).toEqual({ name: 'Default' });
  });

  it('does not intercept detached work after its run ends while another scope is active', async () => {
    const original = globalThis.fetch;
    const fallback = vi.fn<typeof fetch>().mockResolvedValue(new Response('outside'));
    globalThis.fetch = fallback;
    try {
      const expired = await createMockScope({ configuration });
      const active = await createMockScope({ configuration });
      let release!: () => void;
      const barrier = new Promise<void>(resolve => { release = resolve; });
      let detached!: Promise<string>;
      await expired.run(() => {
        detached = (async () => {
          await barrier;
          return (await fetch('http://localhost/api/user')).text();
        })();
      });
      await active.run(async () => {
        release();
        expect(await detached).toBe('outside');
        expect(await (await fetch('/api/user')).json()).toEqual({ name: 'Default' });
      });
      expect(fallback).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('preserves a streamed upload when a disabled mock falls through to native fetch', async () => {
    const original = globalThis.fetch;
    const fallback = vi.fn<typeof fetch>().mockImplementation(async input => {
      return new Response(await (input as Request).text());
    });
    globalThis.fetch = fallback;
    try {
      const scope = await createMockScope({
        configuration: { handlers: { 'POST /api/upload': { mocked: true } } },
        patches: { 'POST /api/upload': null },
      });
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('streamed upload'));
          controller.close();
        },
      });
      await scope.run(async () => {
        const init: RequestInit & { duplex: 'half' } = { method: 'POST', body, duplex: 'half' };
        expect(await (await fetch('http://localhost/api/upload', init)).text()).toBe('streamed upload');
      });
      expect(fallback).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});

const fixtureTest = test.extend<{ mocks: VitestMockScope }>({ mocks: withMocks({ configuration }) });
fixtureTest('provides a Vitest fixture with interception and scenario controls', async ({ mocks }) => {
  await mocks.set({ 'GET /api/user': { name: 'Fixture' } });
  expect(await (await mocks.fetch('/api/user')).json()).toEqual({ name: 'Fixture' });
  await mocks.run(async () => {
    expect(await (await fetch('/api/user')).json()).toEqual({ name: 'Fixture' });
  });
});
