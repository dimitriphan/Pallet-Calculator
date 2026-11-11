import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createSceneStore } from '../store/sceneStore';
import { StoreProvider } from '../ui/StoreContext';
import { makeStores } from '../ui/testUtils';
import { SceneToolbar } from './SceneToolbar';

function renderToolbar(totalProducts: number) {
  const scene = createSceneStore();
  scene.getState().toggle('showProducts');
  render(
    <StoreProvider stores={{ ...makeStores(), scene }}>
      <SceneToolbar totalProducts={totalProducts} />
    </StoreProvider>,
  );
  return scene;
}

describe('SceneToolbar', () => {
  it('offers "Show anyway" above the product threshold', () => {
    renderToolbar(6000);
    expect(screen.getByText(/Products hidden: this layout has 6,000 boxes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show anyway' })).toBeInTheDocument();
  });

  it('offers only Products, Measurements and Reset view in Basic mode', () => {
    render(
      <StoreProvider stores={makeStores(undefined, { viewMode: 'basic' })}>
        <SceneToolbar totalProducts={260} />
      </StoreProvider>,
    );
    expect(screen.getAllByRole('checkbox').map((c) => c.parentElement?.textContent)).toEqual([
      'Products',
      'Measurements',
      'Unused space',
    ]);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Reset view']);
  });

  it('offers an unchecked "Unused space" checkbox that toggles the scene store', async () => {
    const scene = renderToolbar(260);
    const box = screen.getByRole('checkbox', { name: 'Unused space' });
    expect(box).not.toBeChecked();
    expect(box.parentElement).toHaveClass('focus-ticks-within');
    await userEvent.click(box);
    expect(scene.getState().unusedSpace).toBe(true);
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(scene.getState().unusedSpace).toBe(false);
  });

  it('lists every view toggle in Full mode, Unused space last', () => {
    renderToolbar(260);
    expect(screen.getAllByRole('checkbox').map((c) => c.parentElement?.textContent)).toEqual([
      'Products',
      'Cartons',
      'Labels',
      'Envelope',
      'Grid',
      'Wireframe',
      'Measurements',
      'Unused space',
    ]);
  });

  it('refuses to draw more than 200,000 products individually', () => {
    renderToolbar(914000);
    expect(screen.getByText('Too many boxes to draw individually (914,000).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show anyway' })).not.toBeInTheDocument();
  });
});
