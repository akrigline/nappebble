#include "ui.h"
#include "logic/lockout.h"
#include <string.h>

static Lockout s_lockout;
static Window *s_home;

void ui_init(void) {
  lockout_init(&s_lockout);
}

GColor ui_action_color(int action) {
  switch (action) {
    case ACTION_DIAPER: return GColorChromeYellow;
    case ACTION_BOTTLE: return GColorVividCerulean;
    case ACTION_NURSING: return GColorBrilliantRose;
    case ACTION_SLEEP: return GColorIndigo;
    case ACTION_PUMP: return GColorTiffanyBlue;
    case ACTION_POTTY: return GColorMayGreen;
    case ACTION_ACTIVITY: return GColorOrange;
    default: return GColorLightGray;
  }
}

GColor ui_accent(int index) {
  switch (((index % 6) + 6) % 6) {
    case 0: return GColorCobaltBlue;
    case 1: return GColorFolly;
    case 2: return GColorIslamicGreen;
    case 3: return GColorOrange;
    case 4: return GColorPurple;
    default: return GColorDarkCandyAppleRed;
  }
}

GColor ui_baby_accent(const WatchState *s) {
  return ui_accent(s->baby_accent);
}

int32_t ui_now(void) {
  return (int32_t)time(NULL);
}

void ui_set_home_window(Window *home) {
  s_home = home;
}

void ui_pop_to_home(void) {
  while (s_home && window_stack_get_top_window() != s_home && window_stack_contains_window(s_home)) {
    window_stack_pop(false);
  }
}

void ui_add_header(GridView *gv, const char *title) {
  const WatchState *s = comm_state();
  Rect r = { 0, 0, SCREEN_W, HEADER_H };
  char text[48];
  if (s->baby_name[0]) snprintf(text, sizeof(text), "%s: %s", s->baby_name, title);
  else snprintf(text, sizeof(text), "%s", title);
  GridCell *c = grid_view_add(gv, CELL_HEADER, r, "", text, "", ui_baby_accent(s));
  c->enabled = false;
}

static uint32_t now_ms(void) {
  time_t sec;
  uint16_t ms;
  time_ms(&sec, &ms);
  return (uint32_t)sec * 1000u + ms;
}

static void after_logged(GridView *gv) {
  if (comm_state()->exit_after_log) window_stack_pop_all(true);
  else ui_pop_to_home();
}

bool ui_send(int action, const char *what, int cmd, int32_t a1, int32_t a2, int32_t a3, int32_t a4) {
  GridView *top = grid_view_top();
  if (!lockout_try(&s_lockout, action, now_ms())) return false;

  if (!comm_send(cmd, a1, a2, a3, a4)) {
    vibes_double_pulse();
    if (top) grid_view_flash(top, 2, "Phone not connected", 1500, NULL);
    return false;
  }

  const WatchState *s = comm_state();
  char caption[40];
  if (s->baby_name[0]) snprintf(caption, sizeof(caption), "%s: %s", s->baby_name, what);
  else snprintf(caption, sizeof(caption), "%s", what);
  vibes_short_pulse();
  if (top) grid_view_flash(top, 1, caption, 600, after_logged);
  return true;
}
