// Text formatting for the watch. Plain C so it runs under host tests.
#pragma once
#include <stddef.h>
#include <stdint.h>

// "2h ago", "now", or "--" when there is no timestamp (then <= 0).
void fmt_ago(char *buf, size_t n, int32_t now, int32_t then);

// "4:12" or "1:12:04".
void fmt_clock(char *buf, size_t n, int32_t seconds);

// Amount given x10 in the display unit: "4 oz", "2.5 oz", "120 ml".
void fmt_amount(char *buf, size_t n, int32_t x10, int units);

// Backdate chip label: "Now", "-5m", "-1h", "-1h30m".
void fmt_backdate(char *buf, size_t n, int minutes);

// "45m", "1h", "1h 12m".
void fmt_duration_min(char *buf, size_t n, int minutes);
