import { optimize } from '../engine/optimize';
import type { Inputs } from '../domain/types';

self.onmessage = (e: MessageEvent<{ id: number; inputs: Inputs }>) => {
  const { id, inputs } = e.data;
  try {
    self.postMessage({ id, result: optimize(inputs) });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
