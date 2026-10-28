#include "ui.h"
#include "logic/lockout.h"
#include <string.h>

static Lockout s_lockout;
static Window *s_home;

static void on_ack(int id, int status);

void ui_init(void) {
  lockout_init(&s_lockout);
  comm_set_ack_handler(on_ack);
}

GColor ui_action_color(int action) {
  switch (action) {
    // Hues follow the nappi app's tiles, snapped to the 64-colour palette. Flat fills, no gradient.
    case ACTION_DIAPER: return GColorChromeYellow;
    case ACTION_BOTTLE: return GColorBrilliantRose;
    case ACTION_NURSING: return GColorOrange;
    case ACTION_SLEEP: return GColorVividCerulean;
    case ACTION_PUMP: return GColorLavenderIndigo;
    case ACTION_POTTY: return GColorMayGreen;
    default: return GColorLightGray;
  }
}

uint32_t ui_action_icon(int action) {
  switch (action) {
    case ACTION_DIAPER: return RESOURCE_ID_ICON_DIAPER;
    case ACTION_BOTTLE: return RESOURCE_ID_ICON_BOTTLE;
    case ACTION_NURSING: return RESOURCE_ID_ICON_NURSING;
    case ACTION_SLEEP: return RESOURCE_ID_ICON_SLEEP;
    case ACTION_PUMP: return RESOURCE_ID_ICON_PUMP;
    default: return 0;
  }
}

GColor ui_accent(int index) {
  switch (((index % 6) + 6) % 6) {
    // First three match the nappi app's baby avatars (green, amber, coral).
    case 0: return GColorIslamicGreen;
    case 1: return GColorChromeYellow;
    case 2: return GColorSunsetOrange;
    case 3: return GColorCobaltBlue;
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

// ---- send, wait for the phone's ACK, then confirm ----
//
// The checkmark means the phone has taken the command, not that the Bluetooth
// outbox accepted it: there is no delete in the API, so a confirmed log that
// never arrived is the worst failure this app can have.

#define ACK_WAIT_MS 6000     // longer than comm's retries (4 x 600 ms) plus a round trip
#define EXIT_WAIT_MS 6000

static struct {
  bool active;
  int id;
  int action;
  char caption[40];
} s_await;

static bool s_exit_wait;     // exit-after-log is waiting for the phone to deliver

static void exit_now(GridView *gv) {
  s_exit_wait = false;
  window_stack_pop_all(true);
}

// PebbleKit JS stops when this app does, so with exit-after-log hold on until
// the phone has sent the write to nappi (its state shows nothing pending). The
// write is kept on the phone if that never happens, and goes out next launch.
static void after_logged(GridView *gv) {
  if (!comm_state()->exit_after_log) {
    ui_pop_to_home();
    return;
  }
  if (comm_state()->pending == 0 || !gv) {
    exit_now(gv);
    return;
  }
  s_exit_wait = true;
  grid_view_flash(gv, 3, "Saving...", EXIT_WAIT_MS, exit_now);
}

void ui_on_state(void) {
  if (s_exit_wait && comm_state()->pending == 0) exit_now(NULL);
}

static const char *ack_text(int status) {
  switch (status) {
    case STATUS_NO_TOKEN: return "No token set";
    case STATUS_NO_BABY: return "No baby found";
    case STATUS_WRONG_BABY: return "Baby changed. Try again";
    case COMM_ACK_NOT_SENT: return "Not sent. Try again";
    case COMM_ACK_NO_REPLY: return "No reply. Check phone";
    default: return "Not logged";
  }
}

static void await_timed_out(GridView *gv) {
  if (!s_await.active) return;
  s_await.active = false;
  vibes_double_pulse();
  grid_view_flash(gv, 2, ack_text(COMM_ACK_NO_REPLY), 2500, NULL);
}

static void on_ack(int id, int status) {
  GridView *top = grid_view_top();
  if (id == 0) {
    // The phone speaking unprompted: nappi refused a write we had confirmed.
    if (status == STATUS_REJECTED) {
      vibes_double_pulse();
      if (top) grid_view_flash(top, 2, "nappi rejected a log", 3000, NULL);
    }
    return;
  }
  if (!s_await.active || id != s_await.id) return;
  s_await.active = false;

  if (status == STATUS_OK) {
    vibes_short_pulse();
    if (top) grid_view_flash(top, 1, s_await.caption, 600, after_logged);
    else after_logged(NULL);
    return;
  }
  // Nothing was logged. When it never reached the phone, let the user tap again at once.
  if (status != COMM_ACK_NO_REPLY) lockout_clear(&s_lockout, s_await.action);
  vibes_double_pulse();
  if (top) grid_view_flash(top, 2, ack_text(status), 2500, NULL);
}

bool ui_send(int action, const char *what, int cmd, int32_t a1, int32_t a2, int32_t a3, int32_t a4) {
  GridView *top = grid_view_top();
  if (!lockout_try(&s_lockout, action, now_ms())) return false;

  if (!comm_send(cmd, a1, a2, a3, a4)) {
    lockout_clear(&s_lockout, action);
    vibes_double_pulse();
    if (top) grid_view_flash(top, 2, "Phone not connected", 1500, NULL);
    return false;
  }

  const WatchState *s = comm_state();
  s_await.active = true;
  s_await.id = comm_last_cmd_id();
  s_await.action = action;
  if (s->baby_name[0]) snprintf(s_await.caption, sizeof(s_await.caption), "%s: %s", s->baby_name, what);
  else snprintf(s_await.caption, sizeof(s_await.caption), "%s", what);
  if (top) grid_view_flash(top, 3, "Sending...", ACK_WAIT_MS, await_timed_out);
  return true;
}
