# Cypress

У Cypress-адаптера две половины. `@avinlab/qmock/cypress/node` работает в
Node-процессе Cypress и загружает ваши обработчики. `@avinlab/qmock/cypress`
работает в браузерном коде спеков и применяет их.

## Настройка

Зарегистрируйте QMock в конфигурации Cypress:

```ts [cypress.config.ts]
import { defineConfig } from 'cypress';
import { registerMocks } from '@avinlab/qmock/cypress/node';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      registerMocks(on, config);
    },
  },
});
```

Ту же регистрацию используйте в `component.setupNodeEvents` для компонентных
тестов:

```ts
export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      registerMocks(on, config);
    },
  },
  component: {
    setupNodeEvents(on, config) {
      registerMocks(on, config);
    },
  },
});
```

## Ваш первый тест

Применяйте моки **до** `cy.visit` или монтирования компонента:

```ts
import { applyMocks } from '@avinlab/qmock/cypress';

it('shows a service error', () => {
  applyMocks({
    overrides: [{ id: 'user/profile', params: { fail: true } }],
  });

  cy.visit('/profile');
  cy.contains('Service unavailable').should('be.visible');
});
```

В отличие от Vitest и Playwright, Cypress выбирает оверрайды **по ID** — пути
внутри папки оверрайдов без `.ts`
(см. [Оверрайды](/ru/guide/overrides#где-лежат-оверрайды)).

- `applyMocks()` без опций использует только базовые обработчики.
- У каждого теста независимые моки, а настройки дашборда на них не влияют.
- Cypress снимает перехват запросов после каждого теста.

## Выбор оверрайдов

Используйте голые ID для параметров по умолчанию или объекты, чтобы задать
параметры:

```ts
applyMocks({
  overrides: [
    'orders/empty',
    { id: 'user/profile', params: { name: 'Sam' } },
  ],
});
```

## Автоматическая настройка в support-файле

Вызовите `setupMocks()` один раз в support-файле Cypress. Передайте опции
сценария, чтобы задать значения по умолчанию для всего набора тестов:

```ts [cypress/support/e2e.ts]
import { setupMocks } from '@avinlab/qmock/cypress';

setupMocks();
```

## Изменение ответов во время теста

`applyMocks` возвращает scope. Используйте `set`, чтобы добавить временные
ответы:

```ts
applyMocks().then(mocks => {
  mocks.set({ 'GET /api/user': { name: 'Test User' } });
});
cy.visit('/profile');
```

## Компонентные тесты

Те же моки работают, когда вы монтируете компонент напрямую, без dev-сервера:

```ts
import { applyMocks } from '@avinlab/qmock/cypress';
import { UserCard } from './UserCard';

it('renders the admin badge', () => {
  applyMocks({
    overrides: [{ id: 'user/profile', params: { role: 'admin' } }],
  });
  cy.mount(<UserCard />);
  cy.contains('admin').should('be.visible');
});
```

## Свои пути

По умолчанию пути — `src/mocks/handlers.ts` и `src/mocks/overrides` относительно
корня проекта Cypress. Переопределите их в `registerMocks`:

```ts
registerMocks(on, config, {
  configuration: 'test/mocks/handlers.ts',
  overrides: 'test/mocks/overrides',
});
```

Опция `root` выбирает другую директорию проекта, а `alias` добавляет
дополнительные алиасы модулей.

## Покрытие и ограничения

- Покрывается: браузерные запросы приложения, включая `fetch` и XMLHttpRequest.
- Не покрывается: `cy.request()`, использующий отдельную сетевую подсистему.
- Запросы без совпадения продолжают идти как обычно.
- Для e2e-тестов можно отдавать статическую сборку или монтировать компоненты
  напрямую, без dev-сервера QMock.
- Обработчики, используемые с Cypress, должны использовать **зависимости,
  совместимые с браузером**, а тела запросов читать через `readRequestBody` или
  `readFormData`.

## Дальше

[Опции сценария](/ru/testing/options): алиасы и свои файлы обработчиков.
