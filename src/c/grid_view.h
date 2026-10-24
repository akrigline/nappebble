// A window made of tappable cells: tiles, buttons, chips, a header band and
// text blocks. Home and every sheet are GridViews, so touch (through the
// host-tested TouchFsm) and the button fallback are written once.
#pragma once
#include <pebble.h>
#include "logic/layout.h"
#include "logic/touch_fsm.h"

#define GRID_MAX_CELLS 20

enum { FONT_BODY = 0, FONT_VALUE = 1, FONT_CLOCK = 2 };

typedef enum {
  CELL_TILE,
  CELL_BUTTON,
  CELL_CHIP,
  CELL_HEADER,
  CELL_TEXT
} CellKind;

typedef struct {
  Rect rect;
  CellKind kind;
  char title[24];
  char l1[100];
  char l2[24];
  GColor bg, fg;
  bool selected;
  bool enabled;
  uint8_t font;       // CELL_TEXT: FONT_BODY, FONT_VALUE or FONT_CLOCK
  bool has_dot;       // CELL_HEADER: status dot at the right edge
  GColor dot;
} GridCell;

typedef struct GridView GridView;

typedef struct {
  void (*on_activate)(GridView *gv, int index, bool long_press);
  void (*on_swipe)(GridView *gv, int direction);   // SWIPE_LEFT / SWIPE_RIGHT
  void (*on_tick)(GridView *gv);
  void (*on_state)(GridView *gv);                  // phone state changed
  void (*on_slider)(GridView *gv, int y);          // touch inside the slider track
  void (*on_unload)(GridView *gv);
} GridHandlers;

struct GridView {
  Window *window;
  Layer *layer;
  GridCell cells[GRID_MAX_CELLS];
  int count;
  int focus;
  bool show_focus;
  int pressed;
  TouchFsm fsm;
  AppTimer *press_timer;
  GridHandlers h;
  void *ctx;                 // owned by the creator; freed in on_unload
  int page, pages;
  int tick_secs;             // 0, 1 or 60
  int overlay;               // 0 none, 1 check, 2 message
  char message[40];
  AppTimer *overlay_timer;
  void (*overlay_done)(GridView *gv);
  bool has_slider;
  Rect slider_track;
  int slider_knob_y;
};

GridView *grid_view_create(const GridHandlers *handlers, void *ctx);
void grid_view_push(GridView *gv);

void grid_view_clear(GridView *gv);
GridCell *grid_view_add(GridView *gv, CellKind kind, Rect rect, const char *title, const char *l1,
                        const char *l2, GColor bg);
// Call after editing cells so touch hit-testing and drawing pick them up.
void grid_view_commit(GridView *gv);

void grid_view_set_tick(GridView *gv, int secs);
void grid_view_focus(GridView *gv, int index);

// 1 = checkmark with `message` as its caption, 2 = error banner. `done` runs when it expires.
void grid_view_flash(GridView *gv, int kind, const char *message, int ms, void (*done)(GridView *gv));

GridView *grid_view_top(void);
void grid_view_notify_state(void);
