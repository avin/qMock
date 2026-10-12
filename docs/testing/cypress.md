# Cypress

The Cypress adapter has two halves. `@avinlab/qmock/cypress/node` runs in
Cypress's Node process and loads your handlers. `@avinlab/qmock/cypress` runs in
the browser spec code and applies them.

## Setup

Register QMock in your Cypress configuration:

```ts [cypress.config.ts]
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

Use the same registration in `component.setupNodeEvents` for component tests:

```ts
export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      registerMocks(on, config);
    },
  },
  component: {
    setupNodeEvents(on, config) {
      registerMocks(on, config);
    },
  },
});
```

## Your first test

Apply mocks **before** visiting the app or mounting a component:

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

Unlike Vitest and Playwright, Cypress selects overrides **by ID**, the path
under your overrides directory without `.ts`
(see [Overrides](/guide/overrides#where-overrides-live)).

- `applyMocks()` with no options uses base handlers only.
- Each test gets independent mocks, and dashboard settings do not affect them.
- Cypress removes the request interception after each test.

## Selecting overrides

Use bare IDs for default parameters, or objects to provide parameters:

```ts
applyMocks({
  overrides: [
    'orders/empty',
    { id: 'user/profile', params: { name: 'Sam' } },
  ],
});
```

## Automatic setup in the support file

Call `setupMocks()` once in your Cypress support file. Pass scenario options to
set defaults for the whole suite:

```ts [cypress/support/e2e.ts]
import { setupMocks } from '@avinlab/qmock/cypress';

setupMocks();
```

## Customizing responses during a test

`applyMocks` returns a scope. Use `set` to add temporary responses:

```ts
applyMocks().then(mocks => {
  mocks.set({ 'GET /api/user': { name: 'Test User' } });
});
cy.visit('/profile');
```

## Component tests

The same mocks work when you mount a component directly, with no dev server:

```ts
import { applyMocks } from '@avinlab/qmock/cypress';
import { UserCard } from './UserCard';

it('renders the admin badge', () => {
  applyMocks({
    overrides: [{ id: 'user/profile', params: { role: 'admin' } }],
  });
  cy.mount(<UserCard />);
  cy.contains('admin').should('be.visible');
});
```

## Custom paths

Paths default to `src/mocks/handlers.ts` and `src/mocks/overrides`, relative to
Cypress's project root. Override them in `registerMocks`:

```ts
registerMocks(on, config, {
  configuration: 'test/mocks/handlers.ts',
  overrides: 'test/mocks/overrides',
});
```

Use `root` to choose a different project directory, and `alias` for additional
module aliases.

## Coverage and limits

- Covered: the application's browser requests, including `fetch` and
  XMLHttpRequest.
- Not covered: `cy.request()`, which uses separate networking.
- Unmatched requests continue normally.
- You can serve a static build for end-to-end tests, or mount components
  directly without a QMock dev server.
- Handlers used with Cypress should use **browser-compatible dependencies**, and
  `readRequestBody` or `readFormData` to read request bodies.

## Next

[Scenario options](/testing/options) for aliases and custom handler files.
