import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

const { createApp } = await import('../src/app.js');
const { getConfig } = await import('../src/config/env.js');
const {
  Notification,
  Reminder,
  TravelDocument,
  User,
  sequelize,
} = await import('../src/models/index.js');

const config = getConfig();
if (config.nodeEnv !== 'test' || !new URL(config.databaseUrl).pathname.toLowerCase().includes('test')) {
  throw new Error('Refusing destructive integration tests outside a dedicated test database');
}

const app = createApp();
const current = new Date();
const TODAY = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), 12));

function dateFromNow(days) {
  const date = new Date(TODAY);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function cookieFrom(response) {
  return response.headers['set-cookie'][0].split(';', 1)[0];
}

async function register(email, name) {
  const password = `Aa1-${randomBytes(18).toString('base64url')}`;
  const response = await request(app).post('/api/auth/register').send({ name, email, password });
  assert.equal(response.status, 201);
  assert.equal(response.body.user.status, 'active');
  return { cookie: cookieFrom(response), password, user: response.body.user };
}

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

describe('admin-only account management and aggregate statistics', () => {
  let admin;
  let owner;
  let other;
  let passport;
  let visa;

  before(async () => {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
    admin = await register('admin-panel@example.test', 'Platform Admin');
    owner = await register('admin-owner@example.test', 'Document Owner');
    other = await register('admin-other@example.test', 'Other Account');
    await User.update({ role: 'admin' }, { where: { id: admin.user.id } });

    const passportResponse = await request(app).post('/api/passports').set('Cookie', owner.cookie).send({
      passportNumber: 'SENSITIVE-PASSPORT-999',
      countryOfIssue: 'India',
      issueDate: dateFromNow(-365),
      expiryDate: dateFromNow(180),
    });
    assert.equal(passportResponse.status, 201);
    passport = passportResponse.body.passport;

    const visaResponse = await request(app).post('/api/visas').set('Cookie', owner.cookie).send({
      country: 'Japan',
      visaType: 'Visitor',
      validFrom: dateFromNow(-365),
      validUntil: dateFromNow(20),
      entryType: 'multiple',
      visaId: 'SENSITIVE-VISA-888',
    });
    assert.equal(visaResponse.status, 201);
    visa = visaResponse.body.visa;

    await TravelDocument.create({
      ownerId: other.user.id,
      documentType: 'Private insurance record',
      fileReference: 'unguessable-sensitive-file-reference.png',
      originalFileName: 'private-insurance-proof.png',
      fileMimeType: 'image/png',
      fileSize: 68,
      expiryDate: dateFromNow(-1),
    });
    const tripResponse = await request(app).post('/api/travel-history').set('Cookie', owner.cookie).send({
      countryVisited: 'Japan',
      entryDate: dateFromNow(-20),
      exitDate: dateFromNow(-15),
      purpose: 'Tourism',
      visaUsedId: visa.id,
    });
    assert.equal(tripResponse.status, 201);

    const passportReminder = await Reminder.findOne({
      where: { ownerId: owner.user.id, relatedDocumentId: passport.id },
      order: [['daysBefore', 'DESC']],
    });
    const visaReminder = await Reminder.findOne({
      where: { ownerId: owner.user.id, relatedDocumentId: visa.id },
      order: [['daysBefore', 'DESC']],
    });
    await Notification.bulkCreate([
      {
        ownerId: owner.user.id,
        relatedReminderId: passportReminder.id,
        sentStatus: 'sent',
        sentDate: new Date(),
        channel: 'email',
        recipientEmail: owner.user.email,
        subject: 'SENSITIVE-PASSPORT-999 delivery subject',
        documentType: 'passport',
        documentId: passport.id,
        documentLabel: 'Passport SENSITIVE-PASSPORT-999',
        thresholdDays: passportReminder.daysBefore,
        expiryDate: passport.expiryDate,
        providerMessageId: 'admin-sent-test',
      },
      {
        ownerId: owner.user.id,
        relatedReminderId: visaReminder.id,
        sentStatus: 'failed',
        sentDate: new Date(),
        channel: 'email',
        recipientEmail: owner.user.email,
        subject: 'SENSITIVE-VISA-888 delivery subject',
        documentType: 'visa',
        documentId: visa.id,
        documentLabel: 'Visa SENSITIVE-VISA-888',
        thresholdDays: visaReminder.daysBefore,
        expiryDate: visa.validUntil,
        failureReason: 'SMTP connection refused',
      },
    ]);
  });

  after(async () => {
    await sequelize.close();
  });

  it('rejects unauthenticated and user-role access to every admin endpoint', async () => {
    const unauthenticated = await Promise.all([
      request(app).get('/api/admin/users'),
      request(app).get('/api/admin/statistics'),
      request(app).patch(`/api/admin/users/${other.user.id}/status`).send({ status: 'disabled' }),
    ]);
    assert.deepEqual(unauthenticated.map((response) => response.status), [401, 401, 401]);

    const nonAdmin = await Promise.all([
      request(app).get('/api/admin/users').set('Cookie', owner.cookie),
      request(app).get('/api/admin/statistics').set('Cookie', owner.cookie),
      request(app)
        .patch(`/api/admin/users/${other.user.id}/status`)
        .set('Cookie', owner.cookie)
        .send({ status: 'disabled' }),
    ]);
    assert.deepEqual(nonAdmin.map((response) => response.status), [403, 403, 403]);
    assert.equal((await User.findByPk(other.user.id)).status, 'active');
  });

  it('lists only safe account metadata with accurate basic activity', async () => {
    const response = await request(app).get('/api/admin/users').set('Cookie', admin.cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.users.length, 3);
    const ownerRow = response.body.users.find((user) => user.id === owner.user.id);
    assert.equal(ownerRow.email, owner.user.email);
    assert.equal(ownerRow.activity.documents, 2);
    assert.equal(ownerRow.activity.trips, 1);
    assert.equal(ownerRow.activity.notifications, 2);
    assert.ok(ownerRow.activity.lastActivityAt);
    assert.equal(response.body.users.find((user) => user.id === admin.user.id).role, 'admin');
    assert.equal(collectKeys(response.body).has('passwordHash'), false);
    assert.equal(JSON.stringify(response.body).includes(owner.password), false);
  });

  it('returns correct aggregate statistics without sensitive document or message contents', async () => {
    const response = await request(app).get('/api/admin/statistics').set('Cookie', admin.cookie);
    assert.equal(response.status, 200);
    const statistics = response.body.statistics;
    assert.deepEqual(statistics.documents.byType, {
      total: 3,
      passport: 1,
      visa: 1,
      travelDocument: 1,
    });
    assert.deepEqual(statistics.documents.byStatus, {
      valid: 1,
      expiringSoon: 1,
      expired: 1,
      noExpiry: 0,
    });
    assert.equal(
      statistics.reminders.active,
      await Reminder.count({ where: { enabled: true, archived: false, status: 'active' } }),
    );
    assert.deepEqual(statistics.notifications.counts, { total: 2, sent: 1, failed: 1, pending: 0 });
    assert.equal(statistics.notifications.recentFailures.length, 1);
    assert.equal(statistics.notifications.recentFailures[0].failureReason, 'SMTP connection refused');
    assert.equal(statistics.usage.totalUsers, 3);
    assert.equal(statistics.usage.activeUsersLast30Days, 2);
    assert.equal(statistics.usage.weeklyActivity.at(-1).documentsAdded, 3);
    assert.equal(statistics.usage.weeklyActivity.at(-1).tripsLogged, 1);
    assert.equal(statistics.compliance.isExternallyVerified, false);
    assert.match(statistics.compliance.disclaimer, /not external or government verification/i);

    const keys = collectKeys(response.body);
    for (const forbiddenKey of [
      'passportNumber',
      'visaId',
      'fileReference',
      'originalFileName',
      'recipientEmail',
      'subject',
      'documentLabel',
      'documentId',
      'relatedDocumentId',
    ]) {
      assert.equal(keys.has(forbiddenKey), false, `admin response leaked ${forbiddenKey}`);
    }
    const serialized = JSON.stringify(response.body);
    for (const secret of [
      'SENSITIVE-PASSPORT-999',
      'SENSITIVE-VISA-888',
      'unguessable-sensitive-file-reference.png',
      'private-insurance-proof.png',
    ]) {
      assert.equal(serialized.includes(secret), false, `admin response leaked ${secret}`);
    }
  });

  it('validates status changes, prevents self-disable, and enforces disabled status immediately', async () => {
    const invalid = await request(app)
      .patch(`/api/admin/users/${other.user.id}/status`)
      .set('Cookie', admin.cookie)
      .send({ status: 'deleted' });
    assert.equal(invalid.status, 422);

    const selfDisable = await request(app)
      .patch(`/api/admin/users/${admin.user.id}/status`)
      .set('Cookie', admin.cookie)
      .send({ status: 'disabled' });
    assert.equal(selfDisable.status, 422);

    const disabled = await request(app)
      .patch(`/api/admin/users/${other.user.id}/status`)
      .set('Cookie', admin.cookie)
      .send({ status: 'disabled' });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.body.user.status, 'disabled');

    const existingSession = await request(app).get('/api/test/protected').set('Cookie', other.cookie);
    assert.equal(existingSession.status, 403);
    const disabledLogin = await request(app).post('/api/auth/login').send({
      email: other.user.email,
      password: other.password,
    });
    assert.equal(disabledLogin.status, 403);

    const enabled = await request(app)
      .patch(`/api/admin/users/${other.user.id}/status`)
      .set('Cookie', admin.cookie)
      .send({ status: 'active' });
    assert.equal(enabled.status, 200);
    const enabledLogin = await request(app).post('/api/auth/login').send({
      email: other.user.email,
      password: other.password,
    });
    assert.equal(enabledLogin.status, 200);
  });
});
