// Touch gesture state machine. The SDK only gives raw touchdown / position /
// liftoff events, so taps, drag-out cancel, long press and page swipes are
// decided here, over a set of rects. Plain C.
//
// Semantics (spec "Interaction model"):
//  - press on touchdown inside a rect;
//  - activate on liftoff only if the finger never left that rect;
//  - leaving the rect cancels, and coming back does not revive the tap;
//  - holding LONG_PRESS_MS fires long_press once and suppresses the tap;
//  - a mostly-horizontal move of SWIPE_MIN_PX fires one swipe and cancels.
#pragma once
#include <stdbool.h>
#include <stdint.h>
#include "layout.h"

#define TOUCH_MAX_RECTS 16
#define LONG_PRESS_MS 500
#define SWIPE_MIN_PX 40
#define SWIPE_LEFT (-1)   // finger moved left: next page
#define SWIPE_RIGHT 1

typedef struct {
  int press;       // rect index, or -1
  int cancel;
  int activate;
  int long_press;
  int swipe;       // SWIPE_LEFT, SWIPE_RIGHT or 0
} TouchResult;

typedef struct {
  Rect rects[TOUCH_MAX_RECTS];
  int count;
  bool active;
  int target;
  int down_x, down_y;
  uint32_t down_ms;
  bool long_fired, cancelled, swiped;
} TouchFsm;

void touch_fsm_init(TouchFsm *f);
void touch_fsm_set_rects(TouchFsm *f, const Rect *rects, int count);
TouchResult touch_fsm_down(TouchFsm *f, int x, int y, uint32_t now_ms);
TouchResult touch_fsm_move(TouchFsm *f, int x, int y, uint32_t now_ms);
TouchResult touch_fsm_up(TouchFsm *f, int x, int y, uint32_t now_ms);
TouchResult touch_fsm_tick(TouchFsm *f, uint32_t now_ms);
