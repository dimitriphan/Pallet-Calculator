import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoticesStore } from '../store/noticesStore';
import { flush, renderApp } from './testUtils';

const mocks = vi.hoisted(() => ({
  composePng: vi.fn(),
  downloadBlob: vi.fn(),
}));
vi.mock('../export/png', async (orig) => ({
  ...(await orig<typeof import('../export/png')>()),
  composePng: mocks.composePng,
}));
vi.mock('../export/download', () => ({ downloadBlob: mocks.downloadBlob }));

const VIEWS = { current: 'c', top: 't', side: 's' };

beforeEach(() => {
  useNoticesStore.setState({ notices: [] });
  mocks.composePng.mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  mocks.downloadBlob.mockReset();
});
afterEach(() => vi.useRealTimers());

async function openMenu(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  await user.click(screen.getByRole('button', { name: 'Export' }));
}

describe('ExportMenu', () => {
  it('lists JSON, CSV and PNG as menu items', async () => {
    const { user } = await renderApp();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await openMenu(user);
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'JSON',
      'CSV',
      'PNG',
    ]);
  });

  it('downloads JSON of the selected layout and closes', async () => {
    const { user } = await renderApp();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'JSON' }));
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = mocks.downloadBlob.mock.calls[0] as [Blob, string];
    expect(name).toMatch(/^pallet-layout-\d{8}-\d{6}\.json$/);
    const parsed = JSON.parse(await blob.text()) as { selectedLayout: { rank: number } };
    expect(parsed.selectedLayout.rank).toBe(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('exports an out-of-date result, saying so', async () => {
    const { user } = await renderApp();
    const length = screen.getAllByRole('textbox', { name: 'Length' })[0]!;
    await user.clear(length);
    await user.type(length, 'abc');
    await flush();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'JSON' }));
    const [blob] = mocks.downloadBlob.mock.calls[0] as [Blob, string];
    expect(JSON.parse(await blob.text())).toMatchObject({
      stale: true,
      status: 'Out of date: inputs changed after this calculation',
    });
  });

  it('downloads a CSV', async () => {
    const { user } = await renderApp();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'CSV' }));
    const [blob, name] = mocks.downloadBlob.mock.calls[0] as [Blob, string];
    expect(name).toMatch(/\.csv$/);
    expect((await blob.text()).startsWith('Metric,Value\r\n')).toBe(true);
  });

  it('composes and downloads a PNG from the captured views', async () => {
    const { user, stores } = await renderApp();
    const capture = vi.fn(() => VIEWS);
    act(() => stores.scene.getState().setCaptureViews(capture));
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'PNG' }));
    expect(mocks.composePng).toHaveBeenCalledWith(
      VIEWS,
      expect.objectContaining({ exportedAt: expect.any(String) }),
    );
    expect(mocks.downloadBlob.mock.calls[0]?.[1]).toMatch(/\.png$/);
    expect(useNoticesStore.getState().notices).toEqual([]);
  });

  it('disables PNG with an explanation when the 3D view is unavailable', async () => {
    const { user } = await renderApp();
    await openMenu(user);
    expect(screen.getByRole('menuitem', { name: 'PNG' })).toBeDisabled();
    expect(screen.getByRole('menuitem', { name: 'JSON' })).toBeEnabled();
    expect(screen.getByText('3D view is unavailable, so PNG export is disabled.')).toBeVisible();
  });

  it('pushes a notice instead of throwing when the PNG fails', async () => {
    const { user, stores } = await renderApp();
    mocks.composePng.mockRejectedValue(new Error('bad image'));
    act(() => stores.scene.getState().setCaptureViews(() => VIEWS));
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'PNG' }));
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
    expect(useNoticesStore.getState().notices.map((n) => n.message)).toEqual([
      'PNG export failed. Try again after the 3D view has loaded.',
    ]);
  });

  it('pushes the same notice when capturing throws', async () => {
    const { user, stores } = await renderApp();
    act(() =>
      stores.scene.getState().setCaptureViews(() => {
        throw new Error('context lost');
      }),
    );
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'PNG' }));
    expect(useNoticesStore.getState().notices).toHaveLength(1);
  });

  it('disables everything until a layout is selected', async () => {
    const { user, stores } = await renderApp();
    act(() => stores.results.setState({ result: null, inputs: null }));
    await openMenu(user);
    for (const name of ['JSON', 'CSV', 'PNG']) {
      const item = screen.getByRole('menuitem', { name });
      expect(item).toBeDisabled();
      expect(item).toHaveAttribute('title', 'Run a calculation first');
    }
  });

  it('closes with Escape even when every item is disabled', async () => {
    const { user, stores } = await renderApp();
    act(() => stores.results.setState({ result: null, inputs: null }));
    screen.getByRole('button', { name: 'Export' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus();
  });

  it('opens with Enter, moves with arrows, and closes with Escape', async () => {
    const { user } = await renderApp();
    screen.getByRole('button', { name: 'Export' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'JSON' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'CSV' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'JSON' })).toBeEnabled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus();
  });

  it('opens with Space and activates an item with Enter', async () => {
    const { user } = await renderApp();
    screen.getByRole('button', { name: 'Export' }).focus();
    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    expect(mocks.downloadBlob.mock.calls[0]?.[1]).toMatch(/\.json$/);
  });

  it('closes on an outside click', async () => {
    const { user } = await renderApp();
    await openMenu(user);
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
