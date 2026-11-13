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

/** Collects console and page errors, so a test can end by asserting there were none. */
function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
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

  // Millimetres make the numbers longer; the header must still fit, in both themes.
  await page.getByLabel('Units', { exact: true }).selectOption('mm');
  await expectOneRow('modified preset, mm');
});

test('switching units converts the fields, not the result', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/');
  const summary = page.getByRole('region', { name: 'Production summary' });
  const total = summary
    .locator('div', { has: page.getByText('Total boxes per pallet', { exact: true }) })
    .locator('dd');
  const length = group(page, 'Product box').getByLabel('Length', { exact: true });
  const units = page.getByLabel('Units', { exact: true });

  await length.fill('12');
  await expect(total).toHaveText(/^\d+$/);
  const before = await total.innerText();

  /**
   * A unit switch must never mark the result out of date, not even briefly: sampled every
   * 50 ms for 800 ms (well past the 300 ms recalculation debounce), the badge never shows and
   * the total never changes. Any bad sample is kept, so a badge that comes and goes fails.
   */
  const staysCurrent = async (when: string) => {
    const until = Date.now() + 800;
    let bad: string | null = null;
    await expect
      .poll(
        async () => {
          if (bad === null) {
            const badges = await page.getByText('Out of date').count();
            const shown = await total.innerText();
            if (badges > 0) bad = `Out of date shown ${when}`;
            else if (shown !== before) bad = `total ${shown} instead of ${before} ${when}`;
          }
          return bad ?? (Date.now() >= until ? 'held' : 'sampling');
        },
        { intervals: [50], timeout: 3000 },
      )
      .toBe('held');
  };

  await units.selectOption('mm');
  await expect(length).toHaveValue('305');
  await staysCurrent('after switching to mm');

  await units.selectOption('in');
  await expect(length).toHaveValue('12');
  await staysCurrent('after switching back to in');

  expect(problems).toEqual([]);
});

test('a weight limit trims layers and the total stays under it', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/');
  const card = page.getByRole('heading', { name: 'What to build' });
  await expect(card).toBeVisible();

  // The default load is far heavier than this, so layers must come off.
  await page.getByLabel('Weight per product box', { exact: true }).fill('1');
  await page.getByLabel('Maximum pallet weight', { exact: true }).fill('150');
  await expect(page.getByText(/^Limited by weight/).first()).toBeVisible();

  const totalWeight = page
    .locator('dt', { hasText: /^Total weight$/ })
    .locator('xpath=following-sibling::dd[1]');
  await expect(totalWeight).toHaveText(/\d/);
  const shown = await totalWeight.innerText();
  const value = Number(shown.replace(/[^0-9.]/g, ''));
  expect(value).toBeGreaterThan(0);
  expect(value).toBeLessThanOrEqual(150);

  expect(problems).toEqual([]);
});

test('a maximum weight below one layer says nothing fits', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/');
  await page.getByLabel('Weight per product box', { exact: true }).fill('100');
  await page.getByLabel('Maximum pallet weight', { exact: true }).fill('50');
  await expect(
    page.getByText('Nothing fits: one layer is already over the maximum pallet weight.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What to build' })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('a pinwheel layout beats straight cuts and is badged in the table', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();

  await fillDims(page, 'Pallet limitation', ['Length', 'Width', 'Height'], ['48', '40', '60']);
  await fillDims(page, 'Product box', ['Length', 'Width', 'Height'], ['16.5', '10.5', '18']);
  await fillDims(
    page,
    'Maximum carton',
    ['Max length', 'Max width', 'Max height'],
    ['16.5', '10.5', '18'],
  );
  await page.getByLabel('Box leeway', { exact: true }).fill('0');
  await page.getByLabel('Carton wall thickness', { exact: true }).fill('0');

  const summary = page.getByRole('region', { name: 'Production summary' });
  await expect(
    summary
      .locator('div', { has: page.getByText('Total boxes per pallet', { exact: true }) })
      .locator('dd'),
  ).toHaveText('30');
  const first = page.getByRole('table', { name: 'Layout comparison' }).locator('tbody tr').first();
  await expect(first).toContainText('Pinwheel');

  expect(problems).toEqual([]);
});

test('every layout carries a stability rating', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What to build' })).toBeVisible();
  await expect(page.getByText(/^Stability: (Good|Fair|Poor)$/).first()).toBeVisible();
});

test('a minimum stability leaves layouts out and says what Auto would give', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();
  const rows = page.getByRole('table', { name: 'Layout comparison' }).locator('tbody tr');
  const total = page
    .getByRole('region', { name: 'Production summary' })
    .locator('div', { has: page.getByText('Total boxes per pallet', { exact: true }) })
    .locator('dd');
  const minimum = page.getByRole('radiogroup', { name: 'Minimum stability' });

  // Auto: the most boxes first, and every layout of the defaults is rated Fair.
  await expect(minimum.getByRole('radio', { name: 'Auto' })).toBeChecked();
  await expect(total).toHaveText('260');
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText('Fair');

  // Good only: a different list, every layout Good, and the cost of the choice.
  await minimum.getByRole('radio', { name: 'Good only' }).click();
  await expect(total).toHaveText('245');
  await expect(rows).toHaveCount(5);
  for (const text of await rows.allTextContents()) {
    expect(text).toContain('Good');
    expect(text).not.toContain('Fair');
  }
  await expect(page.getByText('Auto would give 15 more boxes.')).toBeVisible();
  await expect(page.getByText('Below your minimum')).toHaveCount(0);

  // Basic view has no control, but says the minimum is in force.
  await page
    .getByRole('radiogroup', { name: 'View' })
    .getByRole('radio', { name: 'Basic' })
    .click();
  await expect(page.getByRole('radiogroup', { name: 'Minimum stability' })).toHaveCount(0);
  const card = page.getByRole('region', { name: 'What to build' });
  await expect(card).toContainText('Minimum stability: Good only. Auto would give 15 more boxes.');
  await expect(page.getByText(/minimum stability Good only\./)).toBeVisible();

  // The choice is remembered with the other inputs.
  await page.reload();
  await expect(card).toContainText('Minimum stability: Good only.');
  await expect(total).toHaveText('245');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();
  await expect(minimum.getByRole('radio', { name: 'Good only' })).toBeChecked();

  // Nothing reaches Good in the pinwheel case: the most stable layouts, each marked.
  await fillDims(page, 'Pallet limitation', ['Length', 'Width', 'Height'], ['48', '40', '60']);
  await fillDims(page, 'Product box', ['Length', 'Width', 'Height'], ['16.5', '10.5', '18']);
  await fillDims(
    page,
    'Maximum carton',
    ['Max length', 'Max width', 'Max height'],
    ['16.5', '10.5', '18'],
  );
  await page.getByLabel('Box leeway', { exact: true }).fill('0');
  await page.getByLabel('Carton wall thickness', { exact: true }).fill('0');
  await expect(
    page.getByText('No layout reaches Good. Showing the most stable found.'),
  ).toBeVisible();
  await expect(total).toHaveText('30');
  await expect(rows.first()).toContainText('Fair');
  await expect(page.getByText('Below your minimum')).toHaveCount(await rows.count());

  // Fair or better is met, so nothing is marked.
  await minimum.getByRole('radio', { name: 'Fair or better' }).click();
  await expect(page.getByText('Below your minimum')).toHaveCount(0);
  await expect(page.getByText(/No layout reaches/)).toHaveCount(0);
  await expect(total).toHaveText('30');
  expect(problems).toEqual([]);
});

test('the unused-space overlay can be switched on and exported', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/');
  await expect(page.getByTestId('scene-slot').locator('canvas')).toBeVisible();

  const overlay = page.getByLabel('Unused space', { exact: true });
  await overlay.check();
  await expect(overlay).toBeChecked();

  const png = await chooseExport(page, 'PNG');
  const bytes = await readFile(await png.path());
  expect(bytes.length).toBeGreaterThan(1000);
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

  expect(problems).toEqual([]);
});

test('the header mascot still loads and is hidden from assistive technology', async ({ page }) => {
  await page.goto('/');
  const image = page.getByRole('banner').locator('img');
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute('aria-hidden', 'true');
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
});

test('the layer pattern setting changes the ranking, and falls back when no pinwheel exists', async ({
  page,
}) => {
  const problems = watchProblems(page);
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();
  const rows = page.getByRole('table', { name: 'Layout comparison' }).locator('tbody tr');
  const total = page
    .getByRole('region', { name: 'Production summary' })
    .locator('div', { has: page.getByText('Total boxes per pallet', { exact: true }) })
    .locator('dd');
  const pattern = page.getByRole('radiogroup', { name: 'Layer pattern' });
  const fallback = page.getByText(
    'No pinwheel layout exists for these sizes. Showing straight-cut layouts.',
  );

  // A 16 x 11 x 6 in box: 92 boxes with straight cuts, and a pinwheel of 92 Auto throws away.
  await fillDims(page, 'Product box', ['Length', 'Width', 'Height'], ['16', '11', '6']);
  await expect(pattern.getByRole('radio', { name: 'Auto' })).toBeChecked();
  await expect(total).toHaveText('92');
  await expect(rows.first()).not.toContainText('Pinwheel');

  // Prefer pinwheel: the same boxes, the pinwheel layout first, the straight-cut one below.
  await pattern.getByRole('radio', { name: 'Prefer pinwheel' }).click();
  await expect(rows.first()).toContainText('Pinwheel');
  await expect(total).toHaveText('92');
  await expect(rows.nth(1)).not.toContainText('Pinwheel');
  await expect(rows.nth(1)).toContainText('92');
  await expect(page.getByText(/Auto would give/)).toHaveCount(0);

  // Pinwheel only: nothing but pinwheel layouts, fewer boxes, and the cost of the choice.
  await pattern.getByRole('radio', { name: 'Pinwheel only' }).click();
  await expect(total).toHaveText('88');
  for (const text of await rows.allTextContents()) expect(text).toContain('Pinwheel');
  await expect(page.getByText('Auto would give 4 more boxes.')).toBeVisible();
  await expect(fallback).toHaveCount(0);

  // Basic view has no control, but says the setting is in force; it is remembered.
  await page
    .getByRole('radiogroup', { name: 'View' })
    .getByRole('radio', { name: 'Basic' })
    .click();
  await expect(page.getByRole('radiogroup', { name: 'Layer pattern' })).toHaveCount(0);
  const card = page.getByRole('region', { name: 'What to build' });
  await expect(card).toContainText('Layer pattern: Pinwheel only. Auto would give 4 more boxes.');
  await page.reload();
  await expect(card).toContainText('Layer pattern: Pinwheel only.');
  await expect(total).toHaveText('88');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();
  await expect(pattern.getByRole('radio', { name: 'Pinwheel only' })).toBeChecked();

  // A carton too large to turn beside itself: no pinwheel, so the straight-cut layouts, said so.
  await fillDims(page, 'Product box', ['Length', 'Width', 'Height'], ['30', '25', '20']);
  await fillDims(
    page,
    'Maximum carton',
    ['Max length', 'Max width', 'Max height'],
    ['31', '26', '21'],
  );
  await expect(fallback).toBeVisible();
  await expect(rows.first()).toBeVisible();
  for (const text of await rows.allTextContents()) expect(text).not.toContain('Pinwheel');
  await expect(page.getByText(/Auto would give/)).toHaveCount(0);

  // Under Auto nothing is said.
  await pattern.getByRole('radio', { name: 'Auto' }).click();
  await expect(fallback).toHaveCount(0);
  expect(problems).toEqual([]);
});

for (const [width, height] of [
  [390, 844],
  [700, 900],
  [768, 1024],
] as const)
  for (const view of ['Basic', 'Full'] as const)
    for (const theme of ['harbor', 'light'] as const)
      test(`below 1024 px the workspace is one column with no sideways page scroll: ${width} px, ${view}, ${theme} (final review F18)`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await page.goto('/');
        await page.getByLabel('Theme', { exact: true }).selectOption(theme);
        await page
          .getByRole('radiogroup', { name: 'View' })
          .getByRole('radio', { name: view })
          .click();
        await expect(page.getByTestId('layout-scene').locator('canvas')).toBeVisible();
        const measure = () =>
          page.evaluate(() => {
            const box = (el: Element | null) => {
              const r = el?.getBoundingClientRect();
              return r ? { x: r.x, y: r.y + window.scrollY, w: r.width, h: r.height } : null;
            };
            return {
              scrollWidth: document.documentElement.scrollWidth,
              bodyWidth: document.body.scrollWidth,
              header: box(document.querySelector('header')),
              actions: box(document.querySelector('[data-testid=header-actions]')),
              summary: box(document.querySelector('[aria-label="Production summary"]')),
              scene: box(document.querySelector('[data-testid=scene-slot]')),
              main: box(document.querySelector('main')),
              details: box(document.querySelector('aside[aria-label=Details]')),
              inputs: box(document.querySelector('aside[aria-label=Inputs]')),
              table: box(document.querySelector('table[aria-label="Layout comparison"]')),
            };
          });
        const m = await measure();
        // Nothing is wider than the window.
        expect(m.scrollWidth).toBe(width);
        expect(m.bodyWidth).toBe(width);
        for (const part of [m.header, m.actions, m.summary, m.scene, m.main, m.details, m.inputs]) {
          expect(part!.x).toBeGreaterThanOrEqual(0);
          expect(part!.x + part!.w).toBeLessThanOrEqual(width);
        }
        // One column, in this order: summary, 3D view (and results), details, inputs.
        expect(m.main!.w).toBe(width);
        expect(m.scene!.w).toBeGreaterThanOrEqual(width - 40);
        expect(m.scene!.h).toBeGreaterThanOrEqual(320);
        expect(m.summary!.y).toBeLessThan(m.scene!.y);
        expect(m.main!.y + m.main!.h).toBeLessThanOrEqual(m.details!.y + 1);
        expect(m.details!.y + m.details!.h).toBeLessThanOrEqual(m.inputs!.y + 1);
        // The inputs can be reached from the top.
        await page.getByRole('link', { name: 'Change inputs' }).click();
        await expect(page.locator('aside[aria-label=Inputs]')).toBeInViewport();
        if (view === 'Full') {
          // The comparison table may scroll sideways inside its own box only.
          const scroller = page.getByRole('table', { name: 'Layout comparison' }).locator('..');
          const s = await scroller.evaluate((el) => ({
            client: el.clientWidth,
            right: el.getBoundingClientRect().right,
          }));
          expect(s.right).toBeLessThanOrEqual(width);
          expect(s.client).toBeLessThanOrEqual(width);
        }
        expect((await measure()).scrollWidth).toBe(width);
      });
