import { AsyncLocalStorage } from "node:async_hooks";
import {
  createMockScope as createCoreMockScope,
  createMockRequest,
  type MockScope,
  type MockScopeOptions,
} from "./testing.js";

export type { MockScopeOptions } from "./testing.js";

export interface VitestMockScope extends MockScope {
  /** Intercepts fetch for this callback, including its asynchronous work. */
  run<T>(callback: () => T | Promise<T>): Promise<T>;
}

interface ActiveScope {
  scope: MockScope;
  active: boolean;
}

const currentScope = new AsyncLocalStorage<ActiveScope>();
let activeRuns = 0;
let originalFetch: typeof globalThis.fetch;

function toRequest(input: Parameters<typeof fetch>[0], init?: RequestInit): Request {
  return createMockRequest(input instanceof Request ? input.clone() : input, init);
}

const dispatch: typeof globalThis.fetch = async (input, init) => {
  const context = currentScope.getStore();
  const fallback = originalFetch;
  if (context?.active) {
    const request = toRequest(input, init);
    const streamingBody = init?.body instanceof ReadableStream;
    const response = await context.scope.handle(streamingBody ? request.clone() : request);
    if (response !== undefined) return response;
    // Cloning a streamed body tees and locks the caller's stream. The untouched
    // branch retains its bytes for the native request when a mock falls through.
    if (streamingBody) return fallback(request);
  }
  return fallback(input, init);
};

function installFetch(): void {
  if (activeRuns === 0) {
    originalFetch = globalThis.fetch;
    globalThis.fetch = dispatch;
  }
  activeRuns += 1;
}

function restoreFetch(): void {
  activeRuns -= 1;
  if (activeRuns === 0 && globalThis.fetch === dispatch) {
    globalThis.fetch = originalFetch;
  }
}

/** Creates an isolated fetch scenario without starting a server. */
export async function createMockScope(options: MockScopeOptions = {}): Promise<VitestMockScope> {
  const scope = await createCoreMockScope(options);
  let scopeRuns = 0;
  return {
    ...scope,
    async run<T>(callback: () => T | Promise<T>): Promise<T> {
      installFetch();
      scopeRuns += 1;
      const context: ActiveScope = { scope, active: true };
      try {
        return await currentScope.run(context, callback);
      } finally {
        context.active = false;
        scopeRuns -= 1;
        try {
          if (scopeRuns === 0) await scope.clear();
        } finally {
          restoreFetch();
        }
      }
    },
  };
}

/**
 * Use as the mocks fixture in Vitest's test.extend().
 * Call mocks.fetch() directly, or mocks.run() to intercept application fetch calls.
 */
export function withMocks(options: MockScopeOptions = {}) {
  return async ({}: object, use: (scope: VitestMockScope) => Promise<void>): Promise<void> => {
    const scope = await createMockScope(options);
    try {
      await use(scope);
    } finally {
      await scope.clear();
    }
  };
}
