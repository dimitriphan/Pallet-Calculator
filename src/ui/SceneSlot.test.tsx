import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { SCENE_LOAD_FAILED, SceneSlot } from '../scene/SceneSlot';
import { renderApp, summaryTile } from './testUtils';

const sceneState = vi.hoisted(() => ({ fail: true }));

// Pretend WebGL works so the slot tries to load the (mocked) scene.
vi.mock('../scene/webgl', () => ({
  WEBGL_UNAVAILABLE: '3D view is unavailable in this browser. All numbers above remain accurate.',
  webglAvailable: () => true,
}));

vi.mock('../scene/PalletScene', () => ({
  default: function PalletScene() {
    if (sceneState.fail) throw new Error('scene exploded');
    return <p>3D scene ready</p>;
  },
}));

let consoleError: MockInstance;
// React (dev) re-dispatches caught render errors as window error events, which jsdom prints.
const swallow = (e: ErrorEvent) => e.preventDefault();
beforeEach(() => {
  sceneState.fail = true;
  // React and the boundary log the expected errors; keep the output clean in these tests only.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  window.addEventListener('error', swallow);
});
afterEach(() => {
  window.removeEventListener('error', swallow);
  consoleError.mockRestore();
});

describe('3D scene slot failures', () => {
  it('keeps the workspace mounted when the scene throws, and Retry loads it again', async () => {
    const { user } = await renderApp();
    expect(await screen.findByText(SCENE_LOAD_FAILED)).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inputs' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Production summary' })).toBeInTheDocument();
    expect(summaryTile('Total boxes per pallet')).toBe('260');
    expect(consoleError).toHaveBeenCalledWith('[3D scene]', expect.any(Error), expect.anything());

    sceneState.fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('3D scene ready')).toBeInTheDocument();
    expect(screen.queryByText(SCENE_LOAD_FAILED)).not.toBeInTheDocument();
  });

  it('shows the message when the scene chunk fails to load, and retries the import', async () => {
    const Ready = () => <p>3D scene ready</p>;
    const load = vi
      .fn<() => Promise<{ default: () => JSX.Element }>>()
      .mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'))
      .mockResolvedValue({ default: Ready });
    render(<SceneSlot load={load} />);
    expect(await screen.findByText(SCENE_LOAD_FAILED)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('3D scene ready')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
