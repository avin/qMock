# Getting started

By the end of this page you will have a working mock endpoint and the dashboard
open in your browser.

## Requirements

- Node.js **22.12** or newer
- A Vite project (QMock is a Vite plugin and is ESM)

## 1. Install

```sh
npm install --save-dev @avinlab/qmock
```

## 2. Add the plugin

Add `apiMockPlugin()` to `vite.config.ts` next to your other plugins:

```ts [vite.config.ts]
import { defineConfig } from 'vite';
import { apiMockPlugin } from '@avinlab/qmock';

export default defineConfig({
  plugins: [apiMockPlugin()],
});
```

With no options, QMock looks for handlers in `src/mocks/handlers.ts` and
overrides in `src/mocks/overrides`. See [Configuration](/reference/configuration)
to change that.

::: tip
`mockApiPlugin` is an alias of `apiMockPlugin`. Use whichever reads better to
you.
:::

## 3. Write your first handlers

Create `src/mocks/handlers.ts`:

```ts [src/mocks/handlers.ts]
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

Each key is `METHOD /pathname`. Each value says what to answer with. These three
handlers show the three common shapes:

| Handler            | Value                    | Meaning                                    |
| ------------------ | ------------------------ | ------------------------------------------ |
| `GET /api/user`    | a plain object           | Respond with this JSON, status 200         |
| `POST /api/orders` | `json(body, status)`     | Respond with this JSON and status          |
| `GET /api/search`  | a function of the request | Compute the response, here from the query |

## 4. Start Vite and call the API

```sh
npx vite
```

From your application code, call the same origin that Vite serves:

```ts
const user = await fetch('/api/user').then(r => r.json());
// { id: 'demo', name: 'Demo User' }

const search = await fetch('/api/search?q=shoes').then(r => r.json());
// { query: 'shoes', results: [] }
```

Or check from a terminal while Vite runs (the default port is 5173):

```sh
curl http://localhost:5173/api/user
```

::: warning Absolute backend URLs
Mocks answer requests that reach the **Vite origin**. If your app calls an
absolute URL like `https://api.example.com/user`, point its development API base
URL at Vite (for example through an environment variable) so requests arrive at
QMock.
:::

Requests that match no handler are not an error: they continue to Vite's normal
middleware and proxies. That means you can mock a few endpoints and let the rest
go to a real backend through Vite's `server.proxy`.

## 5. Open the dashboard

Visit `http://localhost:5173/__apiMocks`. It is
empty for now, because you have not written any overrides yet. That is the next
step.

## Development only

Mocks and the dashboard exist only while the Vite dev server runs. They are not
part of your production build and are not served by `vite preview`.

## Next

Before adding scenarios, learn how routes are matched in
[Handlers and routes](/guide/handlers).
