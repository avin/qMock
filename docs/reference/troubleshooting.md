# Troubleshooting

## The dashboard is empty

The catalog shows files under `src/mocks/overrides` (or your `overrides` path).
Check that:

- Files are `.ts` modules.
- Names and folders do not start with `_`, and files are not `.d.ts` or
  `.test.ts`.
- The module has a **default export** from `defineMockOverride` (or exactly one
  named override export).

## My request is not mocked

- **Route key format.** It must be `METHOD /pathname` with an uppercase method
  and one space. Do not include the query string.
- **Origin.** Mocks answer requests that reach Vite. If the app calls an absolute
  backend URL, point its development API URL at the Vite origin.
- **Production.** Mocks do not exist in production builds or under
  `vite preview`.
- **Wildcards.** Exact handlers win. Among wildcards the first declared wins, so
  a broad `/*` placed first can shadow a narrower one.

## My override does nothing

- Is it in the **Active** list and **enabled** (checkbox)?
- Does the route key match the handler's key exactly? For a wildcard handler, the
  override must use the **same wildcard key**.
- Order: a later override may be replacing what yours produced.
- A modifier that returns `undefined` keeps the current response.

## I get `undefined` in a modifier

For new routes, or routes disabled by `null`, there is no previous body. Guard:
`body => ({ ...(body ?? {}), extra: true })`.

## A JSON `null` body turns into pass-through

A bare `null` patch disables the mock. Use `json(null)` for a real JSON null.

## Request body is empty on the second read

A body can be consumed once. Read it once with `readRequestBody` or
`readFormData` and reuse the value.

## Tests

### Vitest: requests are not mocked

Only calls made **inside** `scope.run(...)`, and awaited before it returns, use
the scope. Move rendering and assertions inside the callback.

### Playwright: requests escape the mocks

- Set `use: { serviceWorkers: 'block' }`.
- Call `applyMocks` **before** `page.goto`.
- `context.request` and other `APIRequestContext` calls are not mocked.

### Cypress: `cy.request()` is not mocked

`cy.request()` uses separate networking. Use the app's own `fetch` or
XMLHttpRequest, or `cy.visit` and interact with the UI.

### A handler fails to load in Cypress

Handlers run in the browser there. Avoid Node-only dependencies, and use
`readRequestBody` or `readFormData` rather than `request.raw` internals.

### Aliases do not resolve in tests

Paths from `tsconfig.json` work by default. For aliases defined only in Vite,
pass `alias: { '@': './src' }` or import the configuration through your test
runner.

## Still stuck?

Open an issue at [github.com/avin/qMock/issues](https://github.com/avin/qMock/issues)
with your Vite config, the relevant handler or override, and the request you
expected to be mocked.
