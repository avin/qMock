# Конфигурация

Все опции `apiMockPlugin` необязательны. Вот значения по умолчанию, записанные
явно:

```ts [vite.config.ts]
import { defineConfig } from 'vite';
import { apiMockPlugin } from '@avinlab/qmock';

export default defineConfig({
  plugins: [
    apiMockPlugin({
      handlers: '/src/mocks/handlers.ts',
      overrides: 'src/mocks/overrides',
      stateFile: '.mock-overrides.json',
    }),
  ],
});
```

| Опция       | По умолчанию             | Смысл                                                                                         |
| ----------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `handlers`  | `/src/mocks/handlers.ts` | Путь к модулю Vite или абсолютный путь к файлу с конфигурацией моков по умолчанию             |
| `overrides` | `src/mocks/overrides`    | Директория относительно корня Vite или абсолютная директория                                  |
| `stateFile` | `.mock-overrides.json`   | Файл относительно корня Vite, абсолютный файл или `false`, чтобы отключить сохранение         |

`mockApiPlugin` — алиас `apiMockPlugin`.

## Примеры

### Держать моки вне `src`

```ts
apiMockPlugin({
  handlers: '/mocks/handlers.ts',
  overrides: 'mocks/overrides',
});
```

### Не сохранять состояние дашборда

```ts
apiMockPlugin({ stateFile: false });
```

Тогда каждый запуск dev-сервера начинается с пустого списка **Active**.

### Разделить личное и общее состояние

```ts
apiMockPlugin({ stateFile: '.mocks/personal.json' });
```

Добавьте `.mocks/` в `.gitignore` или закоммитьте другой файл, если нужен общий
пресет.

### Мокать несколько эндпоинтов, остальные проксировать

Маршруты без совпадения идут в middleware Vite, так что обычный прокси работает
вместе с QMock:

```ts
export default defineConfig({
  plugins: [apiMockPlugin()],
  server: {
    proxy: { '/api': 'https://api.example.com' },
  },
});
```

Маршруты с обработчиком обслуживает QMock. Все остальные запросы `/api`
проксируются.

## Где ищут тесты

Тестовые адаптеры по умолчанию читают `src/mocks/handlers.ts` и
`src/mocks/overrides` и **не читают** `vite.config.ts`. О своих расположениях см.
[Опции сценария](/ru/testing/options) и [Cypress](/ru/testing/cypress#свои-пути).
