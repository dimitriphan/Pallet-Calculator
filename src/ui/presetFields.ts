import type { Inputs, Preset } from '../domain/types';

/** The part of the inputs a preset stores (everything but the product). */
export function presetFieldsOf(i: Inputs): Omit<Preset, 'id' | 'name' | 'advanced'> {
  return {
    pallet: { ...i.pallet },
    maxCarton: { ...i.maxCarton },
    leeway: i.leeway,
    wallThickness: i.wallThickness,
    overhang: i.overhang,
    targetQuantity: i.targetQuantity,
    rotationMode: i.rotationMode,
    customOrientations: [...i.customOrientations],
    keepCartonsUpright: i.keepCartonsUpright,
  };
}
