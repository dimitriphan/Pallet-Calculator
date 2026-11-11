import { describe, expect, it } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import { optimize } from '../engine/optimize';
import { useResultsStore } from './resultsStore';
import { createSceneStore, useSceneStore } from './sceneStore';

describe('sceneStore', () => {
  it('has the specified defaults', () => {
    const s = createSceneStore().getState();
    expect(s).toMatchObject({
      showProducts: false,
      showCartons: true,
      showLabels: false,
      showEnvelope: true,
      showGrid: true,
      showWireframe: false,
      showMeasurements: false,
      forceProducts: false,
      unusedSpace: false,
      selection: null,
      cameraCommand: null,
      captureViews: null,
    });
  });

  it('toggles keys', () => {
    const store = createSceneStore();
    store.getState().toggle('showGrid');
    store.getState().toggle('forceProducts');
    expect(store.getState().showGrid).toBe(false);
    expect(store.getState().forceProducts).toBe(true);
  });

  it('sets selection and the capture hook', () => {
    const store = createSceneStore();
    store.getState().setSelection({ kind: 'pallet' });
    expect(store.getState().selection).toEqual({ kind: 'pallet' });
    const fn = () => ({ current: 'a', top: 'b', side: 'c' });
    store.getState().setCaptureViews(fn);
    expect(store.getState().captureViews).toBe(fn);
  });

  it('issues camera commands with increasing nonces', () => {
    const store = createSceneStore();
    store.getState().resetView();
    const a = store.getState().cameraCommand;
    store.getState().resetView();
    const b = store.getState().cameraCommand;
    store.getState().focusSelection();
    const c = store.getState().cameraCommand;
    expect(a?.type).toBe('reset');
    expect(b!.nonce).toBeGreaterThan(a!.nonce);
    expect(c).toMatchObject({ type: 'focus' });
    expect(c!.nonce).toBeGreaterThan(b!.nonce);
  });

  it('resetForLayout clears the selection and "Show anyway"', () => {
    const store = createSceneStore();
    store.getState().toggle('forceProducts');
    store.getState().setSelection({ kind: 'pallet' });
    store.getState().resetForLayout();
    expect(store.getState()).toMatchObject({ forceProducts: false, selection: null });
  });

  it('toggles the unused space and keeps it for a new layout', () => {
    const store = createSceneStore();
    store.getState().toggle('unusedSpace');
    expect(store.getState().unusedSpace).toBe(true);
    store.getState().resetForLayout();
    expect(store.getState().unusedSpace).toBe(true);
    store.getState().toggle('unusedSpace');
    expect(store.getState().unusedSpace).toBe(false);
  });

  it('the app resets "Show anyway" whenever the results store resets the selection', () => {
    useSceneStore.getState().toggle('forceProducts');
    expect(useSceneStore.getState().forceProducts).toBe(true);
    useResultsStore.getState().restore(DEFAULT_INPUTS, optimize(DEFAULT_INPUTS), 0);
    expect(useSceneStore.getState().forceProducts).toBe(false);
  });

  it('exports a default hook', () => {
    expect(useSceneStore.getState().showCartons).toBe(true);
  });
});
