# Overrides

An override is a scenario applied on top of your base handlers: "the user is an
admin", "the service is down", "the list is empty". This page shows how to write
one, from the simplest case to parameterized ones.

## Where overrides live

Put override files under `src/mocks/overrides`. The folder structure becomes the
catalog tree in the dashboard, and the path without `.ts` becomes the override's
**ID**:

```text
src/mocks/overrides/
├── user/
│   ├── profile.ts        → ID: user/profile
│   └── permissions.ts    → ID: user/permissions
└── orders/
    └── empty.ts          → ID: orders/empty
```

IDs matter later: Cypress tests select scenarios by ID (see
[Cypress](/testing/cypress)).

## Your first override

The smallest override has a name and an `override` function that returns route
patches:

```ts [src/mocks/overrides/orders/empty.ts]
import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'No orders',
  description: 'The user has not ordered anything yet.',
  override: () => ({
    'GET /api/orders': [],
  }),
});
```

The returned object maps route keys to **patches**. Here the patch is a JSON
value, so it simply replaces the response of `GET /api/orders`.

## Modifying instead of replacing

A patch can be a function. It receives the **current body**, which is the
response so far (from the base handler or earlier overrides), and returns what to
send instead:

```ts [src/mocks/overrides/user/admin.ts]
import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Admin user',
  override: () => ({
    'GET /api/user': body => ({ ...body, role: 'admin' }),
  }),
});
```

With the handler from the previous pages, `GET /api/user` now returns
`{ id: 'demo', name: 'Demo User', role: 'admin' }`. Only `role` was added; the
rest of the base response is preserved. This is why overrides stack well: each
one changes one thing.

## Parameters

Hard-coding every variation leads to many near-identical files. **Parameters**
let one override cover them all, and the dashboard turns each into a form
control.

```ts [src/mocks/overrides/user/profile.ts]
import { defineMockOverride, json } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'User profile',
  description: 'Customize the user or simulate a service error.',
  params: {
    fail: { type: 'boolean', default: false },
    name: { type: 'string', default: 'Taylor' },
    role: { type: 'string', default: 'member', options: ['member', 'admin'] },
  },
  override: ({ fail, name, role }) => ({
    'GET /api/user': body =>
      fail
        ? json({ error: 'Service unavailable' }, 503)
        : { ...body, name, role },
  }),
});
```

The parameter values arrive as the argument of `override`, already typed.

| Declaration                                   | Dashboard control |
| --------------------------------------------- | ----------------- |
| `{ type: 'boolean', default: false }`         | Checkbox          |
| `{ type: 'string', default: 'Taylor' }`       | Text field        |
| `{ type: 'string', default: 'a', options: [...] }` | Dropdown     |

`default` sets the initial value. When a test applies the override without
`params`, the defaults are used.

## One override, several routes

An override can patch many routes at once, which is handy for a scenario that
spans a whole feature:

```ts [src/mocks/overrides/checkout/payment-down.ts]
import { defineMockOverride, json } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Payments down',
  description: 'Every payment endpoint returns 503.',
  override: () => ({
    'POST /api/pay': json({ error: 'Payments unavailable' }, 503),
    'GET /api/payment-methods': json({ error: 'Payments unavailable' }, 503),
  }),
});
```

## How overrides are discovered

- Only `.ts` modules are discovered.
- Files and directories starting with `_` are ignored. Use this for shared
  helpers: `overrides/_shared/users.ts`.
- Declaration files (`.d.ts`) and `.test.ts` files are ignored.
- A **default export** takes precedence. A single **named** override export is
  also accepted.
- Changes become available without restarting Vite.

## Sharing helpers between overrides

Because `_`-prefixed files are never shown as overrides, they are a good home for
shared code:

```ts [src/mocks/overrides/_shared/errors.ts]
import { json } from '@avinlab/qmock';

export const unavailable = () => json({ error: 'Service unavailable' }, 503);
```

```ts [src/mocks/overrides/orders/down.ts]
import { defineMockOverride } from '@avinlab/qmock';
import { unavailable } from '../_shared/errors';

export default defineMockOverride({
  name: 'Orders down',
  override: () => ({ 'GET /api/orders': unavailable() }),
});
```

## Next

Now that you have scenarios, [use them in the dashboard](/guide/dashboard).
