import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { cartonList } from './layerView';

const MANUAL_KEY = 'pc.manualLayouts.v1';

function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

async function exported(page: Page, item: string): Promise<Buffer> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  if (item.startsWith('Build sheet'))
    await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  return readFile(await (await download).path());
}

const list = (page: Page) => page.getByRole('region', { name: 'Your layouts' });
const row = (page: Page, name: string) =>
  list(page)
    .getByTestId('your-layout')
    .filter({ has: page.getByRole('button', { name: `Show your layout ${name}`, exact: true }) });
const tile = (page: Page, label: string) =>
  page
    .getByRole('region', { name: 'Production summary' })
    .locator('div', { has: page.getByText(label, { exact: true }) })
    .locator('dd');
const group = (page: Page, legend: string) =>
  page.getByRole('group', { name: legend, exact: true });
const storedNames = (page: Page) =>
  page.evaluate(
    (key) =>
      (
        (JSON.parse(localStorage.getItem(key) ?? '{"items":[]}') as { items: { name: string }[] })
          .items ?? []
      ).map((i) => i.name),
    MANUAL_KEY,
  );

/** Makes a manual layout from the best result with one carton removed: 9 cartons a layer. */
async function makeLayout(page: Page, name: string) {
  await page.getByRole('button', { name: 'Edit layout 1 by hand' }).click();
  const bar = page.getByRole('region', { name: 'Editing by hand' });
  await expect(cartonList(page).getByRole('button')).toHaveCount(10);
  await cartonList(page).locator('[data-carton="9"]').click();
  await bar.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(cartonList(page).getByRole('button')).toHaveCount(9);
  await page.getByLabel('Layout name').fill(name);
  await bar.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(bar).toHaveCount(0);
}

test('a manual layout in the results: list, selection, exports, inputs, scenario, reload', async ({
  page,
}) => {
  const problems = watchProblems(page);
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();
  await expect(page.getByRole('table', { name: 'Layout comparison' })).toBeVisible();
  // Nothing of the list until there is a layout.
  await expect(list(page)).toHaveCount(0);

  await makeLayout(page, 'Dock 4');

  // Listed above the calculated results, with its badge and how it compares.
  const dock = row(page, 'Dock 4');
  await expect(dock).toBeVisible();
  await expect(dock.getByText('Manual', { exact: true })).toBeVisible();
  await expect(dock).toContainText('225 boxes · 45 cartons · 5 layers');
  await expect(dock.getByTestId('difference')).toHaveText(
    '35 fewer than the best calculated layout',
  );
  const listBox = (await list(page).boundingBox())!;
  const tableBox = (await page.getByRole('table', { name: 'Layout comparison' }).boundingBox())!;
  expect(listBox.y).toBeLessThan(tableBox.y);

  // It is the selected layout: summary, explanation, analytics and the unused-space overlay.
  await expect(dock).toHaveAttribute('data-selected', 'true');
  await expect(tile(page, 'Total boxes per pallet')).toHaveText('225');
  await expect(tile(page, 'Cartons per layer')).toHaveText('9');
  const details = page.getByRole('complementary', { name: 'Details' });
  await page.getByRole('tab', { name: 'Explanation' }).click();
  const explanation = details.getByTestId('manual-explanation');
  await expect(explanation).toContainText('Dock 4');
  await expect(explanation).toContainText('35 fewer than the best calculated layout');
  await expect(details).not.toContainText('Score of layout');
  await expect(details).not.toContainText('Final score');
  await page.getByRole('tab', { name: 'Analytics' }).click();
  await expect(details.getByRole('tabpanel')).toContainText('Final results');
  await expect(details.getByRole('tabpanel')).toContainText('225');
  const canvas = page.getByTestId('layout-scene').locator('canvas');
  const plain = await canvas.screenshot();
  await page.getByLabel('Unused space').check();
  await expect
    .poll(async () => (await canvas.screenshot()).equals(plain), { timeout: 10_000 })
    .toBe(false);
  await page.getByLabel('Unused space').uncheck();

  // Rename (Enter), duplicate, delete (asked first).
  await dock.getByRole('button', { name: 'Rename Dock 4' }).click();
  const field = page.getByRole('textbox', { name: 'New name for Dock 4' });
  await expect(field).toBeFocused();
  await field.fill('Dock 5');
  await field.press('Enter');
  await expect(row(page, 'Dock 5')).toBeVisible();
  await expect(row(page, 'Dock 5').getByRole('button', { name: 'Rename Dock 5' })).toBeFocused();
  await row(page, 'Dock 5').getByRole('button', { name: 'Duplicate Dock 5' }).click();
  await expect(list(page).getByTestId('your-layout')).toHaveCount(2);
  await expect(
    list(page).getByRole('button', { name: 'Show your layout Dock 5 (copy)' }),
  ).toBeFocused();
  await row(page, 'Dock 5 (copy)').getByRole('button', { name: 'Delete Dock 5 (copy)' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete this layout?' });
  await expect(confirm.getByRole('button', { name: 'Keep it' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Delete layout' }).click();
  await expect(list(page).getByTestId('your-layout')).toHaveCount(1);
  expect(await storedNames(page)).toEqual(['Dock 5']);

  // Exports of the selected manual layout.
  await expect(row(page, 'Dock 5')).toHaveAttribute('data-selected', 'true');
  const csv = (await exported(page, 'CSV')).toString('utf8');
  const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
  expect(lines).toContain('Selected layout,Manual: Dock 5');
  expect(lines).toContain('Total boxes per pallet,225');
  expect(lines).toContain('Upper layers,Alternate layers turned');
  expect(lines).toContain('Manual layout flags,None');
  expect(csv).not.toMatch(/Selected layout,0|Overall score|contribution/);
  expect(lines.some((l) => l.startsWith('#,'))).toBe(false);

  const json = JSON.parse((await exported(page, 'JSON')).toString('utf8')) as {
    selectedLayout: {
      rank: unknown;
      score: unknown;
      manual: { name: string; status: string; flags: unknown[] };
      layout: { totalProducts: number };
    };
    comparison: unknown[];
  };
  expect(json.selectedLayout.rank).toBeNull();
  expect(json.selectedLayout.score).toBeNull();
  expect(json.selectedLayout.manual).toMatchObject({
    name: 'Dock 5',
    status: 'current',
    flags: [],
  });
  expect(json.selectedLayout.layout.totalProducts).toBe(225);
  expect(json.comparison).toEqual([]);

  const png = await exported(page, 'PNG');
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(png.length).toBeGreaterThan(20_000);

  const pdf = (await exported(page, 'Build sheet (PDF)')).toString('latin1');
  expect(pdf.slice(0, 4)).toBe('%PDF');
  expect(pdf).toContain('(Manual layout: Dock 5)');
  expect(pdf).toContain('Manual layout: Dock 5 - Page 1 of');
  expect(pdf).toContain('(225) Tj');
  expect(pdf).not.toMatch(/Layout \d+ of \d+|Layout 0/);

  // A scenario is saved with the layout.
  await page.getByRole('button', { name: 'Scenarios', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Scenarios' });
  await drawer.getByRole('button', { name: 'Save current' }).click();
  await drawer.getByRole('textbox', { name: 'Name' }).fill('With Dock 5');
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await drawer.getByRole('button', { name: 'Close' }).click();

  // An input that keeps the carton: the layout is re-checked and its numbers change.
  await group(page, 'Pallet limitation').getByLabel('Height', { exact: true }).fill('45');
  await expect(row(page, 'Dock 5')).toContainText('135 boxes · 27 cartons · 3 layers');
  await expect(row(page, 'Dock 5')).toHaveAttribute('data-status', 'current');
  await expect(tile(page, 'Total boxes per pallet')).toHaveText('135');
  await expect(row(page, 'Dock 5').getByTestId('difference')).toContainText(
    'the best calculated layout',
  );

  // An input that changes the carton: out of date, with what it was made for.
  await group(page, 'Product box').getByLabel('Height', { exact: true }).fill('5');
  const old = row(page, 'Dock 5');
  await expect(old).toHaveAttribute('data-status', 'outOfDate');
  await expect(old.getByText('Out of date', { exact: true })).toBeVisible();
  await expect(old.getByTestId('made-for')).toContainText(
    'Made for a product of 12.00 × 8.00 × 4.00 in',
  );
  await expect(old.getByRole('button', { name: 'Discard Dock 5' })).toBeVisible();
  await expect(old.getByRole('button', { name: 'Rebuild Dock 5' })).toBeEnabled();
  await expect(old.getByRole('button', { name: 'Edit Dock 5' })).toHaveCount(0);
  // Wherever its numbers show, it is marked.
  await expect(
    page.getByRole('region', { name: 'Production summary' }).getByText('Out of date'),
  ).toBeVisible();
  const edit = details.getByRole('button', { name: 'Edit layout by hand' });
  await expect(edit).toBeDisabled();
  await expect(edit).toHaveAttribute('title', /out of date/);
  // Rebuild opens the editor on the current best result under its name.
  await old.getByRole('button', { name: 'Rebuild Dock 5' }).click();
  const bar = page.getByRole('region', { name: 'Editing by hand' });
  await expect(page.getByLabel('Layout name')).toHaveValue('Dock 5');
  await bar.getByRole('button', { name: 'Cancel' }).click();
  await expect(bar).toHaveCount(0);

  // A second layout made now; loading the scenario keeps both (it removes none).
  await makeLayout(page, 'Tall boxes');
  await expect(list(page).getByTestId('your-layout')).toHaveCount(2);
  await page.getByRole('button', { name: 'Scenarios', exact: true }).click();
  await drawer.getByRole('button', { name: 'Load' }).click();
  await expect(drawer).toHaveCount(0);
  await expect(group(page, 'Product box').getByLabel('Height', { exact: true })).toHaveValue('4');
  await expect(list(page).getByTestId('your-layout')).toHaveCount(2);
  expect(await storedNames(page)).toEqual(['Dock 5', 'Tall boxes']);
  // Under the scenario's inputs Dock 5 is current again and the other one is out of date.
  await expect(row(page, 'Dock 5')).toHaveAttribute('data-status', 'current');
  await expect(row(page, 'Dock 5')).toContainText('225 boxes');
  await expect(row(page, 'Tall boxes')).toHaveAttribute('data-status', 'outOfDate');

  // Discard, asked first.
  await row(page, 'Tall boxes').getByRole('button', { name: 'Discard Tall boxes' }).click();
  await page
    .getByRole('dialog', { name: 'Discard this layout?' })
    .getByRole('button', { name: 'Discard layout' })
    .click();
  await expect(list(page).getByTestId('your-layout')).toHaveCount(1);

  // A reload keeps it; it can be selected and edited again.
  await page.reload();
  await expect(row(page, 'Dock 5')).toBeVisible();
  await expect(row(page, 'Dock 5')).toContainText('225 boxes');
  await list(page).getByRole('button', { name: 'Show your layout Dock 5' }).click();
  await expect(tile(page, 'Total boxes per pallet')).toHaveText('225');
  await row(page, 'Dock 5').getByRole('button', { name: 'Edit Dock 5' }).click();
  await expect(cartonList(page).getByRole('button')).toHaveCount(9);
  await expect(bar.getByRole('button', { name: 'Save as new' })).toBeVisible();
  // While editing the summary is the editor's, and says so.
  await expect(page.getByTestId('summary-editing')).toBeVisible();
  await bar.getByRole('button', { name: 'Cancel' }).click();
  await expect(row(page, 'Dock 5').getByRole('button', { name: 'Edit Dock 5' })).toBeFocused();

  // Basic view: listed, selectable, printable, not editable.
  await page
    .getByRole('radiogroup', { name: 'View' })
    .getByRole('radio', { name: 'Basic' })
    .click();
  await expect(
    list(page).getByRole('button', { name: /^(Edit|Rename|Duplicate|Delete)/ }),
  ).toHaveCount(0);
  await list(page).getByRole('button', { name: 'Show your layout Dock 5' }).click();
  await expect(page.getByTestId('your-layout-note')).toContainText('Your layout: Dock 5');
  const basicPdf = (await exported(page, 'Build sheet (PDF)')).toString('latin1');
  expect(basicPdf).toContain('(Manual layout: Dock 5)');
  expect(problems).toEqual([]);
});

test('the editor cannot be opened in the wait before a recalculation (review I1)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();
  const own = page.getByRole('button', { name: 'Design my own carton' });
  const first = page.getByRole('button', { name: 'Edit layout 1 by hand' });
  await expect(first).toBeEnabled();
  // Type a new product height and press at once, inside the 300 ms wait.
  await group(page, 'Product box').getByLabel('Height', { exact: true }).fill('5');
  await expect(first).toBeDisabled();
  await expect(own).toBeDisabled();
  await expect(page.locator('#editor-entry-reason')).toHaveText(
    'Wait for the calculation to finish.',
  );
  await first.click({ force: true });
  await expect(page.getByRole('region', { name: 'Editing by hand' })).toHaveCount(0);
  // Once the result is back the editor opens on a sound layer.
  await expect(first).toBeEnabled();
  await first.click();
  await expect(page.getByRole('region', { name: 'Editing by hand' })).toBeVisible();
  await expect(page.getByRole('tabpanel')).not.toContainText('overlap');
});

test('at 768 px the editor caption stands under the view, not over the pallet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();
  await page.getByRole('button', { name: 'Edit layout 1 by hand' }).click();
  const view = (await page.getByTestId('scene-view').boundingBox())!;
  const caption = (await page.getByTestId('view-caption').boundingBox())!;
  expect(caption.y).toBeGreaterThanOrEqual(view.y + view.height - 0.5);
  // Both stay inside the window.
  expect(caption.x + caption.width).toBeLessThanOrEqual(768);
  expect(view.x + view.width).toBeLessThanOrEqual(768);
});
