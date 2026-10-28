# Appstore listing: nappebble

Everything the Developer Dashboard (or `pebble publish`) asks for. Field limits and sizes are from https://developer.repebble.com/guides/appstore-publishing/preparing-a-submission. Text fields are plain text, so the blocks below carry no markdown.

## Fields

| Field | Value |
|---|---|
| Name | nappebble |
| Type | Watchapp (`watchface: false`) |
| Category | Health & Fitness |
| Platforms | emery (Pebble Time 2). Gabbro is a later port. |
| Version | 0.1.0 (every release needs a new, higher version) |
| UUID | `9d7f77ad-7857-480d-b1fa-73eff0df3926`. Never change it: it is how the store matches releases to this listing. |
| Website URL | none yet |
| Source code URL | none yet |
| Companion app | none (the phone side is PebbleKit JS inside the .pbw) |
| Visibility | Unlisted for the first release, Listed once it has been used for real (see the checklist) |

## Description

```
Log your baby's feeds, diapers and sleep to nappi from your wrist.

nappebble puts nappi on your Pebble Time 2. Open it, tap a big colour tile, and the entry is logged. Most things take two taps, so it works one-handed with a baby in the other arm.

WHAT YOU CAN LOG
- Sleep, nursing and pump timers. Tap to start, tap the running timer to stop. Nursing can switch sides.
- Bottles with an amount in oz or ml, as formula or breast milk.
- Diapers (wet, poo, mixed, dry) and potty (potty, accident, sat dry).
- Anything can be backdated by up to 60 minutes with a slider, for when you could not get to your watch.

BUILT FOR TIRED THUMBS
- Big touch tiles in nappi's colours. The buttons work too if you turn touch off.
- Each tile shows how long ago it was last logged and the latest detail, so a glance answers "when did baby last eat?".
- Works offline. Entries queue on your phone and send when it reconnects, without double-logging.
- More than one baby? Switch from the header. Each baby has an accent colour and every confirmation names the baby.
- Choose which tiles appear and in what order.

WHAT YOU NEED
- A nappi account with Premium. nappi's API is a Premium feature.
- An API token from nappi. How to create one is in nappi's API documentation: https://nappi.app/app/api/reference. Paste it into nappebble's settings in the Pebble app, then pick your baby.
- A Pebble Time 2.

PRIVACY
Your token stays in the Pebble app on your phone. nappebble only talks to api.nappi.app: no analytics, no other servers, nothing stored anywhere else.

nappebble is an independent app and is not made by or affiliated with nappi.
```

The last line is a draft: confirm it is true before publishing, and if you are connected to nappi, drop it or reword it.

## Release notes (0.1.0)

```
First release (early version). Log diapers, bottles, potty, and sleep, nursing and pump timers to nappi from a Pebble Time 2. Works offline, supports several babies, and the tiles can be reordered in settings.
```

## Assets

| Asset | Size | File | State |
|---|---|---|---|
| Small icon | 80x80 | `store/icon-small.png` | Done |
| Large icon | 144x144 | `store/icon-large.png` | Done |
| Menu icon (in the .pbw) | 25x25 | `resources/icons/menu-icon.png` | Done |
| Screenshots | 200x228 each, up to 5, no frame | `store/screenshots/emery_*.png` | One taken, to be retaken |
| Banner | 720x320, optional | none | Skipped |

The store icons and the menu icon are made from nappi's own logo (`art/nappi-logo.png`; `node tools/make-store-assets.js` and `node tools/make-icons.js`). That is nappi's artwork, so get nappi's agreement to use it before a public listing, and note it sits oddly beside the "not affiliated" line above: if you do have their blessing, reword that line to say so.

## Before publishing

1. Try it for real. Touch on a real watch and the real nappi API have only been exercised through the mock. Publish as Unlisted first and switch to Listed after a few days of actual use.
2. Settle the affiliation line above and the icon question.
3. Take the screenshots (page 1, page 2, a logging sheet) against the mock server. Filenames must start with the platform, for example `emery_1_home.png`.
4. `pebble login`, then `pebble publish`. It reads the version and UUID from `package.json`, asks for the rest, and creates the listing.
5. Later releases: bump `version` in `package.json`, `pebble build`, `pebble publish --release-notes "..."`.
