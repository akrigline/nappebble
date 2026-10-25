# Slider inputs, button flow and per-screen units: design

Decisions from the 2026-10-25 design conversation. Mockups: `.superpowers/brainstorm/63204-1792945350/content/all-pages.html` (not committed).

## Intent

Every quantity the user enters on the watch (how long ago, how much) is a slider, on touch and on buttons, instead of fixed chips and preset buttons. The common case stays two actions: open the tile, tap the log button.

## What changes

**Time strip.** Replaces the minutes-ago chip row on Diaper, Potty, Nursing (start), Sleep (start), Pump (start) and Bottle. A compact band under the header, with the whole band as the touch target. It reads "Now - 2:41 PM", or "20 min ago - 2:21 PM" once moved (the clock is the moment that would be logged). Now is the far right end; 60 minutes ago is the far left; 5-minute steps. It opens at Now every time.

**Amount strip.** Replaces the six preset buttons, Custom and the vertical slider screen. More is to the right. Steps are 0.5 oz or 5 ml. Range: bottle 0.5 to 12 oz or 10 to 360 ml; pump 0.5 to 20 oz or 10 to 600 ml. It starts at the last amount logged on that screen, 4 oz or 120 ml the first time.

**Unit row.** An "oz | ml" pair of chips above the amount strip, on Bottle and Pump "How much?". Tapping one converts the amount to the nearest step, and the choice is saved for next time. Bottle and Pump have separate units; the single Clay "Units" setting becomes "Bottle units" and "Pump units" (an existing `units` value seeds both).

**Bottle screen.** Time strip, unit row, amount strip, then two buttons that log: "Formula" and "Breast milk". No type toggle; the "Default bottle type" setting decides which button has button focus first.

**Nursing start.** Time strip, then "Left" and "Right" as a 50-50 row, then a full-width "Both" underneath. Button focus cycles in that reading order.

**Pump "How much?"** (after stopping the pump timer): unit row, amount strip, then "Log" and "Skip amount".

**Buttons.** Each sheet is an ordered list of zones. Time strip, unit row and amount strip are adjust zones; the action buttons are one choice zone.
- Up / Down on an adjust zone moves its knob: Up = right (toward Now on the time strip, more on the amount strip; on the unit row, Up selects ml, Down selects oz).
- Up / Down on the choice zone cycles the buttons (wraps).
- Select on an adjust zone moves to the next zone; Select on the choice zone logs the focused button.
- Back moves to the previous zone; Back on the first zone leaves the sheet.
- Order: Bottle is time, unit, amount, buttons. Pump "How much?" is unit, amount, buttons. Diaper, Potty, Nursing, Sleep start and Pump start are time, buttons. Switch baby, Status and the running-timer screen keep their current button behaviour.

**Long press.** Only the Sleep and Pump tiles keep it: a tap starts the timer at once, a long press opens the start sheet to backdate. On every other tile a long press is a tap.

**Activity is removed** from the watch and the phone (tile, sheet, command, message keys, Clay layout entry, tests). A saved layout that still lists it is tolerated. The nappi API and its mock keep supporting activities.

## Non-goals

- No change to the spec in `../docs`, the API client, the offline queue or the refresh policy.
- No second unit-aware field anywhere else (tiles show the bottle amount in bottle units, the pump amount in pump units).

## Constraints

- A tile's latest-amount text uses that screen's unit.
- A write keeps the unit it was logged in, even if the unit is changed before the queue flushes.
- Touch dragging cannot be exercised in the emulator; it needs a Time 2.

## Calls made without the user

60-minute range and 5-minute steps; the separator " - " in the readout; last-logged amount as the starting amount (replacing the preset setting, which is removed); Up on the unit row selects ml; the Back button behaviour on zones; focus start from the default-bottle-type setting.
