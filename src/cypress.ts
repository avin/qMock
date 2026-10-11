/// <reference types="cypress" />
import { createResolvedMockScope } from './browserScope.js';
import { getMockResponseCookies } from './engine.js';
import type { BrowserMockOverride } from './browserScope.js';
import type { MockConfiguration, MockOverride, MockOverrideHandlers } from './utils.js';

export type CypressMockOverride = BrowserMockOverride | string | { id: string; params?: Record<string, boolean | string> };

export interface CypressMockOptions {
  name?: string;
  configuration?: MockConfiguration;
  overrides?: CypressMockOverride[];
  patches?: MockOverrideHandlers;
}

export interface CypressMockScope {
  name: string;
  /** Replace additional patches, keeping configured overrides active. */
  set(patches: MockOverrideHandlers): void;
  /** Restore the initial patches. */
  clear(): void;
  /** Stop this scope from replying to requests. */
  dispose(): void;
}

interface Definitions {
  configuration: MockConfiguration;
  overrides: Record<string, MockOverride>;
}

function install(options: CypressMockOptions, definitions?: Definitions): Cypress.Chainable<CypressMockScope> {
  const overrides = (options.overrides ?? []).map(entry => {
    if (typeof entry !== 'string' && !('id' in entry)) return entry;
    const id = typeof entry === 'string' ? entry : entry.id;
    const override = definitions?.overrides[id];
    if (!override) throw new Error(`Mock override not found: ${id}`);
    return { override, params: typeof entry === 'string' ? undefined : entry.params };
  });
  const scope = createResolvedMockScope(options.configuration ?? definitions!.configuration, { ...options, overrides });
  let disposed = false;
  const result: CypressMockScope = {
    name: scope.name,
    set: scope.set,
    clear: scope.clear,
    dispose() { disposed = true; scope.clear(); },
  };
  return cy.intercept('**/*', async incoming => {
    if (disposed) return;
    const method = incoming.method.toUpperCase();
    const body = incoming.body;
    const headers = Object.fromEntries(Object.entries(incoming.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]));
    let payload: BodyInit | undefined;
    if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
      if (typeof body === 'string') payload = body;
      else if (body instanceof ArrayBuffer) payload = body;
      else if (ArrayBuffer.isView(body)) payload = new Uint8Array(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
      else if (new Headers(headers).get('content-type')?.toLowerCase().includes('application/x-www-form-urlencoded')) {
        const form = new URLSearchParams();
        for (const [key, value] of Object.entries(body)) {
          for (const item of Array.isArray(value) ? value : [value]) form.append(key, String(item));
        }
        payload = form.toString();
      } else payload = JSON.stringify(body);
    }
    const response = await scope.handle(new Request(incoming.url, { method, headers, body: payload }), incoming.headers);
    if (response === undefined || disposed) return;
    const responseHeaders = Object.fromEntries(response.headers);
    const cookies = getMockResponseCookies(response);
    delete responseHeaders['set-cookie'];
    if (cookies.length > 0) {
      incoming.on('before:response', reply => { reply.headers['set-cookie'] = cookies; });
    }
    incoming.reply({
      statusCode: response.status,
      headers: responseHeaders,
      body: await response.arrayBuffer(),
    });
  }).then(() => result);
}

/** Register browser request mocks inside a test or beforeEach hook. */
export function applyMocks(options: CypressMockOptions = {}): Cypress.Chainable<CypressMockScope> {
  const needsDefinitions = options.configuration === undefined ||
    (options.overrides ?? []).some(entry => typeof entry === 'string' || 'id' in entry);
  if (!needsDefinitions) return install(options);
  return cy.task<{ code: string }>('qmock:load', null, { log: false }).then(({ code }) => {
    // This is the trusted project bundle produced by the qmock Node task, not response data.
    const definitions = new Function(`${code}\n;return qmockDefinitions;`)() as Definitions;
    return install(options, definitions);
  });
}

/** Install a fresh mock scope for every test in the current suite. */
export function setupMocks(options: CypressMockOptions = {}): void {
  let scope: CypressMockScope | undefined;
  beforeEach(() => {
    scope = undefined;
    return applyMocks(options).then(value => { scope = value; });
  });
  afterEach(() => { scope?.dispose(); scope = undefined; });
}
