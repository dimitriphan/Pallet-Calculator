import type { Inputs } from '../domain/types';
import { fmtCount, lengthText, type Unit } from './format';

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

/** One plain sentence naming the settings that shaped the result, lengths in `unit`. */
export function settingsSummary(i: Inputs, unit: Unit = 'in'): string {
  const parts = [
    `${lengthText(i.leeway, unit)} leeway`,
    `${lengthText(i.wallThickness, unit)} carton walls`,
    i.overhang > 0 ? `${lengthText(i.overhang, unit)} overhang` : 'no overhang',
    rotationPhrase(i),
  ];
  if (i.keepCartonsUpright) parts.push('cartons kept upright');
  if (i.targetQuantity !== null) parts.push(`target ${fmtCount(i.targetQuantity)} boxes`);
  return `Using ${parts.join(', ')}.`;
}
