// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAll, encodePng } from './build.mjs';
import { PALETTE, POSES, TAB_ICON } from './poses.mjs';

type Grid = readonly string[];

const KEYS = Object.keys(PALETTE);
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function cells(grid: Grid): { x: number; y: number; ch: string }[] {
  return grid.flatMap((row, y) => [...row].map((ch, x) => ({ x, y, ch })));
}

function filled(grid: Grid) {
  return cells(grid).filter((c) => c.ch !== '.');
}

function boundingBox(grid: Grid) {
  const f = filled(grid);
  const xs = f.map((c) => c.x);
  const ys = f.map((c) => c.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

function diff(a: Grid, b: Grid) {
  return cells(a).filter((c) => b[c.y]![c.x] !== c.ch);
}

/** First row holding a head pixel (main brown). */
function headTop(grid: Grid): number {
  return grid.findIndex((row) => row.includes('B'));
}

/** Leaf pixels (above the head) grouped by edge contact, ordered left to right. */
function leafGroups(grid: Grid) {
  const top = headTop(grid);
  const left = filled(grid).filter((c) => c.ch === 'G' && c.y < top);
  const groups: { x: number; y: number }[][] = [];
  const seen = new Set<string>();
  for (const start of left) {
    if (seen.has(`${start.x},${start.y}`)) continue;
    const group: { x: number; y: number }[] = [];
    const queue = [start];
    seen.add(`${start.x},${start.y}`);
    while (queue.length > 0) {
      const c = queue.pop()!;
      group.push({ x: c.x, y: c.y });
      for (const n of left) {
        const key = `${n.x},${n.y}`;
        if (!seen.has(key) && Math.abs(n.x - c.x) + Math.abs(n.y - c.y) === 1) {
          seen.add(key);
          queue.push(n);
        }
      }
    }
    groups.push(group);
  }
  return groups.sort((a, b) => Math.min(...a.map((c) => c.x)) - Math.min(...b.map((c) => c.x)));
}

/** True when the cell is transparent and figure pixels lie beyond it in all four directions. */
function enclosed(grid: Grid, x: number, y: number): boolean {
  const row = grid[y]!;
  const column = grid.map((r) => r[x]);
  return (
    row[x] === '.' &&
    row.slice(0, x).replace(/\./g, '').length > 0 &&
    row.slice(x + 1).replace(/\./g, '').length > 0 &&
    column.slice(0, y).some((ch) => ch !== '.') &&
    column.slice(y + 1).some((ch) => ch !== '.')
  );
}

/** Rows of the head ring (head top to the row above the bandana) holding an enclosed hole. */
function openingRows(grid: Grid): number[] {
  const end = grid.findIndex((row) => row.includes('K'));
  const rows: number[] = [];
  for (let y = headTop(grid); y < (end < 0 ? grid.length : end); y++) {
    if ([...grid[y]!].some((_, x) => enclosed(grid, x, y))) rows.push(y);
  }
  return rows;
}

function runsOf(row: string): number {
  return row.split('.').filter((part) => part.length > 0).length;
}

function hex(rgb: readonly number[]): string {
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');
}

/** Minimal PNG reader for 8-bit RGBA images with filter type 0 rows. */
function decodePng(bytes: Uint8Array) {
  const buf = Buffer.from(bytes);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = 0;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colourType = data[9]!;
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4 + 1;
  const pixel = (x: number, y: number) => {
    expect(raw[y * stride]).toBe(0);
    const i = y * stride + 1 + x * 4;
    return [raw[i]!, raw[i + 1]!, raw[i + 2]!, raw[i + 3]!];
  };
  return { width, height, bitDepth, colourType, rawLength: raw.length, pixel };
}

const idle = POSES.idle;
const working = [POSES.working1, POSES.working2, POSES.working3];

describe('mascot poses', () => {
  it('every pose is 32 rows of 32 known palette characters', () => {
    for (const [name, grid] of Object.entries(POSES)) {
      expect(grid, name).toHaveLength(32);
      for (const row of grid) {
        expect(row, name).toHaveLength(32);
        for (const ch of row) expect(KEYS, `${name} uses ${ch}`).toContain(ch);
      }
    }
  });

  it('the palette is exactly the five mascot colours plus transparent', () => {
    expect(PALETTE).toEqual({
      B: '#945743',
      S: '#79432F',
      K: '#35403A',
      G: '#7BCF80',
      E: '#99E550',
      '.': null,
    });
  });

  it('the tab icon has a ring opening of at least 2 x 2, a stem and two separate leaves', () => {
    const hasHole = TAB_ICON.some((row, y) =>
      [...row].some(
        (_, x) =>
          enclosed(TAB_ICON, x, y) &&
          enclosed(TAB_ICON, x + 1, y) &&
          enclosed(TAB_ICON, x, y + 1) &&
          enclosed(TAB_ICON, x + 1, y + 1),
      ),
    );
    expect(hasHole).toBe(true);
    expect(TAB_ICON.slice(0, headTop(TAB_ICON)).join('')).toContain('S');
    expect(leafGroups(TAB_ICON)).toHaveLength(2);
  });

  it("idle's head opening is open through on consecutive rows, including the eye row", () => {
    const rows = openingRows(idle);
    const eyeRow = idle.findIndex((row) => row.includes('E'));
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows).toEqual(rows.map((_, i) => rows[0]! + i));
    expect(rows).toContain(eyeRow);
  });

  it('working and print raise each leaf tip exactly one row above idle', () => {
    const idleLeaves = leafGroups(idle);
    expect(idleLeaves).toHaveLength(2);
    for (const frame of [...working, POSES.print]) {
      const leaves = leafGroups(frame);
      expect(leaves).toHaveLength(2);
      leaves.forEach((leaf, i) => {
        const topOf = (g: { y: number }[]) => Math.min(...g.map((c) => c.y));
        expect(topOf(leaf)).toBe(topOf(idleLeaves[i]!) - 1);
      });
    }
  });

  it('the tab icon is 16 rows of 16 known palette characters with both eye marks', () => {
    expect(TAB_ICON).toHaveLength(16);
    for (const row of TAB_ICON) {
      expect(row).toHaveLength(16);
      for (const ch of row) expect(KEYS).toContain(ch);
    }
    expect(filled(TAB_ICON).filter((c) => c.ch === 'E')).toHaveLength(2);
  });

  it('the idle figure is 17 wide, 27 tall, feet on row 30, with room above the leaves', () => {
    const box = boundingBox(idle);
    expect(box.right - box.left + 1).toBe(17);
    expect(box.bottom - box.top + 1).toBe(27);
    expect(box.bottom).toBe(30);
    expect(box.top).toBeGreaterThanOrEqual(2);
  });

  it('every leaf and shoot pixel touches another figure pixel along an edge', () => {
    const grids: [string, Grid][] = [...Object.entries(POSES), ['tab icon', TAB_ICON]];
    for (const [name, grid] of grids) {
      for (const c of filled(grid).filter((p) => p.ch === 'G')) {
        const neighbours = [
          grid[c.y - 1]?.[c.x],
          grid[c.y + 1]?.[c.x],
          grid[c.y]?.[c.x - 1],
          grid[c.y]?.[c.x + 1],
        ];
        const isShoot = neighbours.every((n) => n === undefined || n === '.');
        if (isShoot) {
          // the shoulder shoot is a single detached pixel below the head
          expect(
            grid.findIndex((row) => row.includes('E')),
            `${name} ${c.x},${c.y}`,
          ).toBeLessThan(c.y);
        } else {
          expect(
            neighbours.some((n) => n !== undefined && n !== '.'),
            name,
          ).toBe(true);
        }
      }
    }
  });

  it('idle has exactly two eye pixels, on the same row', () => {
    const eyes = filled(idle).filter((c) => c.ch === 'E');
    expect(eyes).toHaveLength(2);
    expect(eyes[0]!.y).toBe(eyes[1]!.y);
  });

  it("idle's lowest row holds exactly four separate limb ends", () => {
    expect(runsOf(idle[30]!)).toBe(4);
  });

  it('working frames differ from each other only in the shoulder shoot', () => {
    const eyeRow = filled(idle).find((c) => c.ch === 'E')!.y;
    for (const a of working) {
      for (const b of working) {
        for (const c of diff(a, b)) {
          expect(c.y).toBeGreaterThan(eyeRow);
          expect(['G', '.']).toContain(c.ch);
          expect(['G', '.']).toContain(b[c.y]![c.x]);
        }
      }
    }
    expect(diff(POSES.working1, POSES.working2).length).toBeGreaterThan(0);
    expect(diff(POSES.working2, POSES.working3).length).toBeGreaterThan(0);
  });

  it('working frames differ from idle only in leaf and shoot pixels', () => {
    for (const frame of working) {
      const changed = diff(frame, idle);
      expect(changed.length).toBeGreaterThan(0);
      for (const c of changed) {
        expect(['G', '.']).toContain(c.ch);
        expect(['G', '.']).toContain(idle[c.y]![c.x]);
      }
    }
  });

  it('print differs from idle only in leaf pixels above the head', () => {
    const headTop = idle.findIndex((row) => row.includes('B'));
    const changed = diff(POSES.print, idle);
    expect(changed.length).toBeGreaterThan(0);
    for (const c of changed) {
      expect(c.y).toBeLessThan(headTop);
      expect(['G', '.']).toContain(c.ch);
      expect(['G', '.']).toContain(idle[c.y]![c.x]);
    }
  });

  it('concerned and idle have identical rows from the shoulders down', () => {
    const shoulderRow = idle.findIndex((row) => row.includes('K'));
    expect(shoulderRow).toBeGreaterThan(0);
    expect(POSES.concerned.slice(shoulderRow)).toEqual(idle.slice(shoulderRow));
    expect(POSES.concerned.slice(0, shoulderRow)).not.toEqual(idle.slice(0, shoulderRow));
  });

  it('the header mark has no bandana pixels', () => {
    expect(POSES.headerMark.join('')).not.toContain('K');
  });
});

describe('encodePng', () => {
  it('encodes the idle grid as a 32 x 32 RGBA PNG whose pixels equal the grid', () => {
    const png = encodePng(idle, PALETTE, 1);
    expect([...png.slice(0, 8)]).toEqual(PNG_SIGNATURE);
    const img = decodePng(png);
    expect([img.width, img.height, img.bitDepth, img.colourType]).toEqual([32, 32, 8, 6]);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const [r, g, b, a] = img.pixel(x, y);
        expect([0, 255]).toContain(a);
        const colour = PALETTE[idle[y]![x] as keyof typeof PALETTE];
        if (colour === null) expect(a).toBe(0);
        else {
          expect(a).toBe(255);
          expect(hex([r!, g!, b!])).toBe(colour);
        }
      }
    }
  });

  it('scale 16 gives 512 x 512 with uniform 16 x 16 blocks', () => {
    const img = decodePng(encodePng(idle, PALETTE, 16));
    expect([img.width, img.height]).toEqual([512, 512]);
    const small = decodePng(encodePng(idle, PALETTE, 1));
    for (let y = 0; y < 512; y += 5) {
      for (let x = 0; x < 512; x += 3) {
        expect(img.pixel(x, y)).toEqual(small.pixel(Math.floor(x / 16), Math.floor(y / 16)));
      }
    }
  });

  it('is deterministic', () => {
    expect(encodePng(idle, PALETTE, 2)).toEqual(encodePng(idle, PALETTE, 2));
  });

  it('rejects characters outside the palette', () => {
    expect(() => encodePng(['X'], PALETTE, 1)).toThrow();
  });
});

describe('buildAll', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes every sprite and the favicon at the documented sizes', () => {
    dir = mkdtempSync(join(tmpdir(), 'mascot-'));
    const out = join(dir, 'assets');
    const pub = join(dir, 'public');
    buildAll(out, pub);
    const sizes: Record<string, number> = {
      'idle.png': 32,
      'working-1.png': 32,
      'working-2.png': 32,
      'working-3.png': 32,
      'concerned.png': 32,
      'header-mark.png': 32,
      'print.png': 512,
    };
    for (const [file, size] of Object.entries(sizes)) {
      const img = decodePng(readFileSync(join(out, file)));
      expect([img.width, img.height], file).toEqual([size, size]);
    }
    const favicon = decodePng(readFileSync(join(pub, 'favicon.png')));
    expect([favicon.width, favicon.height]).toEqual([32, 32]);
  });
});
