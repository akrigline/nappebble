#include "test.h"
#include "fmt.h"
#include "protocol.h"

TEST(ago_formats_each_range) {
  char b[16];
  fmt_ago(b, sizeof b, 1000, 0);        CHECK_STR(b, "--");
  fmt_ago(b, sizeof b, 1000, 970);      CHECK_STR(b, "now");
  fmt_ago(b, sizeof b, 1000, 910);      CHECK_STR(b, "1m ago");
  fmt_ago(b, sizeof b, 10000, 10000 - 59 * 60);  CHECK_STR(b, "59m ago");
  fmt_ago(b, sizeof b, 100000, 100000 - 3600);   CHECK_STR(b, "1h ago");
  fmt_ago(b, sizeof b, 100000, 100000 - (2 * 3600 + 59 * 60)); CHECK_STR(b, "2h ago");
  fmt_ago(b, sizeof b, 1000000, 1000000 - 86400);      CHECK_STR(b, "1d ago");
  fmt_ago(b, sizeof b, 1000000, 1000000 - 3 * 86400);  CHECK_STR(b, "3d ago");
}

TEST(ago_treats_a_future_timestamp_as_now) {
  char b[16];
  fmt_ago(b, sizeof b, 1000, 1500);
  CHECK_STR(b, "now");
}

TEST(ago_never_overflows_a_small_buffer) {
  char b[4];
  fmt_ago(b, sizeof b, 1000000, 1000000 - 3 * 86400);
  CHECK(strlen(b) <= 3);
}

TEST(clock_formats_minutes_then_hours) {
  char b[16];
  fmt_clock(b, sizeof b, 0);     CHECK_STR(b, "0:00");
  fmt_clock(b, sizeof b, 59);    CHECK_STR(b, "0:59");
  fmt_clock(b, sizeof b, 61);    CHECK_STR(b, "1:01");
  fmt_clock(b, sizeof b, 3599);  CHECK_STR(b, "59:59");
  fmt_clock(b, sizeof b, 3600);  CHECK_STR(b, "1:00:00");
  fmt_clock(b, sizeof b, 4324);  CHECK_STR(b, "1:12:04");
  fmt_clock(b, sizeof b, -5);    CHECK_STR(b, "0:00");
}

TEST(amount_in_oz_and_ml) {
  char b[16];
  fmt_amount(b, sizeof b, 40, UNITS_OZ);    CHECK_STR(b, "4 oz");
  fmt_amount(b, sizeof b, 25, UNITS_OZ);    CHECK_STR(b, "2.5 oz");
  fmt_amount(b, sizeof b, 1200, UNITS_ML);  CHECK_STR(b, "120 ml");
  fmt_amount(b, sizeof b, 1250, UNITS_ML);  CHECK_STR(b, "125 ml");
  fmt_amount(b, sizeof b, 125, UNITS_ML);   CHECK_STR(b, "12.5 ml");
  fmt_amount(b, sizeof b, 0, UNITS_OZ);     CHECK_STR(b, "0 oz");
}

TEST(backdate_chip_labels) {
  char b[16];
  fmt_backdate(b, sizeof b, 0);   CHECK_STR(b, "Now");
  fmt_backdate(b, sizeof b, 5);   CHECK_STR(b, "-5m");
  fmt_backdate(b, sizeof b, 45);  CHECK_STR(b, "-45m");
  fmt_backdate(b, sizeof b, 60);  CHECK_STR(b, "-1h");
  fmt_backdate(b, sizeof b, 90);  CHECK_STR(b, "-1h30m");
}

TEST(duration_minutes) {
  char b[16];
  fmt_duration_min(b, sizeof b, 0);   CHECK_STR(b, "0m");
  fmt_duration_min(b, sizeof b, 45);  CHECK_STR(b, "45m");
  fmt_duration_min(b, sizeof b, 60);  CHECK_STR(b, "1h");
  fmt_duration_min(b, sizeof b, 72);  CHECK_STR(b, "1h 12m");
}

int main(void) {
  RUN(ago_formats_each_range);
  RUN(ago_treats_a_future_timestamp_as_now);
  RUN(ago_never_overflows_a_small_buffer);
  RUN(clock_formats_minutes_then_hours);
  RUN(amount_in_oz_and_ml);
  RUN(backdate_chip_labels);
  RUN(duration_minutes);
  FINISH();
}
