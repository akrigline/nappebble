// Renders art/icons/*.svg (24px line icons from the nappi app) to 1-bit PNGs in resources/icons/,
// and the launcher menu icon (a 1-bit rendering of art/nappebble-icon.svg).
// Needs: npm i --no-save @resvg/resvg-js pngjs
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { PNG } = require('pngjs');

const SRC = path.join(__dirname, '..', 'art', 'icons');
const OUT = path.join(__dirname, '..', 'resources', 'icons');
const SIZE = 24;
const MENU_SIZE = 25;   // the launcher's menu icon
const MENU_COVERAGE = 0.35; // share of a cell the line art must cover to count as ink

function render(file, size, outName) {
  const svg = fs.readFileSync(path.join(SRC, file));
  const raw = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render();
  const src = PNG.sync.read(raw.asPng());
  const out = new PNG({ width: size, height: size });
  // Anti-aliasing turns to mush on e-paper: keep a pixel if it is at least half covered.
  for (let i = 0; i < size * size; i++) {
    const on = src.data[i * 4 + 3] >= 128;
    out.data.set(on ? [0, 0, 0, 255] : [0, 0, 0, 0], i * 4);
  }
  fs.writeFileSync(path.join(OUT, outName), PNG.sync.write(out));
  console.log('wrote', outName);
}

for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith('.svg'))) {
  render(file, SIZE, file.replace('.svg', '.png'));
}

// The app icon's line art (art/nappebble-icon.svg) without its background or face: render big, then keep a
// 25 px cell as ink when enough of it is covered. Thin 1 px lines survive this better than a plain downscale.
const FACTOR = 8;
const iconSvg = fs.readFileSync(path.join(__dirname, '..', 'art', 'nappebble-icon.svg'), 'utf8')
  .replace(/<rect id="background"[^>]*\/>/, '')
  .replace(/<path id="face"[^>]*\/>/, ''); // the face turns to mush at 25 px
const big = PNG.sync.read(new Resvg(iconSvg, { fitTo: { mode: 'width', value: MENU_SIZE * FACTOR } }).render().asPng());
const menu = new PNG({ width: MENU_SIZE, height: MENU_SIZE });
for (let y = 0; y < MENU_SIZE; y++) {
  for (let x = 0; x < MENU_SIZE; x++) {
    let covered = 0;
    for (let dy = 0; dy < FACTOR; dy++) {
      for (let dx = 0; dx < FACTOR; dx++) {
        covered += big.data[(((y * FACTOR + dy) * MENU_SIZE * FACTOR) + x * FACTOR + dx) * 4 + 3];
      }
    }
    const on = covered / (FACTOR * FACTOR * 255) >= MENU_COVERAGE;
    menu.data.set(on ? [0, 0, 0, 255] : [0, 0, 0, 0], (y * MENU_SIZE + x) * 4);
  }
}
fs.writeFileSync(path.join(OUT, 'menu-icon.png'), PNG.sync.write(menu));
console.log('wrote menu-icon.png');
