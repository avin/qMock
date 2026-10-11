import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerMocks } from '../src/cypressNode.js';
import { createMockScope } from '../src/testing.js';
import type { MockConfiguration, MockOverride } from '../src/utils.js';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith(path.join(os.tmpdir(), 'qmock-cypress-node-'))) throw new Error('Unexpected cleanup path');
    await rm(root, { recursive: true, force: true });
  }
});

async function project(files: Record<string, string>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'qmock-cypress-node-'));
  roots.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    const filename = path.join(root, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, contents);
  }
  return root;
}

function captureTask(root: string, options?: Parameters<typeof registerMocks>[2]) {
  let task!: () => Promise<{ code: string }>;
  const on = ((event: string, handlers: Record<string, typeof task>) => {
    expect(event).toBe('task');
    task = handlers['qmock:load']!;
  }) as Cypress.PluginEvents;
  registerMocks(on, { projectRoot: root }, options);
  return () => task();
}

function evaluate(code: string) {
  return new Function(`${code}; return qmockDefinitions;`)() as {
    configuration: MockConfiguration;
    overrides: Record<string, MockOverride>;
  };
}

describe('Cypress project loading', () => {
  it('loads default TypeScript handlers, aliases and the override catalog without a server', async () => {
    const root = await project({
      'tsconfig.json': '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["src/*"]}}}',
      'src/data.ts': 'export const initial: string = "base";',
      'src/mocks/handlers.ts': `import { defineMockConfiguration, readRequestBody } from '@avinlab/qmock';
        import { initial } from '@/data';
        export default defineMockConfiguration({ handlers: {
          'GET /api/user': { name: initial },
          'POST /api/echo': async request => ({ body: await readRequestBody(request) }),
        } });`,
      'src/mocks/overrides/user/profile.ts': `import { defineMockOverride } from '@avinlab/qmock';
        export default defineMockOverride({ name: 'Profile', params: { name: { type: 'string', default: 'default' } },
          override: ({ name }) => ({ 'GET /api/user': body => ({ ...body, name }) }) });`,
      'src/mocks/overrides/named.ts': `export const scenario = { name: 'Named', override: () => ({ 'GET /new': { named: true } }) };`,
      'src/mocks/overrides/invalid.ts': 'export default { invalid: true };',
      'src/mocks/overrides/_hidden.ts': 'syntax error must be ignored',
      'src/mocks/overrides/_helpers/internal.ts': 'syntax error must be ignored',
      'src/mocks/overrides/profile.test.ts': 'syntax error must be ignored',
      'src/mocks/overrides/types.d.ts': 'syntax error must be ignored',
    });
    const load = captureTask(root);
    const definitions = evaluate((await load()).code);
    expect(Object.keys(definitions.overrides).sort()).toEqual(['named', 'user/profile']);
    const scope = await createMockScope({ configuration: definitions.configuration,
      overrides: [{ override: definitions.overrides['user/profile']!, params: { name: 'custom' } }] });
    expect(await (await scope.fetch('/api/user')).json()).toEqual({ name: 'custom' });
    expect(await (await scope.fetch('/api/echo', { method: 'POST', body: 'request body' })).json()).toEqual({ body: 'request body' });
    await writeFile(path.join(root, 'src/data.ts'), 'export const initial = "updated";');
    expect(evaluate((await load()).code).configuration.handlers['GET /api/user']).toEqual({ name: 'updated' });
  });

  it('supports custom paths and Vite-only aliases and an absent override directory', async () => {
    const root = await project({
      'fixtures/value.ts': 'export default 42;',
      'fixtures/handlers.ts': 'import value from "~fixtures/value"; export default { handlers: { "GET /": value } };',
    });
    const definitions = evaluate((await captureTask(root, {
      configuration: 'fixtures/handlers.ts', overrides: 'missing-overrides', alias: { '~fixtures': './fixtures' },
    })()).code);
    expect(definitions.configuration.handlers['GET /']).toBe(42);
    expect(definitions.overrides).toEqual({});
  });

  it('reports a missing default configuration with its expected path', async () => {
    const root = await project({});
    await expect(captureTask(root)()).rejects.toThrow(path.join(root, 'src/mocks/handlers.ts'));
  });
});
