import { describe, expect, it } from 'vitest';
import { orthoFit, perspectiveFit, type Bounds } from './cameraFit';

const B: Bounds = { min: [-25, 0, -21], max: [25, 60, 21] };
const CENTRE: [number, number, number] = [0, 30, 0];

function inside(p: [number, number, number], b: Bounds): boolean {
  return p.every((v, k) => v >= b.min[k]! && v <= b.max[k]!);
}

describe('perspectiveFit', () => {
  it('targets the bounds centre and places the camera outside the bounds', () => {
    const fit = perspectiveFit(B, 40, 16 / 9);
    expect(fit.target).toEqual(CENTRE);
    expect(inside(fit.position, B)).toBe(false);
  });

  it('keeps the whole bounding sphere inside the narrower field of view', () => {
    for (const aspect of [0.5, 1, 2]) {
      const fit = perspectiveFit(B, 40, aspect);
      const d = Math.hypot(...fit.position.map((v, k) => v - fit.target[k]!));
      const radius = Math.hypot(50, 60, 42) / 2;
      const vHalf = (20 * Math.PI) / 180;
      const hHalf = Math.atan(Math.tan(vHalf) * aspect);
      expect(d * Math.sin(Math.min(vHalf, hHalf))).toBeGreaterThanOrEqual(radius);
    }
  });
});

describe('orthoFit', () => {
  it('top: looks straight down, frames length x width at the given aspect', () => {
    const fit = orthoFit(B, 'top', 3 / 2);
    expect((fit.right - fit.left) / (fit.top - fit.bottom)).toBeCloseTo(1.5, 12);
    expect(fit.right - fit.left).toBeGreaterThanOrEqual(50);
    expect(fit.top - fit.bottom).toBeGreaterThanOrEqual(42);
    expect(fit.position[0]).toBe(0);
    expect(fit.position[2]).toBe(0);
    expect(fit.position[1]).toBeGreaterThan(60);
    expect(fit.up).toEqual([0, 0, -1]);
    // Everything between the top of the load and the floor lies between near and far.
    expect(fit.near).toBeLessThanOrEqual(fit.position[1] - 60);
    expect(fit.far).toBeGreaterThanOrEqual(fit.position[1] - 0);
  });

  it('side: looks along +Z at the length x height face with height vertical', () => {
    const fit = orthoFit(B, 'side', 3 / 2);
    expect((fit.right - fit.left) / (fit.top - fit.bottom)).toBeCloseTo(1.5, 12);
    expect(fit.right - fit.left).toBeGreaterThanOrEqual(50);
    expect(fit.top - fit.bottom).toBeGreaterThanOrEqual(60);
    expect(fit.position[0]).toBe(0);
    expect(fit.position[1]).toBe(30);
    expect(fit.position[2]).toBeLessThan(-21);
    expect(fit.up).toEqual([0, 1, 0]);
    expect(fit.near).toBeLessThanOrEqual(-21 - fit.position[2]);
    expect(fit.far).toBeGreaterThanOrEqual(21 - fit.position[2]);
  });

  it('adds the margin on the limiting axis', () => {
    const fit = orthoFit(B, 'side', 3 / 2, 1.2);
    expect(fit.top - fit.bottom).toBeCloseTo(60 * 1.2, 12);
  });
});
