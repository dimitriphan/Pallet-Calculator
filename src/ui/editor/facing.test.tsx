import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { OrientationCode } from '../../domain/types';
import { facedSize, facingCaption, facingName, isQuarterTurned, topFace } from './facing';
import { FacingPicture } from './FacingPicture';

const ALL: OrientationCode[] = ['LWH', 'WLH', 'LHW', 'HLW', 'WHL', 'HWL'];
const product = { length: 12, width: 8, height: 4 };

describe('facing names', () => {
  it('says which box dimension is up and whether the box is turned', () => {
    expect(facingCaption('LWH')).toEqual({ upright: 'Height up', turn: 'Straight' });
    expect(facingCaption('WLH')).toEqual({ upright: 'Height up', turn: 'Quarter turn' });
    expect(facingCaption('HWL')).toEqual({ upright: 'Length up', turn: 'Quarter turn' });
    expect(facingName('LWH')).toBe(
      "Box height up, not turned: box length along the carton's length, box width along the carton's width",
    );
    expect(facingName('HLW')).toBe(
      "Box width up, turned a quarter turn: box height along the carton's length, box length along the carton's width",
    );
  });

  it('gives every facing a different name, three turned and three not', () => {
    expect(new Set(ALL.map(facingName)).size).toBe(6);
    expect(ALL.filter(isQuarterTurned)).toHaveLength(3);
  });

  it("lays the box's sizes along the carton's length, width and height", () => {
    expect(facedSize('LWH', product)).toEqual([12, 8, 4]);
    expect(facedSize('HLW', product)).toEqual([4, 12, 8]);
  });
});

describe('FacingPicture', () => {
  it.each(ALL)('draws three faces for %s and shades the top of the box', (facing) => {
    const { container } = render(<FacingPicture facing={facing} product={product} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    const faces = [...container.querySelectorAll('polygon')];
    expect(faces).toHaveLength(3);
    const shaded = faces.filter((f) => f.getAttribute('data-top') === 'true');
    expect(shaded).toHaveLength(1);
    expect(shaded[0]).toHaveAttribute('data-face', topFace(facing));
    // Every corner is inside the picture.
    for (const face of faces)
      for (const pair of face.getAttribute('points')!.split(' ')) {
        const [x, y] = pair.split(',').map(Number) as [number, number];
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(60);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(52);
      }
  });

  it('draws different facings of a box with different sides differently', () => {
    const drawn = ALL.map(
      (facing) => render(<FacingPicture facing={facing} product={product} />).container.innerHTML,
    );
    expect(new Set(drawn).size).toBe(6);
  });
});
