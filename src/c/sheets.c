#include "sheets.h"
#include "ui.h"
#include "logic/fmt.h"
#include "logic/model.h"
#include "logic/slider.h"
#include <stdlib.h>
#include <string.h>

#define PERSIST_BOTTLE_TYPE 110
#define CHIP_MAX 5
#define CHIP_Y 26
#define CHIP_H 28
#define CONTENT_Y 58

typedef struct {
  int action;               // lockout key
  bool backdate;
  int chip_first, chip_count, chip_sel;
  int chip_values[CHIP_MAX];
  bool chip_duration;       // activity: chips are durations, not minutes ago
  int type_first;           // bottle: first of the two type toggles
  int bottle_type;
  int btn_first;            // first content button
  int timer;                // timer index for start / stop sheets
  int mode;                 // amount slider: 0 = bottle, 1 = pump stop
  int32_t value;
  SliderGeom geom;
  int minutes;              // backdate carried into the amount slider
} SheetCtx;

static void free_ctx(GridView *gv) {
  free(gv->ctx);
}

static SheetCtx *ctx_of(GridView *gv) {
  return gv->ctx;
}

// ---- chips ----

static void add_chips(GridView *gv, SheetCtx *c, const int *values, int count, bool duration) {
  c->chip_first = gv->count;
  c->chip_count = count;
  c->chip_sel = 0;
  c->chip_duration = duration;
  Rect cells[CHIP_MAX];
  layout_grid((Rect){ 2, CHIP_Y, SCREEN_W - 4, CHIP_H }, count, 1, 4, cells);
  for (int i = 0; i < count; i++) {
    char label[12];
    c->chip_values[i] = values[i];
    if (duration) {
      if (values[i] == 0) snprintf(label, sizeof(label), "--");
      else snprintf(label, sizeof(label), "%dm", values[i]);
    } else {
      fmt_backdate(label, sizeof(label), values[i]);
    }
    GridCell *cell = grid_view_add(gv, CELL_CHIP, cells[i], label, "", "", GColorLightGray);
    cell->selected = i == 0;
  }
}

static void add_offset_chips(GridView *gv, SheetCtx *c) {
  static const int normal[4] = { 0, 5, 15, 30 };
  static const int later[5] = { 5, 10, 15, 30, 60 };
  if (c->backdate) add_chips(gv, c, later, 5, false);
  else add_chips(gv, c, normal, 4, false);
}

static bool chip_select(GridView *gv, int index) {
  SheetCtx *c = ctx_of(gv);
  if (c->chip_count == 0 || index < c->chip_first || index >= c->chip_first + c->chip_count) return false;
  c->chip_sel = index - c->chip_first;
  for (int i = 0; i < c->chip_count; i++) gv->cells[c->chip_first + i].selected = i == c->chip_sel;
  grid_view_commit(gv);
  return true;
}

static int minutes_ago(const SheetCtx *c) {
  return (c->chip_count > 0 && !c->chip_duration) ? c->chip_values[c->chip_sel] : 0;
}

static int duration_min(const SheetCtx *c) {
  return (c->chip_count > 0 && c->chip_duration) ? c->chip_values[c->chip_sel] : 0;
}

// ---- opening ----

static GridView *open_sheet(const char *title, int action, bool backdate, void (*activate)(GridView *, int, bool)) {
  SheetCtx *c = calloc(1, sizeof(SheetCtx));
  if (!c) return NULL;
  c->action = action;
  c->backdate = backdate;
  GridHandlers h = { .on_activate = activate, .on_unload = free_ctx };
  GridView *gv = grid_view_create(&h, c);
  if (!gv) {
    free(c);
    return NULL;
  }
  ui_add_header(gv, title);
  return gv;
}

static void show_sheet(GridView *gv) {
  SheetCtx *c = ctx_of(gv);
  grid_view_commit(gv);
  if (c->backdate && c->chip_count > 0) grid_view_focus(gv, c->chip_first);
  grid_view_push(gv);
}

// ---- diaper / potty / nursing start / sleep or pump start ----

static void diaper_activate(GridView *gv, int index, bool long_press) {
  if (chip_select(gv, index)) return;
  SheetCtx *c = ctx_of(gv);
  int type = index - c->btn_first;
  if (type < 0 || type > 3) return;
  ui_send(ACTION_DIAPER, model_diaper_label(type), CMD_LOG_DIAPER, type, minutes_ago(c), 0, 0);
}

void sheet_diaper(bool backdate) {
  GridView *gv = open_sheet("Diaper", ACTION_DIAPER, backdate, diaper_activate);
  if (!gv) return;
  SheetCtx *c = ctx_of(gv);
  add_offset_chips(gv, c);
  c->btn_first = gv->count;
  Rect cells[4];
  layout_grid((Rect){ 2, CONTENT_Y, SCREEN_W - 4, SCREEN_H - CONTENT_Y - 2 }, 2, 2, 4, cells);
  for (int i = 0; i < 4; i++) grid_view_add(gv, CELL_BUTTON, cells[i], model_diaper_label(i), "", "", ui_action_color(ACTION_DIAPER));
  show_sheet(gv);
}

static void potty_activate(GridView *gv, int index, bool long_press) {
  if (chip_select(gv, index)) return;
  SheetCtx *c = ctx_of(gv);
  int outcome = index - c->btn_first;
  if (outcome < 0 || outcome > 2) return;
  ui_send(ACTION_POTTY, model_potty_label(outcome), CMD_LOG_POTTY, outcome, minutes_ago(c), 0, 0);
}

void sheet_potty(bool backdate) {
  GridView *gv = open_sheet("Potty", ACTION_POTTY, backdate, potty_activate);
  if (!gv) return;
  SheetCtx *c = ctx_of(gv);
  add_offset_chips(gv, c);
  c->btn_first = gv->count;
  Rect cells[3];
  layout_grid((Rect){ 2, CONTENT_Y, SCREEN_W - 4, SCREEN_H - CONTENT_Y - 2 }, 1, 3, 4, cells);
  for (int i = 0; i < 3; i++) grid_view_add(gv, CELL_BUTTON, cells[i], model_potty_label(i), "", "", ui_action_color(ACTION_POTTY));
  show_sheet(gv);
}

static void nursing_activate(GridView *gv, int index, bool long_press) {
  if (chip_select(gv, index)) return;
  SheetCtx *c = ctx_of(gv);
  int k = index - c->btn_first;
  if (k < 0 || k > 2) return;
  int side = k + 1;   // SIDE_LEFT, SIDE_RIGHT, SIDE_BOTH
  char what[32];
  snprintf(what, sizeof(what), "Nursing %s", model_side_label(side));
  ui_send(ACTION_NURSING, what, CMD_TIMER_START, TIMER_NURSING, side, minutes_ago(c), 0);
}

void sheet_nursing_start(bool backdate) {
  GridView *gv = open_sheet("Nursing", ACTION_NURSING, backdate, nursing_activate);
  if (!gv) return;
  SheetCtx *c = ctx_of(gv);
  add_offset_chips(gv, c);
  c->btn_first = gv->count;
  Rect cells[3];
  layout_grid((Rect){ 2, CONTENT_Y, SCREEN_W - 4, SCREEN_H - CONTENT_Y - 2 }, 1, 3, 4, cells);
  for (int i = 0; i < 3; i++) grid_view_add(gv, CELL_BUTTON, cells[i], model_side_label(i + 1), "", "", ui_action_color(ACTION_NURSING));
  show_sheet(gv);
}

static void timer_start_activate(GridView *gv, int index, bool long_press) {
  if (chip_select(gv, index)) return;
  SheetCtx *c = ctx_of(gv);
  if (index != c->btn_first) return;
  ui_send(c->action, c->action == ACTION_SLEEP ? "Sleep started" : "Pump started", CMD_TIMER_START,
          c->timer, 0, minutes_ago(c), 0);
}

void sheet_timer_start(int action, bool backdate) {
  GridView *gv = open_sheet(action == ACTION_SLEEP ? "Sleep" : "Pump", action, backdate, timer_start_activate);
  if (!gv) return;
  SheetCtx *c = ctx_of(gv);
  c->timer = model_timer_for_action(action);
  add_offset_chips(gv, c);
  c->btn_first = gv->count;
  grid_view_add(gv, CELL_BUTTON, (Rect){ 2, CONTENT_Y + 20, SCREEN_W - 4, 100 },
                action == ACTION_SLEEP ? "Start sleep" : "Start pump", "", "", ui_action_color(action));
  show_sheet(gv);
}

// ---- activity ----

static void activity_activate(GridView *gv, int index, bool long_press) {
  if (chip_select(gv, index)) return;
  SheetCtx *c = ctx_of(gv);
  int k = index - c->btn_first;
  if (k < 0 || k >= ACTIVITY_COMMON_COUNT) return;
  int activity = model_activity_common(k);
  ui_send(ACTION_ACTIVITY, model_activity_label(activity), CMD_LOG_ACTIVITY, activity, duration_min(c), minutes_ago(c), 0);
}

void sheet_activity(bool backdate) {
  GridView *gv = open_sheet("Activity", ACTION_ACTIVITY, backdate, activity_activate);
  if (!gv) return;
  SheetCtx *c = ctx_of(gv);
  if (backdate) {
    add_offset_chips(gv, c);
  } else {
    static const int durations[5] = { 0, 5, 10, 20, 30 };
    add_chips(gv, c, durations, 5, true);
  }
  c->btn_first = gv->count;
  Rect cells[10];
  layout_grid((Rect){ 2, CONTENT_Y, SCREEN_W - 4, SCREEN_H - CONTENT_Y - 2 }, 2, 5, 3, cells);
  for (int i = 0; i < ACTIVITY_COMMON_COUNT; i++) {
    grid_view_add(gv, CELL_BUTTON, cells[i], model_activity_label(model_activity_common(i)), "", "", ui_action_color(ACTION_ACTIVITY));
  }
  show_sheet(gv);
}

// ---- amount slider (custom bottle amount, or pump amount) ----

enum { MODE_BOTTLE = 0, MODE_PUMP = 1 };
#define AMOUNT_TEXT 1
#define AMOUNT_MINUS 2
#define AMOUNT_PLUS 3
#define AMOUNT_LOG 4

static void amount_refresh(GridView *gv) {
  SheetCtx *c = ctx_of(gv);
  fmt_amount(gv->cells[AMOUNT_TEXT].l1, sizeof(gv->cells[AMOUNT_TEXT].l1), c->value, comm_state()->units);
  gv->slider_knob_y = slider_y_for(&c->geom, c->value);
  grid_view_commit(gv);
}

static void amount_on_slider(GridView *gv, int y) {
  SheetCtx *c = ctx_of(gv);
  c->value = slider_value_at(&c->geom, y);
  amount_refresh(gv);
}

static void amount_activate(GridView *gv, int index, bool long_press) {
  SheetCtx *c = ctx_of(gv);
  if (index == AMOUNT_MINUS || index == AMOUNT_PLUS) {
    c->value = slider_nudge(&c->geom, c->value, index == AMOUNT_PLUS ? 1 : -1);
    amount_refresh(gv);
    return;
  }
  if (index != AMOUNT_LOG) return;

  char what[24];
  fmt_amount(what, sizeof(what), c->value, comm_state()->units);
  if (c->mode == MODE_BOTTLE) {
    ui_send(ACTION_BOTTLE, what, CMD_LOG_BOTTLE, c->value, c->bottle_type, c->minutes, 0);
  } else {
    ui_send(ACTION_PUMP, what, CMD_TIMER_STOP, TIMER_PUMPING, 0, c->value, 0);
  }
}

static void open_amount(int mode, int bottle_type, int minutes) {
  const WatchState *s = comm_state();
  SheetCtx *c = calloc(1, sizeof(SheetCtx));
  if (!c) return;
  c->mode = mode;
  c->action = mode == MODE_BOTTLE ? ACTION_BOTTLE : ACTION_PUMP;
  c->bottle_type = bottle_type;
  c->minutes = minutes;
  bool oz = s->units == UNITS_OZ;
  int32_t max = mode == MODE_PUMP ? (oz ? 200 : 6000) : (oz ? 120 : 3600);
  c->geom = (SliderGeom){ 36, 184, oz ? 5 : 100, max, oz ? 5 : 50 };
  c->value = s->preset[2] > 0 ? s->preset[2] : (oz ? 40 : 1200);

  GridHandlers h = { .on_activate = amount_activate, .on_slider = amount_on_slider, .on_unload = free_ctx };
  GridView *gv = grid_view_create(&h, c);
  if (!gv) {
    free(c);
    return;
  }
  ui_add_header(gv, mode == MODE_BOTTLE ? "Amount" : "Pumped");
  grid_view_add(gv, CELL_TEXT, (Rect){ 4, 40, 128, 40 }, "", "", "", GColorWhite)->font = FONT_VALUE;
  grid_view_add(gv, CELL_BUTTON, (Rect){ 4, 88, 60, 56 }, "-", "", "", GColorLightGray);
  grid_view_add(gv, CELL_BUTTON, (Rect){ 72, 88, 60, 56 }, "+", "", "", GColorLightGray);
  grid_view_add(gv, CELL_BUTTON, (Rect){ 4, 160, 128, 62 }, "Log", "", "", mode == MODE_BOTTLE ? ui_action_color(ACTION_BOTTLE) : ui_action_color(ACTION_PUMP));
  gv->has_slider = true;
  gv->slider_track = (Rect){ 150, 36, 24, 184 };
  amount_refresh(gv);
  grid_view_push(gv);
}

// ---- bottle ----

static void bottle_activate(GridView *gv, int index, bool long_press) {
  if (chip_select(gv, index)) return;
  SheetCtx *c = ctx_of(gv);
  const WatchState *s = comm_state();

  if (index == c->type_first || index == c->type_first + 1) {
    c->bottle_type = index - c->type_first;
    gv->cells[c->type_first].selected = c->bottle_type == BOTTLE_TYPE_FORMULA;
    gv->cells[c->type_first + 1].selected = c->bottle_type == BOTTLE_TYPE_BREAST_MILK;
    persist_write_int(PERSIST_BOTTLE_TYPE, c->bottle_type);
    grid_view_commit(gv);
    return;
  }

  int k = index - c->btn_first;
  if (k == PRESET_COUNT) {
    open_amount(MODE_BOTTLE, c->bottle_type, minutes_ago(c));
    return;
  }
  if (k < 0 || k >= PRESET_COUNT || s->preset[k] <= 0) return;
  char what[24];
  fmt_amount(what, sizeof(what), s->preset[k], s->units);
  ui_send(ACTION_BOTTLE, what, CMD_LOG_BOTTLE, s->preset[k], c->bottle_type, minutes_ago(c), 0);
}

void sheet_bottle(bool backdate) {
  const WatchState *s = comm_state();
  GridView *gv = open_sheet("Bottle", ACTION_BOTTLE, backdate, bottle_activate);
  if (!gv) return;
  SheetCtx *c = ctx_of(gv);
  add_offset_chips(gv, c);

  int type = persist_exists(PERSIST_BOTTLE_TYPE) ? persist_read_int(PERSIST_BOTTLE_TYPE) : s->default_bottle;
  c->bottle_type = (type == BOTTLE_TYPE_BREAST_MILK) ? BOTTLE_TYPE_BREAST_MILK : BOTTLE_TYPE_FORMULA;

  c->type_first = gv->count;
  Rect toggles[2];
  layout_grid((Rect){ 2, 56, SCREEN_W - 4, 26 }, 2, 1, 4, toggles);
  grid_view_add(gv, CELL_CHIP, toggles[0], "Formula", "", "", GColorLightGray)->selected = c->bottle_type == BOTTLE_TYPE_FORMULA;
  grid_view_add(gv, CELL_CHIP, toggles[1], "Breast milk", "", "", GColorLightGray)->selected = c->bottle_type == BOTTLE_TYPE_BREAST_MILK;

  c->btn_first = gv->count;
  Rect grid[6];
  layout_grid((Rect){ 2, 86, SCREEN_W - 4, 98 }, 3, 2, 4, grid);
  for (int i = 0; i < PRESET_COUNT; i++) {
    char label[16] = "";
    if (s->preset[i] > 0) fmt_amount(label, sizeof(label), s->preset[i], s->units);
    GridCell *cell = grid_view_add(gv, CELL_BUTTON, grid[i], label, "", "", ui_action_color(ACTION_BOTTLE));
    cell->enabled = s->preset[i] > 0;
  }
  grid_view_add(gv, CELL_BUTTON, (Rect){ 2, 188, SCREEN_W - 4, 36 }, "Custom", "", "", GColorLightGray);
  show_sheet(gv);
}

// ---- pump stop amount ----

static void pump_amount_activate(GridView *gv, int index, bool long_press) {
  SheetCtx *c = ctx_of(gv);
  const WatchState *s = comm_state();
  int k = index - c->btn_first;
  if (k >= 0 && k < PRESET_COUNT) {
    if (s->preset[k] <= 0) return;
    char what[24];
    fmt_amount(what, sizeof(what), s->preset[k], s->units);
    ui_send(ACTION_PUMP, what, CMD_TIMER_STOP, TIMER_PUMPING, 0, s->preset[k], 0);
  } else if (k == PRESET_COUNT) {
    open_amount(MODE_PUMP, 0, 0);
  } else if (k == PRESET_COUNT + 1) {
    ui_send(ACTION_PUMP, "Pump saved", CMD_TIMER_STOP, TIMER_PUMPING, 0, 0, 0);
  }
}

void sheet_pump_amount(void) {
  const WatchState *s = comm_state();
  GridView *gv = open_sheet("How much?", ACTION_PUMP, false, pump_amount_activate);
  if (!gv) return;
  SheetCtx *c = ctx_of(gv);
  c->btn_first = gv->count;
  Rect grid[6];
  layout_grid((Rect){ 2, 30, SCREEN_W - 4, 100 }, 3, 2, 4, grid);
  for (int i = 0; i < PRESET_COUNT; i++) {
    char label[16] = "";
    if (s->preset[i] > 0) fmt_amount(label, sizeof(label), s->preset[i], s->units);
    grid_view_add(gv, CELL_BUTTON, grid[i], label, "", "", ui_action_color(ACTION_PUMP))->enabled = s->preset[i] > 0;
  }
  grid_view_add(gv, CELL_BUTTON, (Rect){ 2, 136, SCREEN_W - 4, 40 }, "Custom", "", "", GColorLightGray);
  grid_view_add(gv, CELL_BUTTON, (Rect){ 2, 180, SCREEN_W - 4, 44 }, "Skip amount", "", "", GColorLightGray);
  show_sheet(gv);
}

// ---- babies ----

static void babies_activate(GridView *gv, int index, bool long_press) {
  const WatchState *s = comm_state();
  int baby = index - 1;
  if (baby < 0 || baby >= s->baby_count) return;
  comm_send(CMD_SWITCH_BABY, baby, 0, 0, 0);
  window_stack_pop(true);
}

void sheet_babies(void) {
  const WatchState *s = comm_state();
  GridView *gv = open_sheet("Switch baby", ACTION_STATUS, false, babies_activate);
  if (!gv) return;
  int count = s->baby_count < 4 ? s->baby_count : 4;
  for (int i = 0; i < count; i++) {
    char name[BABY_NAME_LEN];
    model_baby_name(s, i, name, sizeof(name));
    GridCell *c = grid_view_add(gv, CELL_BUTTON, (Rect){ 4, 32 + i * 48, SCREEN_W - 8, 44 }, name, "", "", ui_accent(i));
    c->selected = i == s->baby_index;
  }
  show_sheet(gv);
}

// ---- status ----

#define STATUS_TEXT 1
#define STATUS_REFRESH 2

static void status_refresh(GridView *gv) {
  const WatchState *s = comm_state();
  char line[64];
  model_status_text(s, line, sizeof(line));
  if (s->pending > 0) snprintf(gv->cells[STATUS_TEXT].l1, sizeof(gv->cells[STATUS_TEXT].l1), "%s\n\n%d entries waiting to send", line, (int)s->pending);
  else snprintf(gv->cells[STATUS_TEXT].l1, sizeof(gv->cells[STATUS_TEXT].l1), "%s", line);
  grid_view_commit(gv);
}

static void status_activate(GridView *gv, int index, bool long_press) {
  if (index == STATUS_REFRESH) comm_send(CMD_REFRESH, 0, 0, 0, 0);
}

void sheet_status(void) {
  GridHandlers h = { .on_activate = status_activate, .on_state = status_refresh };
  GridView *gv = grid_view_create(&h, NULL);
  if (!gv) return;
  ui_add_header(gv, "Status");
  grid_view_add(gv, CELL_TEXT, (Rect){ 8, 34, SCREEN_W - 16, 120 }, "", "", "", GColorWhite);
  grid_view_add(gv, CELL_BUTTON, (Rect){ 4, 168, SCREEN_W - 8, 52 }, "Refresh", "", "", GColorLightGray);
  status_refresh(gv);
  grid_view_push(gv);
}
