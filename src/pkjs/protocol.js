// What the phone tells the watch, and how API failures become that.
// STATUS values travel as small ints in AppMessage; keep them stable.

const STATUS = Object.freeze({
  OK: 0,
  NO_TOKEN: 1,
  UNAUTHORIZED: 2,
  TOKEN_EXPIRED: 3,
  PREMIUM_REQUIRED: 4,
  NETWORK: 5,
  RATE_LIMITED: 6,
  NO_BABY: 7,
  ERROR: 8,
});

// Tile actions. The watch's layout is a list of these ids; STATUS is pinned last.
const ACTION = Object.freeze({
  DIAPER: 0,
  BOTTLE: 1,
  NURSING: 2,
  SLEEP: 3,
  PUMP: 4,
  POTTY: 5,
  ACTIVITY: 6,
  STATUS: 7,
});

// Watch -> phone commands (CMD key, with ARG1..ARG4 and a CMD_ID echoed in the ACK).
//   LOG_DIAPER    ARG1 DIAPER_*, ARG2 minutes ago
//   LOG_BOTTLE    ARG1 amount x10 (in the current UNITS), ARG2 BOTTLE_TYPE_*, ARG3 minutes ago
//   LOG_POTTY     ARG1 POTTY_*, ARG2 minutes ago
//   LOG_ACTIVITY  ARG1 ACTIVITY_* index, ARG2 duration minutes (0 none), ARG3 minutes ago
//   TIMER_START   ARG1 TIMER_*, ARG2 SIDE_*, ARG3 minutes ago
//   TIMER_STOP    ARG1 TIMER_*, ARG2 SIDE_* override (0 none), ARG3 pumped amount x10 (0 none)
//   TIMER_SWITCH  ARG1 new SIDE_* (stop the nursing timer, start the other side)
//   SWITCH_BABY   ARG1 baby index
const CMD = Object.freeze({
  REFRESH: 1,
  LOG_DIAPER: 2,
  LOG_BOTTLE: 3,
  LOG_POTTY: 4,
  LOG_ACTIVITY: 5,
  TIMER_START: 6,
  TIMER_STOP: 7,
  SWITCH_BABY: 8,
  TIMER_SWITCH: 9,
});

const DIAPER = Object.freeze({ WET: 0, POO: 1, MIXED: 2, DRY: 3 });
const DIAPER_TYPES = ['wet', 'poo', 'mixed', 'dry'];

const BOTTLE_TYPE = Object.freeze({
  FORMULA: 0, BREAST_MILK: 1, TUBE_FEEDING: 2, COW_MILK: 3, GOAT_MILK: 4, SOY_MILK: 5, OTHER: 6,
});
const BOTTLE_TYPES = ['formula', 'breast_milk', 'tube_feeding', 'cow_milk', 'goat_milk', 'soy_milk', 'other'];

const POTTY = Object.freeze({ POTTY: 0, ACCIDENT: 1, SAT_DRY: 2 });
const POTTY_OUTCOMES = ['potty', 'accident', 'sat_dry'];

// Order is the API's activity_type enum; the watch sends the index.
const ACTIVITY_TYPES = [
  'bath', 'tummy_time', 'story_time', 'play', 'outdoor', 'screen_time', 'skin_to_skin', 'spit_up',
  'brush_teeth', 'skin_care', 'massage', 'reading', 'doctor_visit', 'hospitalization', 'mouth_exercises',
  'physical_therapy', 'nebulizer', 'stretches', 'digestive_discomfort',
];

const TIMER = Object.freeze({ SLEEP: 0, NURSING: 1, PUMPING: 2 });
const TIMER_TYPES = ['sleep', 'nursing', 'pumping'];
const TIMER_STATE = Object.freeze({ NONE: 0, RUNNING: 1, PAUSED: 2 });

const SIDE = Object.freeze({ NONE: 0, LEFT: 1, RIGHT: 2, BOTH: 3 });
const UNITS = Object.freeze({ OZ: 0, ML: 1 });

const PRESET_COUNT = 6;

// Canonical AppMessage key list; package.json must match (see protocol-sync test).
// "NAME[n]" declares n consecutive keys, MESSAGE_KEY_NAME + i on the watch.
const MESSAGE_KEYS = [
  'STATUS', 'BABY_NAME', 'RETRY_AFTER',
  'CMD', 'CMD_ID', 'ARG1', 'ARG2', 'ARG3', 'ARG4',
  'ACK_ID', 'ACK_STATUS',
  'BABY_COUNT', 'BABY_INDEX', 'BABY_NAMES', 'BABY_ACCENT', 'OTHER_TIMERS',
  'UNITS', 'EXIT_AFTER_LOG', 'DEFAULT_BOTTLE',
  'LAYOUT',
  'PRESET[' + PRESET_COUNT + ']',
  'LAST[' + Object.keys(ACTION).length + ']',
  'INFO[' + Object.keys(ACTION).length + ']',
  'TIMER_STATE[' + Object.keys(TIMER).length + ']',
  'TIMER_ELAPSED[' + Object.keys(TIMER).length + ']',
  'TIMER_SIDE[' + Object.keys(TIMER).length + ']',
  'TIMER_AT',
  'PENDING',
];

function statusMessage(status, retryAfter) {
  switch (status) {
    case STATUS.OK: return 'Connected to nappi.';
    case STATUS.NO_TOKEN: return 'No API token yet.';
    case STATUS.UNAUTHORIZED: return 'That token was not accepted. Create a new one at nappi.app/app/connections.';
    case STATUS.TOKEN_EXPIRED: return 'That token has expired. Create a new one at nappi.app/app/connections.';
    case STATUS.PREMIUM_REQUIRED: return 'The nappi API needs nappi Premium on the token owner\'s account.';
    case STATUS.NETWORK: return 'Could not reach nappi. Check the phone\'s connection.';
    case STATUS.RATE_LIMITED: return 'nappi is rate limiting this token. Try again in ' + retryAfter + ' seconds.';
    case STATUS.NO_BABY: return 'This nappi household has no babies yet.';
    default: return 'nappi returned an unexpected response.';
  }
}

// Branch on the codes the docs name; 429 is recognised by status alone
// because the docs give it no code.
function describeError(err) {
  let status = STATUS.ERROR;
  let retryAfter = null;
  if (err && err.status === 429) {
    status = STATUS.RATE_LIMITED;
    retryAfter = err.retryAfter;
  } else if (err && err.code === 'unauthorized') status = STATUS.UNAUTHORIZED;
  else if (err && err.code === 'token_expired') status = STATUS.TOKEN_EXPIRED;
  else if (err && err.code === 'premium_required') status = STATUS.PREMIUM_REQUIRED;
  else if (err && err.code === 'network') status = STATUS.NETWORK;
  else if (err && err.code === 'no_token') status = STATUS.NO_TOKEN;
  return { status, retryAfter, text: statusMessage(status, retryAfter) };
}

module.exports = {
  STATUS, statusMessage, describeError,
  ACTION, CMD, DIAPER, DIAPER_TYPES, BOTTLE_TYPE, BOTTLE_TYPES, POTTY, POTTY_OUTCOMES, ACTIVITY_TYPES,
  TIMER, TIMER_TYPES, TIMER_STATE, SIDE, UNITS, PRESET_COUNT, MESSAGE_KEYS,
};
