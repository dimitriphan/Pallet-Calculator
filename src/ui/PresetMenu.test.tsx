import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoticesStore } from '../store/noticesStore';
import { flush, renderApp } from './testUtils';

const GMA = 'Standard GMA 48 × 40 × 72';

function inputField(group: string, label: string) {
  return within(screen.getByRole('group', { name: group })).getByRole('textbox', { name: label });
}

async function choosePreset(user: Awaited<ReturnType<typeof renderApp>>['user'], name: string) {
  await user.selectOptions(screen.getByRole('combobox', { name: 'Preset' }), name);
  await flush();
}

async function setLeeway(user: Awaited<ReturnType<typeof renderApp>>['user'], value: string) {
  const leeway = screen.getByRole('textbox', { name: 'Box leeway' });
  await user.clear(leeway);
  await user.type(leeway, value);
  await flush();
}

beforeEach(() => {
  useNoticesStore.setState({ notices: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PresetMenu', () => {
  it('applies a preset to the pallet and leaves the product alone', async () => {
    const { user, stores } = await renderApp();
    await user.clear(inputField('Product box', 'Length'));
    await user.type(inputField('Product box', 'Length'), '10');
    await choosePreset(user, GMA);

    expect(inputField('Pallet limitation', 'Length')).toHaveValue('48');
    expect(inputField('Pallet limitation', 'Width')).toHaveValue('40');
    expect(inputField('Product box', 'Length')).toHaveValue('10');
    expect(inputField('Product box', 'Width')).toHaveValue('8');
    expect(stores.presets.getState().activePresetId).toBe('sample-standard-gma');
    expect(screen.queryByText('Modified')).not.toBeInTheDocument();
  });

  it('lists "No preset" and clearing it leaves the inputs unchanged', async () => {
    const { user, stores } = await renderApp();
    await choosePreset(user, GMA);
    await choosePreset(user, 'No preset');
    expect(stores.presets.getState().activePresetId).toBeNull();
    expect(inputField('Pallet limitation', 'Length')).toHaveValue('48');
  });

  it('shows Modified after an edit, without touching the stored preset', async () => {
    const { user, stores } = await renderApp();
    await choosePreset(user, GMA);
    await setLeeway(user, '0.75');

    expect(screen.getByText('Modified')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save to preset' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save as new' })).toBeEnabled();
    const stored = stores.presets.getState().presets.find((p) => p.id === 'sample-standard-gma');
    expect(stored?.leeway).toBe(0.5);
  });

  it('"Save to preset" updates the preset and clears the badge', async () => {
    const { user, stores } = await renderApp();
    await choosePreset(user, GMA);
    await setLeeway(user, '0.75');
    await user.click(screen.getByRole('button', { name: 'Save to preset' }));

    const stored = stores.presets.getState().presets.find((p) => p.id === 'sample-standard-gma');
    expect(stored?.leeway).toBe(0.75);
    expect(screen.queryByText('Modified')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save to preset' })).not.toBeInTheDocument();
  });

  it('"Save as new" asks for a name, adds a preset and makes it active', async () => {
    const { user, stores } = await renderApp();
    await choosePreset(user, GMA);
    await setLeeway(user, '0.75');
    const before = stores.presets.getState().presets.length;
    await user.click(screen.getByRole('button', { name: 'Save as new' }));

    const dialog = screen.getByRole('dialog', { name: 'Save as new preset' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Tight leeway');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    const { presets, activePresetId } = stores.presets.getState();
    expect(presets).toHaveLength(before + 1);
    const created = presets.find((p) => p.name === 'Tight leeway');
    expect(created?.leeway).toBe(0.75);
    expect(created?.pallet.length).toBe(48);
    expect(activePresetId).toBe(created?.id);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Modified')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveDisplayValue('Tight leeway');
  });

  it('disables both save buttons while the inputs are invalid', async () => {
    const { user } = await renderApp();
    await choosePreset(user, GMA);
    await setLeeway(user, 'abc');
    expect(screen.getByRole('button', { name: 'Save to preset' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save as new' })).toBeDisabled();
  });
});

describe('PresetDialog', () => {
  async function openManage(user: Awaited<ReturnType<typeof renderApp>>['user']) {
    await user.click(screen.getByRole('button', { name: 'Manage' }));
    return screen.getByRole('dialog', { name: 'Manage presets' });
  }

  it('opens and closes, returning focus to the Manage button', async () => {
    const { user } = await renderApp();
    const manage = screen.getByRole('button', { name: 'Manage' });
    const dialog = await openManage(user);
    expect(within(dialog).getByText(GMA)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(manage).toHaveFocus();
  });

  it('clones a preset', async () => {
    const { user, stores } = await renderApp();
    const dialog = await openManage(user);
    const row = within(dialog).getByText(GMA).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Clone' }));
    expect(within(dialog).getByText(`${GMA} (copy)`)).toBeInTheDocument();
    expect(stores.presets.getState().presets).toHaveLength(3);
  });

  it('asks before deleting, and deleting the active preset clears it', async () => {
    const { user, stores } = await renderApp();
    await choosePreset(user, GMA);
    const dialog = await openManage(user);
    const row = within(dialog).getByText(GMA).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(within(dialog).getByText(`Delete preset “${GMA}”?`)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(stores.presets.getState().presets).toHaveLength(2);

    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    await user.click(within(row).getByRole('button', { name: 'Delete' }));
    expect(stores.presets.getState().presets.map((p) => p.name)).not.toContain(GMA);
    expect(stores.presets.getState().activePresetId).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveDisplayValue('No preset');
  });

  it('edits a preset with the inputs panel messages and saves only when valid', async () => {
    const { user, stores } = await renderApp();
    const dialog = await openManage(user);
    const row = within(dialog).getByText(GMA).closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Edit' }));

    const edit = screen.getByRole('dialog', { name: 'Edit preset' });
    const height = within(within(edit).getByRole('group', { name: 'Pallet limitation' })).getByRole(
      'textbox',
      { name: 'Height' },
    );
    await user.clear(height);
    await user.type(height, '4');
    expect(
      within(edit).getByText('Pallet height must be greater than 5 inches'),
    ).toBeInTheDocument();
    expect(within(edit).getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.clear(height);
    await user.type(height, '60');
    const name = within(edit).getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'Short GMA');
    const leeway = within(edit).getByRole('textbox', { name: 'Box leeway' });
    await user.clear(leeway);
    await user.type(leeway, '1');
    await user.click(within(edit).getByRole('button', { name: 'Save' }));

    const stored = stores.presets.getState().presets.find((p) => p.id === 'sample-standard-gma');
    expect(stored).toMatchObject({ name: 'Short GMA', leeway: 1, pallet: { height: 60 } });
    expect(
      within(screen.getByRole('dialog', { name: 'Manage presets' })).getByText('Short GMA'),
    ).toBeInTheDocument();
  });

  it('exports every preset as pallet-presets.json', async () => {
    const { user } = await renderApp();
    let blob: Blob | undefined;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (b: Blob) => {
        blob = b;
        return 'blob:fake';
      },
      revokeObjectURL: () => {},
    });
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    const dialog = await openManage(user);
    await user.click(within(dialog).getByRole('button', { name: 'Export' }));
    expect(names).toEqual(['pallet-presets.json']);
    const parsed = JSON.parse(await blob!.text());
    expect(parsed.presets).toHaveLength(2);
    click.mockRestore();
  });

  it('imports presets from a file and reports the counts', async () => {
    const { user, stores } = await renderApp();
    const good = { ...stores.presets.getState().presets[0]!, name: 'Imported one' };
    const file = new File(
      [JSON.stringify({ version: 1, presets: [good, { nope: true }] })],
      'p.json',
      {
        type: 'application/json',
      },
    );
    const dialog = await openManage(user);
    const input = within(dialog).getByLabelText('Import presets file') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', '.json');
    await user.upload(input, file);

    await waitFor(() =>
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        'Imported 1 preset(s), skipped 1.',
      ),
    );
    expect(useNoticesStore.getState().notices).toEqual([]);
    expect(within(dialog).getByText('Imported one')).toBeInTheDocument();
  });

  describe.each([
    ['invalid JSON', '{not json'],
    ['a JSON array', '[1, 2]'],
    ['an object without presets', '{"version": 1}'],
  ])('importing %s', (_label, text) => {
    it('shows a message inside the dialog and adds nothing', async () => {
      const { user, stores } = await renderApp();
      const dialog = await openManage(user);
      const input = within(dialog).getByLabelText('Import presets file') as HTMLInputElement;
      await user.upload(input, new File([text], 'bad.json', { type: 'application/json' }));
      await waitFor(() =>
        expect(within(dialog).getByRole('status')).toHaveTextContent(
          'That file is not a valid preset export.',
        ),
      );
      expect(stores.presets.getState().presets).toHaveLength(2);
    });
  });

  it('reports a file that cannot be read, without an unhandled rejection', async () => {
    const { user, stores } = await renderApp();
    const dialog = await openManage(user);
    const input = within(dialog).getByLabelText('Import presets file') as HTMLInputElement;
    const file = new File(['{}'], 'p.json', { type: 'application/json' });
    file.text = () => Promise.reject(new Error('disk gone'));
    await user.upload(input, file);
    await waitFor(() =>
      expect(within(dialog).getByRole('status')).toHaveTextContent('That file could not be read.'),
    );
    expect(stores.presets.getState().presets).toHaveLength(2);
  });
});
