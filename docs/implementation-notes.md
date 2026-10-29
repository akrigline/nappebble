# Implementation notes: first full pass

Status of `docs/nappebble-spec-v2.md` against the code. Milestones M0 to M4 are built; M5 is not started.

## What exists

| Spec area | State |
|---|---|
| Home grid, colour tiles, 4 per page, page dots, swipe / button paging | Built. Layout and order come from phone settings. |
| Running-timer banner replacing the header, tap to open the stop screen | Built |
| Press feedback, lift-off activation, drag-out cancel, long-press, 1.5 s lockout | Built as host-tested C (`touch_fsm`, `lockout`). A gesture survives a content refresh (see below). |
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
- **The checkmark waits for the phone's ACK, and the watch says only what it knows.** `ui_send` shows "Sending..." and vibrates and shows the checkmark only when the phone ACKs the command id. The ACK still means "queued on the phone"; delivery to nappi happens afterwards. The decisions are a small host-tested state machine, `logic/send_flow`; `ui.c` owns the timers, vibes and overlays.
  - **One logging command in flight.** While one is awaiting its ACK, `ui_send` refuses another with a "Still sending" notice. Baby switch, units and Refresh do not use this slot (they call `comm_send` directly) and so can never show a checkmark or trigger exit-after-log.
  - **The ACK timeout belongs to the flow, not to a view.** A 6 s `AppTimer` starts when the command is first handed to AppMessage (so a command waiting for the phone to become ready does not time out early) and is cancelled on the ACK. Back during "Sending..." or a later overlay does not cancel it.
  - **No reply means unknown, not failed.** An AppMessage give-up after a send or the 6 s timeout shows "Not confirmed. Check nappi" (double pulse, no suggestion to retry) and the watch sends one forced refresh (`CMD_REFRESH`, `ARG1 1`) so the next state shows whether the entry landed. The lockout is not cleared. A late OK ACK after that is ignored.
  - **Refusals that mean nothing was logged** (`NOT_SENT`, `NO_TOKEN`, `NO_BABY`, `WRONG_BABY`, `ERROR`) show an error banner and clear the action's lockout so the user can tap again at once.
  - **Leaving the view does not lose the result.** If the user presses Back and the OK ACK arrives later, the checkmark and vibration show on whatever view is on top, but nothing navigates: no pop to Home and no exit-after-log. Navigation and exit only happen while the view that sent the command is still on top. A late refusal shows its banner on the top view the same way.
- **The outbox retries, but not blindly.** `comm.c` keeps a small FIFO (4) and retries a busy outbox, a disconnected phone and a NACK up to 4 times 600 ms apart. A send that timed out is not retried: it may have arrived and a second copy could log twice.
- **The watch waits for PebbleKit JS before it sends (`JS_READY`).** The phone's `start()` sends `{ JS_READY: 1 }` first, on every launch, token or not, ahead of any state. `comm.c` holds commands (it still accepts up to 4) until the phone has said anything on this connection. PebbleKit JS is believed to start a fresh context on each reconnect, so readiness is per connection: `comm.c` subscribes to the phone-connection service, forgets readiness on every connection change, and arms an 8 s fallback timer at launch and on each reconnect. If the fallback fires with no word from the phone, commands go out anyway (the retry logic then applies) so a dropped ready message cannot wedge the app, and Home's header shows red "No phone app" until any message from the phone arrives. The decision is host-tested in `logic/ready_gate`; `comm.c` has a link handler that only redraws when that header changes. If the gate is closed and the phone is disconnected, queued commands are given up with "not sent" instead of waiting for nothing. The watch no longer sends a refresh at launch: the phone's `start()` sends state and refreshes by itself.
- **Exit after log waits for delivery, and stays open if it cannot be sure.** PebbleKit JS stops with the app, so with the setting on the app holds on until the phone reports its whole queue empty (`pending == 0`), not just this write. It waits for the first state received after the ACK (the phone sends the ACK first, then a state whose `pending` already counts the new write); if that state has `pending == 0` it exits, otherwise it shows "Saving..." (a 7 s overlay) and keeps waiting for a later state with `pending == 0`. A backlog therefore takes the stay-open path. The wait has its own 6 s timer and is tied to the view that started it: if that view is no longer on top the wait is dropped, so Back during "Saving..." cannot make the app quit later from another screen. On timeout the app stays open: "Saved on your phone. Will send later", then Home. `exit_reason_set(APP_EXIT_ACTION_PERFORMED_SUCCESSFULLY)` is called only on the delivered path. Writes stay queued on the phone and go out next launch.
- **Writes name the baby.** Every command carries `BABY_INDEX`; the phone ACKs `WRONG_BABY` and resends state if it is no longer the active baby. Omitted when the watch has no data yet.
- **Queued writes are laid back over every read.** The cache still takes the optimistic guesses in place, but `readEverything` replays `queue.all()` on top of the server data so a refresh cannot make a pending log vanish.
- **Read and write limits are separate.** A write 429 sets `writeBlockedUntil` only and schedules its own retry; reads carry on. `status` after a read is the last write status, so a good read does not hide a stuck write. The once-a-minute throttle and a read block no longer skip flushing the queue.
- **Read budget.** The engine counts its own reads in a sliding minute; the debounced re-read after a write skips the other babies' timers and is skipped altogether with fewer than 4 reads left. A forced refresh asked for while one is running runs again afterwards. The Status sheet's Refresh sends `ARG1 1` to bypass the one-a-minute throttle.
- **A touch gesture survives a content refresh.** The once-a-second timer refresh, the sheets' once-a-minute clock and phone state messages used to rebuild the hit rects mid-gesture and cancel the press, so a tap on Stop could be lost. Text-only changes now go through `grid_view_redraw` (dirty the layer, touch nothing else); `grid_view_commit` is for real structure changes. Each cell has a small `key` (Home: the action id plus one for tiles, 99 or 100 plus the timer for the header; elsewhere 0), and `touch_fsm` keeps an active gesture across a rebuild only if its target still exists with the same rect and the same key. Otherwise it is cancelled as before. A gesture that started on empty space is kept so a swipe still completes. After a commit the pressed highlight is derived from the FSM.
- **Home ticks once a minute and shows minutes.** Home subscribes to the minute tick only. Tile and banner elapsed time is `<1m`, `12m`, `1h`, `1h 12m` (`fmt_elapsed_min`); it can lag the true value by up to a minute, and a new state message refreshes it at once. The running-timer screen keeps its `m:ss` clock and its one-second tick.
- **A cached state is shown as cached.** The persisted state is still written at exit only. `WatchState` has a watch-only `from_cache` flag, set when the state came from the persisted blob and cleared by the first state message from the phone. While set, Home's dot is grey and its status line says "Cached" (the Status sheet says it is showing the last saved state). Red "No phone app" outranks grey "Cached". A compile-time check on `sizeof(WatchState)` in `model.h` fails the build if the struct changes without bumping `PERSIST_VERSION` in `comm.c`. At exit with no data the persisted blob is deleted, so an old state cannot come back as "Synced".
- **Touch off is handled.** If `touch_service_is_enabled()` is false when a view appears, the view does not subscribe to touch, shows the button focus ring at once, and the first view to appear shows "Touch is off. Using buttons." once. That notice is an overlay and blocks the buttons for its 2.5 s. Each view disables the system touch bridge (`window_set_touch_bridge_disabled`) because it reads raw touch itself. The first touch after the watch idles (`non_navigational`) is ignored on purpose: an accidental tap cannot be undone.
- **Baby switch and Refresh say when they could not be sent.** If `comm_send` fails, the baby sheet shows "Phone not connected" and stays open; on success it pops as before. Status "Refresh" shows "Phone not connected" on failure and a short "Refreshing..." on success. These check only that the command was queued on the watch, not that the phone received it; the wrong-baby guard still protects the next write if a switch never arrived.
- **The token only goes to https, or to this phone or a private network.** The settings store and the Clay parser reject an API address that is not `https:` unless its host is `localhost`, `[::1]`, or a loopback or private IPv4 address (`127.*`, `10.*`, `172.16-31.*`, `192.168.*`), so testing against a dev machine still works. A rejected value from the Clay page is ignored (the previous address is kept) and logged; the field's description on the page states the rule. A bad address that an earlier install saved falls back to the default at read time.
- **No nursing swipe.** A horizontal swipe on the running nursing timer no longer switches side; the "Switch side" button stays. The original spec asked for the swipe; it was dropped on purpose because the switch is stop-then-start (one feed becomes two entries and there is no delete), and a stray swipe cannot be undone. Page swipes on Home are unaffected.
- **Guards.** `GRID_MAX_CELLS` is defined as `TOUCH_MAX_RECTS` (16), so cells and hit rects cannot disagree; dropped cells, a full live-view table and a full icon cache are logged at error level; `main.c` has an `#error` for any platform other than Emery.
- **CI.** A GitHub Actions workflow runs `npm ci` and `npm test` on push to `main` and on pull requests. `pebble build` stays local.

## Verified, and not

Automated (all run by `npm test`):
- JS tests against a mock of the whole API: contract tests for the mock itself, client, queue, engine, state builder, settings, Clay config, protocol sync, and the real `index.js` entry point under fake Pebble globals.
- C checks on the watch logic (including `touch_fsm`, `send_flow`, `ready_gate`, `fmt`, `model`), compiled with `-Wall -Wextra -Werror -pedantic`.
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
- **The review-fixes change as a whole needs a device pass** (touch, the ready handshake, the send flow and exit-after-log cannot be fully exercised in the emulator). The checklist is in `docs/superpowers/specs/2026-10-28-review-fixes-design.md` (Acceptance). Three things are still assumptions: that `connection_service_peek_pebble_app_connection()` is already false inside the disconnect handler; that PebbleKit JS really restarts on each reconnect, so `JS_READY` is sent again (the 8 s fallback covers it if not); and that "Saved on your phone. Will send later" fits the banner.
- **A queued `SET_UNITS` that is later NACKed or times out is not handled on an open sheet.** The sheet and the phone's saved setting could then disagree until the sheet is reopened; amounts are still logged in the unit the sheet showed, because the unit travels with the command. (A send that cannot be queued is handled: the unit stays unchanged and "Phone not connected" shows.)
- **An open sheet does not follow unit changes made in the phone settings** until it is reopened; amounts it logs are still in the unit it showed, because the unit travels with the command.

**Fixed from the council review, not yet checked on a device**
- After the pump stop flow returned to Home, Up / Down / Select stopped responding and Back exited the app. Likely cause (found by reading, never reproduced): the timer view popped itself from its own appear / state handler while `ui_pop_to_home` was still popping. It now defers its close with a 0 ms timer, closes with `window_stack_remove`, and does nothing while a confirmation is up. Needs a run on the emulator or a watch to confirm the symptom is gone.
- The send-confirm decisions (`logic/send_flow`) and the readiness decision (`logic/ready_gate`) are host-tested, but the glue in `comm.c` and `ui.c` (timers, overlays, AppMessage, the connection service) sits on the Pebble SDK and is not. Try: log with the phone app closed, log straight after launch, stop the phone's Bluetooth, and exit-after-log with the phone offline.

**Raised by the council and left alone**
- A stop retried after a lost response could stop a timer another device has just started.
- The queue is not tied to the token: changing the token clears the cache but not queued writes. A 401/403 still halts the whole queue.
- No persistent last-error line on the Status sheet; the baby switcher caps at 4.
- Repeating clicks for strip adjustment by buttons; a retry cap and retryable 408/425 in the queue; an id-based wrong-baby guard; an accurate message when the outbox is full; the layout is hard-coded to Emery's 200x228 (no Gabbro port yet).

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
src/c/logic plain C, host-tested: fmt layout touch_fsm lockout strip amount nav model send_flow ready_gate protocol.h
test/       *.test.js (node:test), c/ (host C tests), support/ (mock API, harness, dev server)
```
