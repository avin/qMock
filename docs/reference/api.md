# API cheat sheet

A compact summary of everything exported. Details live on the linked pages.

## `@avinlab/qmock`

| Export                           | Purpose                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| `apiMockPlugin(options?)`        | The Vite plugin. Alias: `mockApiPlugin`                    |
| `defineMockConfiguration({ handlers })` | Declare base handlers                               |
| `defineMockOverride({ name, description?, params?, override })` | Declare a scenario  |
| `json(body, status?)`            | A JSON response with a status                              |
| `readRequestBody(request)`       | Read the raw request body as text (once)                   |
| `readFormData(request)`          | Read a URL-encoded body as `URLSearchParams` (once)        |

## Route keys

```text
METHOD /pathname        DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
METHOD /prefix/*        wildcard; exact keys win, otherwise first declared
```

## `MockRequest`

| Field   | Meaning                  |
| ------- | ------------------------ |
| `route` | Matched route key        |
| `url`   | `URL` with query string  |
| `raw`   | Raw Node.js request      |

## Response forms

```ts
{ any: 'json' }                                   // 200 JSON
json({ any: 'json' }, 201)                        // JSON with status
{ kind: 'mock-response', status, headers, body }  // envelope: JSON body
{ kind: 'mock-response', text: 'hi' }             // envelope: text
{ kind: 'mock-response', data: new Uint8Array() } // envelope: bytes
```

Payload precedence: `data` → `text` → `body`. Status defaults to 200.

## Route patches in overrides

| Patch                       | Effect                                       |
| --------------------------- | -------------------------------------------- |
| value / envelope            | Replace or add                               |
| `null`                      | Disable the mock; pass through               |
| `(body, { request, response }) => …` | Modify the current response         |
| …returns `undefined`        | Keep response                                |
| …returns a JSON value       | Replace body, keep metadata                  |
| …returns an envelope        | Replace entire response                      |

## Parameters

```ts
params: {
  flag:  { type: 'boolean', default: false },
  text:  { type: 'string',  default: '' },
  pick:  { type: 'string',  default: 'a', options: ['a', 'b'] },
}
```

## Test adapters

| Import                          | Main exports                                  |
| ------------------------------- | --------------------------------------------- |
| `@avinlab/qmock/vitest`         | `createMockScope`, `withMocks`, `VitestMockScope` |
| `@avinlab/qmock/playwright`     | `applyMocks`, `createMockTest`                |
| `@avinlab/qmock/cypress`        | `applyMocks`, `setupMocks`                    |
| `@avinlab/qmock/cypress/node`   | `registerMocks`                               |

Scope methods: `run(fn)` (Vitest), `set(patches)`, `clear()`, `dispose()`
(Playwright).

## CLI

```sh
npx qmock install-skills [--target <dir>]
```

See [Agent skill](/reference/skill).
