# Implementation notes: first full pass

Status of `docs/nappebble-spec-v2.md` against the code. Milestones M0 to M4 are built; M5 is not started.

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
- **Status / error screens are a header status plus the Status sheet**, not a full-screen takeover per error. Writes the API rejects for good (400/404) are dropped and the caches are reloaded; the phone sends the watch an unprompted ACK (id 0, `REJECTED`) and the watch vibrates and shows "nappi rejected a log". There is still no persistent last-error line on the Status sheet.
- **Page 2 is not special.** Status is the last tile in the user's layout (always appended), so it lands on page 2 only with the default order.
- **Activity is removed.** The tile, sheet, command, message keys, Clay layout entry and tests are gone from the watch and the phone. A saved layout that still lists it is tolerated. The API client and mock still support activities.
- **Presets and the Custom screen are replaced by the amount strip.** The Clay bottle presets setting is gone; the starting amount is the last amount logged on that screen.
- **Long press is kept only on Sleep and Pump.** A tap starts the timer at once; a long press opens the start sheet to backdate. On every other tile a long press is a tap. This replaces the spec's long-press backdate set (-5..-60 min chips) with the time strip.
- **Units are per screen and can be changed from the watch.** The single Clay "Units" setting became "Bottle units" and "Pump units" (an old `units` value seeds both). The oz / ml chips send `SET_UNITS` (screen 0 bottle, 1 pump; units 0 oz, 1 ml); the phone ACKs, saves and pushes state. If the send cannot be queued the unit stays unchanged and "Phone not connected" shows. A write keeps the unit it was logged in, even if the unit changes before the queue flushes: the watch sends the unit with `LOG_BOTTLE` and the pump `TIMER_STOP` (ARG4), and the phone falls back to its saved setting only if it is absent or invalid.
- **The checkmark waits for the phone's ACK.** `ui_send` shows "Sending..." and only vibrates and shows the checkmark when the phone ACKs the command id. The ACK still means "queued on the phone"; delivery to nappi happens afterwards. A NACK status, a send that never got through, or 6 s of silence shows an error instead. If the send never reached the phone the action's lockout is cleared so the user can tap again at once.
- **The outbox retries, but not blindly.** `comm.c` keeps a small FIFO (4) and retries a busy outbox, a disconnected phone and a NACK (PebbleKit JS not up yet) up to 4 times 600 ms apart. A send that timed out is not retried: it may have arrived and a second copy could log twice.
- **Exit after log waits for delivery.** PebbleKit JS stops with the app, so the app holds on ("Saving...", up to 6 s) until the phone reports nothing pending. Writes stay queued on the phone if that never happens and go out next launch.
- **Writes name the baby.** Every command carries `BABY_INDEX`; the phone ACKs `WRONG_BABY` and resends state if it is no longer the active baby. Omitted when the watch has no data yet.
- **Queued writes are laid back over every read.** The cache still takes the optimistic guesses in place, but `readEverything` replays `queue.all()` on top of the server data so a refresh cannot make a pending log vanish.
- **Read and write limits are separate.** A write 429 sets `writeBlockedUntil` only and schedules its own retry; reads carry on. `status` after a read is the last write status, so a good read does not hide a stuck write. The once-a-minute throttle and a read block no longer skip flushing the queue.
- **Read budget.** The engine counts its own reads in a sliding minute; the debounced re-read after a write skips the other babies' timers and is skipped altogether with fewer than 4 reads left. A forced refresh asked for while one is running runs again afterwards. The Status sheet's Refresh sends `ARG1 1` to bypass the one-a-minute throttle.

## Verified, and not

Automated (all run by `npm test`):
- 333 JS tests against a mock of the whole API: contract tests for the mock itself, client, queue, engine, state builder, settings, Clay config, protocol sync, and the real `index.js` entry point under fake Pebble globals.
- C checks on the watch logic, compiled with `-Wall -Wextra -Werror -pedantic`.
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

**Fixed from the council review, not yet checked on a device**
- After the pump stop flow returned to Home, Up / Down / Select stopped responding and Back exited the app. Likely cause (found by reading, never reproduced): the timer view popped itself from its own appear / state handler while `ui_pop_to_home` was still popping. It now defers its close with a 0 ms timer, closes with `window_stack_remove`, and does nothing while a confirmation is up. Needs a run on the emulator or a watch to confirm the symptom is gone.
- The ACK / retry / exit-after-log paths in `comm.c` and `ui.c` compile but are not host-tested (they sit on the Pebble SDK). Try: log with the phone app closed, log straight after launch, stop the phone's Bluetooth, and exit-after-log with the phone offline.

**Raised by the council and left alone**
- Swipe on the nursing timer screen still switches side (stop then start, so one feed becomes two entries and there is no delete). The spec asks for the swipe; a confirmation would be a product decision.
- A stop retried after a lost response could stop a timer another device has just started.
- The queue is not tied to the token: changing the token clears the cache but not queued writes. A 401/403 still halts the whole queue.
- `baseUrl` accepts `http://`.
- Home redraws every second while a timer runs; the spec wants that only on the timer screen.
- No persistent last-error line on the Status sheet; no check of `touch_service_is_enabled()`; the baby switcher caps at 4.

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
