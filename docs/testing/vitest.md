# Vitest

Import from `@avinlab/qmock/vitest`. Vitest tests do not need a browser or
server: QMock intercepts `fetch` for the duration of a callback.

## Your first test

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

What happens:

1. `createMockScope` loads your base handlers and applies the listed overrides.
2. Inside `scope.run`, application calls to `fetch` use the scope's mocks.
3. When the callback finishes or throws, the scope is removed.

### Rules for `scope.run`

- **Await all work that should use the scope inside the callback.** Anything that
  happens after the callback returns no longer sees the mocks.
- **Parallel and nested runs stay independent.** Two tests running concurrently
  each see their own scenario.
- **Unmatched requests use the original `fetch`.**

## Base handlers only

Omit options to test against your handlers with no overrides:

```ts
const scope = await createMockScope();
await scope.run(async () => {
  const response = await fetch('/api/user');
  expect(await response.json()).toEqual({ id: 'demo', name: 'Demo User' });
});
```

## Testing a component

A typical component test renders inside `run`, so every request it makes is
mocked:

```tsx
import { render, screen } from '@testing-library/react';
import { createMockScope } from '@avinlab/qmock/vitest';
import profile from './src/mocks/overrides/user/profile';
import { UserCard } from './UserCard';

test('shows an error banner when the service is down', async () => {
  const scope = await createMockScope({
    overrides: [{ override: profile, params: { fail: true } }],
  });

  await scope.run(async () => {
    render(<UserCard />);
    expect(await screen.findByText('Service unavailable')).toBeInTheDocument();
  });
});
```

## Several overrides in order

Overrides are applied in array order, exactly like the **Active** list in the
dashboard:

```ts
import adminRole from './src/mocks/overrides/user/role';
import slow from './src/mocks/overrides/network/slow';

const scope = await createMockScope({
  overrides: [
    { override: adminRole, params: { role: 'owner' } },
    { override: slow, params: { ms: '50' } },
  ],
});
```

You can pass an override without params (it then uses its defaults) as a bare
value: `overrides: [profile]`.

## Automatic scope with a fixture

For automatic creation and cleanup, extend Vitest's `test` with `withMocks()` in
your project's test module:

```ts [test-setup.ts]
import { test as base } from 'vitest';
import { withMocks, type VitestMockScope } from '@avinlab/qmock/vitest';

export const test = base.extend<{ mocks: VitestMockScope }>({
  mocks: withMocks(),
});
```

Then use the `mocks` fixture. Wrap application calls in `mocks.run`:

```ts
import { test } from './test-setup';

test('uses a custom response', async ({ mocks }) => {
  await mocks.set({ 'GET /api/user': { name: 'Test User' } });
  await mocks.run(async () => {
    const response = await fetch('/api/user');
    expect(await response.json()).toEqual({ name: 'Test User' });
  });
});
```

### Ad-hoc responses with `set`

`mocks.set(patches)` takes the same patches an override returns, so you can
inline a one-off response without creating an override file:

```ts
await mocks.set({
  'GET /api/orders': [],
  'POST /api/orders': json({ error: 'Out of stock' }, 409),
});
```

Calling `set` again **replaces** the previous temporary patches. `scope.clear()`
restores the initial patches and keeps the configured overrides. Vitest also
clears temporary patches after each `run`.

## Next

See [Playwright](/testing/playwright) for browser-level tests, or
[Scenario options](/testing/options) for custom paths and aliases.
