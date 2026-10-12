# Recipes

Complete examples for situations you will meet repeatedly. Each recipe is an
override file you can drop into `src/mocks/overrides`. They assume the base
handlers from [Getting started](/guide/getting-started) plus the extra routes
shown.

## A shared base for the examples

```ts [src/mocks/handlers.ts]
import { defineMockConfiguration, json } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'GET /api/user': { id: 'demo', name: 'Demo User', role: 'member' },
    'GET /api/orders': [
      { id: 'o-1', total: 30 },
      { id: 'o-2', total: 55 },
    ],
    'POST /api/orders': json({ id: 'o-3' }, 201),
    'GET /api/search': request => ({
      query: request.url.searchParams.get('q'),
      results: ['one', 'two'],
    }),
  },
});
```

## Simulate a server error

```ts [overrides/errors/server-error.ts]
import { defineMockOverride, json } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Server error',
  description: 'Selected routes answer with a 5xx.',
  params: {
    status: { type: 'string', default: '500', options: ['500', '502', '503'] },
  },
  override: ({ status }) => ({
    'GET /api/orders': json({ error: 'Something went wrong' }, Number(status)),
    'POST /api/orders': json({ error: 'Something went wrong' }, Number(status)),
  }),
});
```

Use it to verify error banners, retry buttons, and what happens to optimistic UI
updates.

## Empty state

```ts [overrides/orders/empty.ts]
import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'No orders',
  override: () => ({ 'GET /api/orders': [] }),
});
```

## Large list for pagination and scrolling

```ts [overrides/orders/many.ts]
import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Many orders',
  params: {
    count: { type: 'string', default: '200' },
  },
  override: ({ count }) => ({
    'GET /api/orders': () =>
      Array.from({ length: Number(count) }, (_, i) => ({
        id: `o-${i + 1}`,
        total: (i % 9) * 10 + 10,
      })),
  }),
});
```

## Slow network

```ts [overrides/network/slow.ts]
import { defineMockOverride } from '@avinlab/qmock';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default defineMockOverride({
  name: 'Slow network',
  description: 'Delay every answer for the routes below.',
  params: {
    ms: { type: 'string', default: '1500' },
  },
  override: ({ ms }) => ({
    'GET /api/orders': async body => {
      await sleep(Number(ms));
      return body;
    },
    'GET /api/user': async body => {
      await sleep(Number(ms));
      return body;
    },
  }),
});
```

Put it **above** an error override in the Active list to see a loading state
before the error appears.

## Feature flags and roles

```ts [overrides/user/role.ts]
import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'User role',
  params: {
    role: { type: 'string', default: 'admin', options: ['member', 'admin', 'owner'] },
    beta: { type: 'boolean', default: false },
  },
  override: ({ role, beta }) => ({
    'GET /api/user': body => ({ ...body, role, features: { beta } }),
  }),
});
```

## Search with query parameters

Handlers can react to the query string, so one handler covers many UI states:

```ts
'GET /api/search': request => {
  const q = request.url.searchParams.get('q') ?? '';
  if (q === 'nothing') return { query: q, results: [] };
  if (q === 'boom') return json({ error: 'Search failed' }, 500);
  return { query: q, results: [`${q} 1`, `${q} 2`, `${q} 3`] };
},
```

Type `nothing` or `boom` into the search box in your app to see each state with
no dashboard interaction at all.

## Validation errors on a form

```ts [overrides/forms/validation-error.ts]
import { defineMockOverride, json } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Validation error',
  params: {
    field: { type: 'string', default: 'email' },
  },
  override: ({ field }) => ({
    'POST /api/orders': json(
      { errors: { [field]: ['is invalid'] } },
      422,
    ),
  }),
});
```

## Pass one endpoint through to the real backend

Set a route to `null` and QMock steps aside for it:

```ts [overrides/real/orders.ts]
import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Real orders service',
  description: 'Orders use the real backend; everything else stays mocked.',
  override: () => ({
    'GET /api/orders': null,
    'POST /api/orders': null,
  }),
});
```

The request continues to Vite's normal middleware and `server.proxy`.

## Stateful-looking behavior

Handlers are plain functions, so a module-level variable can act as state. It
resets when the module reloads:

```ts [src/mocks/handlers.ts]
let likes = 0;

export default defineMockConfiguration({
  handlers: {
    'GET /api/likes': () => ({ likes }),
    'POST /api/likes': () => ({ likes: ++likes }),
  },
});
```

::: warning
Treat this as a convenience for development. In tests every scope should be
independent, so prefer deterministic responses or [`scope.set`](/testing/vitest).
:::

## Download a file

```ts
'GET /api/export.csv': {
  kind: 'mock-response',
  headers: {
    'Content-Type': 'text/csv',
    'Content-Disposition': 'attachment; filename="orders.csv"',
  },
  text: 'id,total\no-1,30\no-2,55\n',
},
```

## Next

Those scenarios are just as useful in automated tests. Continue to
[Testing: Overview](/testing/overview).
