/** The stability rows of the Analytics tab for a layout placed by hand. */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import { computeAnalytics } from '../engine/analytics/analytics';
import { optimize } from '../engine/optimize';
import { overhangingLayout, OVERHANG_INPUTS as I } from '../engine/manual/testSupport';
import { AnalyticsTab } from './AnalyticsTab';

function stabilityRows(analytics: ReturnType<typeof computeAnalytics>) {
  const { unmount } = render(<AnalyticsTab analytics={analytics} />);
  const section = screen.getByRole('heading', { name: 'Stability' }).closest('section')!;
  const rows = [...section.querySelectorAll('dt')].map(
    (dt) => [dt.textContent, dt.nextElementSibling?.textContent] as const,
  );
  const text = within(section);
  return { rows: new Map(rows), labels: rows.map((r) => r[0]), text, unmount };
}

describe('Analytics tab, stability of a manual layout', () => {
  it('names the narrowest free-standing group and gives the share on the pallet', () => {
    // Three cartons in two groups; the worst carton has 294 of its 425 sq in on the pallet.
    const s = stabilityRows(computeAnalytics(overhangingLayout({ upperLayers: 'same' }), I));
    expect(s.rows.get('Stack height ÷ shorter side of the narrowest free-standing group')).toBe(
      '3.82',
    );
    expect(s.labels).not.toContain('Stack height ÷ shorter side of base');
    expect(s.rows.get('Least share of a bottom carton resting on the pallet')).toBe('69%');
    expect(
      s.text.getByText(
        'A free-standing column of the load is tall for its base (3.8 times its shorter side).',
      ),
    ).toBeInTheDocument();
    expect(
      s.text.getByText(
        '2 cartons in the bottom layer hang off the pallet; the worst rests only 69% on it.',
      ),
    ).toBeInTheDocument();
    s.unmount();
  });

  it('keeps the usual label for one group, with the share on the pallet', () => {
    const cartons = [
      { x: 1, y: 1, rotated: false },
      { x: 26, y: 1, rotated: false },
    ];
    const s = stabilityRows(computeAnalytics(overhangingLayout({ cartons }), I));
    expect(s.rows.get('Stack height ÷ shorter side of base')).toBe('3.82');
    expect(s.rows.get('Least share of a bottom carton resting on the pallet')).toBe('100%');
    s.unmount();
  });

  it('a calculated layout has the rows it always had', () => {
    const { layout } = optimize(DEFAULT_INPUTS).layouts[0]!;
    const s = stabilityRows(computeAnalytics(layout, DEFAULT_INPUTS));
    expect(s.labels).toEqual([
      'Rating',
      'Warnings',
      'Stack height ÷ shorter side of base',
      'Carton height ÷ shorter base side, worst layer',
      'Least support from the layer below',
      'Most identical layers in straight columns',
      'Layers turned half a turn (180°)',
    ]);
    s.unmount();
  });
});
