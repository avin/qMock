# Vitest

Импортируйте из `@avinlab/qmock/vitest`. Тестам Vitest не нужны ни браузер, ни
сервер: QMock перехватывает `fetch` и `XMLHttpRequest` на время выполнения колбэка.

## Ваш первый тест

```ts
import { expect, test } from 'vitest';
import { createMockScope } from '@avinlab/qmock/vitest';
import profile from './src/mocks/overrides/user/profile';

test('handles a service error', async () => {
  const scope = await createMockScope({
    overrides: [{ override: profile, params: { fail: true } }],
  });

  await scope.run(async () => {
    const response = await fetch('/api/user');
    expect(response.status).toBe(503);
    // Здесь отрисуйте компонент, чтобы проверить, как он обрабатывает ответ.
  });
});
```

Что происходит:

1. `createMockScope` загружает базовые обработчики и применяет перечисленные
   оверрайды.
2. Внутри `scope.run` вызовы `fetch` и `XMLHttpRequest` в приложении используют моки этого scope.
3. Когда колбэк завершается или бросает исключение, scope удаляется.

### Правила `scope.run`

- **Ожидайте (`await`) всю работу, которая должна использовать scope, внутри
  колбэка.** Всё, что произойдёт после его возврата, моков уже не увидит.
- **Параллельные и вложенные запуски остаются независимыми.** Два одновременно
  выполняющихся теста видят каждый свой сценарий.
- **Запросы без совпадения используют исходный транспорт** (`fetch` или `XMLHttpRequest`).

### XMLHttpRequest

XHR-запросы внутри `scope.run` используют те же обработчики и оверрайды, что и
`fetch`. Это распространяется и на клиенты, использующие XHR, например Axios
с XHR-адаптером. Нужна тестовая среда с `XMLHttpRequest`, например `jsdom`:
QMock не добавляет XHR в обычную среду Node.js.

```ts
await scope.run(async () => {
  const user = await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', '/api/user');
    request.responseType = 'json';
    request.onload = () => resolve(request.response);
    request.onerror = () => reject(new Error('Request failed'));
    request.send();
  });
  expect(user).toEqual({ id: 'demo', name: 'Demo User' });
});
```

## Только базовые обработчики

Опустите опции, чтобы тестировать против ваших обработчиков без оверрайдов:

```ts
const scope = await createMockScope();
await scope.run(async () => {
  const response = await fetch('/api/user');
  expect(await response.json()).toEqual({ id: 'demo', name: 'Demo User' });
});
```

## Тестирование компонента

Типичный тест компонента рендерит его внутри `run`, чтобы все его запросы были
замоканы:

```tsx
import { render, screen } from '@testing-library/react';
import { createMockScope } from '@avinlab/qmock/vitest';
import profile from './src/mocks/overrides/user/profile';
import { UserCard } from './UserCard';

test('shows an error banner when the service is down', async () => {
  const scope = await createMockScope({
    overrides: [{ override: profile, params: { fail: true } }],
  });

  await scope.run(async () => {
    render(<UserCard />);
    expect(await screen.findByText('Service unavailable')).toBeInTheDocument();
  });
});
```

## Несколько оверрайдов по порядку

Оверрайды применяются в порядке массива — ровно как список **Active** в
дашборде:

```ts
import adminRole from './src/mocks/overrides/user/role';
import slow from './src/mocks/overrides/network/slow';

const scope = await createMockScope({
  overrides: [
    { override: adminRole, params: { role: 'owner' } },
    { override: slow, params: { ms: '50' } },
  ],
});
```

Оверрайд можно передать без параметров (тогда он использует значения по
умолчанию) как есть: `overrides: [profile]`.

## Автоматический scope через фикстуру

Для автоматического создания и очистки расширьте `test` из Vitest с помощью
`withMocks()` в тестовом модуле проекта:

```ts [test-setup.ts]
import { test as base } from 'vitest';
import { withMocks, type VitestMockScope } from '@avinlab/qmock/vitest';

export const test = base.extend<{ mocks: VitestMockScope }>({
  mocks: withMocks(),
});
```

Затем используйте фикстуру `mocks`. Оборачивайте вызовы приложения в
`mocks.run`:

```ts
import { test } from './test-setup';

test('uses a custom response', async ({ mocks }) => {
  await mocks.set({ 'GET /api/user': { name: 'Test User' } });
  await mocks.run(async () => {
    const response = await fetch('/api/user');
    expect(await response.json()).toEqual({ name: 'Test User' });
  });
});
```

### Разовые ответы через `set`

`mocks.set(patches)` принимает те же патчи, что возвращает оверрайд, так что
можно задать разовый ответ прямо в тесте, не создавая файл оверрайда:

```ts
await mocks.set({
  'GET /api/orders': [],
  'POST /api/orders': json({ error: 'Out of stock' }, 409),
});
```

Повторный вызов `set` **заменяет** предыдущие временные патчи. `scope.clear()`
восстанавливает исходные патчи и сохраняет настроенные оверрайды. Vitest также
очищает временные патчи после каждого `run`.

## Дальше

См. [Playwright](/ru/testing/playwright) для тестов на уровне браузера или
[Опции сценария](/ru/testing/options) для своих путей и алиасов.
