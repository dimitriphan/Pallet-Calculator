import { act, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildSheet } from '../export/buildSheet';
import { useNoticesStore } from '../store/noticesStore';
import { flush, renderApp } from './testUtils';

const mocks = vi.hoisted(() => ({
  composePng: vi.fn(),
  downloadBlob: vi.fn(),
  renderBuildSheetPdf: vi.fn(),
  loadPrintMascot: vi.fn(),
}));
vi.mock('../export/png', async (orig) => ({
  ...(await orig<typeof import('../export/png')>()),
  composePng: mocks.composePng,
}));
vi.mock('../export/download', () => ({ downloadBlob: mocks.downloadBlob }));
vi.mock('../export/mascotImage', () => ({ loadPrintMascot: mocks.loadPrintMascot }));
vi.mock('../export/buildSheetPdf', () => ({ renderBuildSheetPdf: mocks.renderBuildSheetPdf }));

const MASCOT = { dataUrl: 'data:image/png;base64,AAAA', aspect: 0.63 };
const VIEWS = { current: 'c', top: 't', side: 's' };

beforeEach(() => {
  useNoticesStore.setState({ notices: [] });
  mocks.composePng.mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  mocks.downloadBlob.mockReset();
  mocks.loadPrintMascot.mockReset().mockResolvedValue(MASCOT);
  mocks.renderBuildSheetPdf
    .mockReset()
    .mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
});
afterEach(() => vi.useRealTimers());

async function openMenu(user: Awaited<ReturnType<typeof renderApp>>['user']) {
  await user.click(screen.getByRole('button', { name: 'Export' }));
}

describe('ExportMenu', () => {
  it('lists the build sheet, JSON, CSV and PNG as menu items', async () => {
    const { user } = await renderApp();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await openMenu(user);
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Build sheet (PDF)',
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
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM for Excel
    expect(new TextDecoder().decode(bytes.slice(3)).startsWith('Metric,Value\r\n')).toBe(true);
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
      'in',
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
    for (const name of ['Build sheet (PDF)', 'JSON', 'CSV', 'PNG']) {
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
    expect(screen.getByRole('menuitem', { name: 'Build sheet (PDF)' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
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
    await user.keyboard('{ArrowDown}');
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

describe('ExportMenu, build sheet', () => {
  const FAILED = 'Build sheet could not be created. Try again.';

  async function openDialog(user: Awaited<ReturnType<typeof renderApp>>['user']) {
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Build sheet (PDF)' }));
    return screen.getByRole('dialog', { name: 'Build sheet (PDF)' });
  }

  it('opens a dialog with a job name field', async () => {
    const { user } = await renderApp();
    const dialog = await openDialog(user);
    const field = within(dialog).getByRole('textbox', { name: 'Job name (optional)' });
    expect(field).toHaveAttribute('maxLength', '80');
    expect(field).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Save PDF' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders the sheet with the job name and downloads it', async () => {
    const { user, stores } = await renderApp();
    const capture = vi.fn(() => VIEWS);
    act(() => stores.scene.getState().setCaptureViews(capture));
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByRole('textbox', { name: 'Job name (optional)' }), 'Dock 4');
    await user.click(within(dialog).getByRole('button', { name: 'Save PDF' }));
    expect(mocks.renderBuildSheetPdf).toHaveBeenCalledTimes(1);
    const [sheet, pictures] = mocks.renderBuildSheetPdf.mock.calls[0] as [BuildSheet, unknown];
    expect(sheet.jobName).toBe('Dock 4');
    expect(sheet.summary.at(-1)?.value).toBe('260');
    expect(pictures).toEqual({ current: 'c', side: 's' });
    expect(mocks.renderBuildSheetPdf.mock.calls[0]?.[2]).toEqual(MASCOT);
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(1);
    expect(mocks.downloadBlob.mock.calls[0]?.[1]).toMatch(/^pallet-build-sheet-\d{8}-\d{6}\.pdf$/);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus();
    expect(useNoticesStore.getState().notices).toEqual([]);
  });

  it('still downloads the sheet, without the mascot, when the mascot cannot be loaded', async () => {
    mocks.loadPrintMascot.mockRejectedValue(new Error('offline'));
    const { user } = await renderApp();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Save PDF' }));
    expect(mocks.renderBuildSheetPdf).toHaveBeenCalledTimes(1);
    expect(mocks.renderBuildSheetPdf.mock.calls[0]?.[2]).toBeUndefined();
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(1);
    expect(useNoticesStore.getState().notices).toEqual([]);
  });

  it('submits with Enter', async () => {
    const { user } = await renderApp();
    const dialog = await openDialog(user);
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Job name (optional)' }),
      'Run{Enter}',
    );
    expect(mocks.renderBuildSheetPdf).toHaveBeenCalledTimes(1);
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(1);
  });

  it('shows "Creating…" while the PDF is generated', async () => {
    const { user } = await renderApp();
    let finish: (b: Blob) => void = () => {};
    mocks.renderBuildSheetPdf.mockReturnValue(new Promise<Blob>((r) => (finish = r)));
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Save PDF' }));
    expect(within(dialog).getByRole('button', { name: 'Creating…' })).toBeDisabled();
    await act(async () => finish(new Blob(['%PDF'])));
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('downloads nothing on Cancel', async () => {
    const { user } = await renderApp();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.renderBuildSheetPdf).not.toHaveBeenCalled();
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Export' })).toHaveFocus();
  });

  it('pushes a notice and closes when the renderer fails', async () => {
    const { user } = await renderApp();
    mocks.renderBuildSheetPdf.mockRejectedValue(new Error('jsPDF failed'));
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Save PDF' }));
    expect(useNoticesStore.getState().notices.map((n) => n.message)).toEqual([FAILED]);
    expect(mocks.downloadBlob).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('passes no pictures when the 3D view is unavailable or capture throws', async () => {
    const { user, stores } = await renderApp();
    let dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Save PDF' }));
    expect(mocks.renderBuildSheetPdf.mock.calls[0]?.[1]).toBeNull();

    act(() =>
      stores.scene.getState().setCaptureViews(() => {
        throw new Error('context lost');
      }),
    );
    dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Save PDF' }));
    expect(mocks.renderBuildSheetPdf.mock.calls[1]?.[1]).toBeNull();
    expect(mocks.downloadBlob).toHaveBeenCalledTimes(2);
  });

  it('exports the out-of-date flag from the results', async () => {
    const { user } = await renderApp();
    const length = screen.getAllByRole('textbox', { name: 'Length' })[0]!;
    await user.clear(length);
    await user.type(length, 'abc');
    await flush();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: 'Save PDF' }));
    const [sheet] = mocks.renderBuildSheetPdf.mock.calls[0] as [BuildSheet];
    expect(sheet.stale).toBe(true);
  });

  it('lists only the build sheet and PNG in Basic mode', async () => {
    const { user } = await renderApp(undefined, { viewMode: 'basic' });
    await openMenu(user);
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Build sheet (PDF)',
      'PNG',
    ]);
  });

  it('disables the build sheet until a layout is selected', async () => {
    const { user, stores } = await renderApp();
    act(() => stores.results.setState({ result: null, inputs: null }));
    await openMenu(user);
    const item = screen.getByRole('menuitem', { name: 'Build sheet (PDF)' });
    expect(item).toBeDisabled();
    expect(item).toHaveAttribute('title', 'Run a calculation first');
  });
});

describe('exports follow the display unit', () => {
  it('writes the CSV, PNG caption and build sheet in the unit chosen', async () => {
    const { user, stores } = await renderApp();
    act(() => stores.scene.getState().setCaptureViews(() => VIEWS));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Units' }), 'cm');
    await flush();

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'CSV' }));
    const [blob] = mocks.downloadBlob.mock.calls[0] as [Blob, string];
    const csv = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(3));
    expect(csv.split('\r\n')).toContain('Pallet length (cm),127.0');

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'PNG' }));
    expect(mocks.composePng.mock.calls[0]?.[2]).toBe('cm');

    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: 'Build sheet (PDF)' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save PDF' }));
    const [sheet] = mocks.renderBuildSheetPdf.mock.calls[0] as [BuildSheet];
    expect(sheet.unit).toBe('cm');
    expect(sheet.carton[0]?.value).toBe('53.3 × 33.0 × 22.9 cm');
  });
});
