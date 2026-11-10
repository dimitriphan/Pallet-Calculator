import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import { singleFieldVariants } from '../domain/testSupport';
import type { Inputs, OptimizeResult, RankedLayout } from '../domain/types';
import { SupersededError, type RunOptimizer } from '../worker/optimizerClient';
import { createResultsStore, selectSelected, useResultsStore } from './resultsStore';

const layout = (n: number) => ({ id: n }) as unknown as RankedLayout;
const result = (n: number): OptimizeResult => ({
  layouts: [layout(n), layout(n + 1)],
  candidatesEvaluated: n,
  emptyReason: null,
  truncated: false,
});

function deferred() {
  let resolve!: (r: OptimizeResult) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<OptimizeResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const inputsA: Inputs = DEFAULT_INPUTS;
const inputsB: Inputs = { ...DEFAULT_INPUTS, leeway: 1 };

describe('resultsStore', () => {
  it('starts idle', () => {
    const s = createResultsStore(vi.fn()).getState();
    expect(s).toMatchObject({
      status: 'idle',
      result: null,
      stale: false,
      selectedIndex: 0,
      error: null,
    });
    expect(selectSelected(s)).toBeNull();
  });

  it('runs, then stores the result and resets selection', async () => {
    const reset = vi.fn();
    const run: RunOptimizer = async () => result(1);
    const store = createResultsStore(run, { onSelectionReset: reset });
    const p = store.getState().request(inputsA);
    expect(store.getState().status).toBe('running');
    await p;
    const s = store.getState();
    expect(s).toMatchObject({
      status: 'ready',
      stale: false,
      selectedIndex: 0,
      error: null,
      inputs: inputsA,
    });
    expect(s.result).toEqual(result(1));
    expect(selectSelected(s)).toEqual(layout(1));
    expect(reset).toHaveBeenCalled();
  });

  it('applies only the latest of overlapping requests', async () => {
    const first = deferred();
    const second = deferred();
    const run = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = createResultsStore(run);
    const p1 = store.getState().request(inputsA);
    const p2 = store.getState().request(inputsB);
    second.resolve(result(2));
    await p2;
    first.resolve(result(1));
    await p1;
    expect(store.getState().result).toEqual(result(2));
    expect(store.getState().inputs).toEqual(inputsB);
    expect(store.getState().status).toBe('ready');
  });

  it('ignores a stale rejection', async () => {
    const first = deferred();
    const second = deferred();
    const run = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = createResultsStore(run);
    const p1 = store.getState().request(inputsA);
    const p2 = store.getState().request(inputsB);
    second.resolve(result(2));
    await p2;
    first.reject(new Error('late'));
    await p1;
    expect(store.getState().status).toBe('ready');
    expect(store.getState().error).toBeNull();
  });

  it('never reports a superseded run as an error', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(result(1))
      .mockRejectedValueOnce(new SupersededError());
    const store = createResultsStore(run);
    await store.getState().request(inputsA);
    await store.getState().request(inputsB);
    expect(store.getState().status).not.toBe('error');
    expect(store.getState().error).toBeNull();
    expect(store.getState().result).toEqual(result(1));
  });

  it('keeps the previous result on rejection and sets error', async () => {
    const run = vi.fn().mockResolvedValueOnce(result(1)).mockRejectedValueOnce(new Error('boom'));
    const store = createResultsStore(run);
    await store.getState().request(inputsA);
    await store.getState().request(inputsB);
    const s = store.getState();
    expect(s.status).toBe('error');
    expect(s.error).toBe('boom');
    expect(s.result).toEqual(result(1));
  });

  it('marks the kept result out of date when a run fails, and a later success clears it', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(result(1))
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(result(3));
    const store = createResultsStore(run);
    await store.getState().request(inputsA);
    await store.getState().request(inputsB);
    expect(store.getState()).toMatchObject({ status: 'error', stale: true, result: result(1) });
    store.getState().retry();
    await vi.waitFor(() => expect(store.getState().status).toBe('ready'));
    expect(store.getState()).toMatchObject({ stale: false, result: result(3), inputs: inputsB });
  });

  it('does not mark anything out of date when the first run fails', async () => {
    const store = createResultsStore(vi.fn().mockRejectedValueOnce(new Error('boom')));
    await store.getState().request(inputsA);
    expect(store.getState()).toMatchObject({ status: 'error', stale: false, result: null });
  });

  it('runs the optimizer again when any single input field changes', async () => {
    const variants = singleFieldVariants(DEFAULT_INPUTS);
    expect(variants.map((v) => v.path)).toContain('boxesPerCarton');
    expect(variants.map((v) => v.path)).toContain('product.height');
    for (const { path, inputs } of variants) {
      const run = vi.fn(async () => result(1));
      const store = createResultsStore(run);
      await store.getState().request(DEFAULT_INPUTS);
      await store.getState().request(structuredClone(DEFAULT_INPUTS));
      expect(run, `${path} unchanged`).toHaveBeenCalledTimes(1);
      await store.getState().request(inputs);
      expect(run, path).toHaveBeenCalledTimes(2);
    }
  });

  it('retry re-runs the last requested inputs', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(result(3));
    const store = createResultsStore(run);
    await store.getState().request(inputsB);
    store.getState().retry();
    await vi.waitFor(() => expect(store.getState().status).toBe('ready'));
    expect(run).toHaveBeenLastCalledWith(inputsB);
  });

  it('retry does nothing before any request', () => {
    const run = vi.fn();
    createResultsStore(run).getState().retry();
    expect(run).not.toHaveBeenCalled();
  });

  it('select ignores out-of-range indexes and clears scene selection otherwise', async () => {
    const reset = vi.fn();
    const store = createResultsStore(async () => result(1), { onSelectionReset: reset });
    await store.getState().request(inputsA);
    reset.mockClear();
    store.getState().select(99);
    store.getState().select(-1);
    expect(store.getState().selectedIndex).toBe(0);
    expect(reset).not.toHaveBeenCalled();
    store.getState().select(1);
    expect(store.getState().selectedIndex).toBe(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('markStale flags a ready result', async () => {
    const store = createResultsStore(async () => result(1));
    await store.getState().request(inputsA);
    store.getState().markStale();
    expect(store.getState().stale).toBe(true);
  });

  it('restore sets ready without running', () => {
    const run = vi.fn();
    const store = createResultsStore(run);
    store.getState().restore(inputsA, result(1), 1);
    expect(run).not.toHaveBeenCalled();
    expect(store.getState()).toMatchObject({
      status: 'ready',
      stale: false,
      selectedIndex: 1,
      inputs: inputsA,
    });
  });

  it('restore clamps a saved selection to the layouts it has', () => {
    const store = createResultsStore(vi.fn());
    store.getState().restore(inputsA, result(1), 7);
    expect(store.getState().selectedIndex).toBe(1);
    store.getState().restore(inputsA, result(1), -3);
    expect(store.getState().selectedIndex).toBe(0);
    store.getState().restore(inputsA, { ...result(1), layouts: [] }, 4);
    expect(store.getState().selectedIndex).toBe(0);
  });

  it('restore supersedes a request still in flight', async () => {
    const d = deferred();
    const store = createResultsStore(() => d.promise);
    const p = store.getState().request(inputsA);
    store.getState().restore(inputsB, result(5), 0);
    d.resolve(result(1));
    await p;
    expect(store.getState().result).toEqual(result(5));
  });

  it('keeps stale when markStale is called during a run, and stores the result', async () => {
    const d = deferred();
    const store = createResultsStore(
      vi.fn().mockResolvedValueOnce(result(1)).mockReturnValueOnce(d.promise),
    );
    await store.getState().request(inputsA);
    const p = store.getState().request(inputsB);
    store.getState().markStale();
    d.resolve(result(2));
    await p;
    expect(store.getState()).toMatchObject({ status: 'ready', stale: true, inputs: inputsB });
    expect(store.getState().result).toEqual(result(2));
  });

  it('a new request clears the stale mark', async () => {
    const d = deferred();
    const store = createResultsStore(
      vi
        .fn()
        .mockResolvedValueOnce(result(1))
        .mockReturnValueOnce(d.promise)
        .mockResolvedValueOnce(result(3)),
    );
    await store.getState().request(inputsA);
    const p = store.getState().request(inputsB);
    store.getState().markStale();
    await store.getState().request({ ...inputsB, leeway: 7 });
    d.resolve(result(2));
    await p;
    expect(store.getState().stale).toBe(false);
  });

  it('markStale does nothing without a result', () => {
    const store = createResultsStore(vi.fn());
    store.getState().markStale();
    expect(store.getState().stale).toBe(false);
  });

  it('skips the runner for unchanged inputs and clears stale', async () => {
    const run = vi.fn().mockResolvedValue(result(1));
    const store = createResultsStore(run);
    await store.getState().request(inputsA);
    store.getState().markStale();
    await store.getState().request(structuredClone(inputsA));
    expect(run).toHaveBeenCalledTimes(1);
    expect(store.getState().stale).toBe(false);
  });

  it('re-runs when only boxesPerCarton differs, and skips when it is equal', async () => {
    const run = vi.fn().mockResolvedValue(result(1));
    const store = createResultsStore(run);
    const six: Inputs = { ...DEFAULT_INPUTS, boxesPerCarton: 6 };
    await store.getState().request(six);
    await store.getState().request({ ...six });
    expect(run).toHaveBeenCalledTimes(1);
    await store.getState().request(DEFAULT_INPUTS);
    expect(run).toHaveBeenCalledTimes(2);
    await store.getState().request({ ...six, boxesPerCarton: 7 });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('retry bypasses the unchanged-inputs short-circuit', async () => {
    const run = vi.fn().mockResolvedValue(result(1));
    const store = createResultsStore(run);
    await store.getState().request(inputsA);
    store.getState().retry();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it('shares an in-flight run for equal inputs and clears the stale mark', async () => {
    const d = deferred();
    const run = vi.fn().mockResolvedValueOnce(result(1)).mockReturnValueOnce(d.promise);
    const store = createResultsStore(run);
    await store.getState().request(inputsA);
    const p1 = store.getState().request(inputsB);
    store.getState().markStale();
    const p2 = store.getState().request(structuredClone(inputsB));
    expect(run).toHaveBeenCalledTimes(2);
    d.resolve(result(2));
    await Promise.all([p1, p2]);
    expect(store.getState().stale).toBe(false);
    expect(store.getState().result).toEqual(result(2));
  });

  it('exports a default hook', () => {
    expect(useResultsStore.getState().status).toBe('idle');
  });
});
