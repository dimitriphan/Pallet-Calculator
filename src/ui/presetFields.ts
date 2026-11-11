import type { Inputs, PresetFields } from '../domain/types';

/** The part of the inputs a preset stores (everything but the product and its box weight). */
export function presetFieldsOf(i: Inputs): PresetFields {
  return {
    pallet: { ...i.pallet },
    maxCarton: { ...i.maxCarton },
    leeway: i.leeway,
    wallThickness: i.wallThickness,
    overhang: i.overhang,
    targetQuantity: i.targetQuantity,
    boxesPerCarton: i.boxesPerCarton,
    rotationMode: i.rotationMode,
    customOrientations: [...i.customOrientations],
    keepCartonsUpright: i.keepCartonsUpright,
    weights: {
      maxPallet: i.weights.maxPallet,
      emptyCarton: i.weights.emptyCarton,
      pallet: i.weights.pallet,
    },
  };
}
