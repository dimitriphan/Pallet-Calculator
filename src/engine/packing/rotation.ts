import type { Inputs, ProductAxis } from '../../domain/types';

const AXES: ProductAxis[] = ['L', 'W', 'H'];

/** Product axes that may point straight up, in L, W, H order. */
export function allowedVerticalAxes(i: Inputs): ProductAxis[] {
  switch (i.rotationMode) {
    case 'full':
      return [...AXES];
    case 'upright':
      return ['H'];
    case 'noSide':
      return ['L', 'H'];
    case 'custom': {
      const vertical = new Set(i.customOrientations.map((o) => o[2] as ProductAxis));
      return AXES.filter((a) => vertical.has(a));
    }
  }
}
