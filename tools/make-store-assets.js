// Renders the appstore icons from art/nappebble-icon.svg into store/. Needs: npm i --no-save @resvg/resvg-js
// The banner is tools/make-banner.js.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const svg = fs.readFileSync(path.join(__dirname, '..', 'art', 'nappebble-icon.svg'));
for (const [name, size] of [['icon-small', 80], ['icon-large', 144]]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(path.join(__dirname, '..', 'store', name + '.png'), png);
  console.log('wrote', name + '.png', size + 'px');
}
