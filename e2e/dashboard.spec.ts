import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

async function drag(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Drag source and destination must be visible');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();
}

test.beforeEach(async ({ request, page }) => {
  await request.put('/__apiMocks/overrides', { data: { active: [] } });
  await page.goto('/__apiMock');
  await expect(page.getByRole('heading', { name: 'Mock overrides' })).toBeVisible();
});

test('activate, configure, disable, and remove a scenario through the dashboard', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByText('responses', { exact: true }).click();
  await drag(page, page.getByRole('button', { name: 'Drag Customize response' }), page.getByText('Drag an override here'));
  await expect(page.getByRole('checkbox', { name: 'Enable Customize response' })).toBeChecked();
  await expect.poll(async () => (await (await request.get('/api/demo')).json()).message).toBe('custom');
  await page.getByRole('button', { name: 'Settings for Customize response' }).click();
  await page.getByRole('textbox', { name: 'message', exact: true }).fill('Configured in the browser');
  await page.getByRole('combobox', { name: 'mode' }).selectOption('limited');
  await page.getByRole('checkbox', { name: 'enabled', exact: true }).uncheck();
  await expect.poll(async () => (await (await request.get('/api/demo')).json())).toEqual({
    message: 'Configured in the browser', enabled: false, mode: 'limited', sequence: '',
  });
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Enable Customize response' })).toBeChecked();
  await page.getByRole('checkbox', { name: 'Enable Customize response' }).uncheck();
  await expect.poll(async () => (await (await request.get('/api/demo')).json()).message).toBe('base');
  await page.getByRole('checkbox', { name: 'Enable Customize response' }).check();
  await expect.poll(async () => (await (await request.get('/api/demo')).json()).message).toBe('Configured in the browser');
  await drag(page, page.getByRole('button', { name: 'Move Customize response' }), page.getByRole('region', { name: 'Override catalog' }));
  await expect(page.getByText('Drag an override here')).toBeVisible();
  await expect.poll(async () => (await (await request.get('/api/demo')).json()).message).toBe('base');
  expect(errors).toEqual([]);
});

test('search and drag ordering determine the actual API response', async ({ page, request }) => {
  await page.getByRole('searchbox', { name: 'Search' }).fill('sequence');
  await expect(page.getByRole('button', { name: 'Drag Customize response' })).toHaveCount(0);
  await drag(page, page.getByRole('button', { name: 'Drag Append A' }), page.getByText('Drag an override here'));
  await expect(page.getByRole('button', { name: 'Move Append A' })).toBeVisible();
  const active = page.getByRole('region', { name: 'Active overrides' });
  await drag(page, page.getByRole('button', { name: 'Drag Append B' }), active);
  await expect(page.getByRole('button', { name: 'Move Append B' })).toBeVisible();
  await expect.poll(async () => (await (await request.get('/api/demo')).json()).sequence).toBe('AB');
  await drag(page, page.getByRole('button', { name: 'Move Append B' }), page.getByRole('button', { name: 'Move Append A' }));
  await expect.poll(async () => (await (await request.get('/api/demo')).json()).sequence).toBe('BA');
});

for (const layout of [
  { name: 'small screens', width: 390, height: 844, activate: 'ArrowDown', remove: 'ArrowUp' },
  { name: 'desktop', width: 1280, height: 800, activate: 'ArrowRight', remove: 'ArrowLeft' },
]) test(`keyboard activation and removal work on ${layout.name}`, async ({ page, request }) => {
  await page.setViewportSize({ width: layout.width, height: layout.height });
  // Let the viewport resize event settle before dnd-kit's keyboard sensor subscribes to it.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await expect.poll(() => page.getByRole('main').boundingBox()).toEqual({
    x: 0, y: 0, width: layout.width, height: layout.height,
  });
  expect(await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }))).toEqual({ width: layout.width, height: layout.height });
  await page.getByRole('searchbox', { name: 'Search' }).fill('Customize');
  const source = page.getByRole('button', { name: 'Drag Customize response' });
  await source.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('[aria-live="assertive"]')).toContainText(/catalog:responses\/customize.*(moved over|$)/i);
  // dnd-kit attaches its keyboard listener in a zero-delay task after activation.
  await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
  await page.keyboard.press(layout.activate);
  await expect(page.getByRole('status').filter({ hasText: 'mock-override-active-list' })).toContainText('mock-override-active-list');
  await page.keyboard.press('Space');
  await expect(page.getByRole('checkbox', { name: 'Enable Customize response' })).toBeVisible();
  await expect.poll(async () => (await (await request.get('/api/demo')).json()).message).toBe('custom');
  await page.getByRole('button', { name: 'Move Customize response' }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('[aria-live="assertive"]')).toContainText(/active:responses\/customize.*(moved over|$)/i);
  await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
  await page.keyboard.press(layout.remove);
  await expect(page.getByRole('status').filter({ hasText: 'mock-override-catalog' })).toContainText('mock-override-catalog');
  await page.keyboard.press('Space');
  await expect(page.getByText('Drag an override here')).toBeVisible();
  await expect.poll(async () => (await (await request.get('/api/demo')).json()).message).toBe('base');
});
