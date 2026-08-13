import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Passport, sequelize, TravelHistory, User, Visa } from '../src/models/index.js';
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

const today = new Date();
today.setUTCHours(12, 0, 0, 0);
function dateFromNow(days) {
  const date = new Date(today);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const ownerAccount = {
  name: 'Dashboard Owner',
  email: `dashboard-owner-${suffix}@example.test`,
  password: `Aa1-${randomBytes(18).toString('base64url')}`,
};
const emptyAccount = {
  name: 'Empty Dashboard User',
  email: `dashboard-empty-${suffix}@example.test`,
  password: `Aa1-${randomBytes(18).toString('base64url')}`,
};
const browser = await launchBrowser(process.env.CHROME_BIN);
let ownerUser;
let emptyUser;

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
  await waitFor(browser, "location.pathname === '/dashboard'", `dashboard login for ${account.name}`);
}

async function browserApi(path, { method = 'GET', body } = {}) {
  return evaluate(
    browser,
    `fetch(${JSON.stringify(`${apiUrl}${path}`)}, {
      method: ${JSON.stringify(method)},
      credentials: 'include',
      ${body === undefined ? '' : `headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(${JSON.stringify(body)}),`}
    }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => ({})) }))`,
  );
}

async function createVisa({ visaId, country, expiresIn }) {
  const response = await browserApi('/visas', {
    method: 'POST',
    body: {
      country,
      visaType: 'Visitor',
      validFrom: dateFromNow(-365),
      validUntil: dateFromNow(expiresIn),
      entryType: 'multiple',
      visaId,
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.visa;
}

async function createTrip(visaId, countryVisited, entryOffset) {
  const response = await browserApi('/travel-history', {
    method: 'POST',
    body: {
      countryVisited,
      entryDate: dateFromNow(entryOffset),
      exitDate: dateFromNow(entryOffset + 5),
      purpose: 'Dashboard verification trip',
      visaUsedId: visaId,
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.trip;
}

async function readMetrics() {
  return evaluate(
    browser,
    `Object.fromEntries([...document.querySelectorAll('[data-metric]')].map((element) => [element.dataset.metric, Number(element.textContent)]))`,
  );
}

try {
  await sequelize.authenticate();
  await registerThroughUi(ownerAccount);
  ownerUser = await User.findOne({ where: { email: ownerAccount.email } });
  assert.ok(ownerUser);

  const passportResponse = await browserApi('/passports', {
    method: 'POST',
    body: {
      passportNumber: `UI-DASH-P-${suffix.slice(-6)}`,
      countryOfIssue: 'India',
      issueDate: dateFromNow(-365),
      expiryDate: dateFromNow(180),
    },
  });
  assert.equal(passportResponse.status, 201, JSON.stringify(passportResponse.body));
  const soonVisa = await createVisa({
    visaId: `UI-DASH-S-${suffix.slice(-6)}`,
    country: 'Japan',
    expiresIn: 20,
  });
  await createVisa({
    visaId: `UI-DASH-X-${suffix.slice(-6)}`,
    country: 'France',
    expiresIn: -2,
  });
  const firstTrip = await createTrip(soonVisa.id, 'Japan', -30);

  assert.equal(await Passport.count({ where: { ownerId: ownerUser.id } }), 1);
  assert.equal(await Visa.count({ where: { ownerId: ownerUser.id } }), 2);
  assert.equal(await TravelHistory.count({ where: { ownerId: ownerUser.id } }), 1);

  await navigate(browser, `${frontendUrl}/dashboard`);
  await waitFor(browser, "document.querySelector('[data-metric=total]')?.textContent === '3'", 'mixed dashboard metrics');
  const metrics = await readMetrics();
  assert.deepEqual(metrics, { total: 3, valid: 1, expiringSoon: 1, expired: 1 });

  const apiSnapshot = await evaluate(
    browser,
    `Promise.all([
      fetch(${JSON.stringify(`${apiUrl}/dashboard`)}, { credentials: 'include' }).then((response) => response.json()),
      fetch(${JSON.stringify(`${apiUrl}/passports`)}, { credentials: 'include' }).then((response) => response.json()),
      fetch(${JSON.stringify(`${apiUrl}/visas`)}, { credentials: 'include' }).then((response) => response.json()),
      fetch(${JSON.stringify(`${apiUrl}/travel-documents`)}, { credentials: 'include' }).then((response) => response.json())
    ])`,
  );
  const apiDocuments = [
    ...apiSnapshot[1].passports,
    ...apiSnapshot[2].visas,
    ...apiSnapshot[3].travelDocuments,
  ];
  assert.equal(apiSnapshot[0].dashboard.counts.total, apiDocuments.length);
  assert.equal(apiSnapshot[0].dashboard.counts.valid, apiDocuments.filter((item) => item.status === 'valid').length);
  assert.equal(
    apiSnapshot[0].dashboard.counts.expiringSoon,
    apiDocuments.filter((item) => item.status === 'expiring-soon').length,
  );
  assert.equal(apiSnapshot[0].dashboard.counts.expired, apiDocuments.filter((item) => item.status === 'expired').length);

  const dashboardState = await evaluate(
    browser,
    `({
      complianceCode: document.querySelector('[data-compliance-status]')?.dataset.complianceStatus,
      complianceText: document.querySelector('[data-compliance-status]')?.innerText,
      reminderRows: document.querySelectorAll('[data-dashboard-list=reminders] .dashboard-list-row').length,
      reminderText: document.querySelector('[data-dashboard-list=reminders]')?.innerText,
      tripRows: document.querySelectorAll('[data-dashboard-list=trips] .dashboard-list-row').length,
      tripText: document.querySelector('[data-dashboard-list=trips]')?.innerText,
    })`,
  );
  assert.equal(dashboardState.complianceCode, 'action-needed');
  assert.match(dashboardState.complianceText, /not external or government verification/i);
  assert.ok(dashboardState.reminderRows > 0 && dashboardState.reminderRows <= 5);
  assert.match(dashboardState.reminderText, /days before/i);
  assert.match(dashboardState.reminderText, /remaining/i);
  assert.equal(dashboardState.tripRows, 1);
  assert.match(dashboardState.tripText, /Japan/);
  assert.equal(firstTrip.countryVisited, 'Japan');
  console.log('PASS dashboard UI matches the server-calculated valid, expiring, and expired document statuses');

  for (const width of [1280, 390]) {
    await browser.client.send(
      'Emulation.setDeviceMetricsOverride',
      { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 },
      browser.sessionId,
    );
    const hasHorizontalOverflow = await evaluate(
      browser,
      'document.documentElement.scrollWidth > document.documentElement.clientWidth',
    );
    assert.equal(hasHorizontalOverflow, false, `dashboard overflowed at ${width}px`);
  }
  await browser.client.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
    browser.sessionId,
  );
  console.log('PASS dashboard has no horizontal overflow at desktop and mobile widths');

  const addedVisa = await createVisa({
    visaId: `UI-DASH-R-${suffix.slice(-6)}`,
    country: 'Australia',
    expiresIn: 240,
  });
  const addedTrip = await createTrip(addedVisa.id, 'Australia', -1);
  await navigate(browser, `${frontendUrl}/dashboard?fresh=${Date.now()}`);
  await waitFor(browser, "document.querySelector('[data-metric=total]')?.textContent === '4'", 'refreshed total');
  await waitFor(browser, "document.querySelector('[data-dashboard-list=trips]')?.innerText.includes('Australia')", 'refreshed trip list');
  assert.equal((await readMetrics()).valid, 2);
  assert.equal((await TravelHistory.findByPk(addedTrip.id)).countryVisited, 'Australia');
  console.log('PASS a full refresh reads newly persisted documents and trips with no stale dashboard counts');

  await navigate(browser, `${frontendUrl}/documents/visa/${addedVisa.id}/edit`);
  await waitFor(browser, `document.getElementById('validUntil')?.value === ${JSON.stringify(addedVisa.validUntil)}`, 'dashboard visa edit form');
  await setFormValues(browser, { validUntil: dateFromNow(-1) });
  await submitForm(browser);
  await waitFor(browser, "location.pathname === '/documents'", 'edited visa document list');
  await navigate(browser, `${frontendUrl}/dashboard?edited=${Date.now()}`);
  await waitFor(browser, "document.querySelector('[data-metric=expired]')?.textContent === '2'", 'edited status count');
  assert.deepEqual(await readMetrics(), { total: 4, valid: 1, expiringSoon: 1, expired: 2 });

  await navigate(browser, `${frontendUrl}/documents`);
  await waitFor(browser, "document.querySelectorAll('.document-card').length === 4", 'documents before dashboard deletion');
  await evaluate(
    browser,
    `[...document.querySelectorAll('.document-card')]
      .find((card) => card.innerText.includes('Australia'))
      .querySelector('.delete-action').click()`,
  );
  await waitFor(browser, "document.querySelector('.confirm-dialog')?.open === true", 'visa delete confirmation');
  await evaluate(browser, "document.querySelector('.confirm-dialog .danger-button').click()");
  await waitFor(browser, "document.querySelectorAll('.document-card').length === 3", 'visa deletion');
  assert.equal(await Visa.count({ where: { id: addedVisa.id } }), 0);

  await navigate(browser, `${frontendUrl}/travel-history`);
  await waitFor(browser, "document.querySelector('.trip-card')?.innerText.includes('Australia')", 'trip before dashboard deletion');
  await evaluate(
    browser,
    `[...document.querySelectorAll('.trip-card')]
      .find((card) => card.innerText.includes('Australia'))
      .querySelector('button').click()`,
  );
  await waitFor(browser, "document.querySelector('.confirm-dialog')?.open === true", 'trip delete confirmation');
  await evaluate(browser, "document.querySelector('.confirm-dialog .danger-button').click()");
  await waitFor(browser, "!document.body.innerText.includes('Australia')", 'trip deletion');
  assert.equal(await TravelHistory.count({ where: { id: addedTrip.id } }), 0);

  await navigate(browser, `${frontendUrl}/dashboard?deleted=${Date.now()}`);
  await waitFor(browser, "document.querySelector('[data-metric=total]')?.textContent === '3'", 'dashboard after deletions');
  assert.deepEqual(await readMetrics(), { total: 3, valid: 1, expiringSoon: 1, expired: 1 });
  assert.equal(
    await evaluate(browser, "document.querySelector('[data-dashboard-list=trips]')?.innerText.includes('Australia') ?? false"),
    false,
  );
  console.log('PASS dashboard counts and recent trips refresh after UI edit and confirmation-deletes');

  await signOut();
  await registerThroughUi(emptyAccount);
  emptyUser = await User.findOne({ where: { email: emptyAccount.email } });
  assert.ok(emptyUser);
  await waitFor(browser, "document.querySelector('[data-metric=total]')?.textContent === '0'", 'empty dashboard');
  assert.deepEqual(await readMetrics(), { total: 0, valid: 0, expiringSoon: 0, expired: 0 });
  const emptyState = await evaluate(
    browser,
    `({
      text: document.querySelector('main')?.innerText,
      code: document.querySelector('[data-compliance-status]')?.dataset.complianceStatus,
      hasUndefined: /NaN|undefined/.test(document.querySelector('main')?.innerText ?? ''),
    })`,
  );
  assert.equal(emptyState.code, 'no-data');
  assert.match(emptyState.text, /No documents to assess/);
  assert.match(emptyState.text, /No upcoming reminders/);
  assert.match(emptyState.text, /No trips logged yet/);
  assert.doesNotMatch(emptyState.text, /Japan|Australia/);
  assert.equal(emptyState.hasUndefined, false);
  console.log('PASS a second user gets a complete zero-data state and sees none of the owner’s data');

  await signOut();
  await login(ownerAccount);
  await waitFor(browser, "document.querySelector('[data-metric=total]')?.textContent === '3'", 'owner dashboard after login');
  assert.equal(await evaluate(browser, 'location.pathname'), '/dashboard');
  console.log('PASS login lands on the real dashboard by default');
} finally {
  await ownerUser?.destroy().catch(() => {});
  await emptyUser?.destroy().catch(() => {});
  await browser.close();
  await sequelize.close().catch(() => {});
}
