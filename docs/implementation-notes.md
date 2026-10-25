# Implementation notes: first full pass

Status of `docs/pebble-nappi-spec-v2.md` against the code. Milestones M0 to M4 are built; M5 is not started.

## What exists

| Spec area | State |
|---|---|
| Home grid, colour tiles, 4 per page, page dots, swipe / button paging | Built. Layout and order come from phone settings. |
| Running-timer banner replacing the header, tap to open the stop screen | Built |
| Press feedback, lift-off activation, drag-out cancel, long-press, 1.5 s lockout | Built as host-tested C (`touch_fsm`, `lockout`) |
| Diaper, Bottle, Nursing, Sleep, Pump (with amount), Potty. Activity is gone. | Built |
| Time strip (Now back to 60 min ago in 5 min steps, readout shows the clock time that would be logged, opens at Now) on Diaper, Potty, Nursing, Sleep start, Pump start and Bottle | Built |
| Amount strip (bottle 0.5 to 12 oz / 10 to 360 ml, pump 0.5 to 20 oz / 10 to 600 ml; starts at the last amount logged on that screen, else 4 oz / 120 ml) | Built |
| Per-screen units: an oz / ml chip pair on Bottle and Pump "How much?"; the watch sends `SET_UNITS` and the phone saves it as that screen's unit | Built |
| Button zones on every sheet (time strip, unit chips and amount strip are adjust zones; the action buttons are the choice zone) | Built |
| Multiple babies: switcher, accent colour per baby, every confirmation names the baby, dot (`*`) when another baby's timer runs | Built |
| Offline write queue, idempotency keys, optimistic UI, ETag / 304, 429 handling, once-a-minute refresh | Built |
| Button fallback (UP/DOWN move the focused strip or cycle the buttons, SELECT moves to the next zone or logs, BACK moves to the previous zone, long SELECT) | Built |
| Clay settings: token, baby, bottle units, pump units, tile order/visibility, default bottle type, exit after log, API address | Built |
| M5: launcher glance, timeline pins, Gabbro port | Not started |

## Where it departs from the spec, and why

- **Switch side is stop-then-start.** The API has no way to change the side of a running nursing timer. The watch sends `TIMER_SWITCH`; the phone queues a stop (which saves the feed on the current side) and a start on the other side. Each side becomes its own nursing entry.
- **No "backdate start" on a running timer.** The API cannot edit a running timer's start, so backdating is only offered on the start sheet, through the time strip (reached by a tap, or by a long press on Sleep and Pump).
- **Writes carry the tap time when delivered late.** A job queued more than 30 s ago is stamped with its queue time (`time` / `start_time` / `end_time`). Prompt sends carry no time, so a phone clock running ahead of the server cannot cause a "start in the future" rejection. Found by running the offline scenario in the emulator.
- **Paused timers** (the API reports `paused`; the spec ignored it): shown as "Paused", clock frozen.
- **Status / error screens are a header status plus the Status sheet**, not a full-screen takeover per error. Writes the API rejects for good (400/404) are dropped and logged, and the caches are reloaded; the watch does not yet tell the user.
- **Page 2 is not special.** Status is the last tile in the user's layout (always appended), so it lands on page 2 only with the default order.
- **Activity is removed.** The tile, sheet, command, message keys, Clay layout entry and tests are gone from the watch and the phone. A saved layout that still lists it is tolerated. The API client and mock still support activities.
- **Presets and the Custom screen are replaced by the amount strip.** The Clay bottle presets setting is gone; the starting amount is the last amount logged on that screen.
- **Long press is kept only on Sleep and Pump.** A tap starts the timer at once; a long press opens the start sheet to backdate. On every other tile a long press is a tap. This replaces the spec's long-press backdate set (-5..-60 min chips) with the time strip.
- **Units are per screen and can be changed from the watch.** The single Clay "Units" setting became "Bottle units" and "Pump units" (an old `units` value seeds both). The oz / ml chips send `SET_UNITS` (screen 0 bottle, 1 pump; units 0 oz, 1 ml); the phone ACKs, saves and pushes state. If the send cannot be queued the unit stays unchanged and "Phone not connected" shows. A write keeps the unit it was logged in, even if the unit changes before the queue flushes: the watch sends the unit with `LOG_BOTTLE` and the pump `TIMER_STOP` (ARG4), and the phone falls back to its saved setting only if it is absent or invalid.
- Acknowledgement is optimistic: the ACK means "queued", and the checkmark shows immediately. Delivery happens afterwards.

## Verified, and not

Automated (all run by `npm test`):
- 315 JS tests against a mock of the whole API: contract tests for the mock itself, client, queue, engine, state builder, settings, Clay config, protocol sync, and the real `index.js` entry point under fake Pebble globals.
- 354 C checks on the watch logic, compiled with `-Wall -Wextra -Werror -pedantic`.
- `protocol-sync.test.js` fails if `protocol.h`, `protocol.js` or `package.json` message keys disagree.

Exercised by hand in the Emery emulator with the mock server: launch from cache, status states, every sheet, diaper / bottle logging, sleep / nursing / pump timers, switch side, baby switching, paging by buttons, backdating with the time strip driven by buttons, and offline queue then recovery. Touch dragging on the strips was not run.

**Not verified**
- **Real touch.** The emulator has no touch injection here, so the touch handler in `grid_view.c` is untested end to end. The gesture logic it calls is unit-tested. Test on a Time 2 early.
- **The real nappi API.** There is no token yet. The mock follows the published OpenAPI spec; the assumptions it had to make are listed at the top of `test/support/mock-nappi.js`.
- **The Clay settings page in a browser or in the Core Devices app.** Only its data path was exercised.
- **A real phone's XHR.** The emulator's XHR reports failures differently from a browser (see below); a real phone may differ again.
- **Touch dragging on the time and amount strips** was not run in the emulator, nor was the once-a-minute clock refresh of the time strip. The strip maths (x to value, snapping, nudging) is unit-tested; the touch path through `grid_view.c` is not.
- **The Clay page with the two unit selects** (Bottle units, Pump units) was not opened in a browser or the Core Devices app.
- **The readout font width on a real watch.** The long time readout ("60 min ago - 12:41 PM") and the amount readout have only been seen in the emulator.
- Exit-after-log and persisted-cache launch after a cold start were not run on a device.
- **A queued `SET_UNITS` that is later NACKed or times out is not handled on an open sheet.** The sheet and the phone's saved setting could then disagree until the sheet is reopened; amounts are still logged in the unit the sheet showed, because the unit travels with the command. (A send that cannot be queued is handled: the unit stays unchanged and "Phone not connected" shows.)
- **An open sheet does not follow unit changes made in the phone settings** until it is reopened; amounts it logs are still in the unit it showed, because the unit travels with the command.

**Known issue, not fixed here**
- After the pump stop flow returns to Home, Up / Down / Select stop responding and Back exits the app. It was seen before this work and reproduced at the commit prior to the sheets rewrite, so it is not caused by the strips. Likely cause: the timer view popping itself while `ui_pop_to_home` runs. Not investigated further.

## Things learned the hard way

- The emulator's `XMLHttpRequest` signals a refused connection only via `readystatechange` (status 0). The transport listens to every signal and has its own watchdog; without that a dead network wedged the engine forever.
- pkjs is bundled by webpack 1: ES2015 syntax only (`test/syntax.test.js` is a tripwire).
- After changing `messageKeys`, run `pebble clean` or `MESSAGE_KEY_*` goes stale.
- The touch API is raw (`TouchEvent_Touchdown` / `PositionUpdate` / `Liftoff`); taps, swipes and long-press are decided in `touch_fsm.c`.
- Verification `curl`s against the mock share the app's token, so they eat the app's 12 reads/min.

## Layout

```
src/pkjs/   phone: index.js (glue) app.js (engine) api.js queue.js commands.js optimistic.js state.js
            config.js settings.js protocol.js wire.js time.js uuid.js xhr-transport.js babies.js
src/c/      watch UI: main.c comm.c grid_view.c ui.c home.c sheets.c timer_view.c
src/c/logic plain C, host-tested: fmt layout touch_fsm lockout strip amount nav model protocol.h
test/       *.test.js (node:test), c/ (host C tests), support/ (mock API, harness, dev server)
```
