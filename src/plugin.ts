import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import {
  applyOverrideParams,
  normalizeActiveOverrides,
  parseOverrideStateFile,
} from "./overrideCatalog.js";
import type { MockOverrideActiveEntry } from "./overrideCatalog.js";
import { mockScopeHeader, testOverridePath } from "./testOverride.js";
import type { TestMockOverride } from "./testOverride.js";
import type {
  MockConfiguration,
  MockHandler,
  MockRequest,
  MockResponse,
  MockRoute,
} from "./utils.js";
import { loadOverrideCatalog } from "./loadOverrideCatalog.js";
import { applyRoutePatches, resolveHandler, resolveMockHandler } from "./engine.js";
import type { LoadedOverrideCatalog } from "./loadOverrideCatalog.js";
import { readOverrideStateFile, writeOverrideStateFile } from "./overrideStateFile.js";

type MockModule = {
  default: MockConfiguration;
};

export const overridesPath = "/__apiMocks/overrides";

function sendJson(response: ServerResponse, body: unknown, statusCode = 200) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(body));
}

function sendMockResponse(response: ServerResponse, mockResponse: MockResponse) {
  response.statusCode = mockResponse.status ?? 200;

  for (const [name, value] of Object.entries(mockResponse.headers ?? {})) {
    response.setHeader(name, value);
  }

  if (mockResponse.data !== undefined) {
    response.end(mockResponse.data);
    return;
  }

  if (mockResponse.text !== undefined) {
    if (!response.hasHeader("Content-Type")) {
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
    }

    response.end(mockResponse.text);
    return;
  }

  if (mockResponse.body === undefined) {
    response.end();
    return;
  }

  if (!response.hasHeader("Content-Type")) {
    response.setHeader("Content-Type", "application/json");
  }

  response.end(JSON.stringify(mockResponse.body));
}

function readBody(request: Connect.IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    let bytes = 0;
    request.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) {
        reject(Object.assign(new Error("Request body is too large"), { statusCode: 413 }));
        return;
      }
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
    request.on("aborted", () => reject(new Error("Request aborted")));
  });
}

function parseJsonBody(body: string, response: ServerResponse) {
  try {
    return { ok: true as const, value: JSON.parse(body) as unknown };
  } catch {
    sendJson(response, { error: "Invalid JSON body" }, 400);
    return { ok: false as const };
  }
}

function readHeader(request: Connect.IncomingMessage, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function resolveMockRoute(
  handler: MockHandler | undefined,
  request: MockRequest,
  catalog: LoadedOverrideCatalog,
  active: MockOverrideActiveEntry[],
  testOverride?: TestMockOverride,
) {
  const originalResponse =
    handler === undefined ? undefined : await resolveHandler(handler, request);

  const overriddenResponse = await active.reduce<Promise<MockResponse | undefined>>(
    (currentResponse, entry) =>
      currentResponse.then(async (current) => {
        const override = catalog.byId.get(entry.id);

        if (override === undefined || entry.isEnabled === false) {
          return current;
        }

        return applyRoutePatches(current, request, applyOverrideParams(override, entry.params));
      }),
    Promise.resolve(originalResponse),
  );

  return testOverride === undefined
    ? overriddenResponse
    : applyRoutePatches(overriddenResponse, request, testOverride);
}

function readActiveFromBody(body: unknown): MockOverrideActiveEntry[] | undefined {
  if (
    typeof body !== "object" ||
    body === null ||
    !("active" in body) ||
    !Array.isArray(body.active)
  ) {
    return undefined;
  }

  return parseOverrideStateFile(body);
}

export interface ApiMockPluginOptions {
  /** Vite module path or absolute file path exporting a default mock configuration. */
  handlers?: string;
  /** Project-relative or absolute directory containing override modules. */
  overrides?: string;
  /** Project-relative or absolute persistence file; false disables persistence. */
  stateFile?: string | false;
  /** Maximum size of management API JSON bodies in bytes. */
  maxBodyBytes?: number;
}

export function apiMockPlugin(options: ApiMockPluginOptions = {}): Plugin {
  const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new TypeError("maxBodyBytes must be a positive safe integer");
  }
  let active: MockOverrideActiveEntry[] = [];
  let hasLoadedState = false;
  const testOverrides = new Map<string, TestMockOverride>();

  return {
    name: "mock-api",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (incoming, outgoing, next) => {
        try {
          if (!hasLoadedState) {
            active = options.stateFile === false ? [] : readOverrideStateFile(server.config.root, options.stateFile);
            hasLoadedState = true;
          }

          const url = new URL(incoming.url ?? "/", "http://localhost");
          const { pathname } = url;
          const method = (incoming.method ?? "GET").toUpperCase();
          if (pathname === "/__apiMock" || pathname.startsWith("/__apiMock/")) {
            await serveUi(incoming, outgoing, pathname);
            return;
          }
          const mockModule = (await server.ssrLoadModule(options.handlers ?? "/src/mocks/handlers.ts")) as MockModule;
          const configuration = mockModule.default;
          if (typeof configuration !== "object" || configuration === null ||
            typeof configuration.handlers !== "object" || configuration.handlers === null ||
            Array.isArray(configuration.handlers)) {
            throw new TypeError("Mock configuration must have a handlers object");
          }
          const { handlers } = configuration;
          const catalog = await loadOverrideCatalog(server, server.config.root, options.overrides);
          const knownActive = normalizeActiveOverrides(active, catalog.byId);

          const mockScope = readHeader(incoming, mockScopeHeader);

          if (method === "GET" && pathname === overridesPath) {
            sendJson(outgoing, {
              tree: catalog.tree,
              active: knownActive,
            });
            return;
          }

          if (method === "PUT" && pathname === overridesPath) {
            const parsedBody = parseJsonBody(await readBody(incoming, maxBodyBytes), outgoing);
            if (!parsedBody.ok) {
              return;
            }

            const nextActive = readActiveFromBody(parsedBody.value);

            if (nextActive === undefined) {
              sendJson(outgoing, { error: "Active overrides must be an array" }, 400);
              return;
            }

            const normalized = normalizeActiveOverrides(nextActive, catalog.byId);
            if (options.stateFile !== false) writeOverrideStateFile(server.config.root, normalized, options.stateFile);
            active = normalized;
            sendJson(outgoing, { active });
            return;
          }

          if (method === "PUT" && pathname === testOverridePath) {
            if (mockScope === undefined || mockScope.trim() === "") {
              sendJson(outgoing, { error: "Mock scope header is required" }, 400);
              return;
            }

            const parsedBody = parseJsonBody(await readBody(incoming, maxBodyBytes), outgoing);
            if (!parsedBody.ok) {
              return;
            }

            if (!isTestOverride(parsedBody.value)) {
              sendJson(outgoing, { error: "Test override must be an object of valid mock routes and JSON responses" }, 400);
              return;
            }
            testOverrides.set(mockScope, parsedBody.value);
            sendJson(outgoing, {});
            return;
          }

          if (method === "DELETE" && pathname === testOverridePath) {
            if (mockScope !== undefined) {
              testOverrides.delete(mockScope);
            }
            sendJson(outgoing, {});
            return;
          }

          const exactRoute = `${method} ${pathname}` as MockRoute;
          const resolvedHandler = resolveMockHandler(handlers, method, pathname);
          const route = resolvedHandler?.route ?? exactRoute;
          const handler = resolvedHandler?.handler;
          const request: MockRequest = { route, url, raw: incoming };
          const mockResponse = await resolveMockRoute(
            handler,
            request,
            catalog,
            mockScope === undefined ? knownActive : [],
            mockScope === undefined ? undefined : testOverrides.get(mockScope),
          );

          if (mockResponse === undefined) {
            next();
            return;
          }

          sendMockResponse(outgoing, mockResponse);
        } catch (error) {
          if (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 413) {
            sendJson(outgoing, { error: "Request body is too large" }, 413);
          } else {
            next(error as Error);
          }
        }
      });
    },
  };
}

export const mockApiPlugin = apiMockPlugin;

function isTestOverride(value: unknown): value is TestMockOverride {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([route, answer]) => {
    if (!/^(DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT) \/[^\s]*$/.test(route)) return false;
    if (answer === null || typeof answer !== "object" || !("kind" in answer) || answer.kind !== "mock-response") return isJsonValue(answer);
    const response = answer as Record<string, unknown>;
    return response.kind === "mock-response" &&
      (response.status === undefined || (Number.isInteger(response.status) && Number(response.status) >= 200 && Number(response.status) <= 599)) &&
      (response.text === undefined || typeof response.text === "string") &&
      (response.body === undefined || isJsonValue(response.body)) &&
      response.data === undefined &&
      (response.headers === undefined || (typeof response.headers === "object" && response.headers !== null && !Array.isArray(response.headers) &&
        Object.entries(response.headers).every(([key, header]) => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) &&
          (typeof header === "string" ? isHeaderValue(header) : Array.isArray(header) && header.every(item => typeof item === "string" && isHeaderValue(item))))));
  });
}

function isHeaderValue(value: string) {
  return /^[\t\x20-\x7e\x80-\xff]*$/.test(value);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return typeof value === "object" && value !== null && Object.values(value).every(isJsonValue);
}

async function serveUi(request: Connect.IncomingMessage, response: ServerResponse, pathname: string) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, { error: "Method not allowed" }, 405);
    return;
  }
  const relative = pathname === "/__apiMock" || pathname === "/__apiMock/" ? "index.html" : pathname.slice("/__apiMock/".length);
  let decoded: string;
  try { decoded = decodeURIComponent(relative); } catch { sendJson(response, { error: "Invalid asset path" }, 400); return; }
  const root = fileURLToPath(new URL("./ui/", import.meta.url));
  const file = path.resolve(root, decoded);
  const inside = path.relative(root, file);
  if (inside.startsWith("..") || path.isAbsolute(inside) || decoded.includes("\\") || decoded.includes("\0")) {
    sendJson(response, { error: "Asset not found" }, 404);
    return;
  }
  const contentTypes: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
  try {
    const body = await readFile(file);
    response.setHeader("Content-Type", contentTypes[path.extname(file)] ?? "application/octet-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    if (["ENOENT", "EISDIR", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) sendJson(response, { error: "Asset not found" }, 404);
    else throw error;
  }
}
