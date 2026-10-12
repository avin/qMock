# Playwright

Импортируйте из `@avinlab/qmock/playwright`. Адаптер маршрутизирует браузерные
запросы контекста или страницы, так что мок-сервер не нужен.

## Настройка

Заблокируйте service worker-ы, чтобы все браузерные запросы доходили до
мок-маршрутов:

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
Playwright по-прежнему нужен способ открыть ваше приложение: сервер статической
сборки, настроенный через `webServer` и `baseURL`, или `page.setContent` для
небольшой тестовой страницы. Сами **API-моки** работают без сервера и также
работают для запросов на **абсолютные URL бэкенда**.
:::

## Ваш первый тест

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

Всегда вызывайте `dispose()` (здесь в `finally`), чтобы удалить мок-маршруты.

## Контекст или страница

- `applyMocks(context)` покрывает **каждую страницу этого контекста**. Вызывайте
  его **до навигации**.
- `applyMocks(page)` покрывает одну страницу.

У каждого контекста или страницы может быть независимый сценарий, так что две
страницы в одном тесте могут видеть разные бэкенды:

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

  // ... управляем обеими страницами ...

  await adminMocks.dispose();
  await guestMocks.dispose();
});
```

## Только базовые обработчики

```ts
const mocks = await applyMocks(context);
```

## Автоматическая настройка через `createMockTest`

Один раз расширьте `test` из Playwright — и у каждого теста будет свой scope,
который устанавливается перед тестом и очищается после него:

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

`mockScope.set(patches)` принимает те же патчи, что и оверрайд. Он заменяет
ранее заданные временные патчи.

### Ответы для отдельного теста

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

## Покрытие

- Покрывается: браузерные запросы страниц контекста или страницы.
- Запросы без совпадения идут дальше через обычную сеть браузера.
- Не покрывается: `context.request` и другие запросы `APIRequestContext`.

## Дальше

[Cypress](/ru/testing/cypress) или [Опции сценария](/ru/testing/options).
