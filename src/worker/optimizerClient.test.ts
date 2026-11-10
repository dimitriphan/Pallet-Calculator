import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INPUTS } from '../domain/constants';
import { optimize } from '../engine/optimize';
import { createWorkerRunner, isSuperseded } from './optimizerClient';

class FakeWorker {
  static instances: FakeWorker[] = [];
  posted: { id: number; inputs: unknown }[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminated = false;
  terminate() {
    this.terminated = true;
  }
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

  it('cancels a pending run when a newer one starts', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const run = createWorkerRunner();
    const p1 = run(DEFAULT_INPUTS);
    const p1Settled = p1.catch((e: unknown) => e);
    const p2 = run(DEFAULT_INPUTS);
    expect(FakeWorker.instances).toHaveLength(2);
    const [w1, w2] = FakeWorker.instances as [FakeWorker, FakeWorker];
    expect(w1.terminated).toBe(true);
    expect(w2.terminated).toBe(false);
    const err = await p1Settled;
    expect(err).toBeInstanceOf(Error);
    expect(isSuperseded(err)).toBe(true);
    // Late events from the cancelled worker change nothing.
    w1.reply({ id: w1.posted[0]!.id, result: 'one' });
    w1.onerror?.({ message: 'late crash' } as ErrorEvent);
    w2.reply({ id: w2.posted[0]!.id, result: 'two' });
    await expect(p2).resolves.toBe('two');
  });

  it('keeps one worker for runs that do not overlap', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const run = createWorkerRunner();
    const p1 = run(DEFAULT_INPUTS);
    const w = FakeWorker.instances[0]!;
    w.reply({ id: w.posted[0]!.id, result: 'one' });
    await expect(p1).resolves.toBe('one');
    const p2 = run(DEFAULT_INPUTS);
    expect(FakeWorker.instances).toHaveLength(1);
    w.reply({ id: w.posted[1]!.id, result: 'two' });
    await expect(p2).resolves.toBe('two');
  });

  it('does not report other errors as superseded', () => {
    expect(isSuperseded(new Error('Optimizer failed'))).toBe(false);
    expect(isSuperseded('x')).toBe(false);
  });

  it('rejects when the worker posts an error', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const p = createWorkerRunner()(DEFAULT_INPUTS);
    const w = FakeWorker.instances[0]!;
    w.reply({ id: w.posted[0]!.id, error: 'bad' });
    await expect(p).rejects.toThrow('bad');
  });

  it('rejects the pending request on worker onerror', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const run = createWorkerRunner();
    const p1 = run(DEFAULT_INPUTS);
    FakeWorker.instances[0]!.onerror?.({ message: 'crash' } as ErrorEvent);
    await expect(p1).rejects.toThrow('crash');
  });

  it('recreates the worker after an error', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const run = createWorkerRunner();
    const p1 = run(DEFAULT_INPUTS);
    FakeWorker.instances[0]!.onerror?.({ message: 'crash' } as ErrorEvent);
    await expect(p1).rejects.toThrow('crash');
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    const p2 = run(DEFAULT_INPUTS);
    expect(FakeWorker.instances).toHaveLength(2);
    const w = FakeWorker.instances[1]!;
    w.reply({ id: w.posted[0]!.id, result: 'ok' });
    await expect(p2).resolves.toBe('ok');
  });

  it('rejects pending requests on messageerror and recovers', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const run = createWorkerRunner();
    const p = run(DEFAULT_INPUTS);
    FakeWorker.instances[0]!.onmessageerror?.();
    await expect(p).rejects.toThrow();
    void run(DEFAULT_INPUTS);
    expect(FakeWorker.instances).toHaveLength(2);
  });
});
