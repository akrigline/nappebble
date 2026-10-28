# nappebble

Pebble Time 2 (Emery, touch) companion for the nappi baby tracker. C watch app plus PebbleKit JS on the phone talking to `api.nappi.app`. Spec: `docs/nappebble-spec-v2.md`. API notes: `../docs/nappi-api.md`. What is built, what differs from the spec, and what is unverified: `docs/implementation-notes.md`.

## Commands

```sh
npm test                        # JS tests (node:test) then host-side C tests; no Pebble tooling needed
npm run test:js | test:c        # either half alone
pebble build                    # emery .pbw (SDK 4.33.1)
SEED=1 TWO_BABIES=1 npm run mock   # fake nappi API on http://127.0.0.1:4010, with some history
pebble install --emulator emery
pebble logs --emulator emery
pebble screenshot --emulator emery out.png
pebble emu-button click select down up back   # button fallback; add --duration 900 for a long press
```

Mock tokens: `dev-token` (good), `expired-token`, `revoked-token`, `free-token` (no Premium).

## Driving settings in the emulator

`pebble emu-app-config --emulator emery` opens the Clay page and listens on `http://localhost:<port>/close?`. The page's Save button redirects there with the form values. To skip the browser, GET that URL yourself with the URL-encoded JSON, e.g. `{"token":{"value":"dev-token"},"baseUrl":{"value":"http://localhost:4010"}}`. The port is in the generated `~/pebble-tool-emu-app-config-*.html` (`return_to=`), which the tool deletes once used.

Units are two settings, `bottleUnits` and `pumpUnits` (`oz` or `ml`), e.g. `"bottleUnits":{"value":"ml"}`. The watch changes them too: the oz / ml chips on Bottle and Pump "How much?" send `SET_UNITS` (CMD 10; args: screen 0 bottle / 1 pump, units 0 oz / 1 ml). The phone saves the unit, ACKs, then pushes state.

## Layout

- `src/pkjs/` phone logic. `index.js` is the only file touching Pebble globals; everything else is plain CommonJS under test.
- `src/c/logic/` the watch's decisions as plain C (formatting, geometry, touch gestures, lockout, strips, tile text), unit-tested on the host with gcc.
- `src/c/` the Pebble UI: one reusable `GridView` window drives Home and every sheet.
- `src/pkjs/protocol.js` is the source of truth for enums and message keys; `src/c/logic/protocol.h` and `package.json` must match, and a test enforces it.
- `art/icons/*.svg` are the nappi app's 24px tile icons; `node tools/make-icons.js` (after `npm i --no-save @resvg/resvg-js pngjs`) renders them to the 1-bit PNGs in `resources/icons/`. `grid_view.c` recolours them to each tile's text colour. The launcher menu icon (`menu-icon.png`) and the appstore icons in `store/` are made from `art/nappi-logo.png` by the same script and `tools/make-store-assets.js`.
- `test/support/` mock nappi API (`mock-nappi.js`), engine harness, HTTP wrapper and dev server.

## Gotchas

- pkjs is bundled by webpack 1: stay within ES2015 syntax (no trailing commas in calls, no object spread, no async/await). `test/syntax.test.js` is a tripwire; `pebble build` is the authority.
- After changing `messageKeys` in `package.json`, run `pebble clean` or the generated `MESSAGE_KEY_*` header goes stale.
- Clay builds its widgets from the config passed to its constructor, so `index.js` makes a new Clay per settings page.
- The docs give no error code for 429 or 404; the client branches on HTTP status for 429.
- The emulator's XHR reports a refused connection only through `readystatechange`; `xhr-transport.js` copes and has a watchdog.

## License

MIT, see `LICENSE`. The tile icons in `art/icons/` and the logo in `art/nappi-logo.png` (with the menu and store icons built from it) are nappi's artwork, not ours, and the MIT license does not cover them.
