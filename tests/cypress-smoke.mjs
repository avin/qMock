import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise the packed adapter in a real Cypress browser against a plain HTTP app.
const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
assert(npmCli, 'Run this test with npm run test:cypress');
const temporary = mkdtempSync(path.join(tmpdir(), 'qmock-cypress-'));
const consumer = path.join(temporary, 'consumer');
const cypressCli = path.join(root, 'node_modules/cypress/bin/cypress');
const environment = { ...process.env, FORCE_COLOR: '0' };
// Electron must launch as a browser, even when the parent environment uses Electron.
delete environment.ELECTRON_RUN_AS_NODE;
const npm = args => execFileSync(process.execPath, [npmCli, ...args], {
  cwd: root, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
const runCypress = args => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [cypressCli, ...args], {
    cwd: consumer, env: environment, stdio: 'inherit', windowsHide: true,
  });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Cypress exited with code ${code}`)));
});
let server;
try {
  const [packed] = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary]));
  assert(packed.files.some(file => file.path === 'dist/cypress.js'));
  assert(packed.files.some(file => file.path === 'dist/cypressNode.js'));
  mkdirSync(consumer);
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync(process.execPath, [npmCli, 'install', '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', path.join(temporary, packed.filename)], {
    cwd: consumer, env: environment, stdio: 'inherit',
  });
  mkdirSync(path.join(consumer, 'src/mocks/overrides/user'), { recursive: true });
  writeFileSync(path.join(consumer, 'src/mocks/handlers.ts'), `
import { defineMockConfiguration, readRequestBody, readFormData } from '@avinlab/qmock';
export default defineMockConfiguration({ handlers: {
  'GET /api/user': { name: 'base', order: [] },
  'POST /api/order': async request => ({ body: await readRequestBody(request), token: request.raw.headers['x-token'], query: request.url.searchParams.get('mode') }),
  'POST /api/form': async request => ({ value: (await readFormData(request)).get('value') }),
  'GET /api/text': { kind: 'mock-response', status: 201, text: 'hello', headers: { 'x-example': 'test' } },
  'GET /api/binary': { kind: 'mock-response', data: new Uint8Array([0, 127, 255]), headers: { 'content-type': 'application/octet-stream' } },
  'GET /api/cookies': { kind: 'mock-response', body: { ok: true }, headers: { 'Set-Cookie': ['first=one; Path=/', 'second=two; Path=/'] } },
  'GET /api/credentials': request => ({ cookies: request.raw.headers.cookie, authorization: request.raw.headers.authorization }),
} });
`);
  writeFileSync(path.join(consumer, 'src/mocks/overrides/user/failure.ts'), `
import { defineMockOverride, json } from '@avinlab/qmock';
export default defineMockOverride({ name: 'Failure', params: { message: { type: 'string', default: 'Unavailable' } },
  override: params => ({ 'GET /api/user': json({ error: params.message, order: ['failure'] }, 503) }) });
`);
  writeFileSync(path.join(consumer, 'src/mocks/overrides/user/append.ts'), `
import { defineMockOverride } from '@avinlab/qmock';
export default defineMockOverride({ name: 'Append', override: () => ({ 'GET /api/user': body => ({ ...body, order: [...body.order, 'append'] }) }) });
`);
  server = createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<!doctype html><title>Cypress consumer</title><h1>Static app</h1>');
    } else {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ fallback: true }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  writeFileSync(path.join(consumer, 'cypress.config.js'), `
import { registerMocks } from '@avinlab/qmock/cypress/node';
export default { video: false, screenshotOnRunFailure: false, e2e: {
  baseUrl: ${JSON.stringify(baseUrl)}, supportFile: false,
  setupNodeEvents(on, config) { registerMocks(on, config); return config; },
} };
`);
  mkdirSync(path.join(consumer, 'cypress/e2e'), { recursive: true });
  writeFileSync(path.join(consumer, 'cypress/e2e/mocks.cy.js'), `
import { applyMocks, setupMocks } from '@avinlab/qmock/cypress';
import { defineMockConfiguration } from '@avinlab/qmock';

const browserFetch = (url, init) => cy.window().then(win => win.fetch(url, init));
const json = (url, init) => browserFetch(url, init).then(response => response.json());

describe('packed default handlers', () => {
  let scope;
  beforeEach(() => { applyMocks().then(value => { scope = value; }); cy.visit('/'); });
  afterEach(() => { cy.then(() => scope.dispose()); });

  it('handles request bodies, query, headers and all response formats', () => {
    json('/api/user').should('deep.equal', { name: 'base', order: [] });
    json('/api/order?mode=fast', { method: 'POST', body: 'payload', headers: { 'x-token': 'sample' } })
      .should('deep.equal', { body: 'payload', token: 'sample', query: 'fast' });
    json('/api/form', { method: 'POST', body: 'value=hello+world', headers: { 'content-type': 'application/x-www-form-urlencoded' } })
      .should('deep.equal', { value: 'hello world' });
    browserFetch('/api/text').then(async response => {
      expect(response.status).to.equal(201);
      expect(response.headers.get('x-example')).to.equal('test');
      expect(await response.text()).to.equal('hello');
    });
    browserFetch('/api/binary').then(async response => {
      expect(Array.from(new Uint8Array(await response.arrayBuffer()))).to.deep.equal([0, 127, 255]);
    });
    json('/api/cookies').should('deep.equal', { ok: true });
    cy.getCookies().then(cookies => {
      expect(cookies.map(cookie => [cookie.name, cookie.value]).sort()).to.deep.equal([['first', 'one'], ['second', 'two']]);
    });
    json('/api/credentials', { credentials: 'include', headers: { authorization: 'Bearer token' } })
      .then(body => {
        expect(body.authorization).to.equal('Bearer token');
        expect(body.cookies).to.include('first=one');
        expect(body.cookies).to.include('second=two');
      });
    json('/unmatched').should('deep.equal', { fallback: true });
    cy.then(() => scope.set({ 'GET /api/user': null }));
    json('/api/user').should('deep.equal', { fallback: true });
    cy.then(() => scope.clear());
    json('/api/user').should('deep.equal', { name: 'base', order: [] });
    cy.then(() => scope.set({ 'GET /api/user': { changed: true } }));
    json('/api/user').should('deep.equal', { changed: true });
    cy.then(() => { scope.dispose(); scope.dispose(); });
    json('/api/user').should('deep.equal', { fallback: true });
  });

  it('does not retain the preceding test patches', () => {
    json('/api/user').should('deep.equal', { name: 'base', order: [] });
  });
});

describe('named overrides', () => {
  it('loads TypeScript scenarios with parameters in declared order', () => {
    applyMocks({ overrides: [{ id: 'user/failure', params: { message: 'Custom error' } }, 'user/append'] });
    cy.visit('/');
    browserFetch('/api/user').then(async response => {
      expect(response.status).to.equal(503);
      expect(await response.json()).to.deep.equal({ error: 'Custom error', order: ['failure', 'append'] });
    });
  });
});

describe('automatic lifecycle with imported configuration', () => {
  setupMocks({ configuration: defineMockConfiguration({ handlers: { 'GET /api/user': { imported: true } } }) });
  it('accepts an imported configuration without a mock server', () => {
    cy.visit('/');
    json('/api/user').should('deep.equal', { imported: true });
  });
  it('installs a fresh scope for the next test', () => {
    cy.visit('/');
    json('/api/user').should('deep.equal', { imported: true });
  });
});
`);
  await runCypress(['install']);
  await runCypress(['run', '--project', consumer, '--browser', 'electron']);
  console.log('Packed Cypress adapter passed in a real browser without a mock dev server.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  const cleanupPath = path.resolve(temporary);
  assert.equal(path.dirname(cleanupPath).toLowerCase(), path.resolve(tmpdir()).toLowerCase(), 'Cleanup must stay in the temporary directory');
  assert(path.basename(cleanupPath).startsWith('qmock-cypress-'), 'Cleanup must target the created Cypress consumer');
  rmSync(cleanupPath, { recursive: true, force: true });
}
