// Writes the mascot sprites as PNG files from the pixel maps in poses.mjs.
// Run with `npm run mascot`. Uses only Node's standard library and produces
// byte-identical files on every run.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';
import { PALETTE, POSES, TAB_ICON } from './poses.mjs';

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function rgba(colour) {
  if (colour === null) return [0, 0, 0, 0];
  const n = Number.parseInt(colour.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 0xff];
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Encodes a pixel map (rows of palette keys) as an 8-bit RGBA PNG, each
 * pixel drawn as a scale x scale block. Alpha is only ever 0 or 255.
 */
export function encodePng(grid, palette, scale) {
  if (!Number.isInteger(scale) || scale < 1) throw new Error(`invalid scale ${scale}`);
  const height = grid.length;
  const width = grid[0].length;
  const colours = new Map(Object.entries(palette).map(([key, colour]) => [key, rgba(colour)]));
  const stride = width * scale * 4 + 1;
  const raw = Buffer.alloc(stride * height * scale);
  grid.forEach((row, y) => {
    if (row.length !== width) throw new Error(`row ${y} is ${row.length} wide, expected ${width}`);
    const line = Buffer.alloc(stride); // filter byte 0 (none) at the start
    [...row].forEach((key, x) => {
      const colour = colours.get(key);
      if (!colour) throw new Error(`unknown palette key '${key}' at ${x},${y}`);
      for (let i = 0; i < scale; i++) line.set(colour, 1 + (x * scale + i) * 4);
    });
    for (let i = 0; i < scale; i++) line.copy(raw, (y * scale + i) * stride);
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width * scale, 0);
  header.writeUInt32BE(height * scale, 4);
  header.set([8, 6, 0, 0, 0], 8); // bit depth 8, RGBA, deflate, no filter, no interlace
  return new Uint8Array(
    Buffer.concat([
      SIGNATURE,
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

const SPRITES = [
  ['idle.png', POSES.idle, 1],
  ['working-1.png', POSES.working1, 1],
  ['working-2.png', POSES.working2, 1],
  ['working-3.png', POSES.working3, 1],
  ['concerned.png', POSES.concerned, 1],
  ['header-mark.png', POSES.headerMark, 1],
  ['print.png', POSES.print, 16],
];

/** Writes every sprite into outDir and the tab icon as favicon.png into publicDir. */
export function buildAll(outDir, publicDir) {
  mkdirSync(outDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });
  for (const [file, grid, scale] of SPRITES) {
    writeFileSync(join(outDir, file), encodePng(grid, PALETTE, scale));
  }
  writeFileSync(join(publicDir, 'favicon.png'), encodePng(TAB_ICON, PALETTE, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  buildAll(join(root, 'src/assets/mascot'), join(root, 'public'));
}
