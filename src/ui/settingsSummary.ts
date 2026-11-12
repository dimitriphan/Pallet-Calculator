import type { Inputs } from '../domain/types';
import { fmtCount, lengthText, weightText, type Unit } from './format';
import { MIN_STABILITY_LABEL } from './minStability';

function rotationPhrase(i: Inputs): string {
  switch (i.rotationMode) {
    case 'full':
      return 'fully rotatable';
    case 'upright':
      return 'product kept upright';
    case 'noSide':
      return 'no side rotation';
    case 'custom':
      return `custom orientations (${i.customOrientations.length ? i.customOrientations.join(', ') : 'none'})`;
  }
}

/** One plain sentence naming the settings that shaped the result, in `unit` (lb or kg for weights). */
export function settingsSummary(i: Inputs, unit: Unit = 'in'): string {
  const parts = [
    `${lengthText(i.leeway, unit)} leeway`,
    `${lengthText(i.wallThickness, unit)} carton walls`,
    i.overhang > 0 ? `${lengthText(i.overhang, unit)} overhang` : 'no overhang',
    rotationPhrase(i),
  ];
  if (i.keepCartonsUpright) parts.push('cartons kept upright');
  if (i.targetQuantity !== null) parts.push(`target ${fmtCount(i.targetQuantity)} boxes`);
  // The box weight and maximum show in both views; these two only matter once weight is used.
  if (i.weights.productBox !== null) {
    parts.push(`${weightText(i.weights.pallet, unit)} pallet`);
    if (i.weights.emptyCarton > 0)
      parts.push(`${weightText(i.weights.emptyCarton, unit)} per empty carton`);
  }
  // Auto is how the tool has always worked; only a minimum that leaves layouts out is named.
  if (i.minStability !== 'auto')
    parts.push(`minimum stability ${MIN_STABILITY_LABEL[i.minStability]}`);
  return `Using ${parts.join(', ')}.`;
}
