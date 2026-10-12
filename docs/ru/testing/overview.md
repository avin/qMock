# Обзор тестирования

Обработчики и оверрайды, написанные для разработки, можно переиспользовать в
автотестах с **Vitest**, **Playwright** и **Cypress**. Запускать dev-сервер Vite
или отдельный мок-сервер не нужно.

## Принципы

- **У каждого теста свой сценарий.** Параллельные тесты не влияют друг на друга.
- **Настройки дашборда не применяются.** То, что вы сохранили в
  `.mock-overrides.json`, никак не влияет на тесты, поэтому результат теста не
  зависит от того, в каком состоянии вы оставили дашборд.
- **По умолчанию — базовые обработчики.** Адаптеры загружают
  `src/mocks/handlers.ts` из текущего проекта. Опустите опции сценария, чтобы
  использовать их как есть.
- **Оверрайды подключаются явно.** Передайте те оверрайды, что нужны тесту. Они
  выполняются **в порядке массива** и используют значения параметров по
  умолчанию, если вы не задали `params`.

## Сценарий на одном примере

Допустим, у вас есть такой оверрайд из руководства:

```ts [src/mocks/overrides/user/profile.ts]
export default defineMockOverride({
  name: 'User profile',
  params: {
    fail: { type: 'boolean', default: false },
    name: { type: 'string', default: 'Taylor' },
  },
  override: ({ fail, name }) => ({
    'GET /api/user': body => (fail ? json({ error: 'Service unavailable' }, 503) : { ...body, name }),
  }),
});
```

Тот же сценарий в каждом инструменте:

::: code-group

```ts [Vitest]
const scope = await createMockScope({
  overrides: [{ override: profile, params: { fail: true } }],
});
await scope.run(async () => {
  const response = await fetch('/api/user');
  expect(response.status).toBe(503);
});
```

```ts [Playwright]
const mocks = await applyMocks(context, {
  overrides: [{ override: profile, params: { fail: true } }],
});
await page.goto('/profile');
```

```ts [Cypress]
applyMocks({
  overrides: [{ id: 'user/profile', params: { fail: true } }],
});
cy.visit('/profile');
```

:::

## Выбор адаптера

| Инструмент | Что мокается                                    | Откуда импортировать         |
| ---------- | ----------------------------------------------- | ---------------------------- |
| Vitest     | Вызовы `fetch` внутри `scope.run`               | `@avinlab/qmock/vitest`      |
| Playwright | Браузерные запросы контекста или страницы       | `@avinlab/qmock/playwright`  |
| Cypress    | Браузерные запросы (`fetch` и XMLHttpRequest)   | `@avinlab/qmock/cypress` и `@avinlab/qmock/cypress/node` |

У каждого есть своя страница со всеми подробностями:

- [Vitest](/ru/testing/vitest)
- [Playwright](/ru/testing/playwright)
- [Cypress](/ru/testing/cypress)

Опции, общие для Vitest и Playwright (и частично для Cypress), описаны в
[Опциях сценария](/ru/testing/options).

## Что не мокается

- **Запросы без совпадения — не ошибка.** Они уходят в исходную сеть: исходный
  `fetch` в Vitest, обычная сеть браузера в Playwright и Cypress.
- Запросы Playwright `context.request` и другие запросы `APIRequestContext` не
  покрываются.
- `cy.request()` в Cypress использует отдельную сетевую подсистему и не
  мокается.
