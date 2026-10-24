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

module.exports = { STATUS, statusMessage, describeError };
