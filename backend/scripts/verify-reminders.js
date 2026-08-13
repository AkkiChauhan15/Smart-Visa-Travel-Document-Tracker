import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { connectDatabase, sequelize } from '../src/config/database.js';
import { runReminderJob } from '../src/jobs/reminder-job.js';
import { Notification, Passport, Reminder, User } from '../src/models/index.js';
import { evaluate, launchBrowser, navigate, setFormValues, submitForm, waitFor } from './browser-harness.js';
import { startSmtpCaptureServer } from './smtp-capture-server.js';

const frontendUrl = process.env.UI_BASE_URL;
const apiUrl = process.env.API_BASE_URL;
if (!frontendUrl || !apiUrl) throw new Error('UI_BASE_URL and API_BASE_URL are required');

function dateFromToday(days) {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const account = {
  name: 'Reminder UI Verification',
  email: `reminder-ui-${suffix}@example.test`,
  password: `Aa1-${randomBytes(18).toString('base64url')}`,
};
const browser = await launchBrowser(process.env.CHROME_BIN);
let smtpServer;
let owner;

try {
  await connectDatabase();
  await navigate(browser, `${frontendUrl}/register`);
  await waitFor(browser, "Boolean(document.getElementById('name'))", 'registration form');
  await setFormValues(browser, { ...account, confirmPassword: account.password });
  await submitForm(browser);
  await waitFor(browser, "location.pathname === '/dashboard'", 'dashboard');
  owner = await User.scope('withPassword').findOne({ where: { email: account.email } });
  assert.ok(owner);
  assert.equal(await bcrypt.compare(account.password, owner.passwordHash), true);

  await navigate(browser, `${frontendUrl}/documents/new`);
  await waitFor(browser, "Boolean(document.getElementById('passportNumber'))", 'passport form');
  await setFormValues(browser, {
    passportNumber: `SOON-${suffix.slice(-8)}`,
    countryOfIssue: 'India',
    issueDate: '2020-01-01',
    expiryDate: dateFromToday(20),
  });
  await submitForm(browser);
  await waitFor(browser, "location.pathname === '/documents'", 'documents page after passport');

  await navigate(browser, `${frontendUrl}/documents/new`);
  await waitFor(browser, "Boolean(document.getElementById('kind'))", 'document category');
  await setFormValues(browser, { kind: 'visa' });
  await waitFor(browser, "Boolean(document.getElementById('visaId'))", 'visa form');
  await setFormValues(browser, {
    country: 'Japan',
    visaType: 'Visitor',
    visaId: `OLD-${suffix.slice(-8)}`,
    entryType: 'single',
    validFrom: '2020-01-01',
    validUntil: dateFromToday(-1),
  });
  await submitForm(browser);
  await waitFor(browser, "location.pathname === '/documents'", 'documents page after visa');
  await waitFor(
    browser,
    `Boolean(document.querySelector('[data-kind="passport"] .status-expiring-soon') && document.querySelector('[data-kind="visa"] .status-expired'))`,
    'server-provided status badges',
  );
  console.log('PASS UI shows Expiring soon and Expired from server-computed statuses');

  await navigate(browser, `${frontendUrl}/dashboard`);
  await waitFor(browser, "document.querySelector('[data-metric=total]')?.textContent === '2'", 'dashboard document total');
  const dashboardStatuses = await evaluate(
    browser,
    `({
      valid: Number(document.querySelector('[data-metric=valid]').textContent),
      expiringSoon: Number(document.querySelector('[data-metric=expiringSoon]').textContent),
      expired: Number(document.querySelector('[data-metric=expired]').textContent),
    })`,
  );
  assert.deepEqual(dashboardStatuses, { valid: 0, expiringSoon: 1, expired: 1 });

  const passport = await Passport.findOne({ where: { ownerId: owner.id } });
  await navigate(browser, `${frontendUrl}/reminders`);
  await waitFor(browser, "document.querySelectorAll('.threshold-row').length >= 6", 'default reminder settings');
  const consistentStatuses = await evaluate(
    browser,
    `Boolean(
      document.querySelector('[data-kind=passport] .status-expiring-soon') &&
      document.querySelector('[data-kind=visa] .status-expired')
    )`,
  );
  assert.equal(consistentStatuses, true);
  const defaultThresholds = await evaluate(
    browser,
    `[...document.querySelector('[data-kind=passport]').querySelectorAll('.threshold-row input[type=number]')]
      .map((input) => Number(input.value))`,
  );
  assert.deepEqual(defaultThresholds, [90, 60, 30]);
  console.log('PASS document list, dashboard, and reminder settings agree on status and defaults are 90/60/30');
  const passportCardSelector = `[data-kind="passport"]`;
  await evaluate(
    browser,
    `(() => {
      const card = document.querySelector(${JSON.stringify(passportCardSelector)});
      const rows = [...card.querySelectorAll('.threshold-row')];
      const numberInput = rows[0].querySelector('input[type="number"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(numberInput, '25');
      numberInput.dispatchEvent(new Event('input', { bubbles: true }));
      for (const row of rows.slice(1)) {
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (checkbox.checked) checkbox.click();
      }
      card.querySelector('.primary-button').click();
      return true;
    })()`,
  );
  await waitFor(
    browser,
    `fetch(${JSON.stringify(`${apiUrl}/reminders/passport/${passport.id}`)}, { credentials: 'include' }).then((response) => response.json()).then((data) => data.reminderSetting?.reminderWindowDays === 25)`,
    'custom 25-day reminder preference',
  );
  const activeReminder = await Reminder.findOne({
    where: { ownerId: owner.id, relatedDocumentId: passport.id, daysBefore: 25, enabled: true, archived: false },
  });
  assert.ok(activeReminder);
  assert.equal(
    await Reminder.count({ where: { ownerId: owner.id, relatedDocumentId: passport.id, enabled: true, archived: false } }),
    1,
  );
  console.log('PASS UI persisted a custom 25-day window and disabled the other defaults');

  smtpServer = await startSmtpCaptureServer();
  const emailConfig = {
    EMAIL_PROVIDER: 'smtp',
    EMAIL_FROM: 'reminders@example.test',
    SMTP_HOST: smtpServer.host,
    SMTP_PORT: String(smtpServer.port),
    SMTP_SECURE: 'false',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    SMTP_CONNECTION_TIMEOUT_MS: '2000',
  };
  const firstRun = await runReminderJob({ emailConfig });
  assert.equal(firstRun.sent, 1);
  assert.equal(smtpServer.messages.length, 1);
  assert.match(smtpServer.messages[0], new RegExp(account.email.replace('.', '\\.')));
  assert.match(smtpServer.messages[0], /25-day expiry reminder/);
  const sentNotification = await Notification.findOne({
    where: { ownerId: owner.id, documentId: passport.id, sentStatus: 'sent' },
  });
  assert.ok(sentNotification?.sentDate);
  console.log('PASS manual job delivered a real SMTP message and logged a sent Notification');

  const secondRun = await runReminderJob({ emailConfig });
  assert.equal(secondRun.sent, 0);
  assert.equal(smtpServer.messages.length, 1);
  assert.equal(await Notification.count({ where: { relatedReminderId: activeReminder.id } }), 1);
  console.log('PASS immediate second job run did not send a duplicate');

  await smtpServer.close();
  smtpServer = null;
  const failurePassport = await Passport.create({
    ownerId: owner.id,
    passportNumber: `FAIL-${suffix.slice(-8)}`,
    countryOfIssue: 'India',
    issueDate: '2020-01-01',
    expiryDate: dateFromToday(10),
  });
  await Reminder.create({
    ownerId: owner.id,
    relatedDocumentType: 'passport',
    relatedDocumentId: failurePassport.id,
    daysBefore: 15,
    enabled: true,
    archived: false,
    status: 'active',
  });
  const failureSummary = await runReminderJob({
    emailConfig: { ...emailConfig, SMTP_PORT: '1', SMTP_CONNECTION_TIMEOUT_MS: '500' },
    logger: { log() {}, error() {} },
  });
  assert.equal(failureSummary.failed, 1);
  const failedNotification = await Notification.findOne({
    where: { ownerId: owner.id, documentId: failurePassport.id },
  });
  assert.equal(failedNotification.sentStatus, 'failed');
  assert.ok(failedNotification.failureReason);
  console.log('PASS SMTP failure was logged as failed without crashing the job');

  await navigate(browser, `${frontendUrl}/notifications`);
  await waitFor(
    browser,
    "Boolean(document.querySelector('.delivery-sent') && document.querySelector('.delivery-failed'))",
    'sent and failed notification history',
  );
  const overflow = await evaluate(browser, 'document.documentElement.scrollWidth > document.documentElement.clientWidth');
  assert.equal(overflow, false);
  console.log('PASS notification history renders sent and failed delivery records from the API');
} finally {
  if (smtpServer) await smtpServer.close().catch(() => {});
  await owner?.destroy().catch(() => {});
  await browser.close();
  await sequelize.close().catch(() => {});
}
