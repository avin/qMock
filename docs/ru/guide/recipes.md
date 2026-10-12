# Рецепты

Готовые примеры для ситуаций, которые встречаются снова и снова. Каждый рецепт —
файл оверрайда, который можно положить в `src/mocks/overrides`. Предполагаются
базовые обработчики из [быстрого старта](/ru/guide/getting-started) плюс
показанные ниже дополнительные маршруты.

## Общая база для примеров

```ts [src/mocks/handlers.ts]
import { defineMockConfiguration, json } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'GET /api/user': { id: 'demo', name: 'Demo User', role: 'member' },
    'GET /api/orders': [
      { id: 'o-1', total: 30 },
      { id: 'o-2', total: 55 },
    ],
    'POST /api/orders': json({ id: 'o-3' }, 201),
    'GET /api/search': request => ({
      query: request.url.searchParams.get('q'),
      results: ['one', 'two'],
    }),
  },
});
```

## Имитация ошибки сервера

```ts [overrides/errors/server-error.ts]
import { defineMockOverride, json } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Server error',
  description: 'Selected routes answer with a 5xx.',
  params: {
    status: { type: 'string', default: '500', options: ['500', '502', '503'] },
  },
  override: ({ status }) => ({
    'GET /api/orders': json({ error: 'Something went wrong' }, Number(status)),
    'POST /api/orders': json({ error: 'Something went wrong' }, Number(status)),
  }),
});
```

С его помощью проверяют баннеры ошибок, кнопки повтора и поведение оптимистичных
обновлений интерфейса.

## Пустое состояние

```ts [overrides/orders/empty.ts]
import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'No orders',
  override: () => ({ 'GET /api/orders': [] }),
});
```

## Большой список для пагинации и прокрутки

```ts [overrides/orders/many.ts]
import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Many orders',
  params: {
    count: { type: 'string', default: '200' },
  },
  override: ({ count }) => ({
    'GET /api/orders': () =>
      Array.from({ length: Number(count) }, (_, i) => ({
        id: `o-${i + 1}`,
        total: (i % 9) * 10 + 10,
      })),
  }),
});
```

## Медленная сеть

```ts [overrides/network/slow.ts]
import { defineMockOverride } from '@avinlab/qmock';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default defineMockOverride({
  name: 'Slow network',
  description: 'Delay every answer for the routes below.',
  params: {
    ms: { type: 'string', default: '1500' },
  },
  override: ({ ms }) => ({
    'GET /api/orders': async body => {
      await sleep(Number(ms));
      return body;
    },
    'GET /api/user': async body => {
      await sleep(Number(ms));
      return body;
    },
  }),
});
```

Поставьте его **выше** оверрайда с ошибкой в списке Active, чтобы увидеть
состояние загрузки до появления ошибки.

## Фичефлаги и роли

```ts [overrides/user/role.ts]
import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'User role',
  params: {
    role: { type: 'string', default: 'admin', options: ['member', 'admin', 'owner'] },
    beta: { type: 'boolean', default: false },
  },
  override: ({ role, beta }) => ({
    'GET /api/user': body => ({ ...body, role, features: { beta } }),
  }),
});
```

## Поиск с параметрами запроса

Обработчики могут реагировать на строку запроса, поэтому один обработчик
покрывает много состояний интерфейса:

```ts
'GET /api/search': request => {
  const q = request.url.searchParams.get('q') ?? '';
  if (q === 'nothing') return { query: q, results: [] };
  if (q === 'boom') return json({ error: 'Search failed' }, 500);
  return { query: q, results: [`${q} 1`, `${q} 2`, `${q} 3`] };
},
```

Введите `nothing` или `boom` в поле поиска вашего приложения, чтобы увидеть
каждое состояние вообще без обращения к дашборду.

## Ошибки валидации формы

```ts [overrides/forms/validation-error.ts]
import { defineMockOverride, json } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Validation error',
  params: {
    field: { type: 'string', default: 'email' },
  },
  override: ({ field }) => ({
    'POST /api/orders': json(
      { errors: { [field]: ['is invalid'] } },
      422,
    ),
  }),
});
```

## Пропустить один эндпоинт на реальный бэкенд

Поставьте маршруту `null`, и QMock отойдёт в сторону:

```ts [overrides/real/orders.ts]
import { defineMockOverride } from '@avinlab/qmock';

export default defineMockOverride({
  name: 'Real orders service',
  description: 'Orders use the real backend; everything else stays mocked.',
  override: () => ({
    'GET /api/orders': null,
    'POST /api/orders': null,
  }),
});
```

Запрос продолжает путь в обычные middleware и `server.proxy` Vite.

## Поведение, похожее на состояние

Обработчики — обычные функции, поэтому переменная уровня модуля может играть роль
состояния. Оно сбрасывается при перезагрузке модуля:

```ts [src/mocks/handlers.ts]
let likes = 0;

export default defineMockConfiguration({
  handlers: {
    'GET /api/likes': () => ({ likes }),
    'POST /api/likes': () => ({ likes: ++likes }),
  },
});
```

::: warning
Считайте это удобством для разработки. В тестах каждый scope должен быть
независимым, поэтому предпочитайте детерминированные ответы или
[`scope.set`](/ru/testing/vitest).
:::

## Скачивание файла

```ts
'GET /api/export.csv': {
  kind: 'mock-response',
  headers: {
    'Content-Type': 'text/csv',
    'Content-Disposition': 'attachment; filename="orders.csv"',
  },
  text: 'id,total\no-1,30\no-2,55\n',
},
```

## Дальше

Эти сценарии так же полезны в автотестах. Переходите к разделу
[Тестирование: обзор](/ru/testing/overview).
