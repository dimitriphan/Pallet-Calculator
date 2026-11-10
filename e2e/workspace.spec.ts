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

  // A fresh visit opens in Harbor, with one decorative (hidden) image in the header
  // and a favicon the site really serves.
  const theme = page.getByLabel('Theme', { exact: true });
  await expect(html).toHaveClass(/(^|\s)harbor(\s|$)/);
  await expect(theme).toHaveValue('harbor');
  await expect(theme.locator('option:checked')).toHaveText('Harbor');
  await expect(page.getByRole('banner').locator('img')).toHaveCount(1);
  await expect(page.getByRole('banner').locator('img')).toHaveAttribute('aria-hidden', 'true');
  const favicon = await page.request.get('/favicon.png');
  expect(favicon.status()).toBe(200);

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

  // Light: applied now, and still applied (and still Basic) after a reload.
  await theme.selectOption('light');
  await expect(html).not.toHaveClass(/(^|\s)harbor(\s|$)/);
  await page.reload();
  await expect(html).not.toHaveClass(/(^|\s)harbor(\s|$)/);
  await expect(theme).toHaveValue('light');
  await expect(viewSwitch.getByRole('radio', { name: 'Basic' })).toBeChecked();

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

test('a saved Dark preference opens in Harbor', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  // Written before the app loads, as an older version of the tool would have saved it.
  await page.addInitScript(() => {
    if (!localStorage.getItem('pc.prefs.v1')) {
      localStorage.setItem('pc.prefs.v1', '{"viewMode":"basic","theme":"dark"}');
    }
  });
  await page.goto('/');

  const html = page.locator('html');
  await expect(html).toHaveClass(/(^|\s)harbor(\s|$)/);
  await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('harbor');
  await expect(page.getByLabel('Theme', { exact: true }).locator('option:checked')).toHaveText(
    'Harbor',
  );

  expect(problems).toEqual([]);
});

test('the working mascot animates in the built app while a calculation is held', async ({
  page,
}) => {
  // Hold the optimiser worker script so the first calculation stays "Calculating…".
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/optimizer.worker*.js', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await expect(page.getByText('Calculating…').first()).toBeVisible();

  const frames = page.locator('.mascot-frame:visible');
  await expect(frames).toHaveCount(3);
  // Exactly one of the three frames is on at any moment, and the built CSS really runs them.
  const visibleNow = () =>
    frames.evaluateAll((els) => els.filter((e) => getComputedStyle(e).opacity === '1').length);
  for (let i = 0; i < 5; i++) {
    await expect.poll(visibleNow).toBe(1);
  }
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .map((a) => (a as CSSAnimation).animationName)
          .filter((n) => n.startsWith('mascot-frame-'))
          .sort()
          .join(),
      ),
    )
    .toBe('mascot-frame-1,mascot-frame-2,mascot-frame-3');
  // The frames take turns: more than one distinct frame is seen on within a few loops.
  const seen = new Set<number>();
  await expect
    .poll(async () => {
      seen.add(
        await frames.evaluateAll((els) =>
          els.findIndex((e) => getComputedStyle(e).opacity === '1'),
        ),
      );
      return seen.size;
    })
    .toBeGreaterThanOrEqual(3);

  release();
  await expect(page.getByText('Calculating…')).toHaveCount(0);
});

test('the header fits one 48 px row in Full view at 1100 x 600', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 600 });
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();
  const banner = page.getByRole('banner');
  await expect(banner.getByRole('heading', { name: 'Pallet Calculator' })).toBeVisible();

  const expectOneRow = async (state: string) => {
    for (const theme of ['harbor', 'light']) {
      await page.getByLabel('Theme', { exact: true }).selectOption(theme);
      const result = await banner.evaluate((header) => {
        const box = header.getBoundingClientRect();
        const h1 = header.querySelector('h1') as HTMLElement;
        const lineHeight = parseFloat(getComputedStyle(h1).lineHeight);
        const outside = [...header.querySelectorAll('button, select, label, h1, [data-mascot-box]')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5 || r.right > box.right + 0.5
            );
          })
          .map((el) => `${el.tagName} ${el.textContent ?? ''}`.trim());
        return {
          outside,
          h1Height: h1.getBoundingClientRect().height,
          lineHeight,
          overflow: header.scrollWidth - header.clientWidth,
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(result.outside, `${state}, ${theme}`).toEqual([]);
      expect(result.h1Height, `${state}, ${theme}`).toBeLessThan(result.lineHeight * 1.6);
      expect(result.overflow, `${state}, ${theme}`).toBe(0);
      expect(result.pageOverflow, `${state}, ${theme}`).toBe(0);
    }
  };

  await expectOneRow('default');

  // A chosen preset whose settings were then changed shows the most header controls:
  // "Modified", "Save to preset", "Save as new" and "Manage".
  await page
    .getByLabel('Preset', { exact: true })
    .selectOption({ label: 'Standard GMA 48 × 40 × 72' });
  await page.getByRole('textbox', { name: 'Box leeway' }).fill('1');
  await expect(banner.getByText('Modified')).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Save to preset' })).toBeVisible();
  await expectOneRow('modified preset');
});
