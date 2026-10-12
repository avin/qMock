# Testing overview

The handlers and overrides you wrote for development can be reused in automated
tests with **Vitest**, **Playwright**, and **Cypress**. You do not need to run a
Vite dev server or a separate mock server.

## Principles

- **Each test has its own scenario.** Parallel tests do not affect each other.
- **Dashboard settings are not applied.** What you saved in
  `.mock-overrides.json` has no effect on tests, so a test result never depends
  on how you last left the dashboard.
- **Base handlers by default.** The adapters load `src/mocks/handlers.ts` from the
  current project. Omit scenario options to use them as they are.
- **Overrides are opt-in.** Pass the overrides a test needs. They run in **array
  order** and use their default parameters unless you give `params`.

## A scenario, in one example

Suppose you have this override from the guide:

```ts [src/mocks/overrides/user/profile.ts]
export default defineMockOverride({
  name: 'User profile',
  params: {
    fail: { type: 'boolean', default: false },
    name: { type: 'string', default: 'Taylor' },
  },
  override: ({ fail, name }) => ({
    'GET /api/user': body => (fail ? json({ error: 'Service unavailable' }, 503) : { ...body, name }),
  }),
});
```

The same scenario, expressed per tool:

::: code-group

```ts [Vitest]
const scope = await createMockScope({
  overrides: [{ override: profile, params: { fail: true } }],
});
await scope.run(async () => {
  const response = await fetch('/api/user');
  expect(response.status).toBe(503);
});
```

```ts [Playwright]
const mocks = await applyMocks(context, {
  overrides: [{ override: profile, params: { fail: true } }],
});
await page.goto('/profile');
```

```ts [Cypress]
applyMocks({
  overrides: [{ id: 'user/profile', params: { fail: true } }],
});
cy.visit('/profile');
```

:::

## Choosing an adapter

| Tool       | What is mocked                              | Import from                  |
| ---------- | ------------------------------------------- | ---------------------------- |
| Vitest     | Calls to `fetch` inside `scope.run`         | `@avinlab/qmock/vitest`      |
| Playwright | Browser requests of a context or page       | `@avinlab/qmock/playwright`  |
| Cypress    | Browser requests (`fetch` and XMLHttpRequest) | `@avinlab/qmock/cypress` and `@avinlab/qmock/cypress/node` |

Each has its own page with all the details:

- [Vitest](/testing/vitest)
- [Playwright](/testing/playwright)
- [Cypress](/testing/cypress)

Options shared by Vitest and Playwright (and partly Cypress) are in
[Scenario options](/testing/options).

## What is not mocked

- **Unmatched requests are not errors.** They go to the original networking:
  the original `fetch` in Vitest, the browser's normal networking in Playwright
  and Cypress.
- Playwright's `context.request` and other `APIRequestContext` requests are not
  covered.
- Cypress's `cy.request()` uses separate networking and is not mocked.
