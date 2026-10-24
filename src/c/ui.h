// Helpers shared by Home and the sheets: colours, the send-and-confirm flow
// (debounce, vibe, checkmark naming the baby), and navigation back to Home.
#pragma once
#include <pebble.h>
#include "grid_view.h"
#include "comm.h"

void ui_init(void);

GColor ui_action_color(int action);
GColor ui_accent(int index);   // one colour per baby, so each is recognisable
GColor ui_baby_accent(const WatchState *s);
int32_t ui_now(void);

void ui_set_home_window(Window *home);
void ui_pop_to_home(void);

// Standard sheet header: "<baby>: <title>" in the baby's accent colour.
void ui_add_header(GridView *gv, const char *title);

// Sends a write command: ignores a repeat within the lockout, tells the user
// when the phone is unreachable, otherwise vibrates and shows a checkmark
// captioned "<baby>: <what>" before returning to Home (or exiting).
bool ui_send(int action, const char *what, int cmd, int32_t a1, int32_t a2, int32_t a3, int32_t a4);
