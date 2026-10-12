# Шпаргалка по API

Краткая сводка всего, что экспортируется. Подробности — на страницах по ссылкам.

## `@avinlab/qmock`

| Экспорт                          | Назначение                                                      |
| -------------------------------- | --------------------------------------------------------------- |
| `apiMockPlugin(options?)`        | Плагин Vite. Алиас: `mockApiPlugin`                             |
| `defineMockConfiguration({ handlers })` | Объявить базовые обработчики                             |
| `defineMockOverride({ name, description?, params?, override })` | Объявить сценарий        |
| `json(body, status?)`            | JSON-ответ со статусом                                          |
| `readRequestBody(request)`       | Прочитать сырое тело запроса как текст (один раз)               |
| `readFormData(request)`          | Прочитать URL-кодированное тело как `URLSearchParams` (один раз) |

## Ключи маршрутов

```text
METHOD /pathname        DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT
METHOD /prefix/*        wildcard; точные ключи побеждают, иначе первый объявленный
```

## `MockRequest`

| Поле    | Смысл                    |
| ------- | ------------------------ |
| `route` | Сопоставленный ключ      |
| `url`   | `URL` со строкой запроса |
| `raw`   | Сырой Node.js-запрос     |

## Формы ответа

```ts
{ any: 'json' }                                   // 200 JSON
json({ any: 'json' }, 201)                        // JSON со статусом
{ kind: 'mock-response', status, headers, body }  // конверт: JSON-тело
{ kind: 'mock-response', text: 'hi' }             // конверт: текст
{ kind: 'mock-response', data: new Uint8Array() } // конверт: байты
```

Приоритет содержимого: `data` → `text` → `body`. Статус по умолчанию — 200.

## Патчи маршрутов в оверрайдах

| Патч                        | Эффект                                       |
| --------------------------- | -------------------------------------------- |
| значение / конверт          | Заменить или добавить                        |
| `null`                      | Отключить мок; пропустить дальше             |
| `(body, { request, response }) => …` | Изменить текущий ответ              |
| …возвращает `undefined`     | Оставить ответ                               |
| …возвращает JSON-значение   | Заменить тело, сохранить метаданные          |
| …возвращает конверт         | Заменить ответ целиком                       |

## Параметры

```ts
params: {
  flag:  { type: 'boolean', default: false },
  text:  { type: 'string',  default: '' },
  pick:  { type: 'string',  default: 'a', options: ['a', 'b'] },
}
```

## Тестовые адаптеры

| Импорт                          | Основные экспорты                             |
| ------------------------------- | --------------------------------------------- |
| `@avinlab/qmock/vitest`         | `createMockScope`, `withMocks`, `VitestMockScope` |
| `@avinlab/qmock/playwright`     | `applyMocks`, `createMockTest`                |
| `@avinlab/qmock/cypress`        | `applyMocks`, `setupMocks`                    |
| `@avinlab/qmock/cypress/node`   | `registerMocks`                               |

Методы scope: `run(fn)` (Vitest), `set(patches)`, `clear()`, `dispose()`
(Playwright).

## CLI

```sh
npx qmock install-skills [--target <dir>]
```

См. [Навык для агента](/ru/reference/skill).
