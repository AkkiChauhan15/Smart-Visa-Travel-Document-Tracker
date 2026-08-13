import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  Notification,
  Passport,
  Reminder,
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

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const userAccount = {
  name: 'Responsive Verification User',
  email: `responsive-user-${suffix}@example.test`,
  password: `Aa1-${randomBytes(18).toString('base64url')}`,
};
const adminAccount = {
  name: 'Responsive Verification Admin',
  email: `responsive-admin-${suffix}@example.test`,
  password: `Aa1-${randomBytes(18).toString('base64url')}`,
};
const today = new Date();
today.setUTCHours(12, 0, 0, 0);

function dateFromNow(days) {
  const date = new Date(today);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const browser = await launchBrowser(process.env.CHROME_BIN);
const runtimeErrors = [];
const stopExceptionCapture = browser.client.on('Runtime.exceptionThrown', (message) => {
  runtimeErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
});
const stopConsoleCapture = browser.client.on('Runtime.consoleAPICalled', (message) => {
  if (message.params.type === 'error') {
    runtimeErrors.push(message.params.args.map((argument) => argument.value ?? argument.description).join(' '));
  }
});
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

async function setViewport(width) {
  await browser.client.send(
    'Emulation.setDeviceMetricsOverride',
    { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 },
    browser.sessionId,
  );
}

async function verifyLayout({ label, path, ready }, width) {
  await setViewport(width);
  await navigate(browser, `${frontendUrl}${path}`);
  await waitFor(browser, ready, `${label} at ${width}px`);
  const result = await evaluate(
    browser,
    `(() => {
      const tolerance = 1;
      const visible = (element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const interactive = [...document.querySelectorAll('a, button, input, select')].filter(visible);
      const clipped = interactive
        .filter((element) => !element.closest('.table-scroll'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -tolerance || rect.right > innerWidth + tolerance;
        })
        .map((element) => element.id || element.textContent?.trim().slice(0, 40) || element.tagName);
      const navItems = [...document.querySelectorAll('.app-header nav > *')].filter(visible);
      const overlappingNav = [];
      for (let leftIndex = 0; leftIndex < navItems.length; leftIndex += 1) {
        const left = navItems[leftIndex].getBoundingClientRect();
        for (let rightIndex = leftIndex + 1; rightIndex < navItems.length; rightIndex += 1) {
          const right = navItems[rightIndex].getBoundingClientRect();
          if (Math.min(left.right, right.right) - Math.max(left.left, right.left) > 1 &&
              Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 1) {
            overlappingNav.push(leftIndex + ':' + rightIndex);
          }
        }
      }
      return {
        path: location.pathname + location.search,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + tolerance,
        clipped,
        overlappingNav,
        missingRoot: !document.querySelector('main, .auth-shell'),
        invalidText: /NaN|undefined/.test(document.body.innerText),
      };
    })()`,
  );
  assert.equal(result.horizontalOverflow, false, `${label} overflowed at ${width}px: ${JSON.stringify(result)}`);
  assert.deepEqual(result.clipped, [], `${label} clipped controls at ${width}px`);
  assert.deepEqual(result.overlappingNav, [], `${label} overlapping navigation at ${width}px`);
  assert.equal(result.missingRoot, false, `${label} had no rendered page root at ${width}px`);
  assert.equal(result.invalidText, false, `${label} rendered NaN/undefined at ${width}px`);
}

async function verifyPages(pages) {
  for (const page of pages) {
    for (const width of [1280, 390]) await verifyLayout(page, width);
  }
}

try {
  await sequelize.authenticate();
  await verifyPages([
    { label: 'Login', path: '/login', ready: "Boolean(document.getElementById('email'))" },
    { label: 'Register', path: '/register', ready: "Boolean(document.getElementById('name'))" },
  ]);
  console.log('PASS login and registration layouts at desktop and mobile widths');

  await setViewport(1280);
  await registerThroughUi(userAccount);
  regularUser = await User.findOne({ where: { email: userAccount.email } });
  assert.ok(regularUser);
  assert.deepEqual(
    await evaluate(browser, '({ local: localStorage.length, session: sessionStorage.length })'),
    { local: 0, session: 0 },
  );

  const passportResponse = await browserApi('/passports', {
    method: 'POST',
    body: {
      passportNumber: `RESP-P-${suffix.slice(-7)}`,
      countryOfIssue: 'India',
      issueDate: dateFromNow(-365),
      expiryDate: dateFromNow(180),
    },
  });
  assert.equal(passportResponse.status, 201);
  const passport = passportResponse.body.passport;
  const visaResponse = await browserApi('/visas', {
    method: 'POST',
    body: {
      country: 'Japan',
      visaType: 'Visitor',
      validFrom: dateFromNow(-365),
      validUntil: dateFromNow(20),
      entryType: 'multiple',
      visaId: `RESP-V-${suffix.slice(-7)}`,
    },
  });
  assert.equal(visaResponse.status, 201);
  const visa = visaResponse.body.visa;
  const tripResponse = await browserApi('/travel-history', {
    method: 'POST',
    body: {
      countryVisited: 'Japan',
      entryDate: dateFromNow(-30),
      exitDate: dateFromNow(-25),
      purpose: 'Responsive verification',
      visaUsedId: visa.id,
    },
  });
  assert.equal(tripResponse.status, 201);
  const trip = tripResponse.body.trip;
  const reminder = await Reminder.findOne({
    where: { ownerId: regularUser.id, relatedDocumentId: passport.id },
    order: [['daysBefore', 'DESC']],
  });
  await Notification.create({
    ownerId: regularUser.id,
    relatedReminderId: reminder.id,
    sentStatus: 'failed',
    sentDate: new Date(),
    channel: 'email',
    recipientEmail: regularUser.email,
    subject: 'Responsive verification reminder',
    documentType: 'passport',
    documentId: passport.id,
    documentLabel: 'Responsive verification passport',
    thresholdDays: reminder.daysBefore,
    expiryDate: passport.expiryDate,
    failureReason: 'Responsive verification failure',
  });

  await verifyPages([
    { label: 'Dashboard', path: '/dashboard', ready: "Boolean(document.querySelector('[data-metric=total]'))" },
    { label: 'Travel documents', path: '/documents', ready: "document.querySelectorAll('.document-card').length === 2" },
    { label: 'Add passport', path: '/documents/new', ready: "Boolean(document.getElementById('passportNumber'))" },
    { label: 'Add visa', path: '/documents/new?type=visa', ready: "Boolean(document.getElementById('visaId'))" },
    { label: 'Add supporting document', path: '/documents/new?type=travel-document', ready: "Boolean(document.getElementById('documentType'))" },
    { label: 'Edit document', path: `/documents/passport/${passport.id}/edit`, ready: `document.getElementById('passportNumber')?.value === ${JSON.stringify(passport.passportNumber)}` },
    { label: 'Reminder settings', path: '/reminders', ready: "document.querySelectorAll('.reminder-card').length === 2" },
    { label: 'Notification history', path: '/notifications', ready: "Boolean(document.querySelector('.notification-table'))" },
    { label: 'Travel history', path: '/travel-history', ready: "document.querySelectorAll('.trip-card').length === 1" },
    { label: 'Add trip', path: '/travel-history/new', ready: "document.querySelectorAll('#visaUsedId option').length === 2" },
    { label: 'Edit trip', path: `/travel-history/${trip.id}/edit`, ready: `document.getElementById('purpose')?.value === ${JSON.stringify(trip.purpose)}` },
    { label: 'Destination checklist', path: '/destinations', ready: "Boolean(document.querySelector('.reference-warning'))" },
    { label: 'Account', path: '/account', ready: "Boolean(document.querySelector('.account-card'))" },
  ]);
  console.log('PASS every user page and form is usable at desktop and mobile widths');

  await setViewport(1280);
  await signOut();
  await registerThroughUi(adminAccount);
  adminUser = await User.findOne({ where: { email: adminAccount.email } });
  assert.ok(adminUser);
  await adminUser.update({ role: 'admin' });
  await signOut();
  await login(adminAccount);
  await verifyPages([
    { label: 'Admin panel', path: '/admin', ready: "Boolean(document.querySelector('[data-admin-table=users]'))" },
  ]);
  assert.deepEqual(
    await evaluate(browser, '({ local: localStorage.length, session: sessionStorage.length })'),
    { local: 0, session: 0 },
  );
  console.log('PASS clean cookie-based admin session and admin panel layouts at both widths');

  assert.deepEqual(runtimeErrors, [], `browser runtime errors: ${JSON.stringify(runtimeErrors)}`);
  console.log('PASS no uncaught runtime exceptions or console errors across the full page sweep');
} finally {
  stopExceptionCapture();
  stopConsoleCapture();
  await regularUser?.destroy().catch(() => {});
  await adminUser?.destroy().catch(() => {});
  await browser.close();
  await sequelize.close().catch(() => {});
}
