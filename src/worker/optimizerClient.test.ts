import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import { optimize } from '../engine/optimize';
import { createWorkerRunner } from './optimizerClient';

class FakeWorker {
  static instances: FakeWorker[] = [];
  posted: { id: number; inputs: unknown }[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(m: { id: number; inputs: unknown }) {
    this.posted.push(m);
  }
  reply(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

describe('createWorkerRunner', () => {
  it('falls back to optimize() when Worker is undefined', async () => {
    vi.stubGlobal('Worker', undefined);
    const run = createWorkerRunner();
    const result = await run(DEFAULT_INPUTS);
    expect(result).toEqual(optimize(DEFAULT_INPUTS));
  });

  it('resolves by id and ignores unknown ids', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const run = createWorkerRunner();
    const p = run(DEFAULT_INPUTS);
    const w = FakeWorker.instances[0]!;
    expect(FakeWorker.instances).toHaveLength(1);
    const { id } = w.posted[0]!;
    w.reply({ id: id + 100, result: 'wrong' });
    const out = { layouts: [], candidatesEvaluated: 0, truncated: false };
    w.reply({ id, result: out });
    await expect(p).resolves.toBe(out);
  });

  it('routes overlapping requests to their own promises', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const run = createWorkerRunner();
    const p1 = run(DEFAULT_INPUTS);
    const p2 = run(DEFAULT_INPUTS);
    const w = FakeWorker.instances[0]!;
    expect(FakeWorker.instances).toHaveLength(1);
    w.reply({ id: w.posted[1]!.id, result: 'two' });
    w.reply({ id: w.posted[0]!.id, result: 'one' });
    await expect(p1).resolves.toBe('one');
    await expect(p2).resolves.toBe('two');
  });

  it('rejects when the worker posts an error', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const p = createWorkerRunner()(DEFAULT_INPUTS);
    const w = FakeWorker.instances[0]!;
    w.reply({ id: w.posted[0]!.id, error: 'bad' });
    await expect(p).rejects.toThrow('bad');
  });

  it('rejects all pending requests on worker onerror', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const run = createWorkerRunner();
    const p1 = run(DEFAULT_INPUTS);
    const p2 = run(DEFAULT_INPUTS);
    FakeWorker.instances[0]!.onerror?.({ message: 'crash' } as ErrorEvent);
    await expect(p1).rejects.toThrow('crash');
    await expect(p2).rejects.toThrow('crash');
  });
});
