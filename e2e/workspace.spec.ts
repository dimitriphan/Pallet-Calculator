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

async function chooseExport(page: Page, item: 'Build sheet (PDF)' | 'JSON' | 'CSV' | 'PNG') {
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
  const viewSwitch = page.getByRole('radiogroup', { name: 'View' });
  const html = page.locator('html');

  const summary = page.getByRole('region', { name: 'Production summary' });
  const tile = (name: string) =>
    summary.locator('div', { has: page.getByText(name, { exact: true }) });
  const rows = page.getByRole('table', { name: 'Layout comparison' }).locator('tbody tr');

  // A fresh visit opens in Basic: the answer card, no comparison table.
  await expect(viewSwitch.getByRole('radio', { name: 'Basic' })).toBeChecked();
  await expect(page.getByRole('heading', { name: 'What to build' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Layout comparison' })).toHaveCount(0);
  await expect(tile('Total boxes per pallet').locator('dd')).toHaveText('260');

  // Desired boxes per carton: 6 is honoured, 7 cannot be built, blank restores the best fit.
  const perCarton = page.getByLabel('Desired boxes per carton', { exact: true });
  await perCarton.fill('6');
  await expect(tile('Boxes per carton').locator('dd')).toHaveText('6');
  await perCarton.fill('7');
  await expect(page.getByText(/No carton holding exactly 7 boxes/)).toBeVisible();
  await expect(page.getByText('Counts that do fit: 6 and 8.')).toBeVisible();
  await perCarton.fill('');
  await expect(tile('Total boxes per pallet').locator('dd')).toHaveText('260');
  await expect(page.getByText(/No carton holding exactly/)).toHaveCount(0);

  // Build sheet (PDF): job name, save, then check the downloaded file.
  const pdfDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Build sheet (PDF)', exact: true }).click();
  await page.getByLabel('Job name (optional)').fill('E2E run');
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  const pdfBytes = await readFile(await (await pdfDownload).path());
  await expect(page.getByRole('dialog', { name: 'Build sheet (PDF)' })).toHaveCount(0);
  expect(pdfBytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
  const pdfText = pdfBytes.toString('latin1');
  expect((pdfText.match(/\/Type\s*\/Page(?![s])/g) ?? []).length).toBeGreaterThanOrEqual(2);
  expect(pdfText).toContain('Pallet build sheet');
  expect(pdfText).toContain('E2E run');
  // The total boxes tile is drawn as its own text string: jsPDF writes "(260) Tj".
  expect(pdfText).toContain('(260) Tj');

  // Harbor theme: applied now, and still applied (and still Basic) after a reload.
  const theme = page.getByLabel('Theme', { exact: true });
  await theme.selectOption('harbor');
  await expect(html).toHaveClass(/(^|\s)harbor(\s|$)/);
  await page.reload();
  await expect(html).toHaveClass(/(^|\s)harbor(\s|$)/);
  await expect(viewSwitch.getByRole('radio', { name: 'Basic' })).toBeChecked();
  await theme.selectOption('light');
  await expect(html).not.toHaveClass(/(^|\s)harbor(\s|$)/);

  // Full view: the comparison table appears and the original steps follow.
  await viewSwitch.getByRole('radio', { name: 'Full' }).click();
  await expect(page.getByRole('table', { name: 'Layout comparison' })).toBeVisible();

  // Default inputs: the summary follows the selected row.
  await expect(tile('Total boxes per pallet').locator('dd')).toHaveText('260');
  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(2);
  const secondProducts = (await rows.nth(1).locator('td').nth(2).innerText()).trim();
  expect(secondProducts).toMatch(/^\d+$/);
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tile('Total boxes per pallet').locator('dd')).toHaveText(secondProducts);

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

  await expect(tile('Total boxes per pallet').locator('dd')).toHaveText('32');
  await expect(tile('Cartons per pallet').locator('dd')).toHaveText('8');
  await expect(tile('Boxes per carton').locator('dd')).toHaveText('4');

  await expect.poll(() => rows.count()).toBeGreaterThanOrEqual(2);
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
  const csvText = await readFile(await csv.path(), 'utf8');
  expect(csvText.startsWith('\uFEFFMetric,Value')).toBe(true); // UTF-8 BOM for Excel

  // Saved inputs survive a reload.
  await page.reload();
  await expect(group(page, 'Product box').getByLabel('Length', { exact: true })).toHaveValue('10');

  // Validation message.
  await group(page, 'Pallet limitation').getByLabel('Length', { exact: true }).fill('abc');
  await expect(group(page, 'Pallet limitation').getByText('Enter a number')).toBeVisible();

  expect(problems).toEqual([]);
});
