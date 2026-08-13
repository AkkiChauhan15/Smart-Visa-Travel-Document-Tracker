import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import request from 'supertest';

const { createApp } = await import('../src/app.js');
const { getConfig } = await import('../src/config/env.js');
const { sequelize, User } = await import('../src/models/index.js');

const config = getConfig();
if (config.nodeEnv !== 'test' || !new URL(config.databaseUrl).pathname.toLowerCase().includes('test')) {
  throw new Error('Refusing destructive integration tests outside a dedicated test database');
}

const app = createApp();
const testAccount = {
  name: 'Auth Integration User',
  email: 'auth.integration@example.test',
  password: `Aa1-${randomBytes(18).toString('base64url')}`,
};

function sessionCookie(response) {
  const cookies = response.headers['set-cookie'];
  assert.ok(cookies?.length, 'expected a session cookie');
  return cookies[0].split(';', 1)[0];
}

describe('authentication and authorization', () => {
  before(async () => {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
  });

  after(async () => {
    await sequelize.close();
  });

  it('validates registration input', async () => {
    const response = await request(app).post('/api/auth/register').send({
      name: 'A',
      email: 'not-an-email',
      password: 'weak',
    });

    assert.equal(response.status, 422);
    assert.equal(response.body.error.message, 'Validation failed');
  });

  it('registers a user with a hashed password and starts a session', async () => {
    const response = await request(app).post('/api/auth/register').send(testAccount);

    assert.equal(response.status, 201);
    assert.equal(response.body.user.email, testAccount.email);
    assert.equal(response.body.user.role, 'user');
    assert.equal(response.body.user.passwordHash, undefined);
    sessionCookie(response);

    const storedUser = await User.scope('withPassword').findOne({
      where: { email: testAccount.email },
    });
    assert.ok(storedUser);
    assert.notEqual(storedUser.passwordHash, testAccount.password);
    assert.equal(await bcrypt.compare(testAccount.password, storedUser.passwordHash), true);
  });

  it('rejects duplicate email addresses', async () => {
    const response = await request(app).post('/api/auth/register').send(testAccount);
    assert.equal(response.status, 409);
  });

  it('rejects unauthenticated protected requests', async () => {
    const response = await request(app).get('/api/test/protected');
    assert.equal(response.status, 401);
  });

  it('logs in and accepts an authenticated protected request', async () => {
    const loginResponse = await request(app).post('/api/auth/login').send({
      email: testAccount.email,
      password: testAccount.password,
    });
    assert.equal(loginResponse.status, 200);

    const response = await request(app)
      .get('/api/test/protected')
      .set('Cookie', sessionCookie(loginResponse));
    assert.equal(response.status, 200);
    assert.equal(response.body.user.email, testAccount.email);
  });

  it('rejects invalid credentials', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: testAccount.email,
      password: `${testAccount.password}-wrong`,
    });
    assert.equal(response.status, 401);
  });

  it('blocks a user-role account from the admin route', async () => {
    const loginResponse = await request(app).post('/api/auth/login').send({
      email: testAccount.email,
      password: testAccount.password,
    });

    const response = await request(app)
      .get('/api/test/admin')
      .set('Cookie', sessionCookie(loginResponse));
    assert.equal(response.status, 403);
  });

  it('allows admin-role accounts through role middleware', async () => {
    const storedUser = await User.scope('withPassword').findOne({ where: { email: testAccount.email } });
    storedUser.role = 'admin';
    await storedUser.save();

    const loginResponse = await request(app).post('/api/auth/login').send({
      email: testAccount.email,
      password: testAccount.password,
    });
    const response = await request(app)
      .get('/api/test/admin')
      .set('Cookie', sessionCookie(loginResponse));

    assert.equal(response.status, 200);
    storedUser.role = 'user';
    await storedUser.save();
  });

  it('clears the session cookie on logout', async () => {
    const response = await request(app).post('/api/auth/logout');
    assert.equal(response.status, 204);
    assert.match(response.headers['set-cookie'][0], /svt_session=;/);
  });
});
