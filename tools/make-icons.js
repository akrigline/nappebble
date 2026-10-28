// Renders art/icons/*.svg (24px line icons from the nappi app) to 1-bit PNGs in resources/icons/.
// Needs: npm i --no-save @resvg/resvg-js pngjs
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');
const { PNG } = require('pngjs');

const SRC = path.join(__dirname, '..', 'art', 'icons');
const OUT = path.join(__dirname, '..', 'resources', 'icons');
const SIZE = 24;
const MENU_SIZE = 25;   // the launcher's menu icon, made from the diaper glyph

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
render('diaper.svg', MENU_SIZE, 'menu-icon.png');
