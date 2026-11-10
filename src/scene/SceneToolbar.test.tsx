import { render, screen } from '@testing-library/react';
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

  it('refuses to draw more than 200,000 products individually', () => {
    renderToolbar(914000);
    expect(screen.getByText('Too many boxes to draw individually (914,000).')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show anyway' })).not.toBeInTheDocument();
  });
});
