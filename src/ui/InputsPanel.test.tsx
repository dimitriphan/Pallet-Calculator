import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { flush, renderApp } from './testUtils';

const NOTICE =
  'A 5-inch pallet is automatically included. Available stacking height has been reduced by 5 inches.';
const STALE = 'Showing the last valid result. Fix the highlighted fields to update.';

function field(group: string, label: string) {
  return within(screen.getByRole('group', { name: group })).getByRole('textbox', { name: label });
}

function tableRows() {
  return within(screen.getByRole('table', { name: 'Layout comparison' })).getAllByRole('row');
}

describe('InputsPanel', () => {
  it('shows the pallet notice and the usable stacking height for the defaults', async () => {
    await renderApp();
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByText('Usable stacking height: 67.00 in')).toBeInTheDocument();
    expect(field('Pallet limitation', 'Height')).toHaveValue('72');
    expect(field('Pallet limitation', 'Height')).toHaveAttribute('inputmode', 'decimal');
  });

  it('flags an invalid pallet height and keeps the last valid result, marked stale', async () => {
    const { user } = await renderApp();
    const before = tableRows().map((r) => r.textContent);
    expect(before.length).toBeGreaterThan(1);

    const height = field('Pallet limitation', 'Height');
    await user.clear(height);
    await user.type(height, '4');
    await flush();

    const message = 'Pallet height must be greater than 5 inches';
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(height).toHaveAttribute('aria-invalid', 'true');
    expect(height).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(screen.getByText(STALE)).toBeInTheDocument();
    expect(tableRows().map((r) => r.textContent)).toEqual(before);
  });

  it('requires at least one orientation when rotation is Custom', async () => {
    const { user } = await renderApp();
    await user.click(screen.getByRole('radio', { name: 'Custom' }));
    const group = screen.getByRole('group', { name: 'Product rotation' });
    const boxes = within(group).getAllByRole('checkbox', { name: /^(LWH|LHW|WLH|WHL|HLW|HWL)$/ });
    expect(boxes).toHaveLength(6);
    for (const box of boxes) if ((box as HTMLInputElement).checked) await user.click(box);
    expect(screen.getByText('Select at least one orientation')).toBeInTheDocument();
    const custom = screen.getByRole('group', { name: 'Custom orientations' });
    expect(custom).toHaveAttribute('aria-invalid', 'true');
    expect(custom).toHaveAccessibleDescription(
      expect.stringContaining('Select at least one orientation'),
    );
    await user.click(boxes[0]!);
    expect(custom).toHaveAttribute('aria-invalid', 'false');
  });

  it('keeps Advanced optimization closed and disabled', async () => {
    const { user } = await renderApp();
    expect(screen.getByText('Coming in a later release')).toBeInTheDocument();
    const summary = screen.getByText('Advanced optimization');
    const details = summary.closest('details') as HTMLDetailsElement;
    expect(details).toHaveAttribute('aria-disabled', 'true');
    await user.click(summary);
    expect(details.open).toBe(false);
  });

  it('explains when no carton fits the product', async () => {
    const { user } = await renderApp();
    const length = field('Product box', 'Length');
    await user.clear(length);
    await user.type(length, '30');
    await flush();
    expect(
      screen.getByText(
        'No carton fits: the product box (plus leeway and walls) is larger than the maximum carton dimensions.',
      ),
    ).toBeInTheDocument();
  });
});
