// AppMessage glue: phone state in, commands out, and the persisted cache so
// the grid appears instantly on launch.
#pragma once
#include <pebble.h>
#include "logic/model.h"

typedef void (*CommStateHandler)(void);
// status is a STATUS_* from the phone, or one of the COMM_ACK_* below when the
// watch itself gives up. cmd_id 0 is the phone speaking unprompted.
typedef void (*CommAckHandler)(int cmd_id, int status);

// Never reached the phone, so nothing was logged and trying again is safe.
#define COMM_ACK_NOT_SENT (-1)
// Sent, but no word back: it may or may not have arrived.
#define COMM_ACK_NO_REPLY (-2)

void comm_init(void);
void comm_deinit(void);

const WatchState *comm_state(void);

void comm_set_state_handler(CommStateHandler handler);
void comm_set_ack_handler(CommAckHandler handler);

// Queues a command for the phone and returns true once it is accepted. A busy
// outbox or a phone that is not ready yet (PebbleKit JS still starting) is
// retried a few times; if it never goes, the ack handler gets COMM_ACK_NOT_SENT
// for this command's id. False when the phone is not connected or too many
// commands are waiting; the caller should tell the user nothing was logged.
bool comm_send(int cmd, int32_t a1, int32_t a2, int32_t a3, int32_t a4);
int comm_last_cmd_id(void);
