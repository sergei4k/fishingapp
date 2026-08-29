import sharp from 'sharp';

const input = 'assets/images/logo.png';
const outputDir = 'assets/images';
const source = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { data, info } = source;

const crop = { left: 245, top: 245, width: 565, height: 535 };

function createMark(name, includePixel) {
  const pixels = Buffer.alloc(crop.width * crop.height * 4);

  for (let y = 0; y < crop.height; y += 1) {
    for (let x = 0; x < crop.width; x += 1) {
      const sourceX = crop.left + x;
      const sourceY = crop.top + y;
      const sourceIndex = (sourceY * info.width + sourceX) * 4;
      const targetIndex = (y * crop.width + x) * 4;
      const red = data[sourceIndex];
      const green = data[sourceIndex + 1];
      const blue = data[sourceIndex + 2];
      const brightness = Math.max(red, green, blue);

      // Keep the bright fish artwork and remove the dark logo card.
      if (brightness > 156 && includePixel(sourceX, sourceY)) {
        const alpha = Math.min(255, Math.round((brightness - 156) * 2.58));
        pixels[targetIndex] = red;
        pixels[targetIndex + 1] = green;
        pixels[targetIndex + 2] = blue;
        pixels[targetIndex + 3] = alpha;
      }
    }
  }

  return sharp(pixels, { raw: { width: crop.width, height: crop.height, channels: 4 } })
    .png()
    .toFile(`${outputDir}/${name}`);
}

// The tail section is drawn separately so it can flex around the tail base.
await Promise.all([
  createMark('fish-loader-body.png', (x, y) => !(x < 560 && y > 510)),
  createMark('fish-loader-tail.png', (x, y) => x < 585 && y > 490),
]);
