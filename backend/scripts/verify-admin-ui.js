import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  Notification,
  Passport,
  Reminder,
  TravelDocument,
  TravelHistory,
  User,
  Visa,
  sequelize,
} from '../src/models/index.js';
import {
  evaluate,
  launchBrowser,
  navigate,
  setFormValues,
  submitForm,
  waitFor,
} from './browser-harness.js';

const frontendUrl = process.env.UI_BASE_URL;
const apiUrl = process.env.API_BASE_URL;
if (!frontendUrl || !apiUrl) throw new Error('UI_BASE_URL and API_BASE_URL are required');

const current = new Date();
current.setUTCHours(12, 0, 0, 0);
function dateFromNow(days) {
  const date = new Date(current);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const regularAccount = {
  name: 'Admin UI Regular User',
  email: `admin-ui-user-${suffix}@example.test`,
  password: `Aa1-${randomBytes(18).toString('base64url')}`,
};
const adminAccount = {
  name: 'Admin UI Administrator',
  email: `admin-ui-admin-${suffix}@example.test`,
  password: `Aa1-${randomBytes(18).toString('base64url')}`,
};
const shortSuffix = suffix.slice(-8);
const passportSecret = `PRIVATE-P-${shortSuffix}`;
const visaSecret = `PRIVATE-V-${shortSuffix}`;
const fileSecret = `private-file-${suffix}.png`;
const browser = await launchBrowser(process.env.CHROME_BIN);
let regularUser;
let adminUser;

async function registerThroughUi(account) {
  await navigate(browser, `${frontendUrl}/register`);
  await waitFor(browser, "Boolean(document.getElementById('name'))", 'registration form');
  await setFormValues(browser, { ...account, confirmPassword: account.password });
  await submitForm(browser);
  await waitFor(browser, "location.pathname === '/dashboard'", `dashboard for ${account.name}`);
}

async function signOut() {
  await evaluate(
    browser,
    "[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Sign out')).click()",
  );
  await waitFor(browser, "location.pathname === '/login'", 'logout');
}

async function login(account) {
  await waitFor(browser, "Boolean(document.getElementById('email'))", 'login form');
  await setFormValues(browser, { email: account.email, password: account.password });
  await submitForm(browser);
  await waitFor(browser, "location.pathname === '/dashboard'", `login for ${account.name}`);
}

async function browserApi(path, { method = 'GET', body } = {}) {
  return evaluate(
    browser,
    `fetch(${JSON.stringify(`${apiUrl}${path}`)}, {
      method: ${JSON.stringify(method)}, credentials: 'include',
      ${body === undefined ? '' : `headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify(body)}),`}
    }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => ({})) }))`,
  );
}

try {
  await sequelize.authenticate();
  await registerThroughUi(regularAccount);
  regularUser = await User.findOne({ where: { email: regularAccount.email } });
  assert.ok(regularUser);

  const passportResponse = await browserApi('/passports', {
    method: 'POST',
    body: {
      passportNumber: passportSecret,
      countryOfIssue: 'India',
      issueDate: dateFromNow(-365),
      expiryDate: dateFromNow(180),
    },
  });
  assert.equal(passportResponse.status, 201, JSON.stringify(passportResponse.body));
  const visaResponse = await browserApi('/visas', {
    method: 'POST',
    body: {
      country: 'Japan',
      visaType: 'Visitor',
      validFrom: dateFromNow(-365),
      validUntil: dateFromNow(20),
      entryType: 'multiple',
      visaId: visaSecret,
    },
  });
  assert.equal(visaResponse.status, 201, JSON.stringify(visaResponse.body));
  const tripResponse = await browserApi('/travel-history', {
    method: 'POST',
    body: {
      countryVisited: 'Japan',
      entryDate: dateFromNow(-30),
      exitDate: dateFromNow(-25),
      purpose: 'Admin aggregate verification',
      visaUsedId: visaResponse.body.visa.id,
    },
  });
  assert.equal(tripResponse.status, 201, JSON.stringify(tripResponse.body));
  await TravelDocument.create({
    ownerId: regularUser.id,
    documentType: 'Private insurance record',
    fileReference: fileSecret,
    originalFileName: `original-${fileSecret}`,
    fileMimeType: 'image/png',
    fileSize: 68,
    expiryDate: dateFromNow(-1),
  });
  const failedReminder = await Reminder.findOne({
    where: { ownerId: regularUser.id, relatedDocumentId: visaResponse.body.visa.id },
    order: [['daysBefore', 'DESC']],
  });
  await Notification.create({
    ownerId: regularUser.id,
    relatedReminderId: failedReminder.id,
    sentStatus: 'failed',
    sentDate: new Date(),
    channel: 'email',
    recipientEmail: regularUser.email,
    subject: `Secret visa ${visaSecret}`,
    documentType: 'visa',
    documentId: visaResponse.body.visa.id,
    documentLabel: `Visa ${visaSecret}`,
    thresholdDays: failedReminder.daysBefore,
    expiryDate: visaResponse.body.visa.validUntil,
    failureReason: 'Simulated SMTP timeout',
  });

  const hasAdminLink = await evaluate(
    browser,
    "[...document.querySelectorAll('nav a')].some((link) => link.textContent.trim() === 'Admin')",
  );
  assert.equal(hasAdminLink, false);
  await navigate(browser, `${frontendUrl}/admin`);
  await waitFor(browser, "location.pathname === '/account'", 'non-admin direct route redirect');
  const forbiddenStatuses = await evaluate(
    browser,
    `Promise.all([
      fetch(${JSON.stringify(`${apiUrl}/admin/users`)}, { credentials: 'include' }),
      fetch(${JSON.stringify(`${apiUrl}/admin/statistics`)}, { credentials: 'include' }),
      fetch(${JSON.stringify(`${apiUrl}/admin/users/${regularUser.id}/status`)}, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'disabled' }) })
    ]).then((responses) => responses.map((response) => response.status))`,
  );
  assert.deepEqual(forbiddenStatuses, [403, 403, 403]);
  console.log('PASS non-admin UI route redirects and every direct admin API call returns 403');

  await signOut();
  await registerThroughUi(adminAccount);
  adminUser = await User.findOne({ where: { email: adminAccount.email } });
  assert.ok(adminUser);
  await adminUser.update({ role: 'admin' });
  await signOut();
  await login(adminAccount);
  await waitFor(
    browser,
    "[...document.querySelectorAll('nav a')].some((link) => link.textContent.trim() === 'Admin')",
    'admin navigation link',
  );

  const expected = {
    users: await User.count(),
    documents: (await Passport.count()) + (await Visa.count()) + (await TravelDocument.count()),
    activeReminders: await Reminder.count({ where: { enabled: true, archived: false, status: 'active' } }),
    failedNotifications: await Notification.count({ where: { sentStatus: 'failed' } }),
  };
  await navigate(browser, `${frontendUrl}/admin`);
  await waitFor(browser, "Boolean(document.querySelector('[data-admin-table=users]'))", 'admin user table');
  await waitFor(
    browser,
    `document.querySelectorAll('[data-admin-table=users] tbody tr').length === ${expected.users}`,
    'complete admin user list',
  );
  const uiMetrics = await evaluate(
    browser,
    `({
      users: Number(document.querySelector('[data-admin-metric=totalUsers]').textContent),
      documents: Number(document.querySelector('[data-admin-metric=total]').textContent),
      activeReminders: Number(document.querySelector('[data-admin-metric=active]').textContent),
      failedNotifications: Number(document.querySelector('[data-admin-metric=failed]').textContent),
    })`,
  );
  assert.deepEqual(uiMetrics, expected);
  const adminPageText = await evaluate(browser, "document.querySelector('main').innerText");
  assert.match(adminPageText, /not external or government verification/i);
  assert.match(adminPageText, /Simulated SMTP timeout/);
  assert.match(adminPageText, new RegExp(regularAccount.email.replace('.', '\\.')));
  for (const secret of [passportSecret, visaSecret, fileSecret, `original-${fileSecret}`]) {
    assert.equal(adminPageText.includes(secret), false, `admin page leaked ${secret}`);
  }

  const statisticsResponse = await browserApi('/admin/statistics');
  assert.equal(statisticsResponse.status, 200);
  assert.equal(statisticsResponse.body.statistics.documents.byType.total, expected.documents);
  assert.equal(statisticsResponse.body.statistics.reminders.active, expected.activeReminders);
  const serializedStatistics = JSON.stringify(statisticsResponse.body);
  for (const secret of [passportSecret, visaSecret, fileSecret, `original-${fileSecret}`]) {
    assert.equal(serializedStatistics.includes(secret), false, `admin API leaked ${secret}`);
  }
  console.log('PASS admin sees accurate database-backed users/statistics with no raw document contents');

  for (const width of [1280, 390]) {
    await browser.client.send(
      'Emulation.setDeviceMetricsOverride',
      { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 },
      browser.sessionId,
    );
    assert.equal(
      await evaluate(browser, 'document.documentElement.scrollWidth > document.documentElement.clientWidth'),
      false,
      `admin page overflowed at ${width}px`,
    );
  }
  await browser.client.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
    browser.sessionId,
  );
  console.log('PASS admin panel is responsive at desktop and mobile widths');

  await evaluate(browser, 'window.confirm = () => true; true');
  await evaluate(
    browser,
    `document.querySelector('[data-user-id=${JSON.stringify(regularUser.id)}] .disable-account-button').click()`,
  );
  await waitFor(
    browser,
    `document.querySelector('[data-user-id=${JSON.stringify(regularUser.id)}] .account-status')?.textContent.includes('disabled')`,
    'disabled user status',
  );
  assert.equal((await User.findByPk(regularUser.id)).status, 'disabled');
  await evaluate(
    browser,
    `document.querySelector('[data-user-id=${JSON.stringify(regularUser.id)}] .enable-account-button').click()`,
  );
  await waitFor(
    browser,
    `document.querySelector('[data-user-id=${JSON.stringify(regularUser.id)}] .account-status')?.textContent.includes('active')`,
    're-enabled user status',
  );
  assert.equal((await User.findByPk(regularUser.id)).status, 'active');
  const selfActionDisabled = await evaluate(
    browser,
    `document.querySelector('[data-user-id=${JSON.stringify(adminUser.id)}] button')?.disabled`,
  );
  assert.equal(selfActionDisabled, true);
  console.log('PASS admin can disable/re-enable another account and cannot disable their own');
} finally {
  await regularUser?.destroy().catch(() => {});
  await adminUser?.destroy().catch(() => {});
  await browser.close();
  await sequelize.close().catch(() => {});
}
