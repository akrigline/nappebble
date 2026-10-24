#include "comm.h"
#include <string.h>

// Persistent storage keys. The state is larger than one 256-byte persist
// slot, so it is written in chunks.
#define PERSIST_VERSION_KEY 100
#define PERSIST_CHUNK_KEY 101
#define PERSIST_CHUNK_SIZE 200
#define PERSIST_VERSION 1

#define INBOX_SIZE 1024
#define OUTBOX_SIZE 96

static WatchState s_state;
static CommStateHandler s_state_handler;
static CommAckHandler s_ack_handler;
static int s_cmd_id;

const WatchState *comm_state(void) {
  return &s_state;
}

void comm_set_state_handler(CommStateHandler handler) {
  s_state_handler = handler;
}

void comm_set_ack_handler(CommAckHandler handler) {
  s_ack_handler = handler;
}

int comm_last_cmd_id(void) {
  return s_cmd_id;
}

// ---- persistence ----

static void persist_state(void) {
  if (!s_state.has_data) return;
  const uint8_t *bytes = (const uint8_t *)&s_state;
  size_t total = sizeof(s_state);
  persist_write_int(PERSIST_VERSION_KEY, PERSIST_VERSION * 100000 + (int)total);
  for (size_t offset = 0, key = PERSIST_CHUNK_KEY; offset < total; offset += PERSIST_CHUNK_SIZE, key++) {
    size_t n = total - offset < PERSIST_CHUNK_SIZE ? total - offset : PERSIST_CHUNK_SIZE;
    persist_write_data(key, bytes + offset, n);
  }
}

static void load_persisted(void) {
  size_t total = sizeof(s_state);
  if (!persist_exists(PERSIST_VERSION_KEY)) return;
  if (persist_read_int(PERSIST_VERSION_KEY) != PERSIST_VERSION * 100000 + (int)total) return;

  WatchState loaded;
  uint8_t *bytes = (uint8_t *)&loaded;
  for (size_t offset = 0, key = PERSIST_CHUNK_KEY; offset < total; offset += PERSIST_CHUNK_SIZE, key++) {
    size_t n = total - offset < PERSIST_CHUNK_SIZE ? total - offset : PERSIST_CHUNK_SIZE;
    if (persist_read_data(key, bytes + offset, n) != (int)n) return;
  }
  s_state = loaded;
}

// ---- inbox ----

static bool read_int(DictionaryIterator *it, uint32_t key, int32_t *out) {
  Tuple *t = dict_find(it, key);
  if (!t) return false;
  *out = t->value->int32;
  return true;
}

static void read_array(DictionaryIterator *it, uint32_t base, int32_t *out, int count) {
  for (int i = 0; i < count; i++) {
    int32_t v;
    if (read_int(it, base + i, &v)) out[i] = v;
  }
}

static void apply_state(DictionaryIterator *it) {
  WatchState *s = &s_state;
  int32_t v;
  Tuple *t;

  if (read_int(it, MESSAGE_KEY_STATUS, &v)) s->status = (uint8_t)v;
  s->retry_after = read_int(it, MESSAGE_KEY_RETRY_AFTER, &v) ? v : 0;
  if (read_int(it, MESSAGE_KEY_UNITS, &v)) s->units = (uint8_t)v;
  if (read_int(it, MESSAGE_KEY_EXIT_AFTER_LOG, &v)) s->exit_after_log = v != 0;
  if (read_int(it, MESSAGE_KEY_DEFAULT_BOTTLE, &v)) s->default_bottle = (uint8_t)v;

  t = dict_find(it, MESSAGE_KEY_BABY_NAME);
  if (!t) {
    // Nothing known about a baby yet (no token, bad token, first run offline).
    s->has_data = false;
    s->baby_name[0] = '\0';
    s->baby_count = 0;
    return;
  }

  s->has_data = true;
  snprintf(s->baby_name, sizeof(s->baby_name), "%s", t->value->cstring);
  if ((t = dict_find(it, MESSAGE_KEY_BABY_NAMES))) snprintf(s->baby_names, sizeof(s->baby_names), "%s", t->value->cstring);
  if (read_int(it, MESSAGE_KEY_BABY_COUNT, &v)) s->baby_count = (uint8_t)v;
  if (read_int(it, MESSAGE_KEY_BABY_INDEX, &v)) s->baby_index = (uint8_t)v;
  if (read_int(it, MESSAGE_KEY_BABY_ACCENT, &v)) s->baby_accent = (uint8_t)v;
  if (read_int(it, MESSAGE_KEY_OTHER_TIMERS, &v)) s->other_timers = v != 0;
  if (read_int(it, MESSAGE_KEY_PENDING, &v)) s->pending = v;
  if (read_int(it, MESSAGE_KEY_TIMER_AT, &v)) s->timer_at = v;

  if ((t = dict_find(it, MESSAGE_KEY_LAYOUT)) && t->length > 0) {
    int n = t->length < ACTION_COUNT ? t->length : ACTION_COUNT;
    memcpy(s->layout, t->value->data, (size_t)n);
    s->layout_count = (uint8_t)n;
  }

  read_array(it, MESSAGE_KEY_PRESET, s->preset, PRESET_COUNT);
  read_array(it, MESSAGE_KEY_LAST, s->last, ACTION_COUNT);
  read_array(it, MESSAGE_KEY_INFO, s->info, ACTION_COUNT);
  read_array(it, MESSAGE_KEY_TIMER_ELAPSED, s->timer_elapsed, TIMER_COUNT);
  for (int i = 0; i < TIMER_COUNT; i++) {
    if (read_int(it, MESSAGE_KEY_TIMER_STATE + i, &v)) s->timer_state[i] = (uint8_t)v;
    if (read_int(it, MESSAGE_KEY_TIMER_SIDE + i, &v)) s->timer_side[i] = (uint8_t)v;
  }
}

static void inbox_received(DictionaryIterator *it, void *context) {
  int32_t id, result;
  if (read_int(it, MESSAGE_KEY_ACK_ID, &id) && read_int(it, MESSAGE_KEY_ACK_STATUS, &result)) {
    if (s_ack_handler) s_ack_handler((int)id, (int)result);
  }
  if (dict_find(it, MESSAGE_KEY_STATUS)) {
    apply_state(it);
    if (s_state_handler) s_state_handler();
  }
}

static void inbox_dropped(AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_WARNING, "inbox dropped: %d", (int)reason);
}

static void outbox_failed(DictionaryIterator *it, AppMessageResult reason, void *context) {
  APP_LOG(APP_LOG_LEVEL_WARNING, "outbox failed: %d", (int)reason);
}

// ---- outbox ----

bool comm_send(int cmd, int32_t a1, int32_t a2, int32_t a3, int32_t a4) {
  if (!connection_service_peek_pebble_app_connection()) return false;
  DictionaryIterator *it;
  if (app_message_outbox_begin(&it) != APP_MSG_OK) return false;
  s_cmd_id++;
  dict_write_int32(it, MESSAGE_KEY_CMD, cmd);
  dict_write_int32(it, MESSAGE_KEY_CMD_ID, s_cmd_id);
  dict_write_int32(it, MESSAGE_KEY_ARG1, a1);
  dict_write_int32(it, MESSAGE_KEY_ARG2, a2);
  dict_write_int32(it, MESSAGE_KEY_ARG3, a3);
  dict_write_int32(it, MESSAGE_KEY_ARG4, a4);
  return app_message_outbox_send() == APP_MSG_OK;
}

// ---- lifecycle ----

void comm_init(void) {
  model_default(&s_state);
  load_persisted();
  app_message_register_inbox_received(inbox_received);
  app_message_register_inbox_dropped(inbox_dropped);
  app_message_register_outbox_failed(outbox_failed);
  app_message_open(INBOX_SIZE, OUTBOX_SIZE);
}

void comm_deinit(void) {
  persist_state();
}
