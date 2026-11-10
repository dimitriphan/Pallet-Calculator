import type { ThreeEvent } from '@react-three/fiber';

/** Pointer travel (px) between press and release above which a click counts as a drag. */
const DRAG_TOLERANCE_PX = 4;

/** Stops the click reaching objects behind; true when it was a click rather than an orbit drag. */
export function claimClick(e: ThreeEvent<MouseEvent>): boolean {
  e.stopPropagation();
  return e.delta <= DRAG_TOLERANCE_PX;
}
