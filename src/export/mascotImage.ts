/** The print mascot ready for jsPDF: a PNG data URL and the figure's width / height. */
export interface PrintMascot {
  dataUrl: string;
  aspect: number;
}

/**
 * Loads the print mascot (a transparent 512 x 512 PNG) and crops it to the figure's bounding
 * box, found from the alpha channel, so the figure's own height is what gets placed on the
 * page. The PNG is imported dynamically, so it stays out of the initial chunk and is loaded
 * only when a build sheet is exported.
 */
export async function loadPrintMascot(): Promise<PrintMascot> {
  const { default: printUrl } = await import('../assets/mascot/print.png?url');
  const image = new Image();
  image.src = printUrl;
  await image.decode();
  const full = document.createElement('canvas');
  full.width = image.naturalWidth;
  full.height = image.naturalHeight;
  const fullCtx = full.getContext('2d');
  if (!fullCtx) throw new Error('No 2D canvas');
  fullCtx.drawImage(image, 0, 0);
  const { data, width, height } = fullCtx.getImageData(0, 0, full.width, full.height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data[(y * width + x) * 4 + 3] ?? 0) === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('Mascot image is empty');

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const crop = document.createElement('canvas');
  crop.width = w;
  crop.height = h;
  const cropCtx = crop.getContext('2d');
  if (!cropCtx) throw new Error('No 2D canvas');
  cropCtx.drawImage(image, minX, minY, w, h, 0, 0, w, h);
  return { dataUrl: crop.toDataURL('image/png'), aspect: w / h };
}
