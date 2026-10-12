# Обработчики и маршруты

Обработчики — это основа вашего мок-API: как оно ведёт себя, когда ни один
сценарий не активен. Они лежат в одном файле с экспортом по умолчанию из
`defineMockConfiguration`.

```ts [src/mocks/handlers.ts]
import { defineMockConfiguration } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'GET /api/user': { id: 'demo', name: 'Demo User' },
  },
});
```

Изменения в этом файле подхватываются автоматически, перезапускать Vite не нужно.

## Ключи маршрутов

Ключ — это HTTP-метод и путь, разделённые одним пробелом:

```text
METHOD /pathname
```

Поддерживаемые методы: `DELETE`, `GET`, `HEAD`, `OPTIONS`, `PATCH`, `POST`, `PUT`.

```ts
handlers: {
  'GET /api/products': [{ id: 1 }, { id: 2 }],
  'POST /api/products': json({ id: 3 }, 201),
  'DELETE /api/products/1': { kind: 'mock-response', status: 204 },
}
```

### Строка запроса не входит в ключ

`GET /api/search?q=shoes` соответствует ключу `GET /api/search`. Строка запроса
доступна обработчику через `request.url`:

```ts
'GET /api/search': request => {
  const q = request.url.searchParams.get('q') ?? '';
  const page = Number(request.url.searchParams.get('page') ?? 1);
  return { query: q, page, results: q ? [`${q} #1`, `${q} #2`] : [] };
},
```

## Wildcard-маршруты

Ключ, оканчивающийся на `/*`, соответствует всему, что находится ниже этого пути:

```ts
handlers: {
  'GET /api/users/*': request => ({ path: request.url.pathname }),
}
```

Он отвечает на `/api/users/1`, `/api/users/1/posts` и так далее.

### Какой обработчик выигрывает?

1. **Точные** обработчики побеждают wildcard-обработчики.
2. Если подходит несколько wildcard-ов, побеждает **объявленный первым**.

```ts
handlers: {
  'GET /api/users/me': { id: 'me' },             // точный: выигрывает для /api/users/me
  'GET /api/users/admin/*': { scope: 'admin' },  // первый подходящий wildcard
  'GET /api/users/*': { scope: 'any' },          // запасной вариант
}
```

Ставьте более конкретные wildcard-ы первыми.

::: warning Оверрайды и wildcard-ы
Оверрайд, нацеленный на маршрут, который обслуживает wildcard-обработчик, должен
использовать **тот же wildcard-ключ**. Чтобы изменить `'GET /api/users/*'`, ключ
оверрайда должен быть `'GET /api/users/*'`, а не `'GET /api/users/1'`.
:::

## Обработчики-функции

Обработчик может быть JSON-значением или функцией (синхронной или асинхронной),
получающей `MockRequest`:

| Поле    | Смысл                                      |
| ------- | ------------------------------------------ |
| `route` | Сопоставленный ключ маршрута               |
| `url`   | Объект `URL` с `searchParams` и т. д.      |
| `raw`   | Сырой Node.js-запрос                       |

```ts
'GET /api/whoami': request => ({
  route: request.route,
  agent: request.raw.headers['user-agent'],
}),
```

### Чтение тела запроса

Тело читают два хелпера:

- `readRequestBody(request)` возвращает сырой текст.
- `readFormData(request)` возвращает `URLSearchParams` для URL-кодированных тел
  форм.

```ts
import { defineMockConfiguration, readRequestBody, readFormData } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'POST /api/echo': async request => {
      const text = await readRequestBody(request);
      return { received: JSON.parse(text) };
    },
    'POST /api/login': async request => {
      const form = await readFormData(request);
      return form.get('user') === 'admin'
        ? { token: 'secret' }
        : { kind: 'mock-response', status: 401, body: { error: 'Bad credentials' } };
    },
  },
});
```

::: warning Тело читается один раз
Тело запроса можно прочитать только один раз. Вызывайте `readRequestBody` или
`readFormData` один раз на запрос и переиспользуйте результат.
:::

### Асинхронные обработчики и задержки

Поскольку обработчики могут быть асинхронными, имитация задержки — это просто
промис:

```ts
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

'GET /api/slow': async () => {
  await sleep(1500);
  return { ok: true };
},
```

## Дальше

Пока вы использовали обычные объекты, `json(...)` и `kind: 'mock-response'`.
Раздел [Ответы](/ru/guide/responses) объясняет, как именно каждый из них
превращается в HTTP-ответ.
