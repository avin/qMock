---
layout: home

hero:
  name: QMock
  text: API mocks for Vite, with a dashboard
  tagline: Describe your API once. Switch scenarios in the browser while you develop, and reuse the same scenarios in Vitest, Playwright, and Cypress.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What is QMock?
      link: /guide/introduction
    - theme: alt
      text: GitHub
      link: https://github.com/avin/qMock

features:
  - title: Plain TypeScript handlers
    details: Routes are keys like `GET /api/user`. Values are JSON, or functions that read the request.
  - title: Scenarios you can toggle
    details: Overrides are small modules with typed parameters. Drag them into the dashboard to simulate errors, empty lists, or slow paths.
  - title: Layered responses
    details: Active overrides run top to bottom, and each one sees the response produced by the one before.
  - title: Isolated tests
    details: Every test gets its own scenario. No dev server and no separate mock server are needed.
---

## The idea in 30 seconds

```ts
// src/mocks/handlers.ts: the happy path
import { defineMockConfiguration } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'GET /api/user': { id: 'demo', name: 'Demo User' },
  },
});
```

```ts
// src/mocks/overrides/user/profile.ts: a scenario on top of it
import { defineMockOverride, json } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'User profile',
  params: { fail: { type: 'boolean', default: false } },
  override: ({ fail }) => ({
    'GET /api/user': body => (fail ? json({ error: 'Down' }, 503) : body),
  }),
});
```

Run Vite, open `/__apiMocks`, and drag **User profile** into the active list.
In a test, pass the same file to `createMockScope`, `applyMocks`, or
`registerMocks`.

Ready? Start with the [introduction](/guide/introduction), or jump straight to
[Getting started](/guide/getting-started).
