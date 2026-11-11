import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StabilityBadge } from './StabilityBadge';

afterEach(() => cleanup());

describe('StabilityBadge', () => {
  it.each([
    ['good', 'Stability: Good', 'bg-green-100', 'dark:bg-harbor-green'],
    ['fair', 'Stability: Fair', 'bg-amber-100', 'dark:bg-harbor-sand'],
    ['poor', 'Stability: Poor', 'bg-red-100', 'dark:text-harbor-coral-text'],
  ] as const)('shows %s in the matching badge style', (rating, text, light, dark) => {
    render(<StabilityBadge stability={{ rating, warnings: [] }} />);
    const badge = screen.getByText(text);
    expect(badge).toHaveClass(light);
    expect(badge).toHaveClass(dark);
  });

  it('uses the existing success and caution fills with deep text in Harbor', () => {
    render(<StabilityBadge stability={{ rating: 'good', warnings: [] }} />);
    expect(screen.getByText('Stability: Good')).toHaveClass('dark:text-harbor-deep');
  });

  it('never fills a Poor badge with coral: coral text on the panel', () => {
    render(<StabilityBadge stability={{ rating: 'poor', warnings: [] }} />);
    const badge = screen.getByText('Stability: Poor');
    expect(badge).toHaveClass('dark:bg-harbor-panel');
    expect(badge.className).not.toMatch(/bg-harbor-coral/);
  });

  it('renders nothing for a layout stored without a rating', () => {
    const { container } = render(<StabilityBadge stability={undefined} />);
    expect(container).toBeEmptyDOMElement();
    const again = render(<StabilityBadge stability={null} />);
    expect(again.container).toBeEmptyDOMElement();
  });
});

describe('StabilityBadge short', () => {
  it('shows the rating word alone for a column titled Stability', () => {
    render(<StabilityBadge stability={{ rating: 'fair', warnings: [] }} short />);
    expect(screen.getByText('Fair')).toHaveClass('bg-amber-100');
    expect(screen.queryByText(/Stability:/)).not.toBeInTheDocument();
  });
});
