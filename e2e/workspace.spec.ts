import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Where the PNG from this test is copied, when set (used for manual inspection). */
const PNG_COPY_PATH = process.env.E2E_PNG_COPY;

const group = (page: Page, legend: string): Locator =>
  page.getByRole('group', { name: legend, exact: true });

async function fillDims(page: Page, legend: string, labels: string[], values: string[]) {
  const box = group(page, legend);
  for (let i = 0; i < labels.length; i++) {
    await box.getByLabel(labels[i], { exact: true }).fill(values[i]);
  }
}

async function chooseExport(page: Page, item: 'JSON' | 'CSV' | 'PNG') {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  return download;
}

test('case I: enter inputs, read results, export, reload', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.goto('/');

  await fillDims(page, 'Product box', ['Length', 'Width', 'Height'], ['10', '10', '10']);
  await fillDims(
    page,
    'Maximum carton',
    ['Max length', 'Max width', 'Max height'],
    ['20', '20', '10'],
  );
  await fillDims(page, 'Pallet limitation', ['Length', 'Width', 'Height'], ['40', '40', '25']);
  await page.getByLabel('Box leeway', { exact: true }).fill('0');
  await page.getByLabel('Carton wall thickness', { exact: true }).fill('0');

  const summary = page.getByRole('region', { name: 'Production summary' });
  const tile = (name: string) =>
    summary.locator('div', { has: page.getByText(name, { exact: true }) });
  await expect(tile('Total boxes per pallet').locator('dd')).toHaveText('32');
  await expect(tile('Cartons per pallet').locator('dd')).toHaveText('8');
  await expect(tile('Boxes per carton').locator('dd')).toHaveText('4');

  const rows = page.getByRole('table', { name: 'Layout comparison' }).locator('tbody tr');
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'false');

  await expect(page.getByTestId('scene-slot').locator('canvas')).toBeVisible();

  // PNG: three panels at 2400 x 1500.
  const png = await chooseExport(page, 'PNG');
  const pngPath = await png.path();
  const bytes = await readFile(pngPath);
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(16)).toBe(2400);
  expect(view.getUint32(20)).toBe(1500);
  if (PNG_COPY_PATH) await png.saveAs(PNG_COPY_PATH);

  // JSON
  const json = await chooseExport(page, 'JSON');
  const parsed = JSON.parse(await readFile(await json.path(), 'utf8'));
  expect(parsed.inputs.product.length).toBe(10);

  // CSV
  const csv = await chooseExport(page, 'CSV');
  expect((await readFile(await csv.path(), 'utf8')).startsWith('Metric,Value')).toBe(true);

  // Saved inputs survive a reload.
  await page.reload();
  await expect(group(page, 'Product box').getByLabel('Length', { exact: true })).toHaveValue('10');

  // Validation message.
  await group(page, 'Pallet limitation').getByLabel('Length', { exact: true }).fill('abc');
  await expect(group(page, 'Pallet limitation').getByText('Enter a number')).toBeVisible();

  expect(problems).toEqual([]);
});
