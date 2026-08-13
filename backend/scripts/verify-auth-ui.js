import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { sequelize, User } from '../src/models/index.js';
import { evaluate, fillAndSubmitExpression, launchBrowser, navigate, waitFor } from './browser-harness.js';

const frontendUrl = process.env.UI_BASE_URL;
const apiUrl = process.env.API_BASE_URL;
if (!frontendUrl || !apiUrl) throw new Error('UI_BASE_URL and API_BASE_URL are required');

const browser = await launchBrowser(process.env.CHROME_BIN);
try {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const account = {
    name: 'UI Verification User',
    email: `ui-${suffix}@example.test`,
    password: `Aa1-${randomBytes(18).toString('base64url')}`,
  };

  await navigate(browser, `${frontendUrl}/register`);
  await waitFor(browser, "Boolean(document.getElementById('name'))", 'registration form');
  await evaluate(browser, fillAndSubmitExpression({ ...account, confirmPassword: account.password }));
  await waitFor(browser, "location.pathname === '/dashboard'", 'dashboard after registration');

  const storedUser = await User.scope('withPassword').findOne({ where: { email: account.email } });
  assert.ok(storedUser);
  assert.notEqual(storedUser.passwordHash, account.password);
  assert.equal(await bcrypt.compare(account.password, storedUser.passwordHash), true);
  console.log('PASS UI registration reached the API and stored a bcrypt password hash');

  await browser.client.send('Network.clearBrowserCookies', {}, browser.sessionId);
  await navigate(browser, `${frontendUrl}/account`);
  await waitFor(browser, "location.pathname === '/login'", 'protected-route redirect');
  console.log('PASS frontend protected route redirected an unauthenticated visitor');

  await waitFor(browser, "Boolean(document.getElementById('email'))", 'login form');
  await evaluate(
    browser,
    fillAndSubmitExpression({ email: account.email, password: `${account.password}-wrong` }),
  );
  await waitFor(
    browser,
    "location.pathname === '/login' && document.querySelector('[role=alert]')?.textContent.includes('Invalid email or password')",
    'invalid-credential error',
  );
  console.log('PASS invalid credentials stayed on login and showed a sensible error');

  await evaluate(browser, fillAndSubmitExpression({ email: account.email, password: account.password }));
  await waitFor(browser, "location.pathname === '/dashboard'", 'dashboard after login');

  const protectedResult = await evaluate(
    browser,
    `fetch(${JSON.stringify(`${apiUrl}/test/protected`)}, { credentials: 'include' }).then(async (response) => ({ status: response.status, body: await response.json() }))`,
  );
  assert.equal(protectedResult.status, 200);
  assert.equal(protectedResult.body.user.email, account.email);
  console.log('PASS authenticated browser session reached the protected API route');

  const adminResult = await evaluate(
    browser,
    `fetch(${JSON.stringify(`${apiUrl}/test/admin`)}, { credentials: 'include' }).then((response) => ({ status: response.status }))`,
  );
  assert.equal(adminResult.status, 403);
  console.log('PASS user-role browser session was blocked from the admin-only API route');

  await evaluate(browser, "[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Sign out')).click()");
  await waitFor(browser, "location.pathname === '/login'", 'logout redirect');
  console.log(`PASS logout completed for ${account.email}`);
} finally {
  await browser.close();
  await sequelize.close().catch(() => {});
}
