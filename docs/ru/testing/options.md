# Опции сценария

Vitest (`createMockScope`) и Playwright (`applyMocks`) принимают одни и те же
опции сценария. Cypress поддерживает опции, связанные с путями, через
`registerMocks`.

## Запуск из другой директории

Передайте `root`, когда тесты запускаются не из того проекта, где лежит
`src/mocks`:

```ts
const scope = await createMockScope({ root: '../app' });
```

## Свой файл обработчиков

Укажите имя файла или импортируйте конфигурацию напрямую:

```ts
import configuration from './src/mocks/handlers';
import profile from './src/mocks/overrides/user/profile';

const scope = await createMockScope({
  name: 'checkout-error',
  configuration,
  overrides: [profile],
});
```

`name` — необязательная **метка** (удобна при отладке). Scope-ы остаются
независимыми, даже если у них одинаковое имя.

Импортированные оверрайды могут содержать функции, текстовые ответы и бинарные
данные — как и в разработке.

## Встроенные ответы: `patches`

Используйте `patches`, чтобы задать ответы маршрутов прямо при создании scope, без
файла оверрайда:

```ts
const scope = await createMockScope({
  patches: {
    'GET /api/user': { name: 'Inline' },
    'GET /api/orders': [],
  },
});
```

После создания меняйте их через `scope.set(patches)`, который **заменяет**
временные патчи. `scope.clear()` восстанавливает исходные патчи (заданные при
создании) и сохраняет настроенные оверрайды.

## Алиасы и TypeScript

Загрузка по умолчанию поддерживает TypeScript и пути из `tsconfig.json` проекта.

Для алиасов, определённых **только в Vite**, передайте их явно:

```ts
const scope = await createMockScope({ alias: { '@': './src' } });
```

Или импортируйте конфигурацию через ваш тест-раннер (чтобы применялось его
собственное разрешение модулей) и передайте её напрямую:

```ts
import configuration from './src/mocks/handlers';
const scope = await createMockScope({ configuration });
```

## Сводка

| Опция           | Назначение                                                    |
| --------------- | ------------------------------------------------------------- |
| `root`          | Директория проекта, если тесты запускаются из другого места   |
| `configuration` | Имя файла или импортированный объект конфигурации             |
| `overrides`     | Применяемые оверрайды по порядку. Каждый — оверрайд или `{ override, params }` (Vitest, Playwright) / ID или `{ id, params }` (Cypress) |
| `patches`       | Ответы маршрутов, заданные напрямую                           |
| `name`          | Метка scope                                                   |
| `alias`         | Дополнительные алиасы модулей, например `{ '@': './src' }`    |
