# QMock

API mocks for Vite with a standalone override dashboard at **`/__apiMock`**.
Organize mocks in a nested catalog, create
parameterized scenarios, activate and reorder them with drag and drop,
save your settings, and run tests with independent mock responses.

Requires Node.js >=22.12 and a Vite project. QMock is ESM.

## Install

```sh
npm install --save-dev @avinlab/qmock
```

Add the plugin to `vite.config.ts` alongside your existing plugins:

```ts
import { defineConfig } from 'vite';
import { apiMockPlugin } from '@avinlab/qmock';

export default defineConfig({
  plugins: [apiMockPlugin()],
});
```

Create `src/mocks/handlers.ts`:

```ts
import { defineMockConfiguration, json } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'GET /api/user': { id: 'demo', name: 'Demo User' },
    'POST /api/orders': json({ id: 'order-1' }, 201),
    'GET /api/search': request => ({
      query: request.url.searchParams.get('q'),
      results: [],
    }),
  },
});
```

Start Vite and open `/__apiMock`. Make requests to the same Vite origin, such as
`fetch('/api/user')`. If your application uses an absolute backend URL, configure
its development API URL to point to Vite. Unmatched routes continue to Vite's
normal middleware and proxies.

Mocks and the dashboard are available during development only. They are not
included in your application's production build or served by `vite preview`.

## Overrides

Place scenarios under `src/mocks/overrides`. Directories become catalog groups;
the relative filename without `.ts` becomes the override ID. For example,
`src/mocks/overrides/user/profile.ts` has ID `user/profile`.

```ts
import { defineMockOverride, json } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'User profile',
  description: 'Customize the user or simulate a service error.',
  params: {
    fail: { type: 'boolean', default: false },
    name: { type: 'string', default: 'Taylor' },
    role: { type: 'string', default: 'member', options: ['member', 'admin'] },
  },
  override: ({ fail, name, role }) => ({
    'GET /api/user': body => fail
      ? json({ error: 'Service unavailable' }, 503)
      : { ...body, name, role },
  }),
});
```

Open the dashboard, expand or search the catalog, and drag an override into **Active**. Use the gear button to configure
parameters, the checkbox to enable
or disable a scenario, and drag active rows to change their order. Drag a row
back to the catalog to remove it. Keyboard users can focus a drag row, press
Space to pick it up, use arrow keys to move it, and press Space to drop it;
Escape cancels a drag.

Active overrides execute from top to bottom. Later overrides receive the
response produced by earlier ones. Disabled entries remain in the list and
retain their parameters.

Only `.ts` modules are discovered. Files and directories starting with `_`,
declaration files, and `.test.ts` files are ignored. A default export takes
precedence; a single named override export is also accepted. Changes to handlers
and overrides become available without manually restarting Vite.

Boolean parameters appear as checkboxes, strings as text fields, and strings
with `options` as dropdowns. Use `default` to set each parameter's initial value.

The active list is saved to `.mock-overrides.json` in the Vite root and restored
when the server starts. Add it to `.gitignore` for personal developer settings,
or commit it to share a scenario preset.

## Routes and responses

Keys use `METHOD /pathname`, with DELETE, GET, HEAD, OPTIONS, PATCH, POST, and PUT.
Query strings are available through `request.url` and are not part of the key.
Exact handlers take precedence over wildcard handlers. A trailing `/*` matches
descendants; when several wildcard handlers match, the first declared wins.
An override for a matched wildcard must use the same wildcard key.

A handler can be a JSON value or a sync/async function of `MockRequest`.
`request` contains `route`, `url`, and the raw Node request `raw`.
`readRequestBody(request)` returns raw text; `readFormData(request)` returns
`URLSearchParams` for URL-encoded form bodies. Read a request body once.

Use a response envelope to set status, headers, text, or bytes:

```ts
import { defineMockConfiguration, readFormData } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'POST /api/form': async request => {
      const form = await readFormData(request);
      return { submitted: form.get('name') };
    },
    'GET /download': {
      kind: 'mock-response',
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
      data: new Uint8Array([1, 2, 3]),
    },
    'GET /message': { kind: 'mock-response', text: 'Hello' },
  },
});
```

Envelope fields are `kind: 'mock-response'`, optional `status`, `headers`,
`body`, `text`, and `data`. Status defaults to 200. Bytes take precedence over
text, then JSON body. Text defaults to `text/plain; charset=utf-8`; JSON defaults
to `application/json`, unless a content type was supplied. An envelope without
any payload sends an empty response.

An override's route patch can be:

| Patch                                     | Behavior                                                       |
|-------------------------------------------|----------------------------------------------------------------|
| JSON value or response envelope           | Replace or add a response                                      |
| `null`                                    | Disable the mock and pass the request to downstream middleware |
| `(body, { request, response }) => answer` | Modify the current response, synchronously or asynchronously   |
| Modifier returning `undefined`            | Keep the current response                                      |
| Modifier returning a JSON value           | Replace the body while preserving response metadata            |
| Modifier returning an envelope            | Replace the entire response                                    |

Use `json(null)` when the intended response is JSON null. Modifiers receive
`undefined` as their body for new or disabled routes. Use `context.response`
to access the current status, headers, or non-object payloads. Return a full
response envelope when switching between JSON, text, and binary responses.

## Configuration

```ts
apiMockPlugin({
  handlers: '/src/mocks/handlers.ts',
  overrides: 'src/mocks/overrides',
  stateFile: '.mock-overrides.json',
});
```

| Option      | Default                  | Meaning                                                                          |
|-------------|--------------------------|----------------------------------------------------------------------------------|
| `handlers`  | `/src/mocks/handlers.ts` | Vite module path or absolute file path with a default mock configuration         |
| `overrides` | `src/mocks/overrides`    | Directory relative to the Vite root, or absolute directory                       |
| `stateFile` | `.mock-overrides.json`   | File relative to the Vite root, absolute file, or `false` to disable persistence |

`mockApiPlugin` is an alias of `apiMockPlugin`.

## Isolated tests

Use the same handlers and overrides in Vitest, Playwright, and Cypress without
running a Vite development server or a separate mock server. Each test has its own scenario;
saved dashboard settings are not applied.

The adapters load `src/mocks/handlers.ts` from the current project by default.
Omit scenario options to use your base handlers, or supply overrides for a
particular scenario. Overrides run in array order and
use their default parameters unless you provide `params`.

### Vitest

```ts
import { expect, test } from 'vitest';
import { createMockScope } from '@avinlab/qmock/vitest';
import profile from './src/mocks/overrides/user/profile';

test('handles a service error', async () => {
  const scope = await createMockScope({
    overrides: [{ override: profile, params: { fail: true } }],
  });

  await scope.run(async () => {
    const response = await fetch('/api/user');
    expect(response.status).toBe(503);
    // Render your component here to test how it handles the response.
  });
});
```

Inside `scope.run`, application calls to `fetch` use the scope's mocks. The scope
is removed when the callback completes or throws. Parallel and nested runs keep
their scenarios independent. Await all work that should use the scope inside the
callback. Unmatched requests use the original `fetch`.

For base handlers only:

```ts
const scope = await createMockScope();
await scope.run(async () => {
  const response = await fetch('/api/user');
});
```

For automatic scope creation and cleanup, add a fixture to your project's test
module. Use `mocks.run` around application calls:

```ts
import { test as base } from 'vitest';
import { withMocks, type VitestMockScope } from '@avinlab/qmock/vitest';

export const test = base.extend<{ mocks: VitestMockScope }>({
  mocks: withMocks(),
});

test('uses a custom response', async ({ mocks }) => {
  await mocks.set({ 'GET /api/user': { name: 'Test User' } });
  await mocks.run(async () => {
    const response = await fetch('/api/user');
  });
});
```

### Playwright

```ts
import { expect, test } from '@playwright/test';
import { applyMocks } from '@avinlab/qmock/playwright';
import profile from './src/mocks/overrides/user/profile';

test('shows a service error', async ({ context, page }) => {
  const mocks = await applyMocks(context, {
    overrides: [{ override: profile, params: { fail: true } }],
  });

  try {
    await page.goto('/profile');
    await expect(page.getByText('Service unavailable')).toBeVisible();
  } finally {
    await mocks.dispose();
  }
});
```

Call `applyMocks(context)` before navigation to use base handlers for every page
in that context. You can pass a single `page` instead. Each context or page can
have an independent scenario. Configure Playwright with
`use: { serviceWorkers: 'block' }` so browser requests reach the mock routes.

Playwright still needs a way to open your application, such as a static build
server configured with `webServer` and `baseURL`, or `page.setContent` for a small
test page. API mocks themselves run without a server and also work for requests
to absolute backend URLs. Unmatched requests continue through the browser's
normal networking. This adapter covers browser requests, not
`context.request` or other `APIRequestContext` requests.

Use `createMockTest` to install mocks and clean them up automatically per test:

```ts
import { test as base } from '@playwright/test';
import { createMockTest } from '@avinlab/qmock/playwright';

export const test = createMockTest(base);

test('uses a custom response', async ({ page, mockScope }) => {
  await mockScope.set({ 'GET /api/user': { name: 'Test User' } });
  await page.goto('/profile');
});
```

### Cypress

Register QMock in your Cypress configuration:

```ts
import { defineConfig } from 'cypress';
import { registerMocks } from '@avinlab/qmock/cypress/node';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      registerMocks(on, config);
    },
  },
});
```

Use the same registration in `component.setupNodeEvents` for component tests.
Then apply mocks before visiting the application or mounting a component:

```ts
import { applyMocks } from '@avinlab/qmock/cypress';

it('shows a service error', () => {
  applyMocks({
    overrides: [{ id: 'user/profile', params: { fail: true } }],
  });

  cy.visit('/profile');
  cy.contains('Service unavailable').should('be.visible');
});
```

`applyMocks()` uses base handlers only. Select scenarios by their IDs, such as
`overrides: ['user/profile']`, or provide parameters as shown above. Each test
gets independent mocks; dashboard settings do not affect them. Cypress removes
the request interception after each test.

For automatic setup and cleanup, call `setupMocks()` once in your Cypress support
file. Pass scenario options to set defaults for that suite:

```ts
import { setupMocks } from '@avinlab/qmock/cypress';

setupMocks();
```

To customize responses during a test, use the scope returned by `applyMocks`:

```ts
applyMocks().then(mocks => {
  mocks.set({ 'GET /api/user': { name: 'Test User' } });
});
cy.visit('/profile');
```

The Cypress adapter covers the application's browser requests, including `fetch`
and XMLHttpRequest; `cy.request()` uses separate networking and is not mocked.
Unmatched requests continue normally. You can serve a static application build
for end-to-end tests or mount components directly without a QMock dev-server.
Handlers used with Cypress should use browser-compatible dependencies and
`readRequestBody` or `readFormData` for request bodies.

For custom paths, pass options to `registerMocks(on, config, options)`:

```ts
registerMocks(on, config, {
  configuration: 'test/mocks/handlers.ts',
  overrides: 'test/mocks/overrides',
});
```

Paths default to `src/mocks/handlers.ts` and `src/mocks/overrides` relative to
Cypress's project root. Use `root` to select a different project directory or
`alias` for additional module aliases.

### Vitest and Playwright configuration

Pass `root` when tests run from a different directory. For a custom handlers
file, provide a filename or import the configuration directly:

```ts
import configuration from './src/mocks/handlers';

const scope = await createMockScope({
  name: 'checkout-error',
  configuration,
  overrides: [profile],
});
```

The name is an optional label; scopes stay independent even when they share a
name. Vitest and Playwright accept the same scenario options. Imported overrides can
include functions, text responses, and binary data, just like development mocks.

Use `patches` to supply route responses directly when creating a scope, or call
`scope.set(patches)` to replace its temporary patches. `scope.clear()` restores
the initial patches and keeps the configured overrides. Vitest also clears
temporary patches after each `run`.

Default loading supports TypeScript and paths from the project's `tsconfig.json`.
For aliases defined only in Vite, pass `alias: { '@': './src' }`, or import the
configuration through your test runner and pass it directly.

## Project skill

Install the bundled `qmock` skill to help your coding agent set up QMock and write
mock scenarios in your project:

```sh
npx qmock install-skills
# Or choose an agent's skill directory:
npx qmock install-skills --target .claude/skills
```

The default destination is `.agents/skills`. Installation refuses to overwrite
an existing skill. The `qmock` skill covers Vite integration, handlers,
parameterized overrides, dashboard usage, and isolated tests.

You can also copy `node_modules/@avinlab/qmock/skills/qmock` into your project's
skill directory. It is self-contained; no additional skills are required.
