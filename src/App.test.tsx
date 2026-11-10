import { act, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Inputs } from './domain/types';
import { optimize } from './engine/optimize';
import { renderApp } from './ui/testUtils';
import type { RunOptimizer } from './worker/optimizerClient';

describe('App', () => {
  it('renders the workspace with one calculation on first load', async () => {
    const run = vi.fn((i: Inputs) => Promise.resolve(optimize(i)));
    await renderApp(run);
    expect(screen.getByRole('heading', { name: 'Pallet Calculator' })).toBeInTheDocument();
    expect(screen.getByTestId('header-actions')).toBeInTheDocument();
    expect(screen.getByTestId('scene-slot')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Layout comparison' })).toBeInTheDocument();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('recalculates 300 ms after the last valid edit, and not while inputs are invalid', async () => {
    const run = vi.fn((i: Inputs) => Promise.resolve(optimize(i)));
    const { user } = await renderApp(run);
    const leeway = screen.getByRole('textbox', { name: 'Box leeway' });
    await user.clear(leeway);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(run).toHaveBeenCalledTimes(1);

    await user.type(leeway, '1');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith(expect.objectContaining({ leeway: 1 }));
  });

  it('shows the error with a Retry button when the optimizer fails', async () => {
    const run = vi.fn<RunOptimizer>(() => Promise.reject(new Error('Optimizer worker failed')));
    const { user } = await renderApp(run);
    expect(screen.getByText('Optimizer worker failed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(run).toHaveBeenCalledTimes(2);
  });
});
