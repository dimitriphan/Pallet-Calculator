/**
 * Test support: one Inputs per leaf field of `base` (nested size fields included), each
 * differing from `base` in that field alone. Iterates the object's own keys, so a field
 * added to Inputs is covered without editing this list.
 */
import type { Inputs } from './types';

function changed(value: unknown, key: string): unknown {
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'boolean') return !value;
  if (value === null) return 3;
  if (Array.isArray(value)) return value.length === 0 ? ['LWH'] : [];
  if (key === 'rotationMode') return value === 'custom' ? 'full' : 'custom';
  if (key === 'minStability') return value === 'good' ? 'auto' : 'good';
  throw new Error(`No variant for ${key}: ${String(value)}`);
}

export function singleFieldVariants(base: Inputs): { path: string; inputs: Inputs }[] {
  const out: { path: string; inputs: Inputs }[] = [];
  for (const [key, value] of Object.entries(base)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [sub, v] of Object.entries(value as Record<string, unknown>))
        out.push({
          path: `${key}.${sub}`,
          inputs: { ...base, [key]: { ...value, [sub]: changed(v, sub) } } as Inputs,
        });
    } else {
      out.push({ path: key, inputs: { ...base, [key]: changed(value, key) } as Inputs });
    }
  }
  return out;
}
