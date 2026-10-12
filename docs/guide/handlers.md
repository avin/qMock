# Handlers and routes

Handlers are the base of your mock API: how it behaves when no scenario is
active. They live in one file with a default export from
`defineMockConfiguration`.

```ts [src/mocks/handlers.ts]
import { defineMockConfiguration } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'GET /api/user': { id: 'demo', name: 'Demo User' },
  },
});
```

Changes to this file are picked up automatically; you do not need to restart
Vite.

## Route keys

A key is the HTTP method and the pathname, separated by one space:

```text
METHOD /pathname
```

Supported methods: `DELETE`, `GET`, `HEAD`, `OPTIONS`, `PATCH`, `POST`, `PUT`.

```ts
handlers: {
  'GET /api/products': [{ id: 1 }, { id: 2 }],
  'POST /api/products': json({ id: 3 }, 201),
  'DELETE /api/products/1': { kind: 'mock-response', status: 204 },
}
```

### Query strings are not part of the key

`GET /api/search?q=shoes` matches the key `GET /api/search`. The query string is
available to your handler through `request.url`:

```ts
'GET /api/search': request => {
  const q = request.url.searchParams.get('q') ?? '';
  const page = Number(request.url.searchParams.get('page') ?? 1);
  return { query: q, page, results: q ? [`${q} #1`, `${q} #2`] : [] };
},
```

## Wildcards

A key ending in `/*` matches everything below that path:

```ts
handlers: {
  'GET /api/users/*': request => ({ path: request.url.pathname }),
}
```

This answers `/api/users/1`, `/api/users/1/posts`, and so on.

### Which handler wins?

1. **Exact** handlers beat wildcard handlers.
2. If several wildcards match, the **first declared** wins.

```ts
handlers: {
  'GET /api/users/me': { id: 'me' },             // exact: wins for /api/users/me
  'GET /api/users/admin/*': { scope: 'admin' },  // first matching wildcard
  'GET /api/users/*': { scope: 'any' },          // fallback
}
```

Put your more specific wildcards first.

::: warning Overrides and wildcards
An override that targets a route matched by a wildcard handler must use the
**same wildcard key**. To patch `'GET /api/users/*'`, the override's key must be
`'GET /api/users/*'`, not `'GET /api/users/1'`.
:::

## Handlers as functions

A handler can be a JSON value or a function (sync or async) that receives a
`MockRequest`:

| Field     | Meaning                                  |
| --------- | ---------------------------------------- |
| `route`   | The matched route key                    |
| `url`     | A `URL` object, with `searchParams` etc. |
| `raw`     | The raw Node.js request                  |

```ts
'GET /api/whoami': request => ({
  route: request.route,
  agent: request.raw.headers['user-agent'],
}),
```

### Reading request bodies

Two helpers read the body:

- `readRequestBody(request)` returns the raw text.
- `readFormData(request)` returns `URLSearchParams` for URL-encoded form bodies.

```ts
import { defineMockConfiguration, readRequestBody, readFormData } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'POST /api/echo': async request => {
      const text = await readRequestBody(request);
      return { received: JSON.parse(text) };
    },
    'POST /api/login': async request => {
      const form = await readFormData(request);
      return form.get('user') === 'admin'
        ? { token: 'secret' }
        : { kind: 'mock-response', status: 401, body: { error: 'Bad credentials' } };
    },
  },
});
```

::: warning Read the body once
A request body can be consumed only once. Call `readRequestBody` or
`readFormData` a single time per request and reuse the result.
:::

### Async handlers and delays

Because handlers can be async, simulating latency is just a promise:

```ts
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

'GET /api/slow': async () => {
  await sleep(1500);
  return { ok: true };
},
```

## Next

You have used plain objects, `json(...)`, and `kind: 'mock-response'` so far.
[Responses](/guide/responses) explains exactly how each is turned into an HTTP
response.
