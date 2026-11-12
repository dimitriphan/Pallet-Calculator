import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const MANUAL_KEY = 'pc.manualLayouts.v1';

/** Collects console and page errors, so a test can end by asserting there were none. */
function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** The picture a canvas shows once it has stopped changing: its screenshot's hash. */
async function settledPicture(canvas: Locator): Promise<string> {
  let previous = '';
  for (let k = 0; k < 40; k++) {
    const now = hash(await canvas.screenshot());
    if (now === previous) return now;
    previous = now;
    await canvas.page().waitForTimeout(150);
  }
  throw new Error('The canvas never settled');
}

async function exportPng(page: Page): Promise<Buffer> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('menuitem', { name: 'PNG', exact: true }).click();
  return readFile(await (await download).path());
}

/**
 * The top and side views of an exported PNG (its right-hand panels, drawn at a fixed size
 * whatever the size of the 3D view on screen), as a hash of their pixels.
 */
async function orthoPanels(page: Page, png: Buffer): Promise<string> {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    if (image.width !== 2400 || image.height !== 1500) throw new Error('Not the export size');
    const canvas = new OffscreenCanvas(900, 1200);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, -1500, 0);
    const digest = await crypto.subtle.digest('SHA-256', ctx.getImageData(0, 0, 900, 1200).data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }, png.toString('base64'));
}

const stored = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as unknown, MANUAL_KEY);

test('design my own carton: counts, facing, flag, save, reload', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();
  await expect(page.getByRole('table', { name: 'Layout comparison' })).toBeVisible();
  await expect(page.getByTestId('layout-scene').locator('canvas')).toBeVisible();
  const before = await exportPng(page);

  await page.getByRole('button', { name: 'Design my own carton' }).click();
  const bar = page.getByRole('region', { name: 'Editing by hand' });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('tab', { name: /Carton/ })).toHaveAttribute('aria-selected', 'true');
  // The editor's bar stands in for the 3D view's toolbar.
  await expect(page.getByRole('button', { name: 'Reset view' })).toHaveCount(1);
  await expect(page.getByLabel('Envelope')).toBeHidden();

  const panel = page.getByRole('tabpanel');
  const figure = (label: string) =>
    panel.locator('dl > div', { has: page.getByText(label, { exact: true }) }).locator('dd');
  const canvas = page.getByTestId('editor-scene').locator('canvas');
  await expect(canvas).toBeVisible();
  await expect(figure('Boxes per carton')).toHaveText('5');
  await expect(figure('Outer size')).toHaveText('21.00 × 9.00 × 13.00 in');
  const first = await settledPicture(canvas);

  // An export while editing still shows the selected layout: its top and side views are,
  // pixel for pixel, what they were before the editor opened.
  expect(await orthoPanels(page, await exportPng(page))).toBe(await orthoPanels(page, before));

  // One more box along the length: the figures follow, the carton is drawn again, and at
  // 25 in it is over the 24 in maximum, which is said at once.
  const flags = panel.getByRole('list', { name: 'Carton flags' });
  await expect(flags).toHaveCount(0);
  await page.getByRole('button', { name: "One more: boxes along the carton's length" }).click();
  await expect(figure('Boxes per carton')).toHaveText('6');
  await expect(figure('Outer size')).toHaveText('25.00 × 9.00 × 13.00 in');
  await expect(flags.getByRole('listitem')).toHaveText([
    'Carton is over the maximum carton size by 1.00 in (longest side)',
  ]);
  const longer = await settledPicture(canvas);
  expect(longer).not.toBe(first);

  // Typing a count works too.
  await page.getByLabel('Boxes along the width').fill('2');
  await expect(figure('Boxes per carton')).toHaveText('12');

  // Another facing: the boxes lie flat, and the carton is a different carton.
  const facing = page.getByRole('radiogroup', { name: 'Box facing' });
  await expect(facing.getByRole('radio')).toHaveCount(6);
  await facing.getByRole('radio', { name: /^Box height up, not turned/ }).click();
  await expect(figure('Outer size')).toHaveText('73.00 × 17.00 × 5.00 in');
  // Now it cannot go on the pallet at all: the next step and Save are closed, with the reason.
  await expect(panel.locator('[data-flag="blocked"]')).toContainText(
    'too big for the allowed footprint',
  );
  await expect(bar.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(bar.getByRole('tab', { name: /Pallet layer/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  const flat = await settledPicture(canvas);
  expect(flat).not.toBe(longer);

  // Back to a carton that fits (3 × 2 × 1 flat boxes), named and saved.
  await page.getByLabel('Boxes along the length').fill('3');
  await expect(figure('Outer size')).toHaveText('37.00 × 17.00 × 5.00 in');
  await expect(bar.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await page.getByLabel('Layout name').fill('Flat sixes');
  expect(await stored(page)).toBeNull();
  await bar.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.getByText('Saved “Flat sixes” to your layouts.')).toBeVisible();
  // The normal 3D view and its toolbar are back.
  await expect(page.getByLabel('Envelope')).toBeVisible();

  const expectStored = async () => {
    const { items: saved } = (await stored(page)) as {
      items: { name: string; design: unknown; cartons: unknown[] }[];
    };
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toBe('Flat sixes');
    expect(saved[0]!.design).toEqual({
      counts: { length: 3, width: 2, height: 1 },
      facing: 'LWH',
      sideDown: 'base',
    });
    expect(saved[0]!.cartons.length).toBeGreaterThan(0);
  };
  await expectStored();

  await page.reload();
  await expect(page.getByRole('table', { name: 'Layout comparison' })).toBeVisible();
  await expectStored();
  expect(problems).toEqual([]);
});

test('edit a calculated layout by hand: the pallet layer step, cancel', async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();
  await page.getByRole('button', { name: 'Edit layout 2 by hand' }).click();
  const bar = page.getByRole('region', { name: 'Editing by hand' });
  await expect(bar.getByRole('tab', { name: /Pallet layer/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const scene = page.getByTestId('editor-scene');
  await expect(scene).toHaveAttribute('data-step', 'layer');
  const layer = await settledPicture(scene.locator('canvas'));
  await expect(
    page.getByRole('tabpanel').getByText('Cartons in the layer', { exact: true }),
  ).toBeVisible();

  // The Carton step draws something else in the same view.
  await bar.getByRole('tab', { name: /Carton/ }).click();
  await expect(scene).toHaveAttribute('data-step', 'carton');
  expect(await settledPicture(scene.locator('canvas'))).not.toBe(layer);

  // A change, then Cancel: asked first, and nothing is stored.
  await page.getByRole('button', { name: "One more: boxes along the carton's height" }).click();
  await bar.getByRole('button', { name: 'Cancel' }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard your changes?' });
  await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
  // Focus stays inside the dialog.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await bar.getByRole('button', { name: 'Cancel' }).click();
  await dialog.getByRole('button', { name: 'Discard changes' }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Design my own carton' })).toBeFocused();
  expect(await stored(page)).toBeNull();
  expect(problems).toEqual([]);
});

test('below 768 px the editor is off and says why', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();
  const design = page.getByRole('button', { name: 'Design my own carton' });
  await expect(design).toBeDisabled();
  await expect(page.getByText(/Editing by hand needs a wider screen/)).toBeAttached();
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(design).toBeEnabled();
});
