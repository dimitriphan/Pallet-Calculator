import { formatDims } from '../engine/units/units';
import type { ExportPayload } from './exportData';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pngLayout(): {
  width: 2400;
  height: 1500;
  current: Rect;
  top: Rect;
  side: Rect;
  caption: Rect;
} {
  return {
    width: 2400,
    height: 1500,
    current: { x: 0, y: 0, width: 1500, height: 1200 },
    top: { x: 1500, y: 0, width: 900, height: 600 },
    side: { x: 1500, y: 600, width: 900, height: 600 },
    caption: { x: 0, y: 1200, width: 2400, height: 300 },
  };
}

/** An ISO timestamp as the viewer's local time, YYYY-MM-DD HH:mm. */
export function localMinute(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The caption text, one string per line. */
export function captionLines(p: ExportPayload): string[] {
  const { summary, carton, pallet } = p.analytics;
  return [
    [
      `Boxes per carton: ${summary.boxesPerCarton}`,
      `Cartons per layer: ${summary.cartonsPerLayer}`,
      `Layers: ${summary.layers}`,
      `Cartons per pallet: ${summary.cartonsPerPallet}`,
      `Total boxes per pallet: ${summary.totalBoxes}`,
    ].join('   |   '),
    `Load: ${formatDims({ length: pallet.loadLength, width: pallet.loadWidth, height: pallet.totalLoadHeight })} in (including pallet)`,
    `Carton: ${formatDims(carton.outer)} in (outer)`,
    [
      `Layout ${p.selectedLayout.rank}`,
      `Exported ${localMinute(p.exportedAt)}`,
      ...(p.stale ? [p.status] : []),
    ].join('   |   '),
  ];
}

function loadImage(src: string, name: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load the ${name} view image`));
    img.src = src;
  });
}

function drawImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  r: Rect,
  fit: 'cover' | 'contain',
): void {
  const scale = (fit === 'cover' ? Math.max : Math.min)(
    r.width / img.naturalWidth,
    r.height / img.naturalHeight,
  );
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.width, r.height);
  ctx.clip();
  ctx.drawImage(img, r.x + (r.width - w) / 2, r.y + (r.height - h) / 2, w, h);
  ctx.restore();
}

/** Browser-only: draws the three views and the caption onto one 2400 x 1500 PNG. */
export async function composePng(
  views: { current: string; top: string; side: string },
  p: ExportPayload,
): Promise<Blob> {
  const layout = pngLayout();
  const [current, top, side] = await Promise.all([
    loadImage(views.current, '3D'),
    loadImage(views.top, 'top'),
    loadImage(views.side, 'side'),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, layout.width, layout.height);
  drawImage(ctx, current, layout.current, 'cover');
  drawImage(ctx, top, layout.top, 'contain');
  drawImage(ctx, side, layout.side, 'contain');

  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 2;
  for (const r of [layout.current, layout.top, layout.side, layout.caption])
    ctx.strokeRect(r.x + 1, r.y + 1, r.width - 2, r.height - 2);

  ctx.fillStyle = '#374151';
  ctx.textBaseline = 'top';
  ctx.font = '600 36px sans-serif';
  const title = (text: string, r: Rect) => {
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(r.x + 8, r.y + 8, w + 24, 52);
    ctx.fillStyle = '#374151';
    ctx.fillText(text, r.x + 20, r.y + 16);
  };
  title('3D view', layout.current);
  title('Top view', layout.top);
  title('Side view', layout.side);

  const lines = captionLines(p);
  const c = layout.caption;
  // The figures line shrinks until it fits the strip.
  let size = 44;
  ctx.font = `600 ${size}px sans-serif`;
  while (size > 24 && ctx.measureText(lines[0] ?? '').width > c.width - 80) {
    size -= 2;
    ctx.font = `600 ${size}px sans-serif`;
  }
  ctx.fillText(lines[0] ?? '', c.x + 40, c.y + 28);
  ctx.font = '40px sans-serif';
  lines.slice(1).forEach((text, k) => ctx.fillText(text, c.x + 40, c.y + 98 + k * 60));

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG'))),
      'image/png',
    ),
  );
}
