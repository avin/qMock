import type { BrowserContext, Fixtures, Page, Route, TestFixture, TestType } from '@playwright/test';
import { createMockScope } from './testing.js';
import type { MockScope, MockScopeOptions } from './testing.js';

export type { MockScopeOptions } from './testing.js';

export interface PlaywrightMockScope extends MockScope {
  /** Stops intercepting requests. Other routes registered by the test remain installed. */
  dispose(): Promise<void>;
}

/** Intercepts browser requests using handlers and overrides without a mock server. */
export async function applyMocks(
  target: BrowserContext | Page,
  options: MockScopeOptions = {},
): Promise<PlaywrightMockScope> {
  const scope = await createMockScope(options);
  const handler = async (route: Route) => {
    const incoming = route.request();
    const body = incoming.postDataBuffer();
    const request = new Request(incoming.url(), {
      method: incoming.method(),
      headers: await incoming.allHeaders(),
      ...(body === null ? {} : { body: new Uint8Array(body) }),
    });
    const response = await scope.handle(request);
    if (response === undefined) {
      await route.fallback();
      return;
    }
    const headers = Object.fromEntries(response.headers);
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) headers['set-cookie'] = cookies.join('\n');
    await route.fulfill({
      status: response.status,
      headers,
      body: Buffer.from(await response.arrayBuffer()),
    });
  };
  await target.route('**/*', handler);
  let disposed = false;
  return {
    ...scope,
    async dispose() {
      if (disposed) return;
      await target.unroute('**/*', handler);
      await scope.clear();
      disposed = true;
    },
  };
}

export interface QMockFixtures {
  mockScope: PlaywrightMockScope;
}

/** Adds an automatic context-level fixture, with cleanup after every test. */
export function createMockTest<T extends { context: BrowserContext }, W extends object>(
  base: TestType<T, W>,
  options: MockScopeOptions = {},
): TestType<T & QMockFixtures, W> {
  const mockScope: TestFixture<PlaywrightMockScope, T & W> = async ({ context }, use) => {
    const scope = await applyMocks(context, options);
    try {
      await use(scope);
    } finally {
      await scope.dispose();
    }
  };
  return base.extend<QMockFixtures>({
    mockScope: [mockScope, { auto: true }],
  } as unknown as Fixtures<QMockFixtures, object, T, W>);
}
