import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

const uploadDirectory = await mkdtemp(path.join(os.tmpdir(), 'svt-document-test-'));
process.env.UPLOAD_DIR = uploadDirectory;

const { createApp } = await import('../src/app.js');
const { getConfig } = await import('../src/config/env.js');
const { Passport, sequelize, TravelDocument, Visa } = await import('../src/models/index.js');

const config = getConfig();
if (config.nodeEnv !== 'test' || !new URL(config.databaseUrl).pathname.toLowerCase().includes('test')) {
  throw new Error('Refusing destructive integration tests outside a dedicated test database');
}

const app = createApp();
const pngFile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function getCookie(response) {
  return response.headers['set-cookie'][0].split(';', 1)[0];
}

async function register(email) {
  const response = await request(app).post('/api/auth/register').send({
    name: email.startsWith('first') ? 'First Owner' : 'Second Owner',
    email,
    password: `Aa1-${randomBytes(18).toString('base64url')}`,
  });
  assert.equal(response.status, 201);
  return { cookie: getCookie(response), user: response.body.user };
}

describe('owned document CRUD and private uploads', () => {
  let first;
  let second;
  let passport;
  let visa;
  let travelDocument;
  let storedReference;

  before(async () => {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
    first = await register('first-owner@example.test');
    second = await register('second-owner@example.test');
  });

  after(async () => {
    await sequelize.close();
    await rm(uploadDirectory, { recursive: true, force: true });
  });

  it('creates, reads, and edits a passport', async () => {
    const invalid = await request(app)
      .post('/api/passports')
      .set('Cookie', first.cookie)
      .send({ passportNumber: 'P123456', countryOfIssue: 'India', issueDate: '2030-01-01', expiryDate: '2029-01-01' });
    assert.equal(invalid.status, 422);

    const created = await request(app)
      .post('/api/passports')
      .set('Cookie', first.cookie)
      .send({ passportNumber: 'P123456', countryOfIssue: 'India', issueDate: '2020-01-01', expiryDate: '2030-01-01' });
    assert.equal(created.status, 201);
    passport = created.body.passport;
    assert.equal(passport.kind, 'passport');

    const single = await request(app).get(`/api/passports/${passport.id}`).set('Cookie', first.cookie);
    assert.equal(single.status, 200);

    const updated = await request(app)
      .patch(`/api/passports/${passport.id}`)
      .set('Cookie', first.cookie)
      .send({ passportNumber: 'P654321' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.passport.passportNumber, 'P654321');
  });

  it('creates, reads, and edits a visa', async () => {
    const invalid = await request(app)
      .post('/api/visas')
      .set('Cookie', first.cookie)
      .send({ country: 'Japan', visaType: 'Tourist', validFrom: '2030-02-01', validUntil: '2030-01-01', entryType: 'single', visaId: 'JP-100' });
    assert.equal(invalid.status, 422);

    const created = await request(app)
      .post('/api/visas')
      .set('Cookie', first.cookie)
      .send({ country: 'Japan', visaType: 'Tourist', validFrom: '2027-01-01', validUntil: '2027-06-01', entryType: 'single', visaId: 'JP-100' });
    assert.equal(created.status, 201);
    visa = created.body.visa;

    const updated = await request(app)
      .patch(`/api/visas/${visa.id}`)
      .set('Cookie', first.cookie)
      .send({ entryType: 'multiple', validUntil: '2027-08-01' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.visa.entryType, 'multiple');
    assert.equal(updated.body.visa.validUntil, '2027-08-01');
  });

  it('stores, retrieves, and replaces a genuine private file', async () => {
    const created = await request(app)
      .post('/api/travel-documents')
      .set('Cookie', first.cookie)
      .field('documentType', 'Travel insurance')
      .field('expiryDate', '2027-12-31')
      .attach('file', pngFile, { filename: 'policy.png', contentType: 'image/png' });
    assert.equal(created.status, 201);
    travelDocument = created.body.travelDocument;
    assert.equal(travelDocument.originalFileName, 'policy.png');
    assert.equal(travelDocument.fileReference, undefined);

    const stored = await TravelDocument.findByPk(travelDocument.id);
    storedReference = stored.fileReference;
    const storedPath = path.join(uploadDirectory, storedReference);
    assert.deepEqual(await readFile(storedPath), pngFile);
    assert.equal((await stat(storedPath)).mode & 0o777, 0o600);
    assert.equal((await stat(uploadDirectory)).mode & 0o777, 0o700);

    const fetchedFile = await request(app)
      .get(`/api/travel-documents/${travelDocument.id}/file`)
      .set('Cookie', first.cookie)
      .buffer(true)
      .parse((response, callback) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    assert.equal(fetchedFile.status, 200);
    assert.equal(fetchedFile.headers['content-type'], 'image/png');
    assert.deepEqual(fetchedFile.body, pngFile);

    const replacement = await request(app)
      .patch(`/api/travel-documents/${travelDocument.id}`)
      .set('Cookie', first.cookie)
      .field('documentType', 'Updated insurance')
      .attach('file', pngFile, { filename: 'updated-policy.png', contentType: 'image/png' });
    assert.equal(replacement.status, 200);
    assert.equal(replacement.body.travelDocument.documentType, 'Updated insurance');
    assert.equal(replacement.body.travelDocument.originalFileName, 'updated-policy.png');
    await assert.rejects(stat(storedPath), { code: 'ENOENT' });
    storedReference = (await TravelDocument.findByPk(travelDocument.id)).fileReference;
  });

  it('rejects invalid and oversized uploads on the backend', async () => {
    const wrongType = await request(app)
      .post('/api/travel-documents')
      .set('Cookie', first.cookie)
      .field('documentType', 'Unsafe file')
      .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'unsafe.pdf', contentType: 'application/pdf' });
    assert.equal(wrongType.status, 415);

    const oversized = await request(app)
      .post('/api/travel-documents')
      .set('Cookie', first.cookie)
      .field('documentType', 'Oversized file')
      .attach('file', Buffer.alloc(getConfig().maxUploadBytes + 1, 0x41), { filename: 'large.pdf', contentType: 'application/pdf' });
    assert.equal(oversized.status, 413);
  });

  it('returns only the authenticated owner records in lists', async () => {
    const [passports, visas, documents] = await Promise.all([
      request(app).get('/api/passports').set('Cookie', second.cookie),
      request(app).get('/api/visas').set('Cookie', second.cookie),
      request(app).get('/api/travel-documents').set('Cookie', second.cookie),
    ]);
    assert.deepEqual(passports.body.passports, []);
    assert.deepEqual(visas.body.visas, []);
    assert.deepEqual(documents.body.travelDocuments, []);
  });

  it('hides and protects every first-user record from the second user', async () => {
    const attempts = [
      request(app).get(`/api/passports/${passport.id}`).set('Cookie', second.cookie),
      request(app).patch(`/api/passports/${passport.id}`).set('Cookie', second.cookie).send({ countryOfIssue: 'Changed' }),
      request(app).delete(`/api/passports/${passport.id}`).set('Cookie', second.cookie),
      request(app).get(`/api/visas/${visa.id}`).set('Cookie', second.cookie),
      request(app).patch(`/api/visas/${visa.id}`).set('Cookie', second.cookie).send({ country: 'Changed' }),
      request(app).delete(`/api/visas/${visa.id}`).set('Cookie', second.cookie),
      request(app).get(`/api/travel-documents/${travelDocument.id}`).set('Cookie', second.cookie),
      request(app).patch(`/api/travel-documents/${travelDocument.id}`).set('Cookie', second.cookie).field('documentType', 'Changed'),
      request(app).delete(`/api/travel-documents/${travelDocument.id}`).set('Cookie', second.cookie),
      request(app).get(`/api/travel-documents/${travelDocument.id}/file`).set('Cookie', second.cookie),
    ];
    const responses = await Promise.all(attempts);
    assert.deepEqual(responses.map((response) => response.status), Array(10).fill(404));
  });

  it('deletes each owned type and removes the private file', async () => {
    const responses = await Promise.all([
      request(app).delete(`/api/passports/${passport.id}`).set('Cookie', first.cookie),
      request(app).delete(`/api/visas/${visa.id}`).set('Cookie', first.cookie),
      request(app).delete(`/api/travel-documents/${travelDocument.id}`).set('Cookie', first.cookie),
    ]);
    assert.deepEqual(responses.map((response) => response.status), [204, 204, 204]);
    assert.equal(await Passport.count({ where: { id: passport.id } }), 0);
    assert.equal(await Visa.count({ where: { id: visa.id } }), 0);
    assert.equal(await TravelDocument.count({ where: { id: travelDocument.id } }), 0);
    await assert.rejects(stat(path.join(uploadDirectory, storedReference)), { code: 'ENOENT' });
  });
});
