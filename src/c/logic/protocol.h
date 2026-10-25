// Shared by the phone and the watch. src/pkjs/protocol.js is the source of truth:
// test/protocol-sync.test.js fails if the two disagree. Plain #defines on purpose
// so the host-side C tests can include it without the Pebble SDK.
#pragma once

#define STATUS_OK 0
#define STATUS_NO_TOKEN 1
#define STATUS_UNAUTHORIZED 2
#define STATUS_TOKEN_EXPIRED 3
#define STATUS_PREMIUM_REQUIRED 4
#define STATUS_NETWORK 5
#define STATUS_RATE_LIMITED 6
#define STATUS_NO_BABY 7
#define STATUS_ERROR 8

#define ACTION_DIAPER 0
#define ACTION_BOTTLE 1
#define ACTION_NURSING 2
#define ACTION_SLEEP 3
#define ACTION_PUMP 4
#define ACTION_POTTY 5
#define ACTION_STATUS 6

#define CMD_REFRESH 1
#define CMD_LOG_DIAPER 2
#define CMD_LOG_BOTTLE 3
#define CMD_LOG_POTTY 4
// 5 was CMD_LOG_ACTIVITY, removed from the watch app; left unused.
#define CMD_TIMER_START 6
#define CMD_TIMER_STOP 7
#define CMD_SWITCH_BABY 8
#define CMD_TIMER_SWITCH 9

#define DIAPER_WET 0
#define DIAPER_POO 1
#define DIAPER_MIXED 2
#define DIAPER_DRY 3

#define BOTTLE_TYPE_FORMULA 0
#define BOTTLE_TYPE_BREAST_MILK 1
#define BOTTLE_TYPE_TUBE_FEEDING 2
#define BOTTLE_TYPE_COW_MILK 3
#define BOTTLE_TYPE_GOAT_MILK 4
#define BOTTLE_TYPE_SOY_MILK 5
#define BOTTLE_TYPE_OTHER 6

#define POTTY_POTTY 0
#define POTTY_ACCIDENT 1
#define POTTY_SAT_DRY 2

#define TIMER_SLEEP 0
#define TIMER_NURSING 1
#define TIMER_PUMPING 2

#define TIMER_STATE_NONE 0
#define TIMER_STATE_RUNNING 1
#define TIMER_STATE_PAUSED 2

#define SIDE_NONE 0
#define SIDE_LEFT 1
#define SIDE_RIGHT 2
#define SIDE_BOTH 3

#define UNITS_OZ 0
#define UNITS_ML 1

#define PRESET_COUNT 6
#define ACTION_COUNT 7
#define TIMER_COUNT 3
