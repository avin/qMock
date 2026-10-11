import { applyRoutePatches, resolveHandler, resolveMockHandler, serializeMockResponse } from './engine.js';
import { isMockOverride, resolveOverrideParams } from './overrideCatalog.js';
import type { MockConfiguration, MockOverride, MockOverrideHandlers, MockRequest, MockRoute } from './utils.js';

export type BrowserMockOverride = MockOverride | { override: MockOverride; params?: Record<string, boolean | string> };

export interface BrowserMockScopeOptions {
  name?: string;
  overrides?: BrowserMockOverride[];
  patches?: MockOverrideHandlers;
}

/** Evaluate the shared mock engine without Node streams or a listening server. */
export function createResolvedMockScope(configuration: MockConfiguration, options: BrowserMockScopeOptions = {}) {
  const name = options.name ?? crypto.randomUUID();
  if (typeof name !== 'string' || name.trim() === '') throw new TypeError('Mock scope name must not be empty');
  if (!configuration || typeof configuration.handlers !== 'object' ||
      configuration.handlers === null || Array.isArray(configuration.handlers)) {
    throw new TypeError('Mock configuration must have a handlers object');
  }
  const configuredPatches = (options.overrides ?? []).map(entry => {
    const override = isMockOverride(entry) ? entry : entry.override;
    if (!isMockOverride(override)) throw new TypeError('Invalid mock override');
    return override.override(resolveOverrideParams(override.params, isMockOverride(entry) ? undefined : entry.params));
  });
  let patches = options.patches ?? {};
  return {
    name,
    set(next: MockOverrideHandlers) { patches = next; },
    clear() { patches = options.patches ?? {}; },
    async handle(incoming: Request, rawHeaders?: Record<string, string | string[]>): Promise<Response | undefined> {
      if (incoming.signal.aborted) throw incoming.signal.reason;
      let onAbort!: () => void;
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(incoming.signal.reason);
        incoming.signal.addEventListener('abort', onAbort, { once: true });
      });
      try {
        return await Promise.race([resolveRequest(incoming, rawHeaders), aborted]);
      } finally {
        incoming.signal.removeEventListener('abort', onAbort);
      }
    },
  };
  async function resolveRequest(incoming: Request, rawHeaders?: Record<string, string | string[]>): Promise<Response | undefined> {
    const url = new URL(incoming.url);
    const method = incoming.method.toUpperCase();
    const matched = resolveMockHandler(configuration.handlers, method, url.pathname);
    const route = matched?.route ?? `${method} ${url.pathname}` as MockRoute;
    if (matched === undefined && !Object.hasOwn(patches, route) &&
        !configuredPatches.some(override => Object.hasOwn(override, route))) return undefined;
    const bytes = new Uint8Array(await incoming.arrayBuffer());
    let encoding: string | undefined;
    let consumed = false;
    const raw = {
      headers: rawHeaders === undefined ? Object.fromEntries(incoming.headers)
        : Object.fromEntries(Object.entries(rawHeaders).map(([name, value]) => [name.toLowerCase(), value])),
      method, url: url.pathname + url.search,
      setEncoding(next: string) { encoding = next; return this; },
      async *[Symbol.asyncIterator]() {
        if (consumed) return;
        consumed = true;
        if (bytes.length > 0) yield encoding ? new TextDecoder(encoding).decode(bytes) : bytes;
      },
    };
    const request: MockRequest = { route, url, raw: raw as unknown as MockRequest['raw'] };
    let response = matched === undefined ? undefined : await resolveHandler(matched.handler, request);
    for (const override of configuredPatches) response = await applyRoutePatches(response, request, override);
    response = await applyRoutePatches(response, request, patches);
    return response === undefined ? undefined : serializeMockResponse(response, method);
  }
}
