import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getConfig } from '../src/config/env.js';
import { Passport, sequelize, TravelDocument, User, Visa } from '../src/models/index.js';
import {
  attachFile,
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

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'svt-ui-documents-'));
const pngPath = path.join(temporaryDirectory, 'insurance-proof.png');
const downloadDirectory = path.join(temporaryDirectory, 'downloads');
await mkdir(downloadDirectory);
await writeFile(
  pngPath,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
);

const browser = await launchBrowser(process.env.CHROME_BIN);
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const firstAccount = {
  name: 'Document Owner One',
  email: `documents-first-${suffix}@example.test`,
  password: `Aa1-${randomBytes(18).toString('base64url')}`,
};
const secondAccount = {
  name: 'Document Owner Two',
  email: `documents-second-${suffix}@example.test`,
  password: `Aa1-${randomBytes(18).toString('base64url')}`,
};

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

async function createPassport() {
  await navigate(browser, `${frontendUrl}/documents/new`);
  await waitFor(browser, "Boolean(document.getElementById('passportNumber'))", 'passport form');
  await setFormValues(browser, {
    passportNumber: 'UI-P-10001',
    countryOfIssue: 'India',
    issueDate: '2021-04-12',
    expiryDate: '2031-04-11',
  });
  await submitForm(browser);
  await waitFor(browser, "location.pathname === '/documents' && document.body.innerText.includes('UI-P-10001')", 'passport card');
}

async function createVisa() {
  await navigate(browser, `${frontendUrl}/documents/new`);
  await waitFor(browser, "Boolean(document.getElementById('kind'))", 'document category');
  await setFormValues(browser, { kind: 'visa' });
  await waitFor(browser, "Boolean(document.getElementById('visaId'))", 'visa form');
  await setFormValues(browser, {
    country: 'Japan',
    visaType: 'Visitor',
    visaId: 'UI-V-20002',
    entryType: 'single',
    validFrom: '2027-01-10',
    validUntil: '2027-07-10',
  });
  await submitForm(browser);
  await waitFor(browser, "location.pathname === '/documents' && document.body.innerText.includes('UI-V-20002')", 'visa card');
}

async function createTravelDocument() {
  await navigate(browser, `${frontendUrl}/documents/new`);
  await waitFor(browser, "Boolean(document.getElementById('kind'))", 'document category');
  await setFormValues(browser, { kind: 'travel-document' });
  await waitFor(browser, "Boolean(document.getElementById('documentType'))", 'supporting document form');
  await setFormValues(browser, { documentType: 'UI Travel Insurance', expiryDate: '2028-12-31' });
  await attachFile(browser, '#file', pngPath);
  await submitForm(browser);
  await waitFor(browser, "location.pathname === '/documents' && document.body.innerText.includes('UI Travel Insurance')", 'supporting document card');
}

async function editDocument(kind, id, field, value) {
  await navigate(browser, `${frontendUrl}/documents/${kind}/${id}/edit`);
  await waitFor(browser, `document.getElementById(${JSON.stringify(field)})?.value`, `${kind} edit data`);
  await setFormValues(browser, { [field]: value });
  await submitForm(browser);
  await waitFor(browser, "location.pathname === '/documents'", `${kind} edit completion`);
}

async function deleteThroughUi(kind) {
  const initialCount = await evaluate(browser, `document.querySelectorAll('.document-card').length`);
  await evaluate(browser, `document.querySelector('[data-kind=${JSON.stringify(kind)}] .delete-action').click()`);
  await waitFor(browser, "document.querySelector('.confirm-dialog')?.open", 'delete confirmation');
  await evaluate(browser, "document.querySelector('.confirm-dialog .danger-button').click()");
  await waitFor(
    browser,
    `document.querySelectorAll('.document-card').length === ${initialCount - 1}`,
    `${kind} deletion`,
  );
}

try {
  await registerThroughUi(firstAccount);
  const firstUser = await User.findOne({ where: { email: firstAccount.email } });
  assert.ok(firstUser);

  await createPassport();
  await createVisa();
  await createTravelDocument();

  let passport = await Passport.findOne({ where: { ownerId: firstUser.id } });
  let visa = await Visa.findOne({ where: { ownerId: firstUser.id } });
  let travelDocument = await TravelDocument.findOne({ where: { ownerId: firstUser.id } });
  assert.ok(passport && visa && travelDocument, 'all UI-created records must reach PostgreSQL');
  assert.equal((await stat(path.join(getConfig().uploadDirectory, travelDocument.fileReference))).isFile(), true);
  console.log('PASS UI created Passport, Visa, and TravelDocument records plus a private real file');

  const ownerDownload = await evaluate(
    browser,
    `fetch(${JSON.stringify(`${apiUrl}/travel-documents/${travelDocument.id}/file`)}, { credentials: 'include' }).then(async (response) => ({
      status: response.status,
      contentType: response.headers.get('content-type'),
      disposition: response.headers.get('content-disposition'),
      bytes: [...new Uint8Array(await response.arrayBuffer()).slice(0, 8)]
    }))`,
  );
  assert.equal(ownerDownload.status, 200);
  assert.equal(ownerDownload.contentType, 'image/png');
  assert.match(ownerDownload.disposition, /insurance-proof\.png/);
  assert.deepEqual(ownerDownload.bytes, [137, 80, 78, 71, 13, 10, 26, 10]);
  const unauthenticatedDownload = await evaluate(
    browser,
    `fetch(${JSON.stringify(`${apiUrl}/travel-documents/${travelDocument.id}/file`)}, { credentials: 'omit' }).then((response) => response.status)`,
  );
  const guessedPublicPath = await evaluate(
    browser,
    `fetch(${JSON.stringify(`${apiUrl}/uploads/${travelDocument.fileReference}`)}, { credentials: 'omit' }).then((response) => response.status)`,
  );
  assert.equal(unauthenticatedDownload, 401);
  assert.equal(guessedPublicPath, 404);
  await browser.client.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDirectory,
    eventsEnabled: true,
  });
  const downloadStarted = browser.client.once('Browser.downloadWillBegin');
  await evaluate(browser, "document.querySelector('[data-kind=travel-document] .card-actions button').click()");
  const downloadEvent = await downloadStarted;
  assert.equal(downloadEvent.suggestedFilename, 'insurance-proof.png');
  const downloadedPath = path.join(downloadDirectory, 'insurance-proof.png');
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await stat(downloadedPath)).size > 0) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.deepEqual(await readFile(downloadedPath), await readFile(pngPath));
  console.log('PASS UI download returned genuine bytes while unauthenticated and guessed public paths were blocked');

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
    assert.equal(hasHorizontalOverflow, false, `documents page overflowed at ${width}px`);
  }
  await browser.client.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false },
    browser.sessionId,
  );
  console.log('PASS document list has no horizontal overflow at desktop and mobile widths');

  await editDocument('passport', passport.id, 'passportNumber', 'UI-P-EDITED');
  await editDocument('visa', visa.id, 'visaType', 'Business visitor');
  await editDocument('travel-document', travelDocument.id, 'documentType', 'UI Insurance Edited');
  passport = await Passport.findByPk(passport.id);
  visa = await Visa.findByPk(visa.id);
  travelDocument = await TravelDocument.findByPk(travelDocument.id);
  assert.equal(passport.passportNumber, 'UI-P-EDITED');
  assert.equal(visa.visaType, 'Business visitor');
  assert.equal(travelDocument.documentType, 'UI Insurance Edited');
  console.log('PASS UI edits for all three types persisted in PostgreSQL');

  const wrongUploadStatus = await evaluate(
    browser,
    `(() => {
      const data = new FormData();
      data.set('documentType', 'Invalid signature');
      data.set('file', new File(['not a pdf'], 'fake.pdf', { type: 'application/pdf' }));
      return fetch(${JSON.stringify(`${apiUrl}/travel-documents`)}, { method: 'POST', credentials: 'include', body: data }).then((response) => response.status);
    })()`,
  );
  assert.equal(wrongUploadStatus, 415);
  const oversizedStatus = await evaluate(
    browser,
    `(() => {
      const data = new FormData();
      data.set('documentType', 'Oversized upload');
      data.set('file', new File([new Uint8Array(5242881)], 'large.pdf', { type: 'application/pdf' }));
      return fetch(${JSON.stringify(`${apiUrl}/travel-documents`)}, { method: 'POST', credentials: 'include', body: data }).then((response) => response.status);
    })()`,
  );
  assert.equal(oversizedStatus, 413);
  console.log('PASS running backend rejected forged-type and oversized uploads');

  await signOut();
  await registerThroughUi(secondAccount);
  await navigate(browser, `${frontendUrl}/documents`);
  await waitFor(browser, "document.body.innerText.includes('No documents yet')", 'empty second-user document list');

  const crossUserStatuses = await evaluate(
    browser,
    `Promise.all([
      fetch(${JSON.stringify(`${apiUrl}/passports/${passport.id}`)}, { credentials: 'include' }),
      fetch(${JSON.stringify(`${apiUrl}/passports/${passport.id}`)}, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ countryOfIssue: 'Unauthorized' }) }),
      fetch(${JSON.stringify(`${apiUrl}/passports/${passport.id}`)}, { method: 'DELETE', credentials: 'include' }),
      fetch(${JSON.stringify(`${apiUrl}/visas/${visa.id}`)}, { credentials: 'include' }),
      fetch(${JSON.stringify(`${apiUrl}/visas/${visa.id}`)}, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: 'Unauthorized' }) }),
      fetch(${JSON.stringify(`${apiUrl}/visas/${visa.id}`)}, { method: 'DELETE', credentials: 'include' }),
      fetch(${JSON.stringify(`${apiUrl}/travel-documents/${travelDocument.id}`)}, { credentials: 'include' }),
      fetch(${JSON.stringify(`${apiUrl}/travel-documents/${travelDocument.id}`)}, { method: 'PATCH', credentials: 'include', body: new FormData() }),
      fetch(${JSON.stringify(`${apiUrl}/travel-documents/${travelDocument.id}`)}, { method: 'DELETE', credentials: 'include' }),
      fetch(${JSON.stringify(`${apiUrl}/travel-documents/${travelDocument.id}/file`)}, { credentials: 'include' })
    ]).then((responses) => responses.map((response) => response.status))`,
  );
  assert.deepEqual(crossUserStatuses, Array(10).fill(404));
  console.log('PASS second user saw no records and received 404 for guessed read/edit/delete/file URLs');

  await signOut();
  await waitFor(browser, "Boolean(document.getElementById('email'))", 'first-user login form');
  await setFormValues(browser, { email: firstAccount.email, password: firstAccount.password });
  await submitForm(browser);
  await waitFor(browser, "location.pathname === '/dashboard'", 'first-user login');
  await navigate(browser, `${frontendUrl}/documents`);
  await waitFor(browser, "document.querySelectorAll('.document-card').length === 3", 'three owner documents');

  const storedPath = path.join(getConfig().uploadDirectory, travelDocument.fileReference);
  await deleteThroughUi('passport');
  await deleteThroughUi('visa');
  await deleteThroughUi('travel-document');
  assert.equal(await Passport.count({ where: { id: passport.id } }), 0);
  assert.equal(await Visa.count({ where: { id: visa.id } }), 0);
  assert.equal(await TravelDocument.count({ where: { id: travelDocument.id } }), 0);
  await assert.rejects(stat(storedPath), { code: 'ENOENT' });
  console.log('PASS UI confirmation and deletion removed all records and the private file');
} finally {
  await browser.close();
  await sequelize.close().catch(() => {});
  await rm(temporaryDirectory, { recursive: true, force: true });
}
