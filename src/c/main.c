#include <pebble.h>
#include "comm.h"
#include "grid_view.h"
#include "home.h"
#include "ui.h"

static void on_state(void) {
  grid_view_notify_state();
  ui_on_state();
}

static void init(void) {
  ui_init();
  comm_init();
  comm_set_state_handler(on_state);
  home_push();
  comm_send(CMD_REFRESH, 0, 0, 0, 0);
}

static void deinit(void) {
  comm_deinit();
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
