---
layout: home

hero:
  name: QMock
  text: API-моки для Vite с дашбордом
  tagline: Опишите API один раз. Переключайте сценарии в браузере во время разработки и используйте те же сценарии в Vitest, Playwright и Cypress.
  actions:
    - theme: brand
      text: Быстрый старт
      link: /ru/guide/getting-started
    - theme: alt
      text: Что такое QMock?
      link: /ru/guide/introduction
    - theme: alt
      text: GitHub
      link: https://github.com/avin/qMock

features:
  - title: Обычные TypeScript-обработчики
    details: Маршруты задаются ключами вроде `GET /api/user`. Значения — это JSON или функции, читающие запрос.
  - title: Сценарии, которые можно переключать
    details: Оверрайды — небольшие модули с типизированными параметрами. Перетащите их в дашборд, чтобы имитировать ошибки, пустые списки или медленные ответы.
  - title: Ответы по слоям
    details: Активные оверрайды выполняются сверху вниз, и каждый видит ответ, полученный от предыдущего.
  - title: Изолированные тесты
    details: У каждого теста свой сценарий. Ни dev-сервер, ни отдельный мок-сервер не нужны.
---

## Идея за 30 секунд

```ts
// src/mocks/handlers.ts: счастливый путь
import { defineMockConfiguration } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'GET /api/user': { id: 'demo', name: 'Demo User' },
  },
});
```

```ts
// src/mocks/overrides/user/profile.ts: сценарий поверх него
import { defineMockOverride, json } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'User profile',
  params: { fail: { type: 'boolean', default: false } },
  override: ({ fail }) => ({
    'GET /api/user': body => (fail ? json({ error: 'Down' }, 503) : body),
  }),
});
```

Запустите Vite, откройте `/__apiMock` и перетащите **User profile** в список
активных. В тесте передайте тот же файл в `createMockScope`, `applyMocks` или
`registerMocks`.

Готовы? Начните с [введения](/ru/guide/introduction) или сразу переходите к
[быстрому старту](/ru/guide/getting-started).
