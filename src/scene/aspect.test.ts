import { describe, expect, it } from 'vitest';
import { aspectChanged } from './aspect';

describe('aspectChanged', () => {
  it('ignores small changes', () => expect(aspectChanged(1.5, 1.6)).toBe(false));
  it('detects a wider canvas', () => expect(aspectChanged(1.5, 1.7)).toBe(true));
  it('detects a narrower canvas', () => expect(aspectChanged(1.5, 1.3)).toBe(true));
  it('is false for a zero aspect', () => expect(aspectChanged(0, 1.5)).toBe(false));
  it('is false for a non-finite aspect', () => expect(aspectChanged(NaN, 1)).toBe(false));
  it('honours a custom tolerance', () => expect(aspectChanged(1.5, 1.6, 0.01)).toBe(true));
});
