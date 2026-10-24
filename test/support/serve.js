// `npm run mock`: a local fake of api.nappi.app for the emulator.
// In the app's settings, set Developer > API address to http://localhost:4010
// and use one of the tokens below.
//
//   PORT=4010 HOST=127.0.0.1 TWO_BABIES=1 npm run mock

const { createMockNappi } = require('./mock-nappi');
const { listen } = require('./http-server');

const port = Number(process.env.PORT || 4010);
const host = process.env.HOST || '127.0.0.1';

const mock = createMockNappi();
mock.addToken('dev-token');
mock.addToken('expired-token', { expired: true });
mock.addToken('revoked-token', { revoked: true });
mock.addToken('free-token', { premium: false });
mock.addBaby({ id: '6f1c1d52-3b8e-4c43-9a55-0d5d8f6a1a01', name: 'Phoebe', birth_date: '2026-03-02', timezone: 'America/New_York' });
if (process.env.TWO_BABIES) {
  mock.addBaby({ id: '0a2b3c4d-1111-4222-8333-444455556666', name: 'Oscar', birth_date: '2024-01-09', timezone: 'America/New_York' });
}

listen(mock, port, host).then(() => {
  console.log(`mock nappi API on http://${host}:${port}`);
  console.log('tokens: dev-token | expired-token | revoked-token | free-token');
});
