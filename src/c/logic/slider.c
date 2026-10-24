#include "slider.h"

static int32_t step_of(const SliderGeom *g) {
  return g->step > 0 ? g->step : 1;
}

static int32_t clamp(const SliderGeom *g, int32_t v) {
  if (v < g->min) return g->min;
  if (v > g->max) return g->max;
  return v;
}

int32_t slider_value_at(const SliderGeom *g, int y) {
  if (g->height <= 0 || g->max <= g->min) return g->min;
  int dy = y - g->top;
  if (dy < 0) dy = 0;
  if (dy > g->height) dy = g->height;
  int32_t span = g->max - g->min;
  int32_t raw = g->max - (dy * span + g->height / 2) / g->height;
  int32_t step = step_of(g);
  int32_t snapped = g->min + ((raw - g->min + step / 2) / step) * step;
  return clamp(g, snapped);
}

int slider_y_for(const SliderGeom *g, int32_t value) {
  if (g->max <= g->min) return g->top;
  int32_t v = clamp(g, value);
  int32_t span = g->max - g->min;
  return g->top + (int)(((g->max - v) * g->height + span / 2) / span);
}

int32_t slider_nudge(const SliderGeom *g, int32_t value, int dir) {
  return clamp(g, value + dir * step_of(g));
}
