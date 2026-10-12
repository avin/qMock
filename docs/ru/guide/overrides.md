# Оверрайды

Оверрайд — это сценарий, применяемый поверх ваших базовых обработчиков:
«пользователь — администратор», «сервис недоступен», «список пуст». На этой
странице показано, как написать оверрайд — от простейшего до параметризованного.

## Где лежат оверрайды

Кладите файлы оверрайдов в `src/mocks/overrides`. Структура папок становится
деревом каталога в дашборде, а путь без `.ts` становится **ID** оверрайда:

```text
src/mocks/overrides/
├── user/
│   ├── profile.ts        → ID: user/profile
│   └── permissions.ts    → ID: user/permissions
└── orders/
    └── empty.ts          → ID: orders/empty
```

ID пригодятся позже: Cypress-тесты выбирают сценарии по ID (см.
[Cypress](/ru/testing/cypress)).

## Ваш первый оверрайд

Самый маленький оверрайд состоит из имени и функции `override`, возвращающей
патчи маршрутов:

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

Возвращаемый объект сопоставляет ключи маршрутов с **патчами**. Здесь патч —
JSON-значение, поэтому он просто заменяет ответ `GET /api/orders`.

## Изменение вместо замены

Патч может быть функцией. Она получает **текущее тело** — ответ на данный момент
(от базового обработчика или предыдущих оверрайдов) — и возвращает то, что нужно
отправить вместо него:

```ts [src/mocks/overrides/user/admin.ts]
import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Admin user',
  override: () => ({
    'GET /api/user': body => ({ ...body, role: 'admin' }),
  }),
});
```

С обработчиком из предыдущих страниц `GET /api/user` теперь возвращает
`{ id: 'demo', name: 'Demo User', role: 'admin' }`. Добавлено только `role`,
остальной базовый ответ сохранён. Поэтому оверрайды хорошо складываются: каждый
меняет что-то одно.

## Параметры

Если жёстко прописывать каждую вариацию, получится много почти одинаковых файлов.
**Параметры** позволяют одному оверрайду покрыть их все, а дашборд превращает
каждый параметр в элемент формы.

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

Значения параметров приходят аргументом `override` уже типизированными.

| Объявление                                          | Элемент в дашборде |
| --------------------------------------------------- | ------------------ |
| `{ type: 'boolean', default: false }`               | Чекбокс            |
| `{ type: 'string', default: 'Taylor' }`             | Текстовое поле     |
| `{ type: 'string', default: 'a', options: [...] }`  | Выпадающий список  |

`default` задаёт начальное значение. Если тест применяет оверрайд без `params`,
используются значения по умолчанию.

## Один оверрайд, несколько маршрутов

Оверрайд может менять сразу несколько маршрутов — это удобно для сценария,
охватывающего целую функциональность:

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

## Как находятся оверрайды

- Обнаруживаются только модули `.ts`.
- Файлы и папки, имена которых начинаются с `_`, игнорируются. Используйте это
  для общих хелперов: `overrides/_shared/users.ts`.
- Файлы деклараций (`.d.ts`) и `.test.ts` игнорируются.
- Приоритет у **экспорта по умолчанию**. Единственный **именованный** экспорт
  оверрайда тоже принимается.
- Изменения становятся доступны без перезапуска Vite.

## Общие хелперы для оверрайдов

Файлы с префиксом `_` никогда не показываются как оверрайды, поэтому в них
удобно держать общий код:

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

## Дальше

Теперь, когда у вас есть сценарии, [используйте их в дашборде](/ru/guide/dashboard).
