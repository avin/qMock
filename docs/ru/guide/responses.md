# Ответы

Обработчик может возвращать значения нескольких видов. На этой странице разобраны
все.

## JSON-значения

Самый простой ответ — любое значение, которое можно сериализовать в JSON. Оно
отправляется как `application/json` со статусом 200.

```ts
'GET /api/user': { id: 'demo', name: 'Demo User' },
'GET /api/tags': ['a', 'b', 'c'],
```

## Хелпер `json()`

Чтобы изменить код статуса, оберните тело в `json(body, status)`:

```ts
import { json } from '@avinlab/qmock';

'POST /api/orders': json({ id: 'order-1' }, 201),
'GET /api/missing': json({ error: 'Not found' }, 404),
```

::: tip JSON null
Голый `null` в оверрайдах имеет особый смысл (он отключает мок, см.
[Изменение ответов](/ru/guide/modifiers)). Если вам действительно нужно тело
`null` в JSON, пишите `json(null)`.
:::

## Конверты ответа

Для полного контроля (статус, заголовки, текст или байты) возвращайте
**конверт** — объект с `kind: 'mock-response'`:

```ts
export default defineMockConfiguration({
  handlers: {
    'GET /message': { kind: 'mock-response', text: 'Hello' },

    'GET /download': {
      kind: 'mock-response',
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
      data: new Uint8Array([1, 2, 3]),
    },

    'GET /api/created': {
      kind: 'mock-response',
      status: 201,
      headers: { Location: '/api/items/42' },
      body: { id: 42 },
    },

    'DELETE /api/items/42': { kind: 'mock-response', status: 204 },
  },
});
```

### Поля конверта

| Поле      | Смысл                                    |
| --------- | ---------------------------------------- |
| `kind`    | Всегда `'mock-response'`                 |
| `status`  | HTTP-статус. По умолчанию `200`          |
| `headers` | Заголовки ответа                         |
| `body`    | JSON-значение                            |
| `text`    | Текстовое содержимое                     |
| `data`    | Байты (`Uint8Array`)                     |

### Правила содержимого

Если задано несколько полей содержимого, приоритет такой:

1. `data` (байты)
2. `text`
3. `body` (JSON)

Content-Type подбирается автоматически, если вы не задали его сами:

- `text` по умолчанию получает `text/plain; charset=utf-8`.
- `body` по умолчанию получает `application/json`.
- Конверт **без содержимого** отправляет пустой ответ (удобно для `204`).

### Примеры

Текстовый health check:

```ts
'GET /health': { kind: 'mock-response', text: 'ok' },
```

Для HTML или XML нужен явный Content-Type:

```ts
'GET /feed.xml': {
  kind: 'mock-response',
  headers: { 'Content-Type': 'application/xml' },
  text: '<feed><entry>Hello</entry></feed>',
},
```

Заголовок, связанный с кэшированием:

```ts
'GET /api/config': {
  kind: 'mock-response',
  headers: { 'Cache-Control': 'no-store' },
  body: { featureFlags: { newCheckout: true } },
},
```

Ошибка с телом, которое может показать ваш интерфейс:

```ts
'POST /api/pay': {
  kind: 'mock-response',
  status: 402,
  body: { code: 'card_declined', message: 'Your card was declined.' },
},
```

## Какую форму выбрать?

| Что вам нужно…                      | Что использовать                           |
| ----------------------------------- | ------------------------------------------ |
| JSON, статус 200                    | обычное значение                           |
| JSON, другой статус                 | `json(body, status)`                       |
| Заголовки, обычный текст или байты  | конверт                                    |
| Ответ, зависящий от входных данных  | функция, возвращающая любое из вышеперечисленного |

## Дальше

Обработчики описывают счастливый путь. Чтобы по требованию получать ошибки и
варианты ответов, напишите [оверрайды](/ru/guide/overrides).
