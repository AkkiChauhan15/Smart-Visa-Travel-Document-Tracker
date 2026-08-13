import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

process.env.CRON_SECRET = 'system-boundary-cron-secret-with-32-characters';

const { createApp } = await import('../src/app.js');
const { getConfig } = await import('../src/config/env.js');
const { sequelize } = await import('../src/models/index.js');

const config = getConfig();
if (config.nodeEnv !== 'test' || !new URL(config.databaseUrl).pathname.toLowerCase().includes('test')) {
  throw new Error('Refusing destructive integration tests outside a dedicated test database');
}

const app = createApp();

describe('whole-application route boundaries', () => {
  before(async () => {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
  });

  after(async () => {
    await sequelize.close();
  });

  it('requires authentication for every protected API route family', async () => {
    const protectedPaths = [
      '/api/test/protected',
      '/api/dashboard',
      '/api/passports',
      '/api/visas',
      '/api/travel-documents',
      '/api/reminders',
      '/api/notifications',
      '/api/travel-history',
      '/api/destination-checklists',
      '/api/admin/users',
      '/api/admin/statistics',
    ];
    const responses = await Promise.all(protectedPaths.map((path) => request(app).get(path)));
    assert.deepEqual(responses.map((response) => response.status), protectedPaths.map(() => 401));
    for (const response of responses) {
      assert.equal(response.body.error.message, 'Authentication required');
      assert.equal(JSON.stringify(response.body).includes('stack'), false);
    }
  });

  it('does not expose private storage as a static URL and keeps health public', async () => {
    const [guessedFile, health] = await Promise.all([
      request(app).get('/uploads/00000000-0000-4000-8000-000000000000.png'),
      request(app).get('/api/health'),
    ]);
    assert.equal(guessedFile.status, 404);
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { status: 'ok' });
  });

  it('rejects missing or incorrect external reminder trigger secrets', async () => {
    const [missing, incorrect] = await Promise.all([
      request(app).get('/api/cron/run-reminders'),
      request(app).get('/api/cron/run-reminders').set('x-cron-secret', 'incorrect-secret'),
    ]);

    assert.equal(missing.status, 401);
    assert.equal(incorrect.status, 401);
    assert.equal(missing.body.error.message, 'Invalid reminder trigger credentials');
    assert.equal(incorrect.body.error.message, 'Invalid reminder trigger credentials');
  });
});
