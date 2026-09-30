import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import mongoose from 'mongoose';
import { createApp } from '../src/shared/http.ts';

test('liveness works without credentials but readiness does not claim a database connection', async () => {
  const database = mongoose.createConnection();
  const server = createApp('automation', database).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const live = await fetch(`${origin}/api/health`);
    assert.equal(live.status, 200);
    assert.equal((await live.json()).service, 'automation');
    const ready = await fetch(`${origin}/api/ready`);
    assert.equal(ready.status, 503);
    assert.equal((await ready.json()).database, 'disconnected');
    const missing = await fetch(`${origin}/api/members/12345`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { code: 'NOT_FOUND' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await database.close();
  }
});
