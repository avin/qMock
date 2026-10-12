# Быстрый старт

К концу этой страницы у вас будет работающий мок-эндпоинт и открытый в браузере
дашборд.

## Требования

- Node.js **22.12** или новее
- Проект на Vite (QMock — плагин для Vite, и он ESM)

## 1. Установка

```sh
npm install --save-dev @avinlab/qmock
```

## 2. Подключите плагин

Добавьте `apiMockPlugin()` в `vite.config.ts` рядом с остальными плагинами:

```ts [vite.config.ts]
import { defineConfig } from 'vite';
import { apiMockPlugin } from '@avinlab/qmock';

export default defineConfig({
  plugins: [apiMockPlugin()],
});
```

Без опций QMock ищет обработчики в `src/mocks/handlers.ts`, а оверрайды — в
`src/mocks/overrides`. Как это изменить, см. в разделе
[Конфигурация](/ru/reference/configuration).

::: tip
`mockApiPlugin` — алиас `apiMockPlugin`. Используйте тот, что вам больше нравится.
:::

## 3. Напишите первые обработчики

Создайте `src/mocks/handlers.ts`:

```ts [src/mocks/handlers.ts]
import { defineMockConfiguration, json } from '@avinlab/qmock';

export default defineMockConfiguration({
  handlers: {
    'GET /api/user': { id: 'demo', name: 'Demo User' },
    'POST /api/orders': json({ id: 'order-1' }, 201),
    'GET /api/search': request => ({
      query: request.url.searchParams.get('q'),
      results: [],
    }),
  },
});
```

Каждый ключ — это `METHOD /pathname`. Каждое значение говорит, чем отвечать.
Эти три обработчика показывают три типичные формы:

| Обработчик         | Значение                    | Смысл                                           |
| ------------------ | --------------------------- | ----------------------------------------------- |
| `GET /api/user`    | обычный объект              | Ответить этим JSON со статусом 200              |
| `POST /api/orders` | `json(body, status)`        | Ответить этим JSON и этим статусом              |
| `GET /api/search`  | функция от запроса          | Вычислить ответ, здесь — по строке запроса      |

## 4. Запустите Vite и вызовите API

```sh
npx vite
```

Из кода приложения обращайтесь к тому же origin, который отдаёт Vite:

```ts
const user = await fetch('/api/user').then(r => r.json());
// { id: 'demo', name: 'Demo User' }

const search = await fetch('/api/search?q=shoes').then(r => r.json());
// { query: 'shoes', results: [] }
```

Или проверьте из терминала, пока Vite запущен (порт по умолчанию — 5173):

```sh
curl http://localhost:5173/api/user
```

::: warning Абсолютные URL бэкенда
Моки отвечают на запросы, которые доходят до **origin Vite**. Если ваше
приложение обращается по абсолютному адресу вроде `https://api.example.com/user`,
направьте базовый URL API для разработки на Vite (например, через переменную
окружения), чтобы запросы попадали в QMock.
:::

Запросы, которым не соответствует ни один обработчик, — не ошибка: они идут
дальше в обычные middleware и прокси Vite. Это значит, что можно замокать
несколько эндпоинтов, а остальные пустить на реальный бэкенд через
`server.proxy` Vite.

## 5. Откройте дашборд

Перейдите на `http://localhost:5173/__apiMock`. Пока он пуст, потому что вы ещё
не написали ни одного оверрайда. Это следующий шаг.

## Только для разработки

Моки и дашборд существуют только пока запущен dev-сервер Vite. Они не входят в
продакшн-сборку и не отдаются командой `vite preview`.

## Дальше

Прежде чем добавлять сценарии, разберитесь, как сопоставляются маршруты, в
разделе [Обработчики и маршруты](/ru/guide/handlers).
