import type {
  JsonObject, MockAnswer, MockHandlers, MockHandler, MockOverrideHandlers,
  MockRequest, MockResponse, MockRoute,
} from "./utils.js";

export function resolveMockHandler(handlers: MockHandlers, method: string, pathname: string) {
  const exactRoute = `${method} ${pathname}` as MockRoute;
  if (handlers[exactRoute] !== undefined) return { route: exactRoute, handler: handlers[exactRoute]! };
  for (const route of Object.keys(handlers) as MockRoute[]) {
    if (route.endsWith("/*") && exactRoute.startsWith(route.slice(0, -1))) {
      return { route, handler: handlers[route]! };
    }
  }
  return undefined;
}

function isMockResponse(answer: MockAnswer): answer is MockResponse {
  return typeof answer === "object" && answer !== null && "kind" in answer && answer.kind === "mock-response";
}

function normalizeAnswer(answer: MockAnswer, original?: MockResponse): MockResponse {
  if (isMockResponse(answer)) return structuredClone(answer);
  return { ...(original ?? { kind: "mock-response", status: 200 }), body: structuredClone(answer) };
}

export async function resolveHandler(handler: MockHandler, request: MockRequest) {
  return normalizeAnswer(typeof handler === "function" ? await handler(request) : handler);
}

export async function applyRoutePatches(response: MockResponse | undefined, request: MockRequest, patches: MockOverrideHandlers) {
  if (!Object.hasOwn(patches, request.route)) return response;
  const patch = patches[request.route];
  if (patch === null) return undefined;
  if (patch === undefined) return response;
  if (typeof patch === "function") {
    const answer = await patch(response?.body as JsonObject | undefined, { request, response });
    return answer === undefined ? response : normalizeAnswer(answer, response);
  }
  return normalizeAnswer(patch);
}

const responseCookies = new WeakMap<Response, string[]>();

/** Keep cookie headers intact even where browser Headers filters them. */
export function getMockResponseCookies(response: Response): string[] {
  return responseCookies.get(response) ?? response.headers.getSetCookie?.() ?? [];
}

/** Serialize the same payload and content types used by the development server. */
export function serializeMockResponse(response: MockResponse, method: string) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(response.headers ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  let body: Uint8Array | string | undefined;
  if (response.data !== undefined) body = response.data;
  else if (response.text !== undefined) {
    body = response.text;
    if (!headers.has("Content-Type")) headers.set("Content-Type", "text/plain; charset=utf-8");
  } else if (response.body !== undefined) {
    body = JSON.stringify(response.body);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  }
  const status = response.status ?? 200;
  if (method === "HEAD" || [204, 205, 304].includes(status)) body = undefined;
  const result = new Response(body === undefined ? null : typeof body === "string" ? body : new Uint8Array(body), { status, headers });
  const cookies = Object.entries(response.headers ?? {}).filter(([name]) => name.toLowerCase() === "set-cookie")
    .flatMap(([, value]) => Array.isArray(value) ? value : [value]);
  responseCookies.set(result, cookies);
  return result;
}
