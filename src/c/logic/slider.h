// Vertical slider mapping for the custom-amount screen: top is max, bottom
// is min, values snap to `step`. Plain C.
#pragma once
#include <stdint.h>

typedef struct {
  int16_t top, height;
  int32_t min, max, step;
} SliderGeom;

int32_t slider_value_at(const SliderGeom *g, int y);
int slider_y_for(const SliderGeom *g, int32_t value);
int32_t slider_nudge(const SliderGeom *g, int32_t value, int dir);
