// Renders the appstore banner (720x320) into store/banner.png. Needs: npm i --no-save @resvg/resvg-js
// The "Works with nappi" badge is nappi's, so it goes in unedited at its native 226x56 (art/badge/).
// Terms: https://nappi.app/press#works-with
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const root = path.join(__dirname, '..');
const b64 = (p) => fs.readFileSync(path.join(root, p)).toString('base64');
// The app icon's line art on a transparent ground, so it sits on the banner colour.
const icon = fs.readFileSync(path.join(root, 'art', 'nappebble-icon.svg'), 'utf8')
  .replace(/<rect id="background"[^>]*\/>/, '');
const iconUri = 'data:image/svg+xml;base64,' + Buffer.from(icon).toString('base64');
const badgeUri = 'data:image/svg+xml;base64,' + b64('art/badge/works-with-nappi-dark.svg');
const shotUri = 'data:image/png;base64,' + b64('docs/screenshots/emery_1_home.png');
const FONT = "Ubuntu, 'Liberation Sans', sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 320" width="720" height="320">
  <defs><clipPath id="shot"><rect x="484" y="46" width="200" height="228" rx="12"/></clipPath></defs>
  <rect width="720" height="320" fill="#1c1430"/>
  <image href="${shotUri}" x="484" y="46" width="200" height="228" clip-path="url(#shot)"/>
  <rect x="484" y="46" width="200" height="228" rx="12" fill="none" stroke="#3a4a5a" stroke-width="2"/>
  <image href="${iconUri}" x="28" y="26" width="96" height="96"/>
  <text x="124" y="84" font-family="${FONT}" font-size="40" font-weight="bold" fill="#4ade80">nappebble</text>
  <text font-family="${FONT}" font-size="19" fill="#c9d4de"><tspan x="36" y="150">Log to nappi from your wrist</tspan></text>
  <image href="${badgeUri}" x="36" y="228" width="226" height="56"/>
</svg>`;

const out = path.join(root, 'store', 'banner.png');
fs.writeFileSync(out, new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: true } }).render().asPng());
console.log('wrote banner.png 720x320');
