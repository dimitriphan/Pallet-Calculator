import type { Inputs } from '../domain/types';
import { formatNumber } from '../engine/units/units';

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

/** One plain sentence naming the settings that shaped the result. */
export function settingsSummary(i: Inputs): string {
  const parts = [
    `${formatNumber(i.leeway)} in leeway`,
    `${formatNumber(i.wallThickness)} in carton walls`,
    i.overhang > 0 ? `${formatNumber(i.overhang)} in overhang` : 'no overhang',
    rotationPhrase(i),
  ];
  if (i.keepCartonsUpright) parts.push('cartons kept upright');
  if (i.targetQuantity !== null) parts.push(`target ${formatNumber(i.targetQuantity, 0)} boxes`);
  return `Using ${parts.join(', ')}.`;
}
