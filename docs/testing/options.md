# Scenario options

Vitest (`createMockScope`) and Playwright (`applyMocks`) accept the same scenario
options. Cypress supports the path-related ones through `registerMocks`.

## Running from another directory

Pass `root` when tests run from a different directory than the project that
holds `src/mocks`:

```ts
const scope = await createMockScope({ root: '../app' });
```

## A custom handlers file

Provide a filename, or import the configuration directly:

```ts
import configuration from './src/mocks/handlers';
import profile from './src/mocks/overrides/user/profile';

const scope = await createMockScope({
  name: 'checkout-error',
  configuration,
  overrides: [profile],
});
```

`name` is an optional **label** (handy in debugging output). Scopes stay
independent even when they share a name.

Imported overrides can include functions, text responses, and binary data, just
like in development.

## Inline responses: `patches`

Use `patches` to supply route responses directly when creating a scope, with no
override file:

```ts
const scope = await createMockScope({
  patches: {
    'GET /api/user': { name: 'Inline' },
    'GET /api/orders': [],
  },
});
```

After creation, change them with `scope.set(patches)`, which **replaces** the
temporary patches. `scope.clear()` restores the initial patches (the ones given
at creation) and keeps the configured overrides.

## Aliases and TypeScript

Default loading supports TypeScript and paths from the project's `tsconfig.json`.

For aliases defined **only in Vite**, pass them explicitly:

```ts
const scope = await createMockScope({ alias: { '@': './src' } });
```

Or import the configuration through your test runner (so its own resolution
applies) and pass it directly:

```ts
import configuration from './src/mocks/handlers';
const scope = await createMockScope({ configuration });
```

## Summary

| Option          | Purpose                                                      |
| --------------- | ------------------------------------------------------------ |
| `root`          | Project directory when tests run from elsewhere              |
| `configuration` | A filename, or an imported configuration object              |
| `overrides`     | Overrides to apply, in order. Each is an override or `{ override, params }` (Vitest, Playwright) / an ID or `{ id, params }` (Cypress) |
| `patches`       | Route responses supplied directly                            |
| `name`          | A label for the scope                                        |
| `alias`         | Extra module aliases, such as `{ '@': './src' }`             |
