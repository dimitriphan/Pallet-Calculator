import { DEFAULT_INPUTS } from '../domain/constants';
import type { Preset } from '../domain/types';

function fromDefaults(id: string, name: string, pallet: Preset['pallet']): Preset {
  const d = DEFAULT_INPUTS;
  return {
    id,
    name,
    pallet,
    maxCarton: { ...d.maxCarton },
    leeway: d.leeway,
    wallThickness: d.wallThickness,
    overhang: d.overhang,
    targetQuantity: d.targetQuantity,
    boxesPerCarton: null,
    rotationMode: d.rotationMode,
    customOrientations: [...d.customOrientations],
    keepCartonsUpright: d.keepCartonsUpright,
    weights: {
      maxPallet: d.weights.maxPallet,
      emptyCarton: d.weights.emptyCarton,
      pallet: d.weights.pallet,
    },
    minStability: d.minStability,
    layerPattern: d.layerPattern,
    advanced: {},
  };
}

export const samplePresets: Preset[] = [
  fromDefaults('sample-spec-example', 'Spec example 50 × 42 × 72', { ...DEFAULT_INPUTS.pallet }),
  fromDefaults('sample-standard-gma', 'Standard GMA 48 × 40 × 72', {
    length: 48,
    width: 40,
    height: 72,
  }),
];
