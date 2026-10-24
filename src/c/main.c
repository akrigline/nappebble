#include <pebble.h>

// M0: show the active baby and the phone's connection status. Values of the
// STATUS message key come from src/pkjs/protocol.js and must stay in step.
enum {
  STATUS_OK = 0,
  STATUS_NO_TOKEN = 1,
  STATUS_UNAUTHORIZED = 2,
  STATUS_TOKEN_EXPIRED = 3,
  STATUS_PREMIUM_REQUIRED = 4,
  STATUS_NETWORK = 5,
  STATUS_RATE_LIMITED = 6,
  STATUS_NO_BABY = 7,
};

#define HEADER_HEIGHT 24
#define NAME_MAX 32
#define STATUS_MAX 96

static Window *s_window;
static TextLayer *s_header_layer;
static TextLayer *s_status_layer;
static char s_baby_name[NAME_MAX];
static char s_status_text[STATUS_MAX];

static void show_status(int32_t status, int32_t retry_after) {
  switch (status) {
    case STATUS_OK:
      snprintf(s_status_text, sizeof(s_status_text), "Connected");
      break;
    case STATUS_NO_TOKEN:
      snprintf(s_status_text, sizeof(s_status_text), "Open nappi settings on your phone and enter your API token");
      break;
    case STATUS_UNAUTHORIZED:
      snprintf(s_status_text, sizeof(s_status_text), "Token not accepted. Check nappi settings");
      break;
    case STATUS_TOKEN_EXPIRED:
      snprintf(s_status_text, sizeof(s_status_text), "Token expired. Create a new one");
      break;
    case STATUS_PREMIUM_REQUIRED:
      snprintf(s_status_text, sizeof(s_status_text), "nappi Premium is required");
      break;
    case STATUS_NETWORK:
      snprintf(s_status_text, sizeof(s_status_text), "Can't reach nappi. Check the phone's connection");
      break;
    case STATUS_RATE_LIMITED:
      snprintf(s_status_text, sizeof(s_status_text), "Slow down. Retry in %d s", (int)retry_after);
      break;
    case STATUS_NO_BABY:
      snprintf(s_status_text, sizeof(s_status_text), "No babies in this nappi household");
      break;
    default:
      snprintf(s_status_text, sizeof(s_status_text), "Unexpected response from nappi");
      break;
  }
  text_layer_set_text(s_status_layer, s_status_text);
}

static void inbox_received(DictionaryIterator *iter, void *context) {
  Tuple *status = dict_find(iter, MESSAGE_KEY_STATUS);
  Tuple *name = dict_find(iter, MESSAGE_KEY_BABY_NAME);
  Tuple *retry = dict_find(iter, MESSAGE_KEY_RETRY_AFTER);

  if (name) {
    snprintf(s_baby_name, sizeof(s_baby_name), "%s", name->value->cstring);
    text_layer_set_text(s_header_layer, s_baby_name);
  }
  if (status) {
    show_status(status->value->int32, retry ? retry->value->int32 : 0);
  }
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_header_layer = text_layer_create(GRect(4, 0, bounds.size.w - 8, HEADER_HEIGHT));
  text_layer_set_font(s_header_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_text(s_header_layer, "nappi");
  layer_add_child(root, text_layer_get_layer(s_header_layer));

  s_status_layer = text_layer_create(GRect(4, HEADER_HEIGHT + 8, bounds.size.w - 8, bounds.size.h - HEADER_HEIGHT - 8));
  text_layer_set_font(s_status_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_text(s_status_layer, "Connecting...");
  layer_add_child(root, text_layer_get_layer(s_status_layer));
}

static void window_unload(Window *window) {
  text_layer_destroy(s_status_layer);
  text_layer_destroy(s_header_layer);
}

static void init(void) {
  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers) {
    .load = window_load,
    .unload = window_unload,
  });
  app_message_register_inbox_received(inbox_received);
  app_message_open(128, 0);
  window_stack_push(s_window, true);
}

static void deinit(void) {
  window_destroy(s_window);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
