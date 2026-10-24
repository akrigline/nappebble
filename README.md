# pebble-nappi

Pebble Time 2 (Emery, touch) companion for the nappi baby tracker. C watch app plus PebbleKit JS on the phone talking to `api.nappi.app`. Spec: `../docs/pebble-nappi-spec-v2.md`. API notes: `../docs/nappi-api.md`.

## Commands

```sh
npm test                        # node:test suite, no Pebble tooling needed
pebble build                    # emery .pbw (SDK 4.33.1)
npm run mock                    # fake nappi API on http://127.0.0.1:4010 (TWO_BABIES=1 adds a second baby)
pebble install --emulator emery
pebble logs --emulator emery
pebble screenshot --emulator emery out.png
```

Mock tokens: `dev-token` (good), `expired-token`, `revoked-token`, `free-token` (no Premium).

## Driving settings in the emulator

`pebble emu-app-config --emulator emery` opens the Clay page and listens on `http://localhost:<port>/close?`. The page's Save button redirects there with the form values. To skip the browser, GET that URL yourself with the URL-encoded JSON, e.g. `{"token":{"value":"dev-token"},"baseUrl":{"value":"http://localhost:4010"}}`. The port is in the generated `~/pebble-tool-emu-app-config-*.html` (`return_to=`), which the tool deletes once used.

## Layout

- `src/c/main.c` watch UI (M0: baby name + status).
- `src/pkjs/` phone logic. `index.js` is the only file touching Pebble globals; everything else is plain CommonJS under test.
- `test/support/` mock nappi API (`mock-nappi.js`) and its HTTP wrapper.

## Gotchas

- pkjs is bundled by webpack 1: stay within ES2015 syntax (no trailing commas in calls, no object spread, no async/await). `test/syntax.test.js` is a tripwire; `pebble build` is the authority.
- After changing `messageKeys` in `package.json`, run `pebble clean` or the generated `MESSAGE_KEY_*` header goes stale.
- Clay builds its widgets from the config passed to its constructor, so `index.js` makes a new Clay per settings page.
- The docs give no error code for 429 or 404; the client branches on HTTP status for 429.
