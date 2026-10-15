const test = require('node:test');
const assert = require('node:assert/strict');
const { getDatabaseOptions } = require('../../src/config/database');

test('database TLS verifies certificates and local sockets do not require TLS', () => {
  assert.equal(getDatabaseOptions('postgresql://user:fixture@db.supabase.co/database', {}).ssl.rejectUnauthorized, true);
  assert.equal(getDatabaseOptions('postgresql://localhost/database', { DATABASE_SSL: 'true' }).ssl.rejectUnauthorized, true);
  assert.equal(getDatabaseOptions('postgresql:///database?host=/tmp/socket', {}).ssl, undefined);
  assert.throws(() => getDatabaseOptions('postgresql://localhost/database?sslmode=no-verify', {}), /verification/);
  assert.throws(() => getDatabaseOptions('postgresql://db.supabase.co/database?sslmode=disable', {}), /cannot be disabled/);
});
