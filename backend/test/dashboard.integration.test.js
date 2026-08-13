import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

const { createApp } = await import('../src/app.js');
const { getConfig } = await import('../src/config/env.js');
const { Notification, Reminder, sequelize } = await import('../src/models/index.js');

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
  const response = await request(app).post('/api/auth/register').send({
    name,
    email,
    password: `Aa1-${randomBytes(18).toString('base64url')}`,
  });
  assert.equal(response.status, 201);
  return { cookie: cookieFrom(response), user: response.body.user };
}

async function createVisa(cookie, { visaId, country, expiresIn }) {
  const response = await request(app).post('/api/visas').set('Cookie', cookie).send({
    country,
    visaType: 'Visitor',
    validFrom: dateFromNow(-365),
    validUntil: dateFromNow(expiresIn),
    entryType: 'multiple',
    visaId,
  });
  assert.equal(response.status, 201);
  return response.body.visa;
}

async function createTrip(cookie, visa, countryVisited, entryOffset) {
  const response = await request(app).post('/api/travel-history').set('Cookie', cookie).send({
    countryVisited,
    entryDate: dateFromNow(entryOffset),
    exitDate: dateFromNow(entryOffset + 5),
    purpose: 'Tourism',
    visaUsedId: visa.id,
  });
  assert.equal(response.status, 201);
  return response.body.trip;
}

describe('authenticated user dashboard aggregation', () => {
  let owner;
  let other;
  let emptyUser;
  let soonVisa;
  let otherVisa;

  before(async () => {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
    owner = await register('dashboard-owner@example.test', 'Dashboard Owner');
    other = await register('dashboard-other@example.test', 'Dashboard Other');
    emptyUser = await register('dashboard-empty@example.test', 'Dashboard Empty');

    const validPassport = await request(app).post('/api/passports').set('Cookie', owner.cookie).send({
      passportNumber: 'DASH-VALID-01',
      countryOfIssue: 'India',
      issueDate: dateFromNow(-365),
      expiryDate: dateFromNow(180),
    });
    assert.equal(validPassport.status, 201);
    soonVisa = await createVisa(owner.cookie, {
      visaId: 'DASH-SOON-02',
      country: 'Japan',
      expiresIn: 20,
    });
    await createVisa(owner.cookie, {
      visaId: 'DASH-EXPIRED-03',
      country: 'France',
      expiresIn: -2,
    });
    await createTrip(owner.cookie, soonVisa, 'Japan', -30);

    otherVisa = await createVisa(other.cookie, {
      visaId: 'DASH-OTHER-04',
      country: 'Canada',
      expiresIn: 200,
    });
    await createTrip(other.cookie, otherVisa, 'Canada', -10);
  });

  after(async () => {
    await sequelize.close();
  });

  it('protects the endpoint and returns no cross-user aggregation', async () => {
    const unauthenticated = await request(app).get('/api/dashboard');
    assert.equal(unauthenticated.status, 401);

    const response = await request(app).get('/api/dashboard').set('Cookie', owner.cookie);
    assert.equal(response.status, 200);
    assert.equal(response.body.dashboard.counts.total, 3);
    assert.equal(response.body.dashboard.recentTrips.length, 1);
    assert.equal(response.body.dashboard.recentTrips[0].countryVisited, 'Japan');
    assert.ok(
      response.body.dashboard.upcomingReminders.every(
        (reminder) => reminder.documentId !== otherVisa.id && !reminder.documentLabel.includes('Canada'),
      ),
    );
  });

  it('matches mixed status counts from the existing document APIs', async () => {
    const [dashboardResponse, passportResponse, visaResponse, travelDocumentResponse] = await Promise.all([
      request(app).get('/api/dashboard').set('Cookie', owner.cookie),
      request(app).get('/api/passports').set('Cookie', owner.cookie),
      request(app).get('/api/visas').set('Cookie', owner.cookie),
      request(app).get('/api/travel-documents').set('Cookie', owner.cookie),
    ]);
    const documents = [
      ...passportResponse.body.passports,
      ...visaResponse.body.visas,
      ...travelDocumentResponse.body.travelDocuments,
    ];
    const manual = {
      total: documents.length,
      valid: documents.filter((document) => document.status === 'valid').length,
      expiringSoon: documents.filter((document) => document.status === 'expiring-soon').length,
      expired: documents.filter((document) => document.status === 'expired').length,
      noExpiry: documents.filter((document) => document.status === 'no-expiry').length,
    };

    assert.deepEqual(dashboardResponse.body.dashboard.counts, manual);
    assert.deepEqual(manual, { total: 3, valid: 1, expiringSoon: 1, expired: 1, noExpiry: 0 });
    assert.equal(dashboardResponse.body.dashboard.complianceStatus.code, 'action-needed');
    assert.equal(dashboardResponse.body.dashboard.complianceStatus.isExternallyVerified, false);
    assert.match(dashboardResponse.body.dashboard.complianceStatus.disclaimer, /not external/i);
  });

  it('returns reminder details and only the five most recent trips', async () => {
    const response = await request(app).get('/api/dashboard').set('Cookie', owner.cookie);
    assert.equal(response.status, 200);
    assert.ok(response.body.dashboard.upcomingReminders.length > 0);
    assert.ok(response.body.dashboard.upcomingReminders.length <= 5);
    for (const reminder of response.body.dashboard.upcomingReminders) {
      assert.equal(typeof reminder.thresholdDays, 'number');
      assert.equal(typeof reminder.daysUntilExpiry, 'number');
      assert.match(reminder.reminderDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(['not-sent', 'failed', 'pending'].includes(reminder.deliveryStatus));
    }

    for (let index = 0; index < 6; index += 1) {
      await createTrip(owner.cookie, soonVisa, `Recent country ${index}`, -20 + index);
    }
    const refreshed = await request(app).get('/api/dashboard').set('Cookie', owner.cookie);
    assert.equal(refreshed.body.dashboard.recentTrips.length, 5);
    assert.deepEqual(
      refreshed.body.dashboard.recentTrips.map((trip) => trip.countryVisited),
      ['Recent country 5', 'Recent country 4', 'Recent country 3', 'Recent country 2', 'Recent country 1'],
    );
  });

  it('uses notification history to exclude an already delivered reminder occurrence', async () => {
    const beforeResponse = await request(app).get('/api/dashboard').set('Cookie', owner.cookie);
    const deliveredReminder = beforeResponse.body.dashboard.upcomingReminders[0];
    const reminder = await Reminder.findByPk(deliveredReminder.id);
    assert.ok(reminder);
    await Notification.create({
      ownerId: owner.user.id,
      relatedReminderId: reminder.id,
      sentStatus: 'sent',
      sentDate: new Date(),
      channel: 'email',
      recipientEmail: owner.user.email,
      subject: 'Dashboard delivered reminder test',
      documentType: reminder.relatedDocumentType,
      documentId: deliveredReminder.documentId,
      documentLabel: deliveredReminder.documentLabel,
      thresholdDays: deliveredReminder.thresholdDays,
      expiryDate: deliveredReminder.expiryDate,
      providerMessageId: 'dashboard-test-message',
    });

    const afterResponse = await request(app).get('/api/dashboard').set('Cookie', owner.cookie);
    assert.ok(
      afterResponse.body.dashboard.upcomingReminders.every((item) => item.id !== deliveredReminder.id),
    );
  });

  it('reflects newly persisted documents and trips without stale counts', async () => {
    const beforeResponse = await request(app).get('/api/dashboard').set('Cookie', owner.cookie);
    const newVisa = await createVisa(owner.cookie, {
      visaId: 'DASH-REFRESH-05',
      country: 'Australia',
      expiresIn: 240,
    });
    const newTrip = await createTrip(owner.cookie, newVisa, 'Australia', -1);
    const afterResponse = await request(app).get('/api/dashboard').set('Cookie', owner.cookie);

    assert.equal(afterResponse.body.dashboard.counts.total, beforeResponse.body.dashboard.counts.total + 1);
    assert.equal(afterResponse.body.dashboard.counts.valid, beforeResponse.body.dashboard.counts.valid + 1);
    assert.equal(afterResponse.body.dashboard.recentTrips[0].id, newTrip.id);
  });

  it('returns stable zero values and useful empty states for an empty account', async () => {
    const response = await request(app).get('/api/dashboard').set('Cookie', emptyUser.cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.dashboard.counts, {
      total: 0,
      valid: 0,
      expiringSoon: 0,
      expired: 0,
      noExpiry: 0,
    });
    assert.deepEqual(response.body.dashboard.upcomingReminders, []);
    assert.deepEqual(response.body.dashboard.recentTrips, []);
    assert.equal(response.body.dashboard.complianceStatus.code, 'no-data');
    assert.doesNotMatch(JSON.stringify(response.body), /NaN|undefined/);
  });
});
