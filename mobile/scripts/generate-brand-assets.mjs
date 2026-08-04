// Regenerates all KaamWala brand PNGs (app icon, splash, adaptive, favicon)
// from the "Bond" mark. Run: node scripts/generate-brand-assets.mjs
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, '..', 'assets');

const ORANGE = '#FF5C00';
const INK = '#0D0D0D';
const CREAM = '#F5F0E8';

// The Bond mark (viewBox 0 0 100 100): two rounded strands joined by a diamond knot.
function markGroup(orange = ORANGE, ink = INK, accent = ORANGE) {
  return `
  <g>
    <path d="M22 22 L43 43" stroke="${orange}" stroke-width="18" stroke-linecap="round" fill="none"/>
    <path d="M57 57 L78 78" stroke="${ink}" stroke-width="18" stroke-linecap="round" fill="none"/>
    <g transform="rotate(45 50 50)">
      <rect x="41" y="41" width="18" height="18" rx="4" fill="${accent}"/>
    </g>
  </g>`;
}

function centeredMark(canvas, markPx) {
  const scale = markPx / 100;
  const offset = (canvas - markPx) / 2;
  return `<g transform="translate(${offset} ${offset}) scale(${scale})">${markGroup()}</g>`;
}

async function writePng(svg, file) {
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();
  writeFileSync(file, buf);
  console.log('wrote', file);
}

async function main() {
  mkdirSync(ASSETS, { recursive: true });

  // 1. App icon — cream square + mark (1024)
  await writePng(
    `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="1024" fill="${CREAM}"/>
      ${centeredMark(1024, 520)}
    </svg>`,
    join(ASSETS, 'icon.png'),
  );

  // 2. Splash — transparent mark only, for the native splash on cream (1024)
  await writePng(
    `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      ${centeredMark(1024, 340)}
    </svg>`,
    join(ASSETS, 'splash-icon.png'),
  );

  // 3. Adaptive foreground — transparent mark inside the safe zone (1024)
  await writePng(
    `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      ${centeredMark(1024, 500)}
    </svg>`,
    join(ASSETS, 'android-icon-foreground.png'),
  );

  // 4. Adaptive background — solid cream (1024)
  await writePng(
    `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <rect width="1024" height="1024" fill="${CREAM}"/>
    </svg>`,
    join(ASSETS, 'android-icon-background.png'),
  );

  // 5. Monochrome (themed icons) — single-color mark (1024)
  await writePng(
    `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(262 262) scale(5)">
        <path d="M22 22 L43 43" stroke="${INK}" stroke-width="18" stroke-linecap="round" fill="none"/>
        <path d="M57 57 L78 78" stroke="${INK}" stroke-width="18" stroke-linecap="round" fill="none"/>
        <g transform="rotate(45 50 50)">
          <rect x="41" y="41" width="18" height="18" rx="4" fill="${INK}"/>
        </g>
      </g>
    </svg>`,
    join(ASSETS, 'android-icon-monochrome.png'),
  );

  // 6. Favicon — 48px cream + mark
  await writePng(
    `<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" fill="${CREAM}"/>
      ${centeredMark(48, 26)}
    </svg>`,
    join(ASSETS, 'favicon.png'),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
