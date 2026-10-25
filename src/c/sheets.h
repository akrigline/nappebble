// Bottom-sheet style screens opened from Home. Each is a GridView.
// `backdate` opens the sheet with the minutes-ago chip row focused and the
// longer set of choices (-5 .. -60 min).
#pragma once
#include <stdbool.h>

void sheet_diaper(bool backdate);
void sheet_potty(bool backdate);
void sheet_bottle(bool backdate);
void sheet_nursing_start(bool backdate);
void sheet_timer_start(int action, bool backdate);   // sleep or pump, backdated start
void sheet_pump_amount(void);                        // after stopping a pump timer
void sheet_babies(void);
void sheet_status(void);

void timer_view_open(int timer);
