# Slider Inputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chip and preset inputs on the Pebble nappi watch app with time and amount sliders, give buttons a zone-by-zone flow, split units per screen, and remove Activity.

**Architecture:** New decisions live in host-tested plain C under `src/c/logic/` (`strip`, `amount`, `nav`, `fmt`); `grid_view.c` gains a strip cell and zone navigation on top of them; `sheets.c` is rewritten to use them. The phone side (`src/pkjs/`) gains per-screen units and a `SET_UNITS` command and loses presets and Activity. `protocol.js`, `protocol.h` and `package.json` stay in sync at every commit.

**Tech Stack:** C (Pebble SDK 4.33.1, Emery 200x228), PebbleKit JS (ES2015 only, webpack 1), `node:test`, gcc host tests.

**Spec:** `docs/superpowers/specs/2026-10-25-slider-inputs-design.md`

## Global Constraints

- Emery only, 200x228. Header 24 px high. Sheet content starts at y=27.
- pkjs: ES2015 syntax only, no trailing commas in calls, no object spread, no async/await. `pebble build` is the authority.
- Plain-C logic compiles with `gcc -std=c99 -Wall -Wextra -Werror -pedantic` and includes no Pebble headers.
- `src/pkjs/protocol.js` is the source of truth; `src/c/logic/protocol.h` and `package.json` `messageKeys` must match (`test/protocol-sync.test.js`). Run `pebble clean` after any `messageKeys` change.
- Time strip: 0 to 60 minutes ago, step 5, default 0, Now at the right end, Up moves toward Now.
- Amount strip, values are x10 of the display unit. oz: min 5, step 5, max 120 (bottle) or 200 (pump); ml: min 100, step 50, max 3600 (bottle) or 6000 (pump). Default 40 (4 oz) or 1200 (120 ml). 1 oz = 29.5735 ml.
- Readout text: `"Now - 2:41 PM"`, `"20 min ago - 2:21 PM"`; 12-hour `"2:21 PM"` (no leading zero) or 24-hour `"14:21"`.
- Commit after every task. `npm test` must pass at every commit.

## Review Focus

1. A saved layout that still contains `'activity'` (existing install) must not break the state builder or the Clay page. Tested in Task 1.
2. Settings saved before this change have `units` but no `bottleUnits` or `pumpUnits`; both must inherit it. Tested in Task 2.
3. Converting units at the ends of the range (a 12 oz bottle to ml, 10 ml to oz) must clamp and snap, not overflow or land off-step. Tested in Task 3.
4. A bottle logged in oz stays oz if the unit is switched to ml before the offline queue flushes; a bad `SET_UNITS` must change nothing. Tested in Task 2.
5. Sheets with a single choice (Sleep start, Pump start) and a single-item wrap must activate and not loop or crash; Back from the first zone must leave. Tested in Task 3.

---

### Task 1: Remove Activity

**Files:**
- Modify: `.gitignore` (add `.superpowers/`), `src/pkjs/protocol.js`, `src/c/logic/protocol.h`, `package.json`, `src/pkjs/commands.js`, `src/pkjs/optimistic.js`, `src/pkjs/state.js`, `src/pkjs/settings.js`, `src/pkjs/config.js`, `src/pkjs/app.js`, `src/c/logic/model.c`, `src/c/logic/model.h`, `src/c/sheets.c`, `src/c/sheets.h`, `src/c/home.c`
- Test: `test/protocol-sync.test.js`, `test/commands.test.js`, `test/optimistic.test.js`, `test/state.test.js`, `test/settings-layout.test.js`, `test/app.test.js`, `test/c/test_model.c`

**Interfaces:**
- Produces: `ACTION` = `{DIAPER:0, BOTTLE:1, NURSING:2, SLEEP:3, PUMP:4, POTTY:5, STATUS:6}`; `ACTION_COUNT` is 7 in `protocol.h`; command id 5 is retired (left unused, noted in a comment); `LAST[7]` and `INFO[7]` in `package.json`. No `ACTIVITY_*` constants, `model_activity_label`, `model_activity_common`, `ACTIVITY_COMMON_COUNT`, `sheet_activity`.

- [ ] **Step 1: Write the failing tests**
  - `test/commands.test.js`: `jobsFor({ CMD: 5, CMD_ID: 1, ARG1: 0 }, ctx)` throws `BadCommand` with message `'unknown command: 5'`.
  - `test/state.test.js`: `layoutIds(['diaper', 'activity', 'bottle'])` deep-equals `[P.ACTION.DIAPER, P.ACTION.BOTTLE, P.ACTION.STATUS]`; `buildState(...)` yields `LAST` and `INFO` arrays of length 7.
  - `test/settings-layout.test.js`: with settings whose `layout` is `['diaper', 'activity']`, `buildConfig(...)` contains no item with `messageKey === 'pos_activity'`, and `settingsFromClayResponse({ pos_activity: '1' })` has no `layout` containing `'activity'`.
  - `test/c/test_model.c`: `ACTION_COUNT == 7`; `model_default` gives `layout_count == 7` and `layout[6] == ACTION_STATUS`.
- [ ] **Step 2: Run** `npm test`. Expected: the four new checks FAIL.
- [ ] **Step 3: Remove Activity** from every file listed under Modify and from the tests that referenced it (`optimistic`, `app`, `protocol-sync`, `state`, `settings-layout`, `test_model.c`). Phone: drop `ACTIVITY` from `ACTION`, `ACTIVITY_TYPES`, `CMD.LOG_ACTIVITY`, the `activity` cases in `commands.js`, `optimistic.js`, `state.js`, `'activity'` from `LATEST_TYPES` in `app.js`, from `DEFAULTS.layout` and `ACTION_ORDER`/`ACTION_LABELS`/`ORDINALS`. Watch: drop the `ACTIVITY_*` defines, `model_activity_*`, `sheet_activity`, the activity case in `home.c`, the activity tile detail in `model.c`. Set `ACTION_COUNT 7`, `STATUS` to 6, `LAST[7]`/`INFO[7]`. `layoutIds` already skips unknown names; leave that behaviour.
- [ ] **Step 4: Run** `npm test`. Expected: all PASS. Then `pebble clean && pebble build`; expected: build succeeds.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Remove Activity from the watch and phone"`

### Task 2: Units per screen, drop presets, SET_UNITS (phone and protocol)

**Files:**
- Modify: `src/pkjs/protocol.js`, `src/c/logic/protocol.h`, `package.json`, `src/pkjs/settings.js`, `src/pkjs/config.js`, `src/pkjs/state.js`, `src/pkjs/commands.js`, `src/pkjs/app.js`, `src/c/logic/model.h`, `src/c/logic/model.c`, `src/c/comm.c`, `src/c/sheets.c` (only enough to compile: stop using `preset`/`units`; the sheet rewrite is Task 5)
- Test: `test/settings.test.js`, `test/config.test.js`, `test/state.test.js`, `test/commands.test.js`, `test/app.test.js`, `test/protocol-sync.test.js`, `test/wire.test.js`, `test/index.test.js`, `test/settings-layout.test.js`, `test/c/test_model.c`

**Interfaces:**
- Produces (protocol): `CMD.SET_UNITS = 10` with `ARG1` = screen (`UNITS_SCREEN.BOTTLE = 0`, `UNITS_SCREEN.PUMP = 1`) and `ARG2` = `UNITS.OZ` or `UNITS.ML`; message keys `BOTTLE_UNITS` and `PUMP_UNITS` replace `UNITS`; `PRESET[6]` is removed; `P.UNITS_SCREEN` exported; `protocol.h` gets `#define UNITS_SCREEN_BOTTLE 0`, `#define UNITS_SCREEN_PUMP 1`, `#define CMD_SET_UNITS 10`.
- Produces (settings): `settings.get()` returns `bottleUnits` and `pumpUnits` (`'oz'|'ml'`, default `'oz'`) and no `units`, no `bottlePresets`; `DEFAULT_PRESETS` is removed.
- Produces (commands): `jobsFor(dict, ctx)` reads `ctx.bottleUnits` for `LOG_BOTTLE` and `ctx.pumpUnits` for pumping `TIMER_STOP`; the job body carries the unit string.
- Produces (watch model): `WatchState` has `uint8_t bottle_units, pump_units;` and no `units` or `preset`; `model_tile_lines` formats the bottle tile with `bottle_units` and the pump tile with `pump_units`.

- [ ] **Step 1: Write the failing tests**
  - `settings.test.js`: stored `{ units: 'ml' }` reads back `bottleUnits === 'ml'` and `pumpUnits === 'ml'`; stored `{ units: 'ml', bottleUnits: 'oz' }` reads `bottleUnits === 'oz'`, `pumpUnits === 'ml'`; empty storage gives `'oz'` for both; the result has no `units` or `bottlePresets` key.
  - `config.test.js`: `buildConfig` has selects with `messageKey` `'bottleUnits'` and `'pumpUnits'`, none for `'units'` or `'bottlePresets'`; `settingsFromClayResponse({ bottleUnits: { value: 'ml' }, pumpUnits: { value: 'oz' } })` returns `{ bottleUnits: 'ml', pumpUnits: 'oz' }`.
  - `state.test.js`: with `bottleUnits: 'oz'`, `pumpUnits: 'ml'`, a latest bottle of 118.3 ml gives `INFO[BOTTLE] === 40` and a latest pump of 120 ml gives `INFO[PUMP] === 1200`; `BOTTLE_UNITS === 0`, `PUMP_UNITS === 1`; the state has no `PRESET` or `UNITS` key.
  - `commands.test.js`: `LOG_BOTTLE` with `ARG1: 40` and `ctx.bottleUnits = 'oz'` gives body `amount: 4, unit: 'oz'`; pumping `TIMER_STOP` with `ARG3: 1200` and `ctx.pumpUnits = 'ml'` gives `amount: 120, unit: 'ml'`.
  - `app.test.js` (`SET_UNITS`): `onMessage({ CMD: 10, CMD_ID: 7, ARG1: 0, ARG2: 1 })` saves `bottleUnits: 'ml'`, leaves `pumpUnits`, sends an ACK with `ACK_STATUS: 0` then a state with `BOTTLE_UNITS: 1`; `ARG1: 2` or `ARG2: 5` or a missing arg acks `STATUS.ERROR` (8) and changes no setting. **Offline case:** with the API unreachable, log a bottle in oz (`ARG1: 40`), then send `SET_UNITS` to ml, restore the API, flush; the mock receives `unit: 'oz'` and `amount: 4`.
  - `test/c/test_model.c`: bottle tile detail for `info = 40` with `bottle_units = UNITS_OZ` is `"4 oz"`; pump detail for `info = 1200` with `pump_units = UNITS_ML` is `"120 ml"`.
- [ ] **Step 2: Run** `npm test`. Expected: new tests FAIL.
- [ ] **Step 3: Implement** `createSettings` migration in `settings.js` (`read()` fills `bottleUnits`/`pumpUnits` from stored values, falling back to a stored legacy `units`, then `'oz'`); the two Clay selects in `config.js` replacing the Units select and the presets input; `buildState` per-screen units; a `setUnits(dict)` function in `app.js` dispatched from `onMessage` for `P.CMD.SET_UNITS` that validates both args against the allowed sets, updates settings, calls `ack` then `sendState`; `write()` passes `bottleUnits` and `pumpUnits` in the `jobsFor` ctx. Update `protocol.js`, `protocol.h`, `package.json`, `model.*`, `comm.c` (read `BOTTLE_UNITS`/`PUMP_UNITS`, drop `UNITS`/`PRESET`) together. In `sheets.c` temporarily use `bottle_units`/`pump_units` and a constant instead of `preset[]` so it compiles.
- [ ] **Step 4: Run** `npm test`; expected all PASS. Then `pebble clean && pebble build`; expected success.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Per-screen units, SET_UNITS command, drop bottle presets"`

### Task 3: Watch logic: strip, amount, nav, formatting

**Files:**
- Create: `src/c/logic/strip.h`, `src/c/logic/strip.c`, `src/c/logic/amount.h`, `src/c/logic/amount.c`, `src/c/logic/nav.h`, `src/c/logic/nav.c`
- Modify: `src/c/logic/fmt.h`, `src/c/logic/fmt.c` (add `fmt_strip_time`, remove `fmt_backdate`)
- Test: create `test/c/test_strip.c`, `test/c/test_amount.c`, `test/c/test_nav.c`; modify `test/c/test_fmt.c` (add `fmt_strip_time`; the `fmt_backdate` checks stay until Task 5 removes the function)
- `slider.*` and `fmt_backdate` stay until Task 5, so `pebble build` stays green at every commit.

**Interfaces (Produces):**

```c
// strip.h
typedef struct { int16_t x, w; int32_t min, max, step; bool invert; } StripGeom;
StripGeom strip_time_geom(void);                         // x=15 w=170 min=0 max=60 step=5 invert=true
int32_t strip_value_at(const StripGeom *g, int x);       // snapped, clamped; invert puts min at the right end
int     strip_x_for(const StripGeom *g, int32_t value);  // knob centre x
int32_t strip_snap(const StripGeom *g, int32_t value);   // nearest step, clamped
int32_t strip_nudge(const StripGeom *g, int32_t value, int dir);  // dir +1 moves the knob right
// amount.h
#define AMOUNT_BOTTLE 0
#define AMOUNT_PUMP 1
StripGeom amount_geom(int screen, int units);            // x=15 w=170, limits from Global Constraints
int32_t   amount_default(int screen, int units);         // 40 or 1200
int32_t   amount_convert(int32_t x10, int from_units, int to_units);  // unrounded to step; use strip_snap after
// nav.h
typedef enum { ZONE_ADJUST, ZONE_CHOICE } ZoneKind;
typedef struct { ZoneKind kind; uint8_t count; uint8_t start; } NavZone;   // count/start for CHOICE
#define NAV_MAX_ZONES 4
typedef struct { NavZone zones[NAV_MAX_ZONES]; uint8_t zone_count, zone, item; } Nav;
typedef enum { NAV_NONE, NAV_MOVED, NAV_ADJUST, NAV_ACTIVATE, NAV_LEAVE } NavEffectKind;
typedef struct { NavEffectKind kind; int zone, item, dir; } NavEffect;
void nav_init(Nav *n, const NavZone *zones, int count);
NavEffect nav_up(Nav *n);     // ADJUST: {NAV_ADJUST, dir=+1}; CHOICE: item-1 wrapping, NAV_MOVED
NavEffect nav_down(Nav *n);   // ADJUST: {NAV_ADJUST, dir=-1}; CHOICE: item+1 wrapping, NAV_MOVED
NavEffect nav_select(Nav *n); // ADJUST: next zone (item = its start), NAV_MOVED, or NAV_NONE on the last zone; CHOICE: {NAV_ACTIVATE, zone, item}
NavEffect nav_back(Nav *n);   // zone>0: previous zone, NAV_MOVED; else NAV_LEAVE
// fmt.h
void fmt_strip_time(char *buf, size_t n, int minutes_ago, int hour, int minute, bool is24h);
```

- [ ] **Step 1: Write the failing tests**
  - `test_strip.c`: with `strip_time_geom()`: `strip_value_at(g, 185) == 0`, `strip_value_at(g, 15) == 60`, `strip_value_at(g, 100) == 30` (snapped to 5), `strip_value_at(g, -20) == 60`, `strip_value_at(g, 400) == 0`; `strip_x_for(g, 0) == 185`, `strip_x_for(g, 60) == 15`; `strip_nudge(g, 0, +1) == 0` (already at Now), `strip_nudge(g, 0, -1) == 5`, `strip_nudge(g, 60, -1) == 60`. With `amount_geom(AMOUNT_BOTTLE, UNITS_OZ)`: `strip_value_at(g, 15) == 5`, `strip_value_at(g, 185) == 120`, `strip_nudge(g, 40, +1) == 45`.
  - `test_amount.c`: `amount_default(AMOUNT_BOTTLE, UNITS_OZ) == 40`; `(…, UNITS_ML) == 1200`. `amount_convert(40, UNITS_OZ, UNITS_ML) == 1183`; `amount_convert(1200, UNITS_ML, UNITS_OZ) == 41` (4.06 oz). Edge cases (Review Focus 3), each through `strip_snap(&g, amount_convert(...))` where `g = amount_geom(screen, to_units)`: x10 value 120 (12 oz) to ml for the bottle gives 3550 (3549 snaps to 3550); x10 200 (20 oz) to ml for the pump gives 5900; x10 3600 (360 ml) to oz for the bottle gives 120 (122 clamps to max); x10 100 (10 ml) to oz gives 5 (3 clamps up to min); and every snapped result satisfies `(v - min) % step == 0`.
  - `test_nav.c` (Review Focus 5): zones `{ADJUST},{ADJUST},{CHOICE count 2 start 1}` → after `nav_init`, `zone == 0`; `nav_select` → `NAV_MOVED`, `zone == 1`; again → `zone == 2`, `item == 1`; `nav_up` → `item == 0`, then `nav_up` again → `item == 1` (wrap); `nav_down` wraps back; `nav_select` → `{NAV_ACTIVATE, zone 2, item 1}`; `nav_back` → `zone == 1`, then `zone == 0`, then `NAV_LEAVE`. `nav_up` on an ADJUST zone → `{NAV_ADJUST, dir +1}`, `nav_down` → `dir -1`. A single `{CHOICE count 1}` zone: `nav_up`, `nav_down` keep `item == 0` and `nav_select` activates item 0. `nav_select` on the last ADJUST-only zone returns `NAV_NONE`.
  - `test_fmt.c`: `fmt_strip_time(buf, n, 0, 14, 41, false)` is `"Now - 2:41 PM"`; `(20, 14, 21, false)` is `"20 min ago - 2:21 PM"`; `(60, 0, 5, false)` is `"60 min ago - 12:05 AM"`; `(5, 12, 0, false)` is `"5 min ago - 12:00 PM"`; `(0, 14, 41, true)` is `"Now - 14:41"`.
- [ ] **Step 2: Run** `npm run test:c`. Expected: FAIL (missing headers).
- [ ] **Step 3: Implement** the three modules and `fmt_strip_time`; `strip_value_at` maps x linearly over `[g->x, g->x + g->w]`, snaps with `g->step`, and clamps; `amount_convert` uses integer math with the 29.5735 factor and rounds half up. Add nothing to `sheets.c` yet.
- [ ] **Step 4: Run** `npm run test:c`. Expected: all PASS. Then `pebble build`; expected success.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Watch logic: strip, amount, nav, strip time formatting"`

### Task 4: GridView: strip cells and zone navigation

**Files:**
- Modify: `src/c/grid_view.h`, `src/c/grid_view.c`
- Verify: `pebble build`

**Interfaces:**
- Consumes: `StripGeom`, `strip_value_at`, `strip_x_for`, `Nav`, `NavZone`, `NavEffect`, `nav_*` from Task 3.
- Produces:
  - `CELL_STRIP` in `CellKind`; `GridCell` gains `StripGeom geom; int32_t strip_value;` (title holds the readout text, drawn centred in the top half; the track and knob in the bottom half using `strip_x_for` for the knob).
  - `GridHandlers` gains `void (*on_strip)(GridView *gv, int cell, int x);` (called for touchdown and every move on a strip, with the raw touch x) and `void (*on_adjust)(GridView *gv, int zone, int dir);` (button Up/Down on an ADJUST zone).
  - `GridView` gains `Nav nav; bool has_nav; int zone_cell[NAV_MAX_ZONES]; int zone_cells[NAV_MAX_ZONES];` and `void grid_view_set_zones(GridView *gv, const NavZone *zones, const int *first_cell, const int *cell_count, int count);` (a zone's cells are consecutive from `first_cell`; focus is drawn around the union of that zone's cells for an ADJUST zone, and on the single cell `first_cell + nav.item` for a CHOICE zone).
  - Sheets map the `index` passed to `on_activate` back to an item themselves (`index - first_cell` of the choice zone).
  - The old vertical slider (`has_slider`, `slider_track`, `slider_knob_y`, `on_slider`) stays in this task so `sheets.c` still builds; Task 5 removes it.

- [ ] **Step 1: Implement drawing** for `CELL_STRIP` (readout font Gothic 14 bold at 14 pt-high; track 4 px at `rect.h - 10`; 16 px knob) and the selected-chip style (a selected `CELL_CHIP` draws a dark fill with white text and no outline; the focus outline stays 3 px black). Draw the focus ring for the zone from `nav` when `has_nav && show_focus`.
- [ ] **Step 2: Implement touch**: in `touch_handler`, before the existing `in_slider` branch, if the touch-down point is inside a `CELL_STRIP` rect set `gv->strip_drag = index`; while `strip_drag >= 0` every down/move calls `on_strip(gv, strip_drag, e->x)` and is not passed to `TouchFsm`; Liftoff clears it. Strip cells are not registered as `TouchFsm` rects (empty rect, like `CELL_TEXT`) so they never activate.
- [ ] **Step 3: Implement buttons** when `has_nav`: `up_click`/`down_click` call `nav_up`/`nav_down`; `NAV_ADJUST` calls `on_adjust(gv, effect.zone, effect.dir)`; `NAV_MOVED` redraws. `select_click` calls `nav_select`; `NAV_ACTIVATE` calls `on_activate(gv, zone_cell[zone] + item, false)`. Subscribe `BUTTON_ID_BACK` with `back_click`: `nav_back`; `NAV_LEAVE` calls `window_stack_pop(true)`. Without `has_nav` the existing linear focus code is unchanged (Home, Switch baby, Status, timer screen). Show focus from the first button press (`show_focus = true` when any of Up/Down/Select/Back is pressed); the opening ring is shown at once on a nav view if `grid_view_set_zones` is called with the buttons connected (`gv->show_focus = true` there).
- [ ] **Step 4: Run** `pebble build`. Expected: build succeeds with no warnings from the changed files. Run `npm test`; expected PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "GridView: strip cells and zone navigation"`

### Task 5: Sheets, Home and the SET_UNITS call

**Files:**
- Modify: `src/c/sheets.c`, `src/c/sheets.h`, `src/c/home.c`, `src/c/grid_view.c`, `src/c/grid_view.h`, `src/c/logic/fmt.c`, `src/c/logic/fmt.h`, `test/c/test_fmt.c`
- Delete: `src/c/logic/slider.h`, `src/c/logic/slider.c`; rename `test/c/test_lockout_slider.c` to `test/c/test_lockout.c`
- Verify: `npm test`, `pebble build`, emulator walk-through below

**Interfaces:**
- Consumes: Task 4 `GridView` API; Task 3 logic; `comm_state()->bottle_units/pump_units`, `comm_send(CMD_SET_UNITS, screen, units, 0, 0)`.
- Produces in `sheets.h`: `void sheet_diaper(void); void sheet_potty(void); void sheet_bottle(void); void sheet_nursing_start(void); void sheet_timer_start(int action); void sheet_pump_amount(void); void sheet_babies(void); void sheet_status(void); void timer_view_open(int timer);` (the `backdate` parameters are gone).

Layout (screen coordinates): time strip `{3, 27, 194, 36}` on every sheet that has one; buttons start at y=66.
- Diaper: Wet, Poo, Mixed, Dry as a 2x2 grid in `{3, 66, 194, 158}` (gap 4), buttons only.
- Potty: Potty, Accident, Sat dry as three columns in `{3, 66, 194, 158}`.
- Nursing start: Left `{3, 66, 95, 78}`, Right `{102, 66, 95, 78}`, Both `{3, 148, 194, 76}`; zones `{ADJUST}`, `{CHOICE count 3}`; cycling order Left, Right, Both.
- Sleep/Pump start: one button `{3, 66, 194, 158}` ("Start sleep" / "Start pump"); zones `{ADJUST}`, `{CHOICE count 1}`.
- Bottle: time strip, unit chips "oz" `{3, 66, 95, 26}` and "ml" `{102, 66, 95, 26}`, amount strip `{3, 95, 194, 48}`, buttons "Formula" `{3, 148, 95, 76}` and "Breast milk" `{102, 148, 95, 76}`; zones `{ADJUST}` time, `{ADJUST}` units (2 cells), `{ADJUST}` amount, `{CHOICE count 2, start default_bottle == BOTTLE_TYPE_BREAST_MILK ? 1 : 0}`.
- Pump "How much?": unit chips at y=28 (same widths, h 26), amount strip `{3, 57, 194, 48}`, "Log" `{3, 108, 194, 64}`, "Skip amount" `{3, 176, 194, 48}`; zones units, amount, `{CHOICE count 2}`.

- [ ] **Step 1: Implement shared helpers** in `sheets.c`: `add_time_strip(gv, c)` (adds the `CELL_STRIP`, sets `geom = strip_time_geom()`, value 0, and refreshes its readout text with `fmt_strip_time` using `localtime(time(NULL) - minutes * 60)` and `clock_is_24h_style()`; refresh again on `on_tick` every minute); `on_strip` sets `strip_value = strip_value_at(&geom, x)`; `on_adjust` for the time zone applies `strip_nudge`; `minutes_ago(c)` returns the time strip value. Remove the chip code (`add_chips`, `chip_select`, `add_offset_chips`, `CHIP_*`) and the bottle type toggle and `PERSIST_BOTTLE_TYPE`.
- [ ] **Step 2: Implement the amount strip and unit chips**: `add_amount(gv, c, screen)` reads the starting value from persist keys `PERSIST_BOTTLE_AMOUNT = 111` and `PERSIST_PUMP_AMOUNT = 112` (stored as x10 ml via `amount_convert`), falling back to `amount_default`; converts to the screen's current unit with `amount_convert` + `strip_snap`. Tapping a unit chip, or `on_adjust(+1/-1)` on the unit zone (Up selects ml, Down selects oz), sets `c->units`, converts and snaps `c->value`, updates the chips' `selected` flags, the strip geometry and readout, and calls `comm_send(CMD_SET_UNITS, screen == AMOUNT_BOTTLE ? UNITS_SCREEN_BOTTLE : UNITS_SCREEN_PUMP, c->units, 0, 0)`. On a successful log, write the logged amount (as x10 ml) to the persist key before `ui_send`.
- [ ] **Step 3: Rewrite the six sheets** to the layout above using `layout_grid` where noted, each calling `grid_view_set_zones`. Bottle's buttons call `ui_send(ACTION_BOTTLE, what, CMD_LOG_BOTTLE, c->value, type, minutes_ago(c), 0)` with `type` 0 for Formula, 1 for Breast milk. Pump "How much?": Log sends `CMD_TIMER_STOP, TIMER_PUMPING, 0, c->value`; Skip sends the same with amount 0. Delete `open_amount`, the old `amount_*` slider code and the preset code. Then remove the now-unused pieces: the vertical slider from `grid_view.c`/`grid_view.h` (`has_slider`, `slider_track`, `slider_knob_y`, `on_slider`, `in_slider`, `draw_slider`), `src/c/logic/slider.h` and `slider.c`, the slider checks in `test/c/test_lockout_slider.c` (rename the file to `test/c/test_lockout.c`), and `fmt_backdate` with its checks in `test/c/test_fmt.c`.
- [ ] **Step 4: Update `home.c`** `open_action(int action, bool long_press)`: Diaper, Bottle, Potty, Nursing (not running) call the sheet functions without a backdate flag; Sleep and Pump keep `ui_send` on a tap and call `sheet_timer_start(action)` only when `long_press`. Remove `ACTIVITY`.
- [ ] **Step 5: Verify**: run `pebble clean && pebble build`; expected success. In a second terminal start the mock with `SEED=1 TWO_BABIES=1 npm run mock`, then:
  - `pebble install --emulator emery`, set the token with `pebble emu-app-config --emulator emery` and the close-URL trick from the README (`{"token":{"value":"dev-token"},"baseUrl":{"value":"http://localhost:4010"}}`).
  - For each of Diaper, Potty, Nursing, Sleep (long press), Pump (long press), Bottle: open it with `pebble emu-button click select`, then `pebble screenshot --emulator emery <name>.png`; expected: matches the layout above with the time strip showing "Now - ..." and the knob at the right end.
  - Bottle with buttons: focus the Bottle tile (`pebble emu-button click down`, then `select` to open it), then `down`, `down`, `select`, `up`, `select`, `up`, `select`, `select`; expected: the time moves 10 min back, the unit becomes ml (the amount converts to 120 ml), the amount nudges up one step to 125 ml, then the Formula button logs and the mock shows a bottle entry with `unit: ml` (check against the mock's entry list as in the README, remembering it shares the token's rate limit).
  - `pebble emu-button click back` from the buttons zone moves back one zone; from the first zone it leaves the sheet.
  - Report anything not run (touch dragging cannot be run in the emulator).
- [ ] **Step 6: Commit** `git add -A && git commit -m "Rewrite sheets around time and amount strips"`

### Task 6: Docs and final verification

**Files:**
- Modify: `README.md`, `docs/implementation-notes.md`

- [ ] **Step 1:** In `docs/implementation-notes.md` update the "What exists" table (Activity removed; sliders, zones, per-screen units added), the "departs from the spec" list (add: Activity removed; presets and the Custom screen replaced by the amount strip; long press kept only on Sleep and Pump; units per screen and changed from the watch), and the "Not verified" list (touch dragging on strips, Clay page with the two unit selects, the readout font width on a real watch). Update the test counts to what `npm test` prints. In `README.md` fix the `SEED`/command examples if they changed and add the SET_UNITS note under "Driving settings".
- [ ] **Step 2: Run** `npm test`; expected: JS and C suites PASS. Run `pebble clean && pebble build`; expected success.
- [ ] **Step 3: Commit** `git add -A && git commit -m "Docs for slider inputs"`
