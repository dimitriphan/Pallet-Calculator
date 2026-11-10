import type { Inputs, OptimizeResult } from '../domain/types';
import { optimize } from '../engine/optimize';

export type RunOptimizer = (inputs: Inputs) => Promise<OptimizeResult>;

interface Reply {
  id: number;
  result?: OptimizeResult;
  error?: string;
}

/** Rejection reason for a run that was cancelled because a newer run started. */
export class SupersededError extends Error {
  constructor() {
    super('Superseded by a newer calculation');
    this.name = 'SupersededError';
  }
}

/** Whether `err` is the rejection of a run cancelled by a newer one (never shown to the user). */
export function isSuperseded(err: unknown): boolean {
  return err instanceof SupersededError;
}

interface Pending {
  resolve(result: OptimizeResult): void;
  reject(error: Error): void;
}

/**
 * Runs the optimizer in one lazily created module Worker, tagging each request with an id.
 * A run started while another is pending terminates that worker (a long search cannot be
 * interrupted from inside), rejects the older run with SupersededError and starts a fresh
 * worker. Without Worker support it calls optimize() directly.
 */
export function createWorkerRunner(): RunOptimizer {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const rejectAll = (error: () => Error) => {
    // Drop the worker so the next run starts a fresh one instead of posting to a dead thread.
    worker?.terminate();
    worker = null;
    const all = [...pending.values()];
    pending.clear();
    for (const p of all) p.reject(error());
  };
  const failAll = (message: string) => rejectAll(() => new Error(message));

  const ensureWorker = (): Worker => {
    if (worker) return worker;
    const w = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<Reply>) => {
      if (worker !== w) return; // a cancelled worker
      const { id, result, error } = e.data;
      const waiting = pending.get(id);
      if (!waiting) return;
      pending.delete(id);
      if (error !== undefined || !result) waiting.reject(new Error(error ?? 'Optimizer failed'));
      else waiting.resolve(result);
    };
    w.onerror = (e) => {
      if (worker === w) failAll(e.message || 'Optimizer worker failed');
    };
    w.onmessageerror = () => {
      if (worker === w) failAll('Optimizer reply could not be read');
    };
    worker = w;
    return w;
  };

  return (inputs) => {
    if (typeof Worker === 'undefined') {
      try {
        return Promise.resolve(optimize(inputs));
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
    if (pending.size > 0) rejectAll(() => new SupersededError());
    return new Promise<OptimizeResult>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      try {
        ensureWorker().postMessage({ id, inputs });
      } catch (err) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  };
}
