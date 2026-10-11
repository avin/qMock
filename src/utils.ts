import type { Connect } from "vite";

export type MockMethod = "DELETE" | "GET" | "HEAD" | "OPTIONS" | "PATCH" | "POST" | "PUT";
export type MockRoute = `${MockMethod} /${string}`;
export type JsonValue = boolean | number | string | null | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue | undefined };

export interface MockRequest {
  route: MockRoute;
  url: URL;
  raw: Connect.IncomingMessage;
}

export interface MockResponse {
  kind: "mock-response";
  status?: number;
  headers?: Record<string, string | string[]>;
  body?: JsonValue;
  data?: Uint8Array;
  text?: string;
}

export type MockAnswer = JsonValue | MockResponse;
export type MockResolver = (request: MockRequest) => MockAnswer | Promise<MockAnswer>;
export type MockHandler = MockResolver | MockAnswer;
export type MockHandlers = Partial<Record<MockRoute, MockHandler>>;

export interface MockOverrideContext {
  request: MockRequest;
  response: MockResponse | undefined;
}

/**
 * Receives the current JSON body, or undefined for a new or disabled route.
 * Returning undefined leaves the route unchanged.
 */
export type MockRouteModifier = (
  originalAnswer: JsonObject | undefined,
  context: MockOverrideContext,
) => MockAnswer | undefined | Promise<MockAnswer | undefined>;

/**
 * null disables the mock; a value replaces or adds a response; a function modifies it.
 * Use json(null) for a JSON null response.
 */
export type MockRoutePatch = null | MockAnswer | MockRouteModifier;
export type MockOverrideHandlers = Partial<Record<MockRoute, MockRoutePatch>>;

export interface MockOverrideBooleanParam {
  type: "boolean";
  default: boolean;
}

export interface MockOverrideStringParam {
  type: "string";
  default: string;
  options?: readonly string[];
}

export type MockOverrideParam = MockOverrideBooleanParam | MockOverrideStringParam;
export type MockOverrideParamsSchema = Record<string, MockOverrideParam>;

type MockOverrideParamValue<P extends MockOverrideParam> = P extends MockOverrideBooleanParam ? boolean : string;

export type MockOverrideParamValues<S extends MockOverrideParamsSchema> = {
  [K in keyof S]: MockOverrideParamValue<S[K]>;
};

export interface MockOverride<S extends MockOverrideParamsSchema = MockOverrideParamsSchema> {
  name: string;
  description?: string;
  params?: S;
  override(params: MockOverrideParamValues<S>): MockOverrideHandlers;
}

export interface MockConfiguration {
  handlers: MockHandlers;
}

export function json(body: JsonValue, status = 200): MockResponse {
  return { kind: "mock-response", status, body };
}

export async function readRequestBody({ raw }: MockRequest) {
  let body = "";

  raw.setEncoding("utf8");
  for await (const chunk of raw) {
    body += chunk;
  }

  return body;
}

export async function readFormData(request: MockRequest) {
  return new URLSearchParams(await readRequestBody(request));
}

export function defineMockHandlers<const T extends MockHandlers>(handlers: T): T {
  return handlers;
}

export function defineMockConfiguration<const T extends MockConfiguration>(configuration: T): T {
  return configuration;
}

export function defineMockOverride<const S extends MockOverrideParamsSchema>(
  override: MockOverride<S>,
): MockOverride<S> {
  return override;
}
