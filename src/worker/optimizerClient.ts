import type { Inputs, OptimizeResult } from '../domain/types';
import { optimize } from '../engine/optimize';

export type RunOptimizer = (inputs: Inputs) => Promise<OptimizeResult>;

interface Reply {
  id: number;
  result?: OptimizeResult;
  error?: string;
}

interface Pending {
  resolve(result: OptimizeResult): void;
  reject(error: Error): void;
}

/**
 * Runs the optimizer in one lazily created module Worker, tagging each request with an id.
 * Without Worker support it calls optimize() directly.
 */
export function createWorkerRunner(): RunOptimizer {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  const failAll = (message: string) => {
    const all = [...pending.values()];
    pending.clear();
    for (const p of all) p.reject(new Error(message));
  };

  const ensureWorker = (): Worker => {
    if (worker) return worker;
    const w = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<Reply>) => {
      const { id, result, error } = e.data;
      const waiting = pending.get(id);
      if (!waiting) return;
      pending.delete(id);
      if (error !== undefined || !result) waiting.reject(new Error(error ?? 'Optimizer failed'));
      else waiting.resolve(result);
    };
    w.onerror = (e) => failAll(e.message || 'Optimizer worker failed');
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
