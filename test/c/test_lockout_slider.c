#include "test.h"
#include "lockout.h"
#include "slider.h"
#include "protocol.h"

TEST(the_first_attempt_is_allowed_and_a_repeat_inside_the_lockout_is_not) {
  Lockout l; lockout_init(&l);
  CHECK(lockout_try(&l, ACTION_DIAPER, 10000));
  CHECK(!lockout_try(&l, ACTION_DIAPER, 10000 + LOCKOUT_MS - 1));
  CHECK(lockout_try(&l, ACTION_DIAPER, 10000 + LOCKOUT_MS));
}

TEST(a_denied_attempt_does_not_extend_the_lockout) {
  Lockout l; lockout_init(&l);
  lockout_try(&l, ACTION_BOTTLE, 0);
  CHECK(!lockout_try(&l, ACTION_BOTTLE, 1000));
  CHECK(lockout_try(&l, ACTION_BOTTLE, LOCKOUT_MS));
}

TEST(actions_are_locked_independently) {
  Lockout l; lockout_init(&l);
  CHECK(lockout_try(&l, ACTION_DIAPER, 100));
  CHECK(lockout_try(&l, ACTION_BOTTLE, 200));
  CHECK(!lockout_try(&l, ACTION_DIAPER, 300));
}

TEST(time_zero_is_a_legitimate_first_attempt) {
  Lockout l; lockout_init(&l);
  CHECK(lockout_try(&l, ACTION_POTTY, 0));
  CHECK(!lockout_try(&l, ACTION_POTTY, 10));
}

TEST(out_of_range_actions_are_refused) {
  Lockout l; lockout_init(&l);
  CHECK(!lockout_try(&l, -1, 0));
  CHECK(!lockout_try(&l, ACTION_COUNT, 0));
}

TEST(the_lockout_survives_the_32_bit_millisecond_wrap) {
  Lockout l; lockout_init(&l);
  CHECK(lockout_try(&l, ACTION_DIAPER, 0xFFFFFF00u));
  CHECK(!lockout_try(&l, ACTION_DIAPER, 0x00000010u));
  CHECK(lockout_try(&l, ACTION_DIAPER, 0xFFFFFF00u + LOCKOUT_MS + 5));
}

static SliderGeom geom(void) {
  SliderGeom g = { 40, 100, 0, 100, 5 };  // top, height, min, max, step
  return g;
}

TEST(slider_top_is_the_maximum_and_bottom_the_minimum) {
  SliderGeom g = geom();
  CHECK_INT(slider_value_at(&g, 40), 100);
  CHECK_INT(slider_value_at(&g, 140), 0);
}

TEST(slider_snaps_to_the_step) {
  SliderGeom g = geom();
  CHECK_INT(slider_value_at(&g, 90), 50);
  CHECK_INT(slider_value_at(&g, 91), 50);
  CHECK_INT(slider_value_at(&g, 93), 45);
}

TEST(slider_clamps_outside_the_track) {
  SliderGeom g = geom();
  CHECK_INT(slider_value_at(&g, 0), 100);
  CHECK_INT(slider_value_at(&g, 400), 0);
}

TEST(slider_y_is_the_inverse_of_value) {
  SliderGeom g = geom();
  CHECK_INT(slider_y_for(&g, 100), 40);
  CHECK_INT(slider_y_for(&g, 0), 140);
  CHECK_INT(slider_y_for(&g, 50), 90);
  CHECK_INT(slider_value_at(&g, slider_y_for(&g, 35)), 35);
}

TEST(nudging_moves_by_one_step_and_stops_at_the_ends) {
  SliderGeom g = geom();
  CHECK_INT(slider_nudge(&g, 50, 1), 55);
  CHECK_INT(slider_nudge(&g, 50, -1), 45);
  CHECK_INT(slider_nudge(&g, 100, 1), 100);
  CHECK_INT(slider_nudge(&g, 0, -1), 0);
}

TEST(a_degenerate_slider_does_not_divide_by_zero) {
  SliderGeom g = { 10, 0, 5, 5, 1 };
  CHECK_INT(slider_value_at(&g, 10), 5);
  SliderGeom h = { 10, 50, 0, 10, 0 };
  CHECK_INT(slider_value_at(&h, 35), 5);
}

int main(void) {
  RUN(the_first_attempt_is_allowed_and_a_repeat_inside_the_lockout_is_not);
  RUN(a_denied_attempt_does_not_extend_the_lockout);
  RUN(actions_are_locked_independently);
  RUN(time_zero_is_a_legitimate_first_attempt);
  RUN(out_of_range_actions_are_refused);
  RUN(the_lockout_survives_the_32_bit_millisecond_wrap);
  RUN(slider_top_is_the_maximum_and_bottom_the_minimum);
  RUN(slider_snaps_to_the_step);
  RUN(slider_clamps_outside_the_track);
  RUN(slider_y_is_the_inverse_of_value);
  RUN(nudging_moves_by_one_step_and_stops_at_the_ends);
  RUN(a_degenerate_slider_does_not_divide_by_zero);
  FINISH();
}
