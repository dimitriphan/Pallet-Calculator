/**
 * How a box facing is named and drawn. A facing says which box dimension lies along the
 * carton's length, width and height, in that order (see CartonDesign).
 */
import type { Dims, OrientationCode, ProductAxis } from '../../domain/types';

const DIM: Record<ProductAxis, string> = { L: 'length', W: 'width', H: 'height' };
const ORDER = 'LWH';

const axis = (facing: OrientationCode, n: 0 | 1 | 2) => facing[n] as ProductAxis;
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The box dimension that stands along the carton's height. */
export function uprightDimension(facing: OrientationCode): string {
  return DIM[axis(facing, 2)];
}

/**
 * Whether the box is turned a quarter turn about its upright dimension: the other two box
 * dimensions lie the other way round from their usual order (length before width before height).
 */
export function isQuarterTurned(facing: OrientationCode): boolean {
  return ORDER.indexOf(axis(facing, 0)) > ORDER.indexOf(axis(facing, 1));
}

/** The two lines under a facing's picture: "Height up", then "Straight" or "Quarter turn". */
export function facingCaption(facing: OrientationCode): { upright: string; turn: string } {
  return {
    upright: `${capital(uprightDimension(facing))} up`,
    turn: isQuarterTurned(facing) ? 'Quarter turn' : 'Straight',
  };
}

/** A facing's accessible name: which box dimension is upright and how the box is turned. */
export function facingName(facing: OrientationCode): string {
  const turn = isQuarterTurned(facing) ? 'turned a quarter turn' : 'not turned';
  return `Box ${uprightDimension(facing)} up, ${turn}: box ${DIM[axis(facing, 0)]} along the carton's length, box ${DIM[axis(facing, 1)]} along the carton's width`;
}

/** The box's size along the carton's length, width and height for a facing. */
export function facedSize(facing: OrientationCode, product: Dims): [number, number, number] {
  const size: Record<ProductAxis, number> = {
    L: product.length,
    W: product.width,
    H: product.height,
  };
  return [size[axis(facing, 0)], size[axis(facing, 1)], size[axis(facing, 2)]];
}

/** Which of the picture's three visible faces is the box's own top (the face across its height). */
export function topFace(facing: OrientationCode): 'x' | 'y' | 'z' {
  return (['x', 'y', 'z'] as const)[facing.indexOf('H')] ?? 'z';
}
