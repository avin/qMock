import { access } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { createJiti } from "jiti";
import { applyRoutePatches, resolveHandler, resolveMockHandler, serializeMockResponse } from "./engine.js";
import { isMockOverride, resolveOverrideParams } from "./overrideCatalog.js";
import type { MockConfiguration, MockOverride, MockOverrideHandlers, MockRequest, MockRoute } from "./utils.js";

export type MockScopeOverride = MockOverride | { override: MockOverride; params?: Record<string, boolean | string> };

export interface MockScopeOptions {
  name?: string;
  /** Project root for default handlers and aliases. Defaults to the working directory. */
  root?: string;
  /** Imported configuration or a file path relative to root. */
  configuration?: MockConfiguration | string;
  overrides?: MockScopeOverride[];
  /** Initial route patches applied after named overrides. */
  patches?: MockOverrideHandlers;
  /** Additional module aliases, with paths relative to root or absolute. */
  alias?: Record<string, string>;
}

export interface MockScope {
  name: string;
  set(patches: MockOverrideHandlers): void;
  clear(): void;
  handle(request: Request): Promise<Response | undefined>;
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

export function createMockRequest(input: string | URL | Request, init?: RequestInit) {
  const url = typeof input === "string" ? new URL(input, "http://qmock.local") : input;
  return new Request(url, init);
}

async function loadConfiguration(options: MockScopeOptions): Promise<MockConfiguration> {
  if (typeof options.configuration === "object" && options.configuration !== null) return options.configuration;
  const root = path.resolve(options.root ?? process.cwd());
  const filename = path.resolve(root, options.configuration ?? "src/mocks/handlers.ts");
  try { await access(filename); }
  catch (cause) { throw new Error(`Mock configuration not found: ${filename}. Create the file or pass configuration explicitly.`, { cause }); }
  const alias = Object.fromEntries(Object.entries(options.alias ?? {}).map(([name, target]) => [name, path.resolve(root, target)]));
  const loader = createJiti(path.join(root, "package.json"), {
    interopDefault: false, moduleCache: false, alias, tsconfigPaths: true,
  });
  return loader.import<MockConfiguration>(filename, { default: true });
}

/** Evaluate project mocks directly in memory; no listening server or network is used. */
export async function createMockScope(options: MockScopeOptions = {}): Promise<MockScope> {
  const name = options.name ?? crypto.randomUUID();
  if (typeof name !== "string" || name.trim() === "") throw new TypeError("Mock scope name must not be empty");
  const configuration = await loadConfiguration(options);
  if (!configuration || typeof configuration.handlers !== "object" ||
      configuration.handlers === null || Array.isArray(configuration.handlers)) {
    throw new TypeError("Mock configuration must have a handlers object");
  }
  const configuredPatches = (options.overrides ?? []).map(entry => {
    const override = isMockOverride(entry) ? entry : entry.override;
    if (!isMockOverride(override)) throw new TypeError("Invalid mock override");
    const params = isMockOverride(entry) ? undefined : entry.params;
    return override.override(resolveOverrideParams(override.params, params));
  });
  let patches = options.patches ?? {};
  async function resolveRequest(incoming: Request) {
    const url = new URL(incoming.url);
    const method = incoming.method.toUpperCase();
    const matched = resolveMockHandler(configuration.handlers, method, url.pathname);
    const route = matched?.route ?? `${method} ${url.pathname}` as MockRoute;
    if (matched === undefined && !Object.hasOwn(patches, route) &&
        !configuredPatches.some(override => Object.hasOwn(override, route))) return undefined;
    const raw = Readable.from(incoming.body === null ? [] : [Buffer.from(await incoming.arrayBuffer())]);
    Object.assign(raw, { headers: Object.fromEntries(incoming.headers.entries()), method, url: url.pathname + url.search });
    const request: MockRequest = { route, url, raw: raw as unknown as MockRequest["raw"] };
    let response = matched === undefined ? undefined : await resolveHandler(matched.handler, request);
    for (const override of configuredPatches) response = await applyRoutePatches(response, request, override);
    response = await applyRoutePatches(response, request, patches);
    return response === undefined ? undefined : serializeMockResponse(response, method);
  }
  async function handle(incoming: Request) {
    if (incoming.signal.aborted) throw incoming.signal.reason;
    let rejectAbort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(incoming.signal.reason);
      incoming.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    try {
      return await Promise.race([resolveRequest(incoming), aborted]);
    } finally {
      incoming.signal.removeEventListener("abort", rejectAbort);
    }
  }
  return {
    name,
    set(next) { patches = next; },
    clear() { patches = options.patches ?? {}; },
    handle,
    async fetch(input, init) {
      const request = createMockRequest(input, init);
      const response = await handle(request);
      if (response === undefined) throw new Error(`No mock response for ${request.method} ${new URL(request.url).pathname}`);
      return response;
    },
  };
}
