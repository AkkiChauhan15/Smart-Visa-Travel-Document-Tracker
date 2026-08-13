import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

process.env.CRON_SECRET = 'reminder-integration-cron-secret-with-32-characters';

const { createApp } = await import('../src/app.js');
const { getConfig } = await import('../src/config/env.js');
const { runReminderJob } = await import('../src/jobs/reminder-job.js');
const { Notification, Reminder, sequelize } = await import('../src/models/index.js');
const { calculateExpiryStatus } = await import('../src/utils/expiry-status.js');
const { startSmtpCaptureServer } = await import('../scripts/smtp-capture-server.js');

const config = getConfig();
if (config.nodeEnv !== 'test' || !new URL(config.databaseUrl).pathname.toLowerCase().includes('test')) {
  throw new Error('Refusing destructive integration tests outside a dedicated test database');
}

const app = createApp();
const currentTime = new Date();
const NOW = new Date(Date.UTC(currentTime.getUTCFullYear(), currentTime.getUTCMonth(), currentTime.getUTCDate(), 12));

function dateFromNow(days) {
  const date = new Date(NOW);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getCookie(response) {
  return response.headers['set-cookie'][0].split(';', 1)[0];
}

async function register(email) {
  const response = await request(app).post('/api/auth/register').send({
    name: email.startsWith('reminder-owner') ? 'Reminder Owner' : 'Other User',
    email,
    password: `Aa1-${randomBytes(18).toString('base64url')}`,
  });
  assert.equal(response.status, 201);
  return { cookie: getCookie(response), user: response.body.user };
}

async function waitFor(check, label, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

describe('expiry status, reminder preferences, and notification job', () => {
  let owner;
  let otherUser;
  let soonPassport;
  let failurePassport;

  before(async () => {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
    owner = await register('reminder-owner@example.test');
    otherUser = await register('reminder-other@example.test');
  });

  after(async () => {
    await sequelize.close();
  });

  it('uses one shared UTC date calculation for every status', () => {
    assert.equal(calculateExpiryStatus(dateFromNow(91), [90, 60, 30], NOW).status, 'valid');
    assert.equal(calculateExpiryStatus(dateFromNow(30), [90, 60, 30], NOW).status, 'expiring-soon');
    assert.equal(calculateExpiryStatus(dateFromNow(-1), [90, 60, 30], NOW).status, 'expired');
    assert.equal(calculateExpiryStatus(null, [90, 60, 30], NOW).status, 'no-expiry');
  });

  it('exposes expiring-soon and expired status from document APIs', async () => {
    const soon = await request(app)
      .post('/api/passports')
      .set('Cookie', owner.cookie)
      .send({
        passportNumber: 'REM-SOON-01',
        countryOfIssue: 'India',
        issueDate: '2020-01-01',
        expiryDate: dateFromNow(20),
      });
    assert.equal(soon.status, 201);
    assert.equal(soon.body.passport.status, 'expiring-soon');
    soonPassport = soon.body.passport;

    const expired = await request(app)
      .post('/api/visas')
      .set('Cookie', owner.cookie)
      .send({
        country: 'Japan',
        visaType: 'Visitor',
        validFrom: '2025-01-01',
        validUntil: dateFromNow(-1),
        entryType: 'single',
        visaId: 'REM-EXPIRED-01',
      });
    assert.equal(expired.status, 201);
    assert.equal(expired.body.visa.status, 'expired');

    const list = await request(app).get('/api/passports').set('Cookie', owner.cookie);
    assert.equal(list.body.passports[0].status, 'expiring-soon');
  });

  it('creates defaults and persists a customized reminder window', async () => {
    const defaults = await request(app)
      .get(`/api/reminders/passport/${soonPassport.id}`)
      .set('Cookie', owner.cookie);
    assert.equal(defaults.status, 200);
    assert.deepEqual(defaults.body.reminderSetting.reminders.map((item) => item.daysBefore), [90, 60, 30]);

    const updated = await request(app)
      .put(`/api/reminders/passport/${soonPassport.id}`)
      .set('Cookie', owner.cookie)
      .send({ reminders: [{ daysBefore: 25, enabled: true }, { daysBefore: 5, enabled: false }] });
    assert.equal(updated.status, 200);
    assert.deepEqual(
      updated.body.reminderSetting.reminders.map(({ daysBefore, enabled }) => ({ daysBefore, enabled })),
      [{ daysBefore: 25, enabled: true }, { daysBefore: 5, enabled: false }],
    );
    assert.equal(updated.body.reminderSetting.reminderWindowDays, 25);

    const record = await request(app).get(`/api/passports/${soonPassport.id}`).set('Cookie', owner.cookie);
    assert.equal(record.body.passport.reminderWindowDays, 25);
    assert.equal(record.body.passport.status, 'expiring-soon');
  });

  it('accepts the external trigger, sends once, and deduplicates a second call', async () => {
    const smtp = await startSmtpCaptureServer();
    process.env.EMAIL_PROVIDER = 'smtp';
    process.env.EMAIL_FROM = 'reminders@example.test';
    process.env.SMTP_HOST = smtp.host;
    process.env.SMTP_PORT = String(smtp.port);
    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_USER = '';
    process.env.SMTP_PASSWORD = '';

    try {
      const first = await request(app)
        .get('/api/cron/run-reminders')
        .set('x-cron-secret', process.env.CRON_SECRET);
      assert.equal(first.status, 202);
      assert.equal(first.body.status, 'accepted');
      assert.equal(first.body.started, true);

      await waitFor(() => smtp.messages.length === 1, 'first SMTP delivery');
      const sent = await Notification.findOne({ where: { ownerId: owner.user.id, sentStatus: 'sent' } });
      assert.ok(sent);
      assert.equal(sent.thresholdDays, 25);
      assert.equal(sent.recipientEmail, owner.user.email);
      assert.ok(sent.sentDate);
      assert.match(smtp.messages[0], /REM-SOON-01/);

      const second = await request(app)
        .get('/api/cron/run-reminders')
        .set('x-cron-secret', process.env.CRON_SECRET);
      assert.equal(second.status, 202);
      await new Promise((resolve) => setTimeout(resolve, 100));

      assert.equal(smtp.messages.length, 1);
      assert.equal(await Notification.count({ where: { relatedReminderId: sent.relatedReminderId } }), 1);
    } finally {
      await smtp.close();
    }
  });

  it('logs SMTP failure without throwing or stopping the job', async () => {
    const created = await request(app)
      .post('/api/passports')
      .set('Cookie', owner.cookie)
      .send({
        passportNumber: 'REM-FAIL-02',
        countryOfIssue: 'India',
        issueDate: '2020-01-01',
        expiryDate: dateFromNow(10),
      });
    failurePassport = created.body.passport;
    await request(app)
      .put(`/api/reminders/passport/${failurePassport.id}`)
      .set('Cookie', owner.cookie)
      .send({ reminders: [{ daysBefore: 15, enabled: true }] });

    const errors = [];
    const summary = await runReminderJob({
      now: NOW,
      emailService: { async sendExpiryReminder() { throw new Error('Simulated SMTP refusal'); } },
      logger: { log() {}, error(message) { errors.push(message); } },
    });
    assert.equal(summary.failed, 1);
    assert.equal(errors.length, 1);

    const failed = await Notification.findOne({
      where: { ownerId: owner.user.id, documentId: failurePassport.id },
    });
    assert.equal(failed.sentStatus, 'failed');
    assert.match(failed.failureReason, /Simulated SMTP refusal/);
    assert.ok(failed.sentDate);
  });

  it('ownership-scopes reminder settings and notification history', async () => {
    const hiddenSetting = await request(app)
      .get(`/api/reminders/passport/${soonPassport.id}`)
      .set('Cookie', otherUser.cookie);
    assert.equal(hiddenSetting.status, 404);

    const hiddenUpdate = await request(app)
      .put(`/api/reminders/passport/${soonPassport.id}`)
      .set('Cookie', otherUser.cookie)
      .send({ reminders: [{ daysBefore: 1, enabled: true }] });
    assert.equal(hiddenUpdate.status, 404);

    const otherHistory = await request(app).get('/api/notifications').set('Cookie', otherUser.cookie);
    assert.deepEqual(otherHistory.body.notifications, []);

    const ownerHistory = await request(app).get('/api/notifications').set('Cookie', owner.cookie);
    assert.equal(ownerHistory.body.notifications.length, 2);
    assert.deepEqual(new Set(ownerHistory.body.notifications.map((item) => item.sentStatus)), new Set(['sent', 'failed']));
    assert.equal(await Reminder.count({ where: { ownerId: otherUser.user.id } }), 0);
  });
});
