# Pebble Time 2 x nappi: Spec (draft 2, touch-first)

Target: **Pebble Time 2 (Emery, 200x228, 64-colour e-paper, touch)**. SDK 4.9+. Button fallback kept for when touch is disabled in Settings. Gabbro (Round 2) is a later port.

## Goal
Launch via Quick Launch, then **2 taps to log a diaper, bottle preset, or start a timer**. Everything on the main screen is a big tap target; nothing requires scrolling to reach the top actions.

Non-goals (v1): editing/deleting entries (API has no edit/delete), solids/medication logging (read-only in API), voice, watchface.

## Architecture (unchanged)
```
Watch app (C, touch UI)  <--AppMessage-->  PebbleKit JS (phone)  --HTTPS-->  api.nappi.app
```
- Watch: UI + local timer ticking only. No token, no network.
- pkjs: token, HTTP, cache, ETags, offline write queue, idempotency keys, timezone offset for ISO 8601.
- Clay settings page: token, baby picker (from `GET /v1/babies`), units (ml/oz), bottle presets, default bottle type, "exit after log", and **tile layout** (see below).

### Configurable tile layout (phone-side settings)
- Settings holds an ordered list of all available actions: Diaper, Bottle, Nursing, Sleep, Pump, Potty, Activity (plus Status, pinned last).
- Each action has a show/hide toggle. Visible actions fill the grid in list order: slots 1-4 on page 1, 5-8 on page 2, and so on (page dots appear only when needed).
- Reorder with Clay's drag-to-sort list if available, otherwise a numbered position picker per action. Defaults: Diaper, Bottle, Nursing, Sleep, Pump, Potty, Activity.
- pkjs sends the ordered list to the watch as part of `STATE` (an array of action IDs); the watch renders whatever it receives and caches the last layout in persistent storage so the grid appears instantly on launch.
- Nothing about layout is stored on the nappi side: it is purely a Pebble app setting.
- Also configurable here: per-action colour accent (optional, v2) and which bottle presets appear.

## Multiple babies
- Settings: after the token is entered, pkjs calls `GET /v1/babies`. User picks a default baby. With one baby the switcher is hidden and the header just shows the name.
- Switching: tap the header name -> sheet with one big button per baby (button fallback: long-press UP). The active baby is remembered across launches.
- Safety: each baby has an accent colour in the header and log sheets, and every confirmation names the baby ("Phoebe: Wet"), since the API has no delete.
- Tile layout is one global setting, not per baby.
- Data: full refresh (latest + timers) for the active baby only; other babies get a timers-only read so the header can show a dot when one of them has a timer running. Their latest entries load on switch, then cache. With 2 babies that is about 3 reads per refresh against the 12/min limit.
- No twin/"both babies" mode: every log targets exactly one baby.

## Rate limits (12 reads / 30 writes per min per token; they ask for <= 1 poll/min)
- On launch: `GET /entries/latest?types=sleep,nursing,bottle,diaper,pumping,potty` + `GET /timers` (2 reads), sent with `If-None-Match`.
- While open: refresh at most once per 60s; elapsed clocks tick locally from `started_at`.
- After a write: one debounced re-read. No background polling. Honour `Retry-After` on 429.
- Use a dedicated Pebble token (limits are per token).

## Screen geometry (Emery 200x228)
```
+--------------------------+  y=0
| Phoebe        o synced   |  header 24px (or running-timer banner)
+------------+-------------+  y=24
|  DIAPER    |   BOTTLE    |  tiles 96x100, 4px gutters
|  2h ago    |   3h ago    |
+------------+-------------+
|  NURSING   |   SLEEP     |
|  1h  L     |  45m ago    |
+------------+-------------+  y=228
```
- Tiles are 96x100 px, well above a comfortable touch target. Colour-coded per category (amber diaper, blue bottle, pink nursing, indigo sleep) with high-contrast text.
- **Swipe left/right** = page 2: Pump, Potty, Activity, Status (sync state, last error, queue length). Page dots at the bottom edge.
- **Running timer banner** replaces the header: `Sleeping 1:12:04`. Tap it to open the stop sheet.
- E-paper note: no continuous animation. Tile subtitles refresh once a minute; only the running-timer view redraws each second.

## Interaction model
- **Press feedback:** tile inverts on touch-down. Activation happens on lift-off only if the finger is still inside the same tile (drag out to cancel). This prevents most accidental wrist taps.
- **Long-press (~500 ms)** on a tile = backdate mode (see below).
- **Debounce:** 1.5s lockout per action after a log, since the API has no delete.
- **Feedback:** short vibe + a checkmark overlay (~600ms), then return to Home (or exit app if "exit after log" is on).
- **Button fallback** (also used if touch is disabled): UP/DOWN move focus between tiles, SELECT activates, BACK goes back. Detected with `touch_service_is_enabled()`; `PBL_TOUCH` gates touch-only code.

## Flows

### Diaper (2 taps)
Tap **Diaper** -> bottom sheet with 4 large buttons in a 2x2 grid: **Wet / Poo / Mixed / Dry**. Tap one -> `POST /entries {type: diaper, diaper_type}` -> checkmark.
A chip row above the buttons: `Now | -5 | -15 | -30 min` (default Now) sets the `time` field. Long-pressing the tile opens the sheet with the chip row focused.

### Bottle
Tap **Bottle** -> sheet with a 3x2 grid of preset amounts (configurable, defaults 60/90/120/150/180/210 ml or 2/3/4/5/6/7 oz) and a Formula / Breast milk toggle at the top (remembers last). Tap a preset -> logs. A **Custom** cell opens a vertical **pan slider** (drag to set, +/- nudge buttons) with a big Log button.

### Nursing (timer)
- Idle: tap **Nursing** -> Left / Right / Both big buttons -> `POST /timers/nursing/start {side}`.
- Running: tile shows side + elapsed. Tap -> running view: big clock, **Stop** button, **Switch side** (swipe left/right also switches), **Backdate start**.
- Stop -> `POST /timers/nursing/stop` (optionally `side` override).

### Sleep (timer)
Tap **Sleep** -> starts immediately (`already_running` treated as success). While running, tap opens the stop sheet showing elapsed time with a large **Stop** button (stop is never one accidental tap).

### Pump (page 2)
Start/stop timer like nursing; on stop, an optional amount picker (preset chips + pan slider) before `POST /timers/pumping/stop {amount, unit}`.

### Potty / Activity (page 2)
Potty: Potty / Accident / Sat dry buttons. Activity: scrollable grid of the most common types (bath, tummy time, play, outdoor, ...), with a duration chip row.

### Backdating
Long-press any tile -> same flow, with chip row `-5 / -10 / -15 / -30 / -60 min` pre-opened. Entries send `time`; timers send `start_time` (API allows up to 48h back).

## Touch implementation notes
- `touch_service_subscribe()` only while a touch-capable window is visible; unsubscribe on disappear (the sensor draws power while subscribed).
- Do hit-testing ourselves against tile rects; track touch-down tile, cancel on leaving it, fire on lift-off. Use gesture recognizers (swipe, pan) for page swipes and the amount slider; confirm exact event enum names against the SDK headers.
- Check how touch interacts with backlight (SDK docs have a "Backlight Behavior" section).
- Test in the emulator first: `pebble install --emulator emery`, with touch events injected via the QEMU tooling.

## API mapping
| Action | Call |
|---|---|
| Config: baby list | `GET /v1/babies` |
| Home data | `GET /v1/babies/{id}/entries/latest?types=...` |
| Running timers | `GET /v1/babies/{id}/timers` |
| Log diaper / potty / bottle / nursing / pumping / sleep / activity | `POST /v1/babies/{id}/entries` + `Idempotency-Key` |
| Start / stop timer | `POST /v1/babies/{id}/timers/{sleep|nursing|pumping}/start|stop` |

## Reliability
- Writes go through a pkjs queue; each gets a UUID idempotency key at creation, so retries never double-log. Queue persists in localStorage and flushes when the phone reconnects.
- Optimistic UI with a small "pending" dot on the tile until confirmed.
- Error screens: no token, `unauthorized` / `token_expired`, `premium_required`, phone disconnected, network down (queue and continue), rate limited (retry banner).
- Timers are household-shared and may change from other devices; reconcile on every refresh, and treat `409 timer_not_running` as a silent refresh.

## AppMessage protocol (sketch)
- Watch -> phone: `REFRESH`, `LOG_DIAPER(type, offset_min)`, `LOG_BOTTLE(amount, bottle_type, offset_min)`, `LOG_POTTY`, `LOG_ACTIVITY`, `TIMER_START(type, side, offset_min)`, `TIMER_STOP(type, side, amount)`.
- Phone -> watch: `STATE` (epoch timestamps + short enums per type, timer list, units, presets, baby name), `ACK(cmd_id, ok|error_code)`.
- Keep payloads small; send epoch seconds and enum ints, format text on the watch.

## Project layout
```
nappebble/
  package.json            (targetPlatforms: emery; messageKeys)
  src/c/  main.c  home.c  sheets.c  timer_view.c  touch.c  comm.c  state.c
  src/pkjs/  index.js  api.js  queue.js  cache.js  config.js (Clay)
  resources/ icons, fonts
  test/      api client tests with mocked responses
```

## Milestones
1. **M0:** project builds for emery, Clay config, token + baby select, `GET /babies` from pkjs.
2. **M1 (fast path):** Home grid from cache, tile press states, Diaper sheet -> logged with idempotency.
3. **M2:** timers (sleep, nursing) with running banner and stop sheet.
4. **M3:** bottle presets + pan slider, pump, potty, activity, backdating chips, page 2 swipe.
5. **M4:** offline queue, ETag/304, 429 handling, error screens, button fallback.
6. **M5:** launcher app glance, timeline pins, Gabbro port.

## Open questions
- Single baby assumed; need a quick baby switcher?
- Final tile order and bottle preset values.
- Rebble vs Core Devices app/store for distribution.
- C + PebbleKit JS (assumed here) vs the newer Moddable/Alloy JS route.
- Quick test before building: does nappi's own timer notification mirror to the watch?
