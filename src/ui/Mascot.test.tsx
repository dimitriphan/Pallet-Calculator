/// <reference types="node" />
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import concernedUrl from '../assets/mascot/concerned.png';
import headerUrl from '../assets/mascot/header-mark.png';
import idleUrl from '../assets/mascot/idle.png';
import working1Url from '../assets/mascot/working-1.png';
import working2Url from '../assets/mascot/working-2.png';
import working3Url from '../assets/mascot/working-3.png';
import { Mascot } from './Mascot';
import { flush, makeStores, renderApp } from './testUtils';
import App from '../App';
import { vi } from 'vitest';

// Read from disk (Vitest runs from the project root): it does not load stylesheets.
const css = readFileSync('src/index.css', 'utf8');

const mascots = () => Array.from(document.querySelectorAll('img[data-mascot]'));
const liveRegion = () =>
  screen.getAllByRole('status').find((el) => el.className.includes('empty:'))!;
const kinds = () => mascots().map((m) => m.getAttribute('data-mascot'));

function field(group: string, label: string) {
  return within(screen.getByRole('group', { name: group })).getByRole('textbox', { name: label });
}

describe('Mascot', () => {
  it.each([
    ['header', 24, headerUrl],
    ['header', 32, headerUrl],
    ['idle', 64, idleUrl],
    ['concerned', 32, concernedUrl],
  ] as const)('draws the %s pose at %i px as one decorative pixelated image', (pose, size, url) => {
    const { container } = render(<Mascot pose={pose} size={size} />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    const img = imgs[0]!;
    expect(img).toHaveAttribute('src', url);
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(img).toHaveAttribute('draggable', 'false');
    expect(img).toHaveAttribute('width', String(size));
    expect(img).toHaveAttribute('height', String(size));
    expect(img).toHaveStyle({ imageRendering: 'pixelated' });
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('stacks the three working frames in one fixed-size box', () => {
    const { container } = render(<Mascot pose="working" size={32} />);
    const imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual([working1Url, working2Url, working3Url]);
    for (const img of imgs) {
      expect(img).toHaveAttribute('aria-hidden', 'true');
      expect(img).toHaveAttribute('alt', '');
      expect(img).toHaveAttribute('width', '32');
      expect(img).toHaveAttribute('height', '32');
    }
    expect(container.firstElementChild).toHaveStyle({ width: '32px', height: '32px' });
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('cycles frames 1-2-3-2 at 180 ms by CSS and shows only frame 2 when motion is reduced', () => {
    expect(css).toMatch(/@keyframes mascot-frame-1/);
    expect(css).toMatch(/@keyframes mascot-frame-3/);
    expect(css).toMatch(/@keyframes mascot-frame-2/);
    expect(css).toMatch(/\.mascot-frame\s*\{[^}]*animation:[^}]*0\.72s[^}]*steps\(1/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.mascot-frame\s*\{[^}]*animation:\s*none;[^}]*opacity:\s*0;[^}]*\}\s*\.mascot-frame-2\s*\{[^}]*opacity:\s*1;/,
    );
  });
});

describe('where the mascot appears', () => {
  const renderBasic = (run?: Parameters<typeof renderApp>[0]) =>
    renderApp(run, { viewMode: 'basic' });

  it('puts exactly one mark, 32 px tall, before the product name', async () => {
    await renderApp();
    const header = screen.getByRole('banner');
    const marks = header.querySelectorAll('img');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveAttribute('src', headerUrl);
    expect(marks[0]).toHaveAttribute('height', '32');
    const title = screen.getByRole('heading', { level: 1, name: 'Pallet Calculator' });
    expect(title.contains(marks[0]!)).toBe(false);
    expect(
      marks[0]!.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Pallet Calculator');
  });

  it('shows only the header mark in Full view with a result', async () => {
    await renderApp();
    expect(mascots()).toHaveLength(1);
    expect(kinds()).toEqual(['header']);
    expect(screen.queryAllByRole('img').filter((i) => i.hasAttribute('data-mascot'))).toHaveLength(
      0,
    );
  });

  it('shows no mascot in the table, summary bar, scene slot, or any dialog', async () => {
    const { user } = await renderApp();
    const inside = [
      screen.getByRole('table', { name: 'Layout comparison' }),
      screen.getByRole('region', { name: 'Production summary' }),
      screen.getByTestId('scene-slot'),
    ];
    for (const el of inside) expect(el.querySelector('img[data-mascot]')).toBeNull();
    await user.click(screen.getByRole('button', { name: /export/i }));
    for (const dialog of screen.queryAllByRole('dialog'))
      expect(dialog.querySelector('img[data-mascot]')).toBeNull();
  });

  it('shows idle in the empty hint, and none once the card is populated', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const stores = makeStores(undefined, { viewMode: 'basic' });
    stores.inputs.getState().setField('pallet.length', 'abc');
    const { unmount } = render(<App stores={stores} />);
    await flush();
    const card = screen.getByRole('region', { name: 'What to build' });
    expect(within(card).getByText('Enter the three sizes to see what to build.')).toBeVisible();
    expect(kinds()).toEqual(['header', 'idle']);
    expect(card.querySelector('img[data-mascot="idle"]')).toHaveAttribute('height', '64');
    unmount();
    await renderBasic();
    expect(kinds()).toEqual(['header']);
  });

  it('shows the working pose before "Calculating…" and nothing else', async () => {
    await renderBasic(() => new Promise(() => {}));
    expect(kinds()).toEqual(['header', 'working', 'working', 'working']);
    const line = screen.getByText('Calculating…');
    const box = line.querySelector('[data-mascot-box="working"]');
    expect(box).not.toBeNull();
    expect(line.firstElementChild).toBe(box);
    expect(box!.querySelectorAll('img')).toHaveLength(3);
    expect(liveRegion()).toHaveTextContent('Calculating…');
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('shows concerned with an error and its Retry, not the idle pose', async () => {
    await renderBasic(() => Promise.reject(new Error('Calculation failed.')));
    expect(kinds()).toEqual(['header', 'concerned']);
    const status = liveRegion();
    expect(status.querySelector('img[data-mascot="concerned"]')).toHaveAttribute('height', '32');
    expect(status).toHaveTextContent('Calculation failed.Retry');
  });

  it.each([['product length', 'Product box', 'Length', '30', /No carton fits/]] as const)(
    'shows concerned for the %s "nothing fits" message',
    async (_n, g, l, v, text) => {
      const { user } = await renderBasic();
      await user.clear(field(g, l));
      await user.type(field(g, l), v);
      await flush();
      const message = screen.getByText(text);
      expect(kinds()).toEqual(['header', 'concerned']);
      expect(message.closest('p')?.querySelector('img[data-mascot="concerned"]')).not.toBeNull();
    },
  );

  it('shows concerned for "smallest possible carton is larger than the usable pallet space"', async () => {
    const { user } = await renderBasic();
    await user.clear(field('Pallet limitation', 'Length'));
    await user.type(field('Pallet limitation', 'Length'), '3');
    await user.clear(field('Pallet limitation', 'Width'));
    await user.type(field('Pallet limitation', 'Width'), '3');
    await flush();
    expect(screen.getByText(/No layout fits/)).toBeInTheDocument();
    expect(kinds()).toEqual(['header', 'concerned']);
  });

  it('shows concerned for the boxes-per-carton message', async () => {
    const { user } = await renderBasic();
    await user.type(screen.getByRole('textbox', { name: 'Desired boxes per carton' }), '7');
    await flush();
    const message = screen.getByText(/No carton holding exactly 7 boxes/);
    expect(kinds()).toEqual(['header', 'concerned']);
    expect(message.closest('p')?.querySelector('img')).not.toBeNull();
  });

  it('keeps the mascot off the out-of-date line and the limited-search note', async () => {
    const { user } = await renderBasic();
    await user.clear(field('Pallet limitation', 'Height'));
    await user.type(field('Pallet limitation', 'Height'), 'abc');
    await flush();
    expect(screen.getByText(/Showing the last valid result/)).toBeInTheDocument();
    expect(kinds()).toEqual(['header']);
  });

  it('keeps an empty live region empty', async () => {
    await renderBasic();
    expect(liveRegion()).toBeEmptyDOMElement();
  });
});
