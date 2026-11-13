import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cartonCentre, cartonList, readLayer, screenPoint, type ListedLayer } from './layerView';

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
 * The three views of an exported PNG (the 3D panel and the top and side panels), as a hash of
 * their pixels.
 */
async function viewPanels(page: Page, png: Buffer): Promise<string> {
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    if (image.width !== 2400 || image.height !== 1500) throw new Error('Not the export size');
    // Everything above the caption strip (which holds the time of the export).
    const canvas = new OffscreenCanvas(2400, 1200);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const digest = await crypto.subtle.digest('SHA-256', ctx.getImageData(0, 0, 2400, 1200).data);
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

  // Nothing is exported while editing (the hidden view of the selected layout is another
  // size then, so its 3D picture would differ): every item is off and says why.
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Export' });
  await expect(menu).toContainText('Save or cancel the layout you are editing first.');
  for (const item of await menu.getByRole('menuitem').all()) await expect(item).toBeDisabled();
  await page.keyboard.press('Escape');
  // The view underneath is hidden from assistive technology meanwhile.
  await expect(page.getByTestId('layout-scene')).toHaveAttribute('aria-hidden', 'true');

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
  await expect(
    page
      .getByRole('region', { name: 'Your layouts' })
      .getByRole('button', { name: 'Show your layout Flat sixes' }),
  ).toHaveAttribute('aria-pressed', 'true');
  // The normal 3D view and its toolbar are back.
  await expect(page.getByLabel('Envelope')).toBeVisible();
  await expect(page.getByTestId('layout-scene')).not.toHaveAttribute('aria-hidden');

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
  await expect(page.getByTestId('layout-scene').locator('canvas')).toBeVisible();
  await settledPicture(page.getByTestId('layout-scene').locator('canvas'));
  const before = await exportPng(page);
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
    page.getByRole('tabpanel').locator('dt', { hasText: 'Cartons in the layer' }),
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
  // Back on the control that opened the editor.
  await expect(page.getByRole('button', { name: 'Edit layout 2 by hand' })).toBeFocused();
  expect(await stored(page)).toBeNull();

  // With the editor closed again an export is, pixel for pixel, what it was before the editor
  // opened: the 3D panel as well as the top and side views.
  await settledPicture(page.getByTestId('layout-scene').locator('canvas'));
  expect(await viewPanels(page, await exportPng(page))).toBe(await viewPanels(page, before));
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

/** Opens the editor on the best result at the Pallet layer step: ten 9 x 21 cartons. */
async function openLayerStep(page: Page) {
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Full' }).click();
  await page.getByRole('button', { name: 'Edit layout 1 by hand' }).click();
  const scene = page.getByTestId('editor-scene');
  await expect(scene).toHaveAttribute('data-step', 'layer');
  await expect(cartonList(page).getByRole('button')).toHaveCount(10);
  await settledPicture(scene.locator('canvas'));
}

async function topView(page: Page) {
  await page.getByRole('button', { name: 'Top view' }).click();
  await expect(page.getByTestId('editor-scene')).toHaveAttribute('data-view', 'top');
  await settledPicture(page.getByTestId('editor-scene').locator('canvas'));
}

type View = 'top' | 'angle';
const item = (page: Page, k: number) => cartonList(page).locator(`[data-carton="${k}"]`);
const selectedCartons = (layer: ListedLayer) =>
  layer.cartons.filter((c) => c.selected).map((c) => c.k);

/** Presses on carton `k`, moves the mouse to a point of the layer and (unless told not to) lets go. */
async function dragCarton(
  page: Page,
  view: View,
  k: number,
  to: { x: number; y: number },
  release = true,
) {
  const layer = await readLayer(page);
  const from = await cartonCentre(page, layer, view, k);
  const end = await screenPoint(page, layer, view, to);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + end.x) / 2, (from.y + end.y) / 2, { steps: 4 });
  await page.mouse.move(end.x, end.y, { steps: 4 });
  if (release) await page.mouse.up();
  return end;
}

/** The colour the 3D view shows at a point of the screen. */
async function canvasPixel(page: Page, at: { x: number; y: number }): Promise<number[]> {
  return page.evaluate(({ x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid=editor-scene] canvas')!;
    const box = canvas.getBoundingClientRect();
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    const ctx = copy.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0);
    const scale = canvas.width / box.width;
    const px = ctx.getImageData(
      Math.round((x - box.left) * scale),
      Math.round((y - box.top) * scale),
      1,
      1,
    ).data;
    return [px[0]!, px[1]!, px[2]!];
  }, at);
}

const layerFigure = (page: Page, label: string) =>
  page
    .getByRole('tabpanel')
    .locator('dl > div', { has: page.getByText(label, { exact: true }) })
    .locator('dd');

test('the pallet layer step: drag a carton with the mouse', async ({ page }) => {
  const problems = watchProblems(page);
  await openLayerStep(page);
  const panel = page.getByRole('tabpanel');
  const bar = page.getByRole('region', { name: 'Editing by hand' });
  const message = page.getByTestId('layer-message');
  const left = page.getByLabel('From left edge');
  const front = page.getByLabel('From front edge');
  // The best result mixes layer patterns; the copy is a stack of its bottom layer.
  await expect(page.getByTestId('mixed-note')).toHaveText(
    'This result mixes layer patterns. Editing by hand starts from its bottom layer: 250 boxes instead of 260.',
  );
  await expect(layerFigure(page, 'Total boxes')).toHaveText('250');
  await expect(left).toBeDisabled();

  for (const view of ['angle', 'top'] as const) {
    if (view === 'top') await topView(page);
    const start = await readLayer(page);
    const first = start.cartons[0]!;
    expect(first).toMatchObject({ x: 2.5, y: 0, w: 9, h: 21 });

    // A click selects; the fields show where the carton is.
    const centre = await cartonCentre(page, start, view, 3);
    await page.mouse.click(centre.x, centre.y);
    await expect(item(page, 3)).toHaveAttribute('aria-pressed', 'true');
    await expect(left).toHaveValue('29.50');
    await expect(front).toHaveValue('21.00');
    await expect(bar.getByRole('button', { name: 'Turn 90°' })).toBeEnabled();

    // Dragged a little over 2 in to the left, carton 1 snaps to the footprint's edge, 0.3 in on.
    await dragCarton(page, view, 0, { x: first.x + first.w / 2 - 2.2, y: first.y + first.h / 2 });
    await expect(item(page, 0)).toHaveAttribute('data-x', '0');
    await expect(item(page, 0)).toHaveAttribute('data-y', '0');
    await expect(item(page, 0)).toHaveAttribute('aria-pressed', 'true');
    await expect(item(page, 0)).toHaveAccessibleName(
      'Carton 1: 0.00 in from left, 21.00 in from front',
    );
    await expect(left).toHaveValue('0.00');
    await expect(message).toBeEmpty();

    // Dropped on another carton, it goes back to its last valid place, and says why. While it
    // is over the other carton it is drawn in the error colour.
    // (Sampled beside the seam line down the middle of the carton's top.)
    const redness = async (at: { x: number; y: number }) => {
      const [r, g] = await canvasPixel(
        page,
        await screenPoint(page, await readLayer(page), view, { x: at.x + 2.25, y: at.y }),
      );
      return r! - g!;
    };
    expect(await redness({ x: 16, y: 10.5 })).toBeLessThan(90);
    await dragCarton(page, view, 0, { x: 16, y: 31.5 }, false);
    await expect.poll(() => redness({ x: 16, y: 31.5 })).toBeGreaterThan(120);
    await page.mouse.up();
    await expect(message).toHaveText(
      'Cartons cannot overlap. The carton went back to where it was',
    );
    await expect(item(page, 0)).toHaveAttribute('data-x', '0');
    await expect(item(page, 0)).toHaveAttribute('data-y', '0');

    // Escape gives a drag up.
    await dragCarton(page, view, 0, { x: 60, y: 10 }, false);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(item(page, 0)).toHaveAttribute('data-x', '0');

    // The one drag that moved the carton is one step of undo.
    const undo = bar.getByRole('button', { name: 'Undo' });
    await undo.click();
    await expect(item(page, 0)).toHaveAttribute('data-x', '2.5');
    await expect(undo).toBeDisabled();
  }

  // Past the footprint with snapping off: where it is dropped, and flagged.
  await page.getByRole('checkbox', { name: 'Snapping' }).uncheck();
  await dragCarton(page, 'top', 0, { x: 7 - 6.2, y: 10.5 });
  const moved = (await readLayer(page)).cartons[0]!;
  expect(moved.x).toBeGreaterThan(-3.8);
  expect(moved.x).toBeLessThan(-3.6);
  expect(Math.abs(moved.y)).toBeLessThan(0.1);
  expect(moved.outside).toBe(true);
  await expect(panel.getByRole('list', { name: 'Layout flags' })).toContainText(
    /^1 carton overhangs the allowed footprint by up to 3\.[67]\d in$/,
  );
  await expect(item(page, 0)).toHaveAccessibleName(/outside the allowed footprint$/);
  // The view frames the carton where it now is, and a press still finds it there.
  await settledPicture(page.getByTestId('editor-scene').locator('canvas'));
  const there = await cartonCentre(page, await readLayer(page), 'top', 0);
  const other = await cartonCentre(page, await readLayer(page), 'top', 7);
  await page.mouse.click(other.x, other.y);
  await expect(item(page, 7)).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(there.x, there.y);
  await expect(item(page, 0)).toHaveAttribute('aria-pressed', 'true');

  // A click on empty space clears the selection; a drag on it orbits and moves no carton.
  const box = (await page.getByTestId('editor-scene').locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + 30, box.y + 30);
  expect(selectedCartons(await readLayer(page))).toEqual([]);
  await expect(left).toBeDisabled();
  const canvas = page.getByTestId('editor-scene').locator('canvas');
  const before = await settledPicture(canvas);
  const layerBefore = await readLayer(page);
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 80, { steps: 5 });
  await page.mouse.up();
  expect(await settledPicture(canvas)).not.toBe(before);
  expect(await readLayer(page)).toEqual(layerBefore);
  // "Reset view" puts the camera back where a press finds the cartons again.
  await page.getByRole('button', { name: 'Reset view' }).click();
  await expect(page.getByTestId('editor-scene')).toHaveAttribute('data-view', 'angle');
  await settledPicture(canvas);
  const again = await cartonCentre(page, await readLayer(page), 'angle', 4);
  await page.mouse.click(again.x, again.y);
  await expect(item(page, 4)).toHaveAttribute('aria-pressed', 'true');
  expect(problems).toEqual([]);
});

test.describe('with a finger', () => {
  test.use({ hasTouch: true });

  test('the pallet layer step: tap to select, drag to move', async ({ page }) => {
    const problems = watchProblems(page);
    await openLayerStep(page);
    await topView(page);
    // The page must not scroll or zoom under a finger on the view.
    expect(
      await page.getByTestId('scene-view').evaluate((el) => getComputedStyle(el).touchAction),
    ).toBe('none');

    const layer = await readLayer(page);
    const tap = await cartonCentre(page, layer, 'top', 6);
    await page.touchscreen.tap(tap.x, tap.y);
    await expect(item(page, 6)).toHaveAttribute('aria-pressed', 'true');
    await settledPicture(page.getByTestId('editor-scene').locator('canvas'));

    // Real touches (not synthetic pointer events): the browser makes the pointer events, of
    // type 'touch', and would cancel them if the page were allowed to pan under the finger.
    const touch = await page.context().newCDPSession(page);
    const seen = await page.evaluateHandle(() => {
      const types: string[] = [];
      window.addEventListener('pointerdown', (e) => types.push(e.pointerType), true);
      window.addEventListener('pointercancel', () => types.push('cancel'), true);
      return types;
    });
    const send = (type: string, at?: { x: number; y: number }) =>
      touch.send('Input.dispatchTouchEvent', {
        type: type as 'touchStart',
        touchPoints: at ? [{ x: Math.round(at.x), y: Math.round(at.y) }] : [],
      });
    const from = await cartonCentre(page, layer, 'top', 5);
    // Carton 6 is at the front left (2.5 in from the left edge): 2.2 in further left it snaps.
    const first = layer.cartons[5]!;
    expect(first).toMatchObject({ x: 2.5, y: 21 });
    const to = await screenPoint(page, layer, 'top', { x: 7 - 2.2, y: 31.5 });
    const scrolled = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0);
    await send('touchStart', from);
    for (let k = 1; k <= 6; k++)
      await send('touchMove', {
        x: from.x + ((to.x - from.x) * k) / 6,
        y: from.y + ((to.y - from.y) * k) / 6,
      });
    await send('touchEnd');
    await expect(item(page, 5)).toHaveAttribute('data-x', '0');
    await expect(item(page, 5)).toHaveAttribute('data-y', '21');
    await expect(item(page, 5)).toHaveAttribute('aria-pressed', 'true');
    expect(await seen.jsonValue()).toEqual(['touch']);
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(scrolled);

    // A finger dropping a carton on another: back it goes.
    const now = await readLayer(page);
    const start = await cartonCentre(page, now, 'top', 5);
    const onto = await cartonCentre(page, now, 'top', 8);
    await send('touchStart', start);
    for (let k = 1; k <= 6; k++)
      await send('touchMove', {
        x: start.x + ((onto.x - start.x) * k) / 6,
        y: start.y + ((onto.y - start.y) * k) / 6,
      });
    await send('touchEnd');
    await expect(page.getByTestId('layer-message')).toContainText('Cartons cannot overlap');
    await expect(item(page, 5)).toHaveAttribute('data-x', '0');
    expect(problems).toEqual([]);
  });
});

test('the pallet layer step: tools, keys, upper layers, save', async ({ page }) => {
  const problems = watchProblems(page);
  await openLayerStep(page);
  const panel = page.getByRole('tabpanel');
  const bar = page.getByRole('region', { name: 'Editing by hand' });
  const tool = (name: string) => bar.getByRole('button', { name, exact: true });
  const message = page.getByTestId('layer-message');
  const cartonButtons = cartonList(page).getByRole('button');

  // Every tool is big enough for a finger.
  for (const name of ['Add carton', 'Turn 90°', 'Remove', 'Reset', 'Undo', 'Redo']) {
    const box = (await tool(name).boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(44);
  }
  for (const target of [
    bar.locator('label', { hasText: 'Snapping' }),
    bar.getByRole('radiogroup', { name: 'Upper layers' }),
    page.getByRole('button', { name: 'Top view' }),
    item(page, 0),
  ])
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // By the buttons. A full layer has no room for one more, and says so.
  await expect(tool('Turn 90°')).toBeDisabled();
  await expect(tool('Remove')).toBeDisabled();
  await tool('Add carton').click();
  await expect(message).toHaveText('No free space for another carton inside the footprint');
  // A carton in the middle of a row cannot turn where it stands.
  await item(page, 2).click();
  await tool('Turn 90°').click();
  await expect(message).toHaveText('Cannot turn: it would overlap another carton');
  // Remove the two at the front right (cartons 9 and 10), then turn carton 8 into the room.
  await item(page, 9).click();
  await tool('Remove').click();
  await expect(cartonButtons).toHaveCount(9);
  await expect(message).toBeEmpty();
  await expect(layerFigure(page, 'Cartons in the layer')).toHaveText('9');
  await expect(layerFigure(page, 'Total boxes')).toHaveText('225');
  await item(page, 8).click();
  await tool('Remove').click();
  await expect(cartonButtons).toHaveCount(8);
  await item(page, 7).click();
  await tool('Turn 90°').click();
  await expect(item(page, 7)).toHaveAttribute('data-turned', 'true');
  await expect(item(page, 7)).toHaveAttribute('data-w', '21');
  await expect(item(page, 7)).toHaveAccessibleName(/, turned$/);
  await tool('Undo').click();
  await expect(item(page, 7)).toHaveAttribute('data-turned', 'false');
  await tool('Redo').click();
  await expect(item(page, 7)).toHaveAttribute('data-turned', 'true');
  // Add puts one in the first free spot, lying as the last carton touched, and selects it.
  await tool('Add carton').click();
  await expect(cartonButtons).toHaveCount(9);
  await expect(item(page, 8)).toHaveAttribute('aria-pressed', 'true');
  await expect(item(page, 8)).toHaveAttribute('data-turned', 'true');
  await expect(layerFigure(page, 'Total boxes')).toHaveText('225');

  // By the keys, with the 3D view focused by a press on a carton.
  const layer = await readLayer(page);
  const press = await cartonCentre(page, layer, 'angle', 0);
  await page.mouse.click(press.x, press.y);
  await expect(item(page, 0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('scene-view')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(item(page, 0)).toHaveAttribute('data-x', '2.25');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(item(page, 0)).toHaveAttribute('data-x', '1.25');
  // Up is away from the front: past the back edge of the footprint, which is flagged.
  await page.keyboard.press('ArrowUp');
  await expect(item(page, 0)).toHaveAttribute('data-y', '-0.25');
  await expect(panel.getByRole('list', { name: 'Layout flags' })).toHaveText(
    '1 carton overhangs the allowed footprint by up to 0.25 in',
  );
  await page.keyboard.press('ArrowDown');
  await expect(panel.getByRole('list', { name: 'Layout flags' })).toHaveCount(0);
  // Into its neighbour: refused.
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(item(page, 0)).toHaveAttribute('data-x', '2.25');
  await expect(message).toHaveText('Cartons cannot overlap');
  // The bracket keys go round the cartons; R turns, Delete removes, and both can be undone.
  await page.keyboard.press(']');
  await expect(item(page, 1)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await expect(item(page, 8)).toHaveAttribute('aria-pressed', 'true');
  // Carton 9 lies along the front edge: turned, it would only fit past that edge, and a turn
  // never makes an overhang.
  await page.keyboard.press('r');
  await expect(message).toHaveText('No room to turn this carton here. Move it first.');
  await expect(item(page, 8)).toHaveAttribute('data-turned', 'true');
  await page.keyboard.press('Delete');
  await expect(cartonButtons).toHaveCount(8);
  await page.keyboard.press('Control+z');
  await expect(cartonButtons).toHaveCount(9);
  await page.keyboard.press('Control+Shift+z');
  await expect(cartonButtons).toHaveCount(8);
  // Undo after a redo, then redo by Ctrl+Y, then undo once more.
  await page.keyboard.press('Control+z');
  await expect(cartonButtons).toHaveCount(9);
  await page.keyboard.press('Control+y');
  await expect(cartonButtons).toHaveCount(8);
  await page.keyboard.press('Control+z');
  await expect(item(page, 8)).toHaveAttribute('data-turned', 'true');
  // Typing in a field is typing: the layer keys are not taken from it.
  await page.getByLabel('Layout name').fill('Hand made');
  await page.getByLabel('Layout name').press('Backspace');
  await page.getByLabel('Layout name').press('r');
  await expect(page.getByLabel('Layout name')).toHaveValue('Hand madr');
  await page.getByLabel('Layout name').fill('Hand made');
  await expect(cartonButtons).toHaveCount(9);

  // A typed position, exactly as typed; one over another carton is refused.
  // (Undo brought the selection back with the carton.)
  await expect(item(page, 8)).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('From left edge').fill('30');
  await page.getByLabel('From left edge').press('Enter');
  await expect(item(page, 8)).toHaveAttribute('data-x', '30');
  await page.getByLabel('From left edge').fill('12');
  await page.getByLabel('From left edge').press('Enter');
  await expect(page.getByTestId('position-message')).toHaveText('Cartons cannot overlap');
  await expect(page.getByLabel('From left edge')).toHaveValue('30.00');

  // Upper layers: the layer is no longer the same turned half round, so the choice shows.
  const upper = bar.getByRole('radiogroup', { name: 'Upper layers' });
  const warnings = panel.getByRole('list', { name: 'Stability warnings' });
  await expect(upper.getByRole('radio', { name: 'Alternate layers turned' })).toBeChecked();
  const alternate = await warnings.innerText();
  await upper.getByRole('radio', { name: 'All the same' }).click();
  await expect(upper.getByRole('radio', { name: 'All the same' })).toBeChecked();
  await expect(warnings).toContainText('Layers are stacked in straight columns');
  expect(await warnings.innerText()).not.toBe(alternate);
  await expect(layerFigure(page, 'Layers')).toHaveText('5');
  await expect(layerFigure(page, 'Total boxes')).toHaveText('225');
  await upper.getByRole('radio', { name: 'Alternate layers turned' }).click();
  await expect(warnings).not.toContainText('Layers are stacked in straight columns');

  // Reset asks first; kept here.
  await tool('Reset').click();
  const dialog = page.getByRole('dialog', { name: 'Reset the layer?' });
  await expect(dialog.getByRole('button', { name: 'Keep my layer' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Keep my layer' }).click();
  await expect(cartonButtons).toHaveCount(9);

  // Saved: what is stored is the layer as the list has it.
  const final = await readLayer(page);
  await tool('Save').click();
  await expect(bar).toHaveCount(0);
  await expect(
    page
      .getByRole('region', { name: 'Your layouts' })
      .getByRole('button', { name: 'Show your layout Hand made' }),
  ).toHaveAttribute('aria-pressed', 'true');
  const { items } = (await stored(page)) as {
    items: {
      name: string;
      upperLayers: string;
      cartons: { x: number; y: number; rotated: boolean }[];
    }[];
  };
  expect(items).toHaveLength(1);
  expect(items[0]!.name).toBe('Hand made');
  expect(items[0]!.upperLayers).toBe('alternate');
  expect(items[0]!.cartons).toEqual(
    final.cartons.map((c) => ({ x: c.x, y: c.y, rotated: c.turned })),
  );
  expect(items[0]!.cartons).toHaveLength(9);
  expect(items[0]!.cartons[0]).toEqual({ x: 2.25, y: 0, rotated: false });
  expect(items[0]!.cartons[8]).toMatchObject({ x: 30, rotated: true });
  expect(problems).toEqual([]);
});
