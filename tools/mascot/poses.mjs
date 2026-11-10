// Pixel maps for the Harbor mascot. One character per pixel, keyed by PALETTE.
// The idle map is a trace of the "Existing key — construction study" drawing
// on the owner's design sheet (17 x 22 occupied, feet on row 30). Every other
// pose is derived from it in code, so the body stays identical across poses.
// Edit single characters of IDLE freely; the helpers below check that the
// leaf and shoot pixels they move are still where they expect them.

export const PALETTE = {
  B: '#945743', // brown main
  S: '#79432F', // brown shade
  K: '#35403A', // bandana
  G: '#7BCF80', // leaves and shoot
  E: '#99E550', // eye marks
  '.': null, // transparent
};

// prettier-ignore
const IDLE = [
  '................................', // 0
  '................................', // 1
  '................................', // 2
  '................................', // 3
  '................................', // 4
  '................................', // 5
  '................................', // 6
  '................................', // 7
  '................................', // 8
  '.............GG.................', // 9   left leaf (higher tip)
  '..............G.GG..............', // 10  right leaf
  '...............SG...............', // 11  stem
  '...............S................', // 12
  '...............S................', // 13
  '.............BBSBBB.............', // 14  head ring
  '............BBBBBBBB............', // 15
  '...........BBBBBBBBBB...........', // 16
  '...........BBBB..BBBB...........', // 17  opening, open through
  '...........SBE....EBB...........', // 18  eye marks at the inner edges
  '...........SBB...BBBB...........', // 19
  '............SBBBBBBB............', // 20
  '.............SBBBBB.............', // 21
  '..........G.BBKKKKB.............', // 22  shoulders, bandana, shoulder shoot
  '...........BBBKKKBBB............', // 23
  '..........BBBBBKBBBBB...........', // 24
  '.........BBSBBBBBBBBBBB.........', // 25
  '........BBB.SBBBBBB.BBB.........', // 26
  '.......BBB...SBSSBB..BBB........', // 27
  '.......BB....SB..BB...BB........', // 28  two arms, two legs
  '.......BB....BB..SB...BB........', // 29
  '.......BB....BB..SB...BB........', // 30  ground line
  '................................', // 31
];

/** Pixel positions in IDLE, as [x, y]. */
const LEFT_LEAF = [
  [13, 9],
  [14, 9],
  [14, 10],
]; // tip, bar, base at the stem
const RIGHT_LEAF = [
  [16, 10],
  [17, 10],
  [16, 11],
]; // bar, tip, base at the stem
const LEFT_LEAF_TIP = LEFT_LEAF[0];
const RIGHT_LEAF_TIP = RIGHT_LEAF[1];
const SHOULDER_SHOOT = [10, 22];
const SHOULDER_ROW = 22;

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

/** Moves single leaf or shoot pixels; each source must be 'G' and each target empty. */
function movePixels(grid, moves) {
  for (const [from, to] of moves) {
    expectPixel(grid, from, 'G');
    if (at(grid, to) !== '.' && !moves.some(([f]) => f[0] === to[0] && f[1] === to[1])) {
      throw new Error(`mascot: target ${to.join(',')} is not empty`);
    }
  }
  return paint(grid, [
    ...moves.map(([[x, y]]) => [x, y, '.']),
    ...moves.map(([, [x, y]]) => [x, y, 'G']),
  ]);
}

const up = ([x, y], n = 1) => [x, y - n];

/** Both leaf tips raised one pixel. */
function perkLeaves(grid) {
  return movePixels(grid, [
    [LEFT_LEAF_TIP, up(LEFT_LEAF_TIP)],
    [RIGHT_LEAF_TIP, up(RIGHT_LEAF_TIP)],
  ]);
}

/** The shoulder shoot moved `dx` pixels sideways. */
function shiftShoot(grid, dx) {
  if (dx === 0) return grid;
  return movePixels(grid, [[SHOULDER_SHOOT, [SHOULDER_SHOOT[0] + dx, SHOULDER_SHOOT[1]]]]);
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
 * Leaves hanging: each leaf keeps the pixel that meets the stem and bends
 * outward and down, so its tip ends two pixels lower than before.
 * Expects the leaves already shifted by `dx`.
 */
function droopLeaves(grid, dx) {
  const shift = ([x, y]) => [x + dx, y];
  const [lTip, lBar, lBase] = LEFT_LEAF.map(shift);
  const [rBar, rTip, rBase] = RIGHT_LEAF.map(shift);
  for (const xy of [lTip, lBar, lBase, rBar, rTip, rBase]) expectPixel(grid, xy, 'G');
  const cleared = paint(
    grid,
    [lTip, lBar, rBar, rTip].map(([x, y]) => [x, y, '.']),
  );
  return paint(cleared, [
    // each leaf keeps its base, then one pixel out, then the tip out and down
    [lBase[0] - 1, lBase[1], 'G'],
    [lBase[0] - 2, lBase[1] + 1, 'G'],
    [rBase[0] + 1, rBase[1], 'G'],
    [rBase[0] + 2, rBase[1] + 1, 'G'],
  ]);
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
