import type { Unit } from '../engine/units/units';
import { useInputs } from './StoreContext';

/** The unit the workspace is shown in. Kept apart from format.ts so the formatters stay free of stores. */
export function useUnit(): Unit {
  return useInputs((s) => s.unit);
}
