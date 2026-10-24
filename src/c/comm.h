// AppMessage glue: phone state in, commands out, and the persisted cache so
// the grid appears instantly on launch.
#pragma once
#include <pebble.h>
#include "logic/model.h"

typedef void (*CommStateHandler)(void);
typedef void (*CommAckHandler)(int cmd_id, int status);

void comm_init(void);
void comm_deinit(void);

const WatchState *comm_state(void);

void comm_set_state_handler(CommStateHandler handler);
void comm_set_ack_handler(CommAckHandler handler);

// Sends a command to the phone. False when the phone is not connected or the
// outbox is busy; the caller should tell the user nothing was logged.
bool comm_send(int cmd, int32_t a1, int32_t a2, int32_t a3, int32_t a4);
int comm_last_cmd_id(void);
