---
name: qmock
description: Integrate @avinlab/qmock into Vite projects, write API mock handlers and parameterized overrides, and use isolated mock responses in automated tests. Use when setting up QMock, migrating existing mocks, or changing QMock scenarios.
---

# QMock

Use this skill to connect QMock to a project and implement realistic API scenarios.
Inspect the project's Vite configuration, package manager, request URLs, existing
mocks, and API contracts before editing. Answer questions directly; implement
changes when the user requests them. Preserve existing project conventions and
the user's requested scope.

## Connect to Vite

Install `@avinlab/qmock` as a development dependency with the project's package
manager. It requires Node.js >=22.12 and a Vite project. Register `apiMockPlugin()`
alongside the existing plugins in `vite.config.ts`:

```ts
import { apiMockPlugin } from '@avinlab/qmock';
```

Create `src/mocks/handlers.ts` with a default configuration export:

```ts
import { defineMockConfiguration, json } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'GET /api/user': { id: 'demo', name: 'Taylor' },
    'POST /api/orders': json({ id: 'order-1' }, 201),
    'GET /api/search': request => ({
      query: request.url.searchParams.get('q'),
      results: [],
    }),
  },
});
```

Requests must reach the Vite development origin. Use same-origin URLs or adapt
the application's existing development API URL setting. Unmatched routes pass
through to subsequent middleware and proxies. Mocks and `/__apiMock` are available
only on the development server, not in production builds or `vite preview`.

For an existing mock layout, configure `apiMockPlugin({ handlers, overrides,
stateFile })`. Defaults are `/src/mocks/handlers.ts`, `src/mocks/overrides`, and
`.mock-overrides.json`. The handler path is a Vite module path or absolute file
path; the other paths are relative to the Vite root or absolute filesystem paths.
Use `stateFile: false` to disable persistence. Ignore the state file when settings
should be personal; commit it when the team wants a shared preset.

## Write handlers

Route keys are `METHOD /pathname` for GET, POST, PUT, PATCH, DELETE, HEAD, or
OPTIONS. Query strings belong in `request.url.searchParams`, not in route keys.
Exact routes take precedence over trailing `/*` wildcards. A wildcard matches
descendants; the first declared matching wildcard wins. Overrides for a matched
wildcard use that same wildcard key.

Handlers accept JSON values or synchronous/asynchronous request resolvers.
`request` exposes `route`, `url`, and the raw Node request `raw`.
`readRequestBody(request)` returns text; parse JSON explicitly when needed.
`readFormData(request)` returns `URLSearchParams` for URL-encoded forms. Read each
request body once. Both helpers are exported from `@avinlab/qmock`.

Use `json(body, status)` for explicit JSON responses, including `json(null)`.
To customize headers or return text or bytes, use a response envelope:

```ts
{
  kind: 'mock-response',
  status: 200,
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  text: 'Ready',
}
```

An envelope supports `body` for JSON, `text` for text, or `data: Uint8Array` for
bytes. Status defaults to 200; bytes take precedence over text, then JSON body.
An envelope without a payload sends an empty response. Match the real API's
payload, status, and headers so the application exercises the intended behavior.

## Create overrides

Put `.ts` scenario modules under the configured overrides directory. For example,
`src/mocks/overrides/user/availability.ts` has ID `user/availability` and appears
inside the User catalog group. Export `defineMockOverride(...)` as the default:

```ts
import { defineMockOverride, json } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'User availability',
  description: 'Customize the user or simulate a service failure.',
  params: {
    unavailable: { type: 'boolean', default: false },
    name: { type: 'string', default: 'Taylor' },
    role: { type: 'string', default: 'member', options: ['member', 'admin'] },
  },
  override: ({ unavailable, name, role }) => ({
    'GET /api/user': body => unavailable
      ? json({ error: 'Service unavailable' }, 503)
      : { ...body, name, role },
  }),
});
```

Boolean parameters produce checkboxes; strings produce text fields or dropdowns
when `options` is supplied. Set `default` for each parameter. Use English scenario
names and descriptions. Shared helpers belong in underscore-prefixed files or
directories such as `_helpers`; discovery ignores those, `.d.ts`, and `.test.ts`.

Route patches can replace or add responses with JSON or an envelope. A `null`
patch disables the mock and lets the request pass through; use `json(null)` to
return JSON null instead. A modifier receives `(body, { request, response })` and
may be async. Returning `undefined` keeps the response. Returning JSON changes
the body while preserving existing response metadata, including text/bytes.
Return a full envelope to change status or switch payload formats. The body
argument is `JsonObject | undefined`; use `context.response` for other payload
shapes. New or disabled routes provide `undefined` as the modifier body.

In `/__apiMock`, search or expand the catalog and drag a scenario into **Active**.
The gear button edits parameters; the checkbox toggles the scenario. Reorder
active rows to change composition, or drag a row back to remove it. Overrides run
top to bottom; later modifiers receive earlier results. Disabled entries retain
parameters. Saved settings survive restarts, and handler/override edits reload
without restarting Vite.

## Reuse mocks in tests

Use `@avinlab/qmock/vitest` for application `fetch` calls in Vitest and
`@avinlab/qmock/playwright` or `@avinlab/qmock/cypress` for browser requests.
All run handlers and overrides
without a Vite development server or a mock API server. Saved dashboard state is
irrelevant to test scenarios.

Vitest and Playwright accept optional scenario options:

- `configuration`: an imported default mock configuration or a filename.
  Defaults to `src/mocks/handlers.ts` in the project root.
- `root`: the project directory, defaulting to the current working directory.
- `overrides`: imported override definitions, or `{ override, params }` entries.
  Defaults to `[]`; definitions use their parameter defaults. Array order is
  execution order.
- `name`: an optional descriptive label, not a server address or a shared state
  key. Scopes with identical names remain independent.
- `patches`: initial route patches applied after the selected overrides.
- `alias`: module aliases with targets relative to `root`, for example
  `{ '@': './src' }`. TypeScript configuration paths are picked up automatically.

Pass Vite-only aliases through `alias`, or import the configuration through the
test runner and supply it directly. Use explicit imports for additional runner
transforms. Preserve existing project module resolution instead of rewriting
application imports just for mocks. Functions and binary responses work in test
scenarios; reuse scenario modules instead of duplicating payloads in tests.

`scope.set(patches)` replaces temporary route patches. `scope.clear()` restores
the initial `patches` and retains configured overrides. Route patches follow the
same replacement/modifier/null rules as override modules. Unmatched and disabled
routes use normal networking in these adapters.

### Vitest

```ts
import { expect, test } from 'vitest';
import { createMockScope } from '@avinlab/qmock/vitest';
import availability from './src/mocks/overrides/user/availability';

test('handles an unavailable user service', async () => {
  const scope = await createMockScope({
    overrides: [{ override: availability, params: { unavailable: true } }],
  });

  await scope.run(async () => {
    const response = await fetch('/api/user');
    expect(response.status).toBe(503);
    // Render or exercise the application inside this callback.
  });
});
```

Use `await createMockScope()` for base handlers only. Keep all awaited application
work inside `scope.run`; the fetch interception is cleaned up when the callback
returns or throws. Concurrent and nested scopes stay isolated. Choose this
adapter for `fetch`; browser networking belongs in Playwright or Cypress tests.

For fixture-based tests, extend the project's Vitest test with `withMocks`:

```ts
import { test as base } from 'vitest';
import { withMocks, type VitestMockScope } from '@avinlab/qmock/vitest';

export const test = base.extend<{ mocks: VitestMockScope }>({
  mocks: withMocks(),
});

test('uses a custom user', async ({ mocks }) => {
  await mocks.set({ 'GET /api/user': { name: 'Test User' } });
  await mocks.run(async () => {
    // Render or exercise the application here.
  });
});
```

Supply scenario options to `withMocks(options)` for a suite's default scenario.
The fixture creates the scope and cleans up after the test; use `mocks.run` to
intercept application fetch calls, or `mocks.fetch` to request a mock directly.

### Playwright

```ts
import { expect, test } from '@playwright/test';
import { applyMocks } from '@avinlab/qmock/playwright';
import availability from './src/mocks/overrides/user/availability';

test('shows a service error', async ({ context, page }) => {
  const mocks = await applyMocks(context, {
    overrides: [{ override: availability, params: { unavailable: true } }],
  });
  try {
    await page.goto('/profile');
    await expect(page.getByText('Service unavailable')).toBeVisible();
  } finally {
    await mocks.dispose();
  }
});
```

Install routes before navigation. `applyMocks(context)` covers all pages in that
context; pass a page for page-local interception. Set Playwright's
`use.serviceWorkers` to `'block'` so requests reach the routes. Each page or
context gets independent settings. Preserve the project's application serving
strategy: a static build server or `page.setContent` works without QMock's Vite
plugin. Absolute backend request URLs can also be intercepted. The adapter covers
browser networking; `context.request` and other `APIRequestContext` calls are
outside its routes.

For automatic setup and teardown, extend the project's Playwright test:

```ts
import { test as base } from '@playwright/test';
import { createMockTest } from '@avinlab/qmock/playwright';

export const test = createMockTest(base);

test('uses a custom user', async ({ page, mockScope }) => {
  await mockScope.set({ 'GET /api/user': { name: 'Test User' } });
  await page.goto('/profile');
});
```

`createMockTest(base, options)` accepts the same default scenario options and
provides the context-level `mockScope` fixture with automatic disposal.

### Cypress

Register the Node adapter in the project's existing Cypress configuration. Keep
other event handlers and configuration intact:

```ts
import { registerMocks } from '@avinlab/qmock/cypress/node';

// Inside e2e.setupNodeEvents or component.setupNodeEvents:
registerMocks(on, config);
```

Defaults load `src/mocks/handlers.ts` and discover `src/mocks/overrides` from
`config.projectRoot`. For custom paths, use
`registerMocks(on, config, { configuration: 'test/mocks/handlers.ts',
overrides: 'test/mocks/overrides' })`. Node options also accept `root` and `alias`.
Configure filenames and discovery paths in this Node registration; choose the
scenario in the browser test using catalog IDs:

```ts
import { applyMocks } from '@avinlab/qmock/cypress';

it('shows a service error', () => {
  applyMocks({
    overrides: [{ id: 'user/availability', params: { unavailable: true } }],
  });
  cy.visit('/profile');
  cy.contains('Service unavailable').should('be.visible');
});
```

`applyMocks()` uses base handlers. `overrides: ['user/availability']` uses that
scenario's default parameters; array order controls composition. Install mocks
before `cy.visit` or `cy.mount`. Commands use Cypress's queue rather than
`async`/`await`. To customize a response before application startup:

```ts
applyMocks().then(mocks => {
  mocks.set({ 'GET /api/user': { name: 'Test User' } });
});
cy.visit('/profile');
```

For a shared default scenario, call `setupMocks(options?)` once in the support
file; it registers per-test setup and cleanup. Cypress also clears request
interception between tests. Scopes expose `set`, `clear`, and `dispose` for
explicit response updates and cleanup. Each test's scenario is independent of
the dashboard and other tests.

Browser `fetch` and XMLHttpRequest are intercepted, including absolute backend
URLs. Unmatched and disabled routes continue normally. `cy.request()` is outside
the browser interception. A static application server is sufficient for
end-to-end tests; component mounting needs no QMock dev-server. Keep scenario
handlers browser-compatible: use the body-reading helpers and response envelopes
rather than Node-only request APIs or dependencies.

## Verify the requested behavior

For integration changes, request a known mock endpoint, open `/__apiMock`, and
check that unmatched API requests still reach the configured backend or proxy.
For scenarios, verify the payload and status, parameter changes, and any relevant
ordering or fall-through behavior. For test changes, verify scope isolation and
cleanup. Run the project's relevant checks and report what was actually verified.
