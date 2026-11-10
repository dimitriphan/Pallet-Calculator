/// <reference types="node" />
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Inputs } from '../domain/types';
import { optimize } from '../engine/optimize';
import { SproutProgress } from './SproutProgress';
import { flush, renderApp } from './testUtils';

// Read from disk (Vitest runs from the project root): it does not load stylesheets, not even with ?raw.
const css = readFileSync('src/index.css', 'utf8');

const sprouts = () => document.querySelectorAll('svg.sprout');

function field(group: string, label: string) {
  return within(screen.getByRole('group', { name: group })).getByRole('textbox', { name: label });
}

describe('SproutProgress', () => {
  it('is a decorative 96 × 8 px drawing on whole pixels', () => {
    const { container } = render(<SproutProgress />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '96');
    expect(svg).toHaveAttribute('height', '8');
    expect(svg).toHaveAttribute('shape-rendering', 'crispEdges');
    expect(svg).toHaveClass('sprout');
  });

  it('keeps green on a dark carrier in Light only', () => {
    const { container } = render(<SproutProgress />);
    const carrier = container.querySelector('.sprout-carrier');
    expect(carrier).toHaveAttribute('fill', '#333333');
    expect(carrier).toHaveAttribute('width', '96');
    expect(carrier).toHaveAttribute('height', '8');
    expect(carrier).toHaveClass('dark:hidden');
    expect(container.querySelector('.sprout-line')).toHaveAttribute('stroke', '#7BCF80');
  });

  it('sweeps by CSS and stands still, fully drawn, when motion is reduced', () => {
    // The animation lives in the stylesheet, so the reduced-motion rule is checked there.
    expect(css).toContain('.sprout-line');
    expect(css).toMatch(/\.sprout-line\s*\{[^}]*animation:\s*sprout-sweep 0\.8s[^}]*alternate/);
    expect(css).toMatch(/@keyframes sprout-sweep/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.sprout-line\s*\{[^}]*animation:\s*none;[^}]*stroke-dashoffset:\s*0;/,
    );
  });
});

describe('the sprout beside the calculation status', () => {
  it('shows right after "Calculating…" while a calculation runs', async () => {
    await renderApp(() => new Promise(() => {}));
    const line = screen.getByText('Calculating…');
    expect(sprouts()).toHaveLength(1);
    expect(line.lastElementChild).toBe(sprouts()[0]);
  });

  it('is absent once the result is in', async () => {
    await renderApp();
    expect(screen.queryByText('Calculating…')).not.toBeInTheDocument();
    expect(sprouts()).toHaveLength(0);
  });

  it('is absent from the stale notice', async () => {
    const { user } = await renderApp();
    await user.clear(field('Pallet limitation', 'Height'));
    await user.type(field('Pallet limitation', 'Height'), 'abc');
    await flush();
    expect(screen.getByText(/Showing the last valid result/)).toBeInTheDocument();
    expect(sprouts()).toHaveLength(0);
  });

  it('is absent from a calculation error', async () => {
    await renderApp(() => Promise.reject(new Error('Calculation failed.')));
    expect(screen.getByText('Calculation failed.')).toBeInTheDocument();
    expect(sprouts()).toHaveLength(0);
  });

  it('is absent from the limited-search notice', async () => {
    await renderApp((i: Inputs) => Promise.resolve({ ...optimize(i), truncated: true }));
    expect(screen.getByText(/Search was limited/)).toBeInTheDocument();
    expect(sprouts()).toHaveLength(0);
  });

  it('is absent from the "nothing fits" message', async () => {
    const { user } = await renderApp();
    await user.type(screen.getByRole('textbox', { name: 'Desired boxes per carton' }), '7');
    await flush();
    expect(screen.getByText(/No carton holding exactly 7 boxes/)).toBeInTheDocument();
    expect(sprouts()).toHaveLength(0);
  });
});
