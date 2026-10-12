# Configuration

All options of `apiMockPlugin` are optional. These are the defaults, written out:

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

| Option      | Default                  | Meaning                                                                          |
| ----------- | ------------------------ | -------------------------------------------------------------------------------- |
| `handlers`  | `/src/mocks/handlers.ts` | Vite module path or absolute file path with a default mock configuration         |
| `overrides` | `src/mocks/overrides`    | Directory relative to the Vite root, or absolute directory                       |
| `stateFile` | `.mock-overrides.json`   | File relative to the Vite root, absolute file, or `false` to disable persistence |

`mockApiPlugin` is an alias of `apiMockPlugin`.

## Examples

### Keep mocks outside `src`

```ts
apiMockPlugin({
  handlers: '/mocks/handlers.ts',
  overrides: 'mocks/overrides',
});
```

### Do not persist the dashboard

```ts
apiMockPlugin({ stateFile: false });
```

Every dev-server start then begins with an empty **Active** list.

### Keep personal and shared state apart

```ts
apiMockPlugin({ stateFile: '.mocks/personal.json' });
```

Add `.mocks/` to `.gitignore`, or commit a different file when you want a shared
preset.

### Mock a few endpoints, proxy the rest

Unmatched routes continue to Vite's middleware, so a normal proxy works alongside
QMock:

```ts
export default defineConfig({
  plugins: [apiMockPlugin()],
  server: {
    proxy: { '/api': 'https://api.example.com' },
  },
});
```

Routes with a handler are answered by QMock. All other `/api` requests are
proxied.

## Where tests look

The test adapters read `src/mocks/handlers.ts` and `src/mocks/overrides` by
default and **do not read** `vite.config.ts`. See
[Scenario options](/testing/options) and [Cypress](/testing/cypress#custom-paths)
for custom locations.
