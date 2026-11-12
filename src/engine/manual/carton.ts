/**
 * Designing a carton by hand (spec 6.2a): how many boxes lie along the carton's length, width
 * and height, and which way the boxes face. The carton itself comes from the same carton-size
 * function the search uses, so its sizes, weight and fill cannot differ from a calculated one.
 * Pure: inches and pounds, no React.
 */
import type {
  CartonCandidate,
  Dims,
  Inputs,
  OrientationCode,
  ProductAxis,
} from '../../domain/types';
import { cartonOfCounts } from '../packing/cartons';
import { productSize, usableFootprint, usableHeight } from '../packing/geometry';
import { allowedVerticalAxes } from '../packing/rotation';
import { footprintAxes } from '../packing/stacking';
import { fitsWithin } from '../packing/tolerance';

/** One of the carton's own three directions. */
export type CartonSide = keyof Dims;

/**
 * Which face of the carton rests on the pallet: its 'base' (length × width, the carton's
 * height upright, as designed), its 'side' (length × height, the carton's width upright) or
 * its 'end' (width × height, the carton's length upright).
 */
export type SideDown = 'base' | 'side' | 'end';

/**
 * A carton as the user designs it. `facing` says which box dimension lies along the carton's
 * length, width and height, in that order: 'WLH' is the box's width along the carton's length,
 * its length along the carton's width and its height upright in the carton.
 */
export interface CartonDesign {
  /** Boxes along the carton's length, width and height; whole numbers, each at least 1. */
  counts: Record<CartonSide, number>;
  facing: OrientationCode;
  sideDown: SideDown;
}

const SIDES: CartonSide[] = ['length', 'width', 'height'];
const FACINGS: OrientationCode[] = ['LWH', 'WLH', 'LHW', 'HLW', 'WHL', 'HWL'];
const UPRIGHT_SIDE: Record<SideDown, CartonSide> = { base: 'height', side: 'width', end: 'length' };

/** The box dimension that lies along one of the carton's directions. */
export function boxAxisAlong(facing: OrientationCode, side: CartonSide): ProductAxis {
  return facing[SIDES.indexOf(side)] as ProductAxis;
}

/**
 * The box dimension that points up when the carton is on the pallet: the layer's `vertical`.
 * It follows from the facing and from which carton face is down.
 */
export function verticalAxis(design: Pick<CartonDesign, 'facing' | 'sideDown'>): ProductAxis {
  return boxAxisAlong(design.facing, UPRIGHT_SIDE[design.sideDown]);
}

/**
 * The carton for a design under the current product, leeway and wall thickness: an ordinary
 * CartonCandidate, deep-equal to the calculated carton with the same boxes along each box
 * dimension. Which face is down does not change the carton.
 */
export function designCarton(
  design: Pick<CartonDesign, 'counts' | 'facing'>,
  inputs: Inputs,
): CartonCandidate {
  const counts = { L: 1, W: 1, H: 1 };
  for (const side of SIDES) counts[boxAxisAlong(design.facing, side)] = design.counts[side];
  return cartonOfCounts(counts, productSize(inputs), inputs.leeway, inputs.wallThickness);
}

/**
 * The design of a calculated carton standing with `vertical` up: the carton's height is that
 * box dimension, its length the longer of the other two (the first on a tie), its base down.
 * `designCarton` of the result gives the carton back exactly.
 */
export function designOf(carton: CartonCandidate, vertical: ProductAxis): CartonDesign {
  const [fa, fb] = footprintAxes(vertical);
  const [along, across] = carton.outer[fb] > carton.outer[fa] ? [fb, fa] : [fa, fb];
  return {
    counts: {
      length: carton.counts[along],
      width: carton.counts[across],
      height: carton.counts[vertical],
    },
    facing: `${along}${across}${vertical}` as OrientationCode,
    sideDown: 'base',
  };
}

/** A carton size (inner or outer) along the carton's own length, width and height. */
export function designedSize(
  design: Pick<CartonDesign, 'facing'>,
  carton: CartonCandidate,
  which: 'inner' | 'outer',
): Dims {
  return {
    length: carton[which][boxAxisAlong(design.facing, 'length')],
    width: carton[which][boxAxisAlong(design.facing, 'width')],
    height: carton[which][boxAxisAlong(design.facing, 'height')],
  };
}

/** One full carton's weight in pounds, or null when the box weight is blank. */
export function cartonWeight(carton: CartonCandidate, inputs: Inputs): number | null {
  const box = inputs.weights.productBox;
  return box === null ? null : inputs.weights.emptyCarton + carton.boxesPerCarton * box;
}

const same = (p: number, q: number) => fitsWithin(p, q) && fitsWithin(q, p);

/**
 * The facings that really differ for a product, in a fixed order: up to six, fewer when two
 * of its sides are equal (two facings that put equal sizes along the carton's length, width
 * and height are one facing; the first is kept), one for a cube.
 */
export function facingsFor(product: Dims): OrientationCode[] {
  const size: Record<ProductAxis, number> = {
    L: product.length,
    W: product.width,
    H: product.height,
  };
  const kept: OrientationCode[] = [];
  for (const f of FACINGS) {
    const twin = kept.some((k) =>
      [0, 1, 2].every((n) => same(size[k[n] as ProductAxis], size[f[n] as ProductAxis])),
    );
    if (!twin) kept.push(f);
  }
  return kept;
}

/**
 * The facing kept by `facingsFor` that a facing is the same as for this product (itself when
 * it is one of them), so a stored facing can be matched to the buttons shown.
 */
export function canonicalFacing(facing: OrientationCode, product: Dims): OrientationCode {
  const size: Record<ProductAxis, number> = {
    L: product.length,
    W: product.width,
    H: product.height,
  };
  return (
    facingsFor(product).find((k) =>
      [0, 1, 2].every((n) => same(size[k[n] as ProductAxis], size[facing[n] as ProductAxis])),
    ) ?? facing
  );
}

/** How a carton stands on the pallet for one choice of the face that is down. */
export interface SideDownChoice {
  sideDown: SideDown;
  /** The box dimension pointing up (the layer's `vertical`). */
  vertical: ProductAxis;
  /** The carton's outer base on the pallet and its height as it stands, in inches. */
  base: { a: number; b: number };
  height: number;
}

/** The three ways a designed carton can stand: on its base (as designed), its side or its end. */
export function sideDownChoices(
  design: Pick<CartonDesign, 'facing'>,
  carton: CartonCandidate,
): SideDownChoice[] {
  return (['base', 'side', 'end'] as const).map((sideDown) => {
    const vertical = verticalAxis({ facing: design.facing, sideDown });
    const [fa, fb] = footprintAxes(vertical);
    return {
      sideDown,
      vertical,
      base: { a: carton.outer[fa], b: carton.outer[fb] },
      height: carton.outer[vertical],
    };
  });
}

/** Which of the carton's sides, longest first, is over the same side of the maximum carton. */
export type RankedSide = 'longest' | 'middle' | 'shortest';

export interface OverMaximumSide {
  side: RankedSide;
  /** The carton's outer size on that side, the maximum for it, and the excess; inches. */
  size: number;
  max: number;
  by: number;
}

/** What is wrong with a carton standing on the pallet; all clear when nothing is. */
export interface CartonFlags {
  /**
   * The sides over the maximum carton size, by the rule the search uses: the carton's sides,
   * longest first, against the maximum carton's sides, longest first. Empty when it fits.
   * Allowed, and flagged.
   */
  overMaximum: OverMaximumSide[];
  /** The base fits inside the usable footprint neither way round. Cannot be saved. */
  cannotFitFootprint: boolean;
  /** Inches the standing carton is taller than the usable height, or null. Cannot be saved. */
  overHeightBy: number | null;
  /**
   * The box dimension pointing up is one the rotation inputs would not let the search use.
   * Permitted for a hand-made design, and noted.
   */
  orientationNotAllowed: boolean;
  /** Why the design cannot go on to the layer step or be saved, or null when it can. */
  blocked: 'footprint' | 'height' | null;
}

const RANKS: RankedSide[] = ['longest', 'middle', 'shortest'];

/**
 * The flags of a carton standing with `vertical` up under the inputs' maximum carton size,
 * pallet, overhang, height limit and rotation rule.
 */
export function cartonFlags(
  carton: CartonCandidate,
  vertical: ProductAxis,
  inputs: Inputs,
): CartonFlags {
  const desc = (v: number[]) => [...v].sort((p, q) => q - p);
  const sizes = desc([carton.outer.L, carton.outer.W, carton.outer.H]);
  const maxes = desc([inputs.maxCarton.length, inputs.maxCarton.width, inputs.maxCarton.height]);
  const overMaximum: OverMaximumSide[] = [];
  sizes.forEach((size, k) => {
    const max = maxes[k] as number;
    if (!fitsWithin(size, max)) {
      overMaximum.push({ side: RANKS[k] as RankedSide, size, max, by: size - max });
    }
  });

  const { x, y } = usableFootprint(inputs);
  const [fa, fb] = footprintAxes(vertical);
  const a = carton.outer[fa];
  const b = carton.outer[fb];
  const fits = (fitsWithin(a, x) && fitsWithin(b, y)) || (fitsWithin(b, x) && fitsWithin(a, y));
  const limit = usableHeight(inputs);
  const height = carton.outer[vertical];
  const overHeightBy = fitsWithin(height, limit) ? null : height - limit;
  return {
    overMaximum,
    cannotFitFootprint: !fits,
    overHeightBy,
    orientationNotAllowed: !allowedVerticalAxes(inputs).includes(vertical),
    blocked: !fits ? 'footprint' : overHeightBy !== null ? 'height' : null,
  };
}

/** The flags of a design under the inputs: `cartonFlags` of its carton as it stands. */
export function designFlags(design: CartonDesign, inputs: Inputs): CartonFlags {
  return cartonFlags(designCarton(design, inputs), verticalAxis(design), inputs);
}
