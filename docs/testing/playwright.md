# Playwright

Import from `@avinlab/qmock/playwright`. The adapter routes the browser's
requests for a context or a page, so no mock server is required.

## Setup

Block service workers, so every browser request reaches the mock routes:

```ts [playwright.config.ts]
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: 'http://localhost:4173',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
  },
});
```

::: tip
Playwright still needs a way to open your app: a static build server configured
with `webServer` and `baseURL`, or `page.setContent` for a small test page. The
**API mocks** run without a server and also work for requests to **absolute
backend URLs**.
:::

## Your first test

```ts
import { expect, test } from '@playwright/test';
import { applyMocks } from '@avinlab/qmock/playwright';
import profile from './src/mocks/overrides/user/profile';

test('shows a service error', async ({ context, page }) => {
  const mocks = await applyMocks(context, {
    overrides: [{ override: profile, params: { fail: true } }],
  });

  try {
    await page.goto('/profile');
    await expect(page.getByText('Service unavailable')).toBeVisible();
  } finally {
    await mocks.dispose();
  }
});
```

Always call `dispose()` (here in `finally`) to remove the mock routes.

## Context or page

- `applyMocks(context)` covers **every page in that context**. Call it **before
  navigation**.
- `applyMocks(page)` covers a single page.

Each context or page can have an independent scenario, so two pages in one test
can see different backends:

```ts
test('two users, two scenarios', async ({ browser }) => {
  const adminContext = await browser.newContext();
  const guestContext = await browser.newContext();

  const adminMocks = await applyMocks(adminContext, {
    overrides: [{ override: role, params: { role: 'admin' } }],
  });
  const guestMocks = await applyMocks(guestContext, {
    overrides: [{ override: role, params: { role: 'member' } }],
  });

  // ... drive both pages ...

  await adminMocks.dispose();
  await guestMocks.dispose();
});
```

## Base handlers only

```ts
const mocks = await applyMocks(context);
```

## Automatic setup with `createMockTest`

Extend Playwright's `test` once, and every test gets its own scope, installed
before the test and cleaned up after it:

```ts [tests/fixtures.ts]
import { test as base } from '@playwright/test';
import { createMockTest } from '@avinlab/qmock/playwright';

export const test = createMockTest(base);
```

```ts
import { test } from './fixtures';

test('uses a custom response', async ({ page, mockScope }) => {
  await mockScope.set({ 'GET /api/user': { name: 'Test User' } });
  await page.goto('/profile');
});
```

`mockScope.set(patches)` accepts the same patches as an override. It replaces
the previously set temporary patches.

### Per-test responses

```ts
test('empty orders', async ({ page, mockScope }) => {
  await mockScope.set({ 'GET /api/orders': [] });
  await page.goto('/orders');
  await expect(page.getByText('No orders yet')).toBeVisible();
});

test('orders failing', async ({ page, mockScope }) => {
  await mockScope.set({
    'GET /api/orders': json({ error: 'Down' }, 503),
  });
  await page.goto('/orders');
  await expect(page.getByRole('alert')).toBeVisible();
});
```

## Coverage

- Covered: browser requests from pages in the context or page.
- Unmatched requests continue through the browser's normal networking.
- Not covered: `context.request` and other `APIRequestContext` requests.

## Next

[Cypress](/testing/cypress), or [Scenario options](/testing/options).
