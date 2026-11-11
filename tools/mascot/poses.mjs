// Pixel maps for the Harbor mascot. One character per pixel, keyed by PALETTE.
// The idle map is a trace of the "Existing key — construction study" drawing
// on the owner's design sheet, on that drawing's own pixel grid: 17 x 27
// occupied, feet on row 30. (The sheet's footer says 17 x 22, but its drawing
// is taller; the drawing is what was traced.) Every other pose is derived from
// it in code, so the body stays identical across poses. Edit single characters
// of IDLE freely (rows 7-10 are the helmet); the helpers below check that the
// leaf and shoot pixels they change are still where they expect them.

export const PALETTE = {
  B: '#945743', // brown main
  S: '#79432F', // brown shade
  K: '#35403A', // bandana
  G: '#7BCF80', // leaves and shoot
  E: '#99E550', // eye marks
  Y: '#E8B93C', // helmet yellow
  H: '#B98A22', // helmet shade (right side and brim)
  '.': null, // transparent
};

// prettier-ignore
const IDLE = [
  '................................', // 0
  '................................', // 1
  '................................', // 2
  '................................', // 3
  '............GGG.................', // 4  left leaf (higher tip)
  '.............GG.GG..............', // 5  right leaf
  '..............SSG...............', // 6  stem, two pixels wide
  '.............YYYYYH.............', // 7  helmet dome, the stem passes into it
  '...........YYYYYYYHHH...........', // 8
  '...........YYYYYYYYHH...........', // 9
  '..........HHHHHHHHHHHH..........', // 10 brim, one pixel wider than the head each side
  '...........BBBBBBBBBB...........', // 11
  '...........BBBB..BBBB...........', // 12  opening, open through
  '...........SBE....EBB...........', // 13  eye marks at the inner edges
  '...........SBB...BBBB...........', // 14
  '............SBBBBBBB............', // 15
  '.............SBBBBB.............', // 16
  '..........G.BBKKKKB.............', // 17  shoulders, bandana, shoulder shoot
  '...........BBBKKKKBB............', // 18
  '..........BBBBBKKBBBB...........', // 19
  '.........BBSBBBBBBBBBBB.........', // 20  arms arch out from the shoulders
  '........BBB.SBBBBBBBBBB.........', // 21
  '........BBB.SBBBBBB.BBB.........', // 22
  '.......BBB...SBSSBB..BBB........', // 23
  '.......BB....SB..BB...BB........', // 24  two arms, two legs
  '.......BB....SB..BB...BB........', // 25
  '.......BB....SB..BB...BB........', // 26
  '.......BB....BB..SB...BB........', // 27
  '.......BB....BB..SB...BB........', // 28
  '.......BB....BB..SB...BB........', // 29
  '.......BB....SS..SS...BB........', // 30  ground line
  '................................', // 31
];

/** Leaf pixels in IDLE as [x, y], each leaf's tip, and its hanging shape. */
const LEFT_LEAF = {
  // prettier-ignore
  pixels: [[12, 4], [13, 4], [14, 4], [13, 5], [14, 5]],
  tip: [12, 4],
  // keeps its base over the stem, reaches out along row 5, tip hangs at the end
  // prettier-ignore
  drooped: [[14, 5], [13, 5], [12, 5], [11, 5], [11, 6]],
};
const RIGHT_LEAF = {
  // prettier-ignore
  pixels: [[16, 5], [17, 5], [16, 6]],
  tip: [17, 5],
  // reaches out past the dome's right edge before the tip hangs
  // prettier-ignore
  drooped: [[16, 6], [17, 6], [18, 6], [19, 6], [19, 7]],
};
const SHOULDER_SHOOT = [10, 17];
const SHOULDER_ROW = 17;

function at(grid, [x, y]) {
  return grid[y][x];
}

function expectPixel(grid, xy, ch) {
  if (at(grid, xy) !== ch) {
    throw new Error(`mascot: expected '${ch}' at ${xy.join(',')}, found '${at(grid, xy)}'`);
  }
}

/** Returns a copy of `grid` with the given [x, y, ch] pixels written. */
function paint(grid, pixels) {
  const rows = grid.map((row) => [...row]);
  for (const [x, y, ch] of pixels) rows[y][x] = ch;
  return rows.map((row) => row.join(''));
}

/** Replaces the 'G' pixels `from` with `to`; every new pixel must land on empty space. */
function replaceGreen(grid, from, to) {
  for (const xy of from) expectPixel(grid, xy, 'G');
  const cleared = paint(
    grid,
    from.map(([x, y]) => [x, y, '.']),
  );
  for (const xy of to) expectPixel(cleared, xy, '.');
  return paint(
    cleared,
    to.map(([x, y]) => [x, y, 'G']),
  );
}

const up = ([x, y]) => [x, y - 1];
const shiftX =
  (dx) =>
  ([x, y]) => [x + dx, y];

/** Both leaf tips raised one pixel: each tip grows one pixel upward, so it stays joined to its leaf. */
function perkLeaves(grid) {
  const tips = [LEFT_LEAF.tip, RIGHT_LEAF.tip];
  for (const tip of tips) expectPixel(grid, tip, 'G');
  return replaceGreen(grid, [], tips.map(up));
}

/** The shoulder shoot moved `dx` pixels sideways. */
function shiftShoot(grid, dx) {
  if (dx === 0) return grid;
  return replaceGreen(grid, [SHOULDER_SHOOT], [shiftX(dx)(SHOULDER_SHOOT)]);
}

/** Head, stem and leaves (every row above the shoulders) shifted one pixel left. */
function tiltHeadLeft(grid) {
  return grid.map((row, y) => {
    if (y >= SHOULDER_ROW) return row;
    if (row[0] !== '.') throw new Error('mascot: no room to shift the head left');
    return row.slice(1) + '.';
  });
}

/**
 * Leaves hanging: each leaf keeps its base at the stem and reaches outward,
 * its tip two pixels lower and one pixel further out than before.
 * Expects the leaves already shifted sideways by `dx`.
 */
function droopLeaves(grid, dx) {
  const move = shiftX(dx);
  let out = grid;
  for (const leaf of [LEFT_LEAF, RIGHT_LEAF]) {
    out = replaceGreen(out, leaf.pixels.map(move), leaf.drooped.map(move));
  }
  return out;
}

/** Keeps the rows above the shoulders (head ring, stem, leaves) only. */
function headOnly(grid) {
  return grid.map((row, y) => (y < SHOULDER_ROW ? row : '.'.repeat(row.length)));
}

/** Cuts `height` rows x `width` columns at [x, y] and centres them in a size x size cell. */
function recentre(grid, [x, y, width, height], size) {
  const left = Math.floor((size - width) / 2);
  const top = Math.floor((size - height) / 2);
  return Array.from({ length: size }, (_, row) => {
    const src = row - top;
    if (src < 0 || src >= height) return '.'.repeat(size);
    const middle = grid[y + src].slice(x, x + width);
    return '.'.repeat(left) + middle + '.'.repeat(size - left - width);
  });
}

function boundingBox(grid) {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }),
  );
  return [left, top, right - left + 1, bottom - top + 1];
}

const perked = perkLeaves(IDLE);
const head = headOnly(IDLE);

export const POSES = {
  idle: IDLE,
  working1: shiftShoot(perked, -1),
  working2: shiftShoot(perked, 0),
  working3: shiftShoot(perked, 1),
  concerned: droopLeaves(tiltHeadLeft(IDLE), -1),
  headerMark: recentre(head, boundingBox(head), 32),
  print: perked,
};

// The key's head ring, stem and leaves are 10 x 13 pixels, so they fit the
// 16 x 16 tab icon unscaled: the opening stays 4 x 3 and both eye marks stay.
export const TAB_ICON = recentre(head, boundingBox(head), 16);
