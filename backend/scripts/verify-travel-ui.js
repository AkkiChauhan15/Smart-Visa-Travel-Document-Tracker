import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sequelize, TravelHistory, User, Visa } from '../src/models/index.js';
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

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const firstAccount = {
  name: 'Travel History Owner',
  email: `travel-first-${suffix}@example.test`,
  password: `Aa1-${randomBytes(18).toString('base64url')}`,
};
const secondAccount = {
  name: 'Travel History Other',
  email: `travel-second-${suffix}@example.test`,
  password: `Aa1-${randomBytes(18).toString('base64url')}`,
};

const browser = await launchBrowser(process.env.CHROME_BIN);
let firstUser;
let secondUser;

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

try {
  await sequelize.authenticate();
  await registerThroughUi(firstAccount);
  firstUser = await User.findOne({ where: { email: firstAccount.email } });
  assert.ok(firstUser);

  await navigate(browser, `${frontendUrl}/documents/new?type=visa`);
  await waitFor(browser, "Boolean(document.getElementById('visaId'))", 'visa form');
  await setFormValues(browser, {
    country: 'Japan',
    visaType: 'Visitor',
    visaId: `UI-TRIP-${suffix.slice(-7)}`,
    entryType: 'multiple',
    validFrom: '2025-01-01',
    validUntil: '2030-01-01',
  });
  await submitForm(browser);
  await waitFor(browser, "location.pathname === '/documents'", 'documents after visa creation');
  const firstVisa = await Visa.findOne({ where: { ownerId: firstUser.id } });
  assert.ok(firstVisa);

  await navigate(browser, `${frontendUrl}/travel-history/new`);
  await waitFor(browser, "document.querySelectorAll('#visaUsedId option').length === 2", 'owned visa dropdown');
  const visaOptions = await evaluate(
    browser,
    "[...document.querySelectorAll('#visaUsedId option')].map((option) => ({ value: option.value, text: option.textContent }))",
  );
  assert.equal(visaOptions[1].value, firstVisa.id);
  assert.match(visaOptions[1].text, /Japan/);
  await setFormValues(browser, {
    countryVisited: 'Japan',
    purpose: 'Cultural holiday',
    entryDate: '2026-04-10',
    exitDate: '2026-04-20',
    visaUsedId: firstVisa.id,
  });
  await submitForm(browser);
  await waitFor(
    browser,
    "location.pathname === '/travel-history' && document.body.innerText.includes('Cultural holiday')",
    'persisted trip card',
  );
  let trip = await TravelHistory.findOne({ where: { ownerId: firstUser.id } });
  assert.ok(trip);
  assert.equal(trip.visaUsedId, firstVisa.id);
  console.log('PASS UI logged a trip tied to the owner’s real visa and persisted it in PostgreSQL');

  await navigate(browser, `${frontendUrl}/travel-history/${trip.id}/edit`);
  await waitFor(browser, "document.getElementById('purpose')?.value === 'Cultural holiday'", 'trip edit form');
  await setFormValues(browser, { purpose: 'Business and culture', exitDate: '2026-04-22' });
  await submitForm(browser);
  await waitFor(
    browser,
    "location.pathname === '/travel-history' && document.body.innerText.includes('Business and culture')",
    'edited trip card',
  );
  trip = await TravelHistory.findByPk(trip.id);
  assert.equal(trip.purpose, 'Business and culture');
  assert.equal(trip.exitDate, '2026-04-22');
  console.log('PASS UI trip edit persisted and displayed from the API');

  const invalidDateStatus = await evaluate(
    browser,
    `fetch(${JSON.stringify(`${apiUrl}/travel-history`)}, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryVisited: 'Japan', entryDate: '2026-05-10', exitDate: '2026-05-09', purpose: 'Invalid dates', visaUsedId: ${JSON.stringify(firstVisa.id)} })
    }).then((response) => response.status)`,
  );
  assert.equal(invalidDateStatus, 422);
  console.log('PASS running backend rejected an exit date before the entry date');

  await signOut();
  await registerThroughUi(secondAccount);
  secondUser = await User.findOne({ where: { email: secondAccount.email } });
  assert.ok(secondUser);
  const secondVisaResult = await evaluate(
    browser,
    `fetch(${JSON.stringify(`${apiUrl}/visas`)}, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: 'France', visaType: 'Visitor', validFrom: '2025-01-01', validUntil: '2030-01-01', entryType: 'multiple', visaId: ${JSON.stringify(`UI-OTHER-${suffix.slice(-7)}`)} })
    }).then(async (response) => ({ status: response.status, body: await response.json() }))`,
  );
  assert.equal(secondVisaResult.status, 201);

  await navigate(browser, `${frontendUrl}/travel-history`);
  await waitFor(browser, "document.body.innerText.includes('No trips logged yet')", 'empty second-user trip list');
  const isolationStatuses = await evaluate(
    browser,
    `Promise.all([
      fetch(${JSON.stringify(`${apiUrl}/travel-history/${trip.id}`)}, { credentials: 'include' }),
      fetch(${JSON.stringify(`${apiUrl}/travel-history/${trip.id}`)}, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose: 'Unauthorized', visaUsedId: ${JSON.stringify(secondVisaResult.body.visa.id)} }) }),
      fetch(${JSON.stringify(`${apiUrl}/travel-history/${trip.id}`)}, { method: 'DELETE', credentials: 'include' }),
      fetch(${JSON.stringify(`${apiUrl}/travel-history`)}, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ countryVisited: 'Japan', entryDate: '2026-04-10', exitDate: '2026-04-20', purpose: 'Forced foreign visa', visaUsedId: ${JSON.stringify(firstVisa.id)} }) })
    ]).then((responses) => responses.map((response) => response.status))`,
  );
  assert.deepEqual(isolationStatuses, [404, 404, 404, 422]);
  assert.notEqual((await TravelHistory.findByPk(trip.id)).purpose, 'Unauthorized');
  console.log('PASS second user cannot list or mutate the first user’s trips or force-reference their visa');

  await navigate(browser, `${frontendUrl}/destinations`);
  await waitFor(browser, "Boolean(document.querySelector('.reference-warning'))", 'destination disclaimer');
  await evaluate(browser, 'window.scrollTo(0, 0); true');
  const checklistState = await evaluate(
    browser,
    `(() => {
      const warning = document.querySelector('.reference-warning');
      const rect = warning.getBoundingClientRect();
      return {
        visible: rect.top >= 0 && rect.top < innerHeight && rect.width > 0 && rect.height > 0,
        rect: { top: rect.top, width: rect.width, height: rect.height, viewportHeight: innerHeight },
        text: warning.innerText,
        destinations: document.querySelectorAll('#destination option').length,
        items: document.querySelectorAll('.checklist-items li').length,
        widgetNotice: document.querySelector('.third-party-warning')?.innerText ?? '',
        widgetFrame: (() => {
          const frame = document.querySelector('.visahq-widget-frame');
          return frame ? { src: frame.getAttribute('src'), sandbox: frame.getAttribute('sandbox') } : null;
        })(),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    })()`,
  );
  assert.equal(checklistState.visible, true, JSON.stringify(checklistState.rect));
  assert.match(checklistState.text, /Not live-verified reference data/i);
  assert.match(checklistState.text, /official government and immigration sources/i);
  assert.ok(checklistState.destinations >= 5);
  assert.ok(checklistState.items >= 4);
  assert.match(checklistState.widgetNotice, /not a government authority/i);
  assert.match(checklistState.widgetNotice, /does not submit or verify visa applications/i);
  assert.deepEqual(checklistState.widgetFrame, {
    src: '/visa-requirements-widget.html',
    sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox',
  });
  assert.equal(checklistState.overflow, false);

  await browser.client.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height: 900, deviceScaleFactor: 1, mobile: true },
    browser.sessionId,
  );
  const mobileOverflow = await evaluate(
    browser,
    'document.documentElement.scrollWidth > document.documentElement.clientWidth',
  );
  assert.equal(mobileOverflow, false);
  console.log('PASS checklist page visibly surfaces the non-live official-source warning and is responsive');

  await browser.client.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
    browser.sessionId,
  );
  await signOut();
  await login(firstAccount);
  await navigate(browser, `${frontendUrl}/travel-history`);
  await waitFor(browser, "document.querySelectorAll('.trip-card').length === 1", 'owner trip list');
  await evaluate(browser, "document.querySelector('.trip-actions button').click()");
  await waitFor(browser, "document.querySelector('.confirm-dialog')?.open === true", 'trip delete confirmation');
  await evaluate(browser, "document.querySelector('.confirm-dialog .danger-button').click()");
  await waitFor(browser, "document.body.innerText.includes('No trips logged yet')", 'trip deletion');
  assert.equal(await TravelHistory.count({ where: { id: trip.id } }), 0);
  console.log('PASS UI confirmation deleted the trip from PostgreSQL');
} finally {
  await firstUser?.destroy().catch(() => {});
  await secondUser?.destroy().catch(() => {});
  await browser.close();
  await sequelize.close().catch(() => {});
}
