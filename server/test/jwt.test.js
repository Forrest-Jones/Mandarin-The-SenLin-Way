import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signJwt, verifyJwt } from '../src/jwt.js';

const secret = 'unit-test-secret-0123456789';

test('jwt: sign/verify round trip', async () => {
  const token = await signJwt({ sub: 'u1', email: 'a@b.co' }, secret);
  assert.equal(token.split('.').length, 3);
  const payload = await verifyJwt(token, secret);
  assert.equal(payload.sub, 'u1');
  assert.equal(payload.email, 'a@b.co');
  assert.equal(payload.exp - payload.iat, 90 * 24 * 3600);
});

test('jwt: rejects wrong secret, tampering and expiry', async () => {
  const token = await signJwt({ sub: 'u1' }, secret, { expiresInSec: 60 });
  assert.equal(await verifyJwt(token, 'another-secret-0123456789'), null);
  const [h, p, s] = token.split('.');
  assert.equal(await verifyJwt(`${h}.${p}x.${s}`, secret), null);
  assert.equal(await verifyJwt(`${h}.${p}.${s.slice(0, -2)}AA`, secret), null);
  assert.equal(await verifyJwt(token, secret, { now: Date.now() + 61_000 }), null);
  assert.equal(await verifyJwt('garbage', secret), null);
  assert.equal(await verifyJwt(null, secret), null);
});
