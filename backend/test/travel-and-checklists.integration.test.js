import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';

const { createApp } = await import('../src/app.js');
const { getConfig } = await import('../src/config/env.js');
const { sequelize, TravelHistory } = await import('../src/models/index.js');
const {
  DESTINATION_CHECKLIST_SEEDS,
  seedDestinationChecklists,
} = await import('../src/services/destination-checklist-service.js');

const config = getConfig();
if (config.nodeEnv !== 'test' || !new URL(config.databaseUrl).pathname.toLowerCase().includes('test')) {
  throw new Error('Refusing destructive integration tests outside a dedicated test database');
}

const app = createApp();

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

async function createVisa(cookie, visaId, country = 'Japan') {
  const response = await request(app).post('/api/visas').set('Cookie', cookie).send({
    country,
    visaType: 'Visitor',
    validFrom: '2025-01-01',
    validUntil: '2030-01-01',
    entryType: 'multiple',
    visaId,
  });
  assert.equal(response.status, 201);
  return response.body.visa;
}

describe('travel history and destination reference checklists', () => {
  let first;
  let second;
  let firstVisa;
  let secondVisa;
  let trip;

  before(async () => {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });
    await seedDestinationChecklists();
    first = await register('trip-owner@example.test', 'Trip Owner');
    second = await register('trip-other@example.test', 'Other Traveller');
    firstVisa = await createVisa(first.cookie, 'TRIP-VISA-01');
    secondVisa = await createVisa(second.cookie, 'OTHER-VISA-02', 'France');
  });

  after(async () => {
    await sequelize.close();
  });

  it('rejects an exit date before the entry date on the backend', async () => {
    const response = await request(app).post('/api/travel-history').set('Cookie', first.cookie).send({
      countryVisited: 'Japan',
      entryDate: '2026-04-10',
      exitDate: '2026-04-09',
      purpose: 'Tourism',
      visaUsedId: firstVisa.id,
    });
    assert.equal(response.status, 422);
    assert.equal(await TravelHistory.count(), 0);
  });

  it('rejects another user’s visa on both create and update', async () => {
    const createAttempt = await request(app).post('/api/travel-history').set('Cookie', first.cookie).send({
      countryVisited: 'France',
      entryDate: '2026-03-01',
      exitDate: '2026-03-08',
      purpose: 'Tourism',
      visaUsedId: secondVisa.id,
    });
    assert.equal(createAttempt.status, 422);
    assert.match(createAttempt.body.error.message, /does not belong/);

    const created = await request(app).post('/api/travel-history').set('Cookie', first.cookie).send({
      countryVisited: 'Japan',
      entryDate: '2026-04-10',
      exitDate: '2026-04-20',
      purpose: 'Tourism',
      visaUsedId: firstVisa.id,
    });
    assert.equal(created.status, 201);
    trip = created.body.trip;
    assert.equal(trip.visaUsed.id, firstVisa.id);

    const updateAttempt = await request(app)
      .patch(`/api/travel-history/${trip.id}`)
      .set('Cookie', first.cookie)
      .send({ visaUsedId: secondVisa.id });
    assert.equal(updateAttempt.status, 422);
    assert.equal((await TravelHistory.findByPk(trip.id)).visaUsedId, firstVisa.id);
  });

  it('persists, lists most recent first, reads, and edits owned trips', async () => {
    const older = await request(app).post('/api/travel-history').set('Cookie', first.cookie).send({
      countryVisited: 'Japan',
      entryDate: '2025-01-10',
      exitDate: '2025-01-20',
      purpose: 'Conference',
      visaUsedId: firstVisa.id,
    });
    assert.equal(older.status, 201);

    const list = await request(app).get('/api/travel-history').set('Cookie', first.cookie);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.trips.map((item) => item.id), [trip.id, older.body.trip.id]);

    const single = await request(app).get(`/api/travel-history/${trip.id}`).set('Cookie', first.cookie);
    assert.equal(single.status, 200);
    assert.equal(single.body.trip.countryVisited, 'Japan');

    const updated = await request(app)
      .patch(`/api/travel-history/${trip.id}`)
      .set('Cookie', first.cookie)
      .send({ purpose: 'Business meetings', exitDate: '2026-04-22' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.trip.purpose, 'Business meetings');
    assert.equal(updated.body.trip.exitDate, '2026-04-22');
  });

  it('hides and protects the first user’s trips from the second user', async () => {
    const secondList = await request(app).get('/api/travel-history').set('Cookie', second.cookie);
    assert.deepEqual(secondList.body.trips, []);

    const attempts = await Promise.all([
      request(app).get(`/api/travel-history/${trip.id}`).set('Cookie', second.cookie),
      request(app)
        .patch(`/api/travel-history/${trip.id}`)
        .set('Cookie', second.cookie)
        .send({ purpose: 'Unauthorized edit', visaUsedId: secondVisa.id }),
      request(app).delete(`/api/travel-history/${trip.id}`).set('Cookie', second.cookie),
    ]);
    assert.deepEqual(attempts.map((response) => response.status), [404, 404, 404]);
    assert.notEqual((await TravelHistory.findByPk(trip.id)).purpose, 'Unauthorized edit');
  });

  it('serves seeded reference checklists with explicit non-live disclaimers', async () => {
    await seedDestinationChecklists();
    const unauthenticated = await request(app).get('/api/destination-checklists');
    assert.equal(unauthenticated.status, 401);

    const list = await request(app).get('/api/destination-checklists').set('Cookie', first.cookie);
    assert.equal(list.status, 200);
    assert.equal(list.body.destinationChecklists.length, DESTINATION_CHECKLIST_SEEDS.length);
    assert.equal(list.body.referenceNotice.isStaticReference, true);
    assert.equal(list.body.referenceNotice.isLiveVerified, false);
    assert.match(list.body.referenceNotice.disclaimer, /verified with official authorities/i);
    for (const checklist of list.body.destinationChecklists) {
      assert.equal(checklist.isStaticReference, true);
      assert.equal(checklist.isLiveVerified, false);
      assert.match(checklist.disclaimer, /static reference data only/i);
      assert.ok(checklist.checklistItems.length >= 4);
    }

    const detail = await request(app)
      .get(`/api/destination-checklists/${list.body.destinationChecklists[0].id}`)
      .set('Cookie', first.cookie);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.destinationChecklist.isLiveVerified, false);
    assert.match(detail.body.referenceNotice.disclaimer, /official authorities/i);
  });

  it('deletes an owned trip in the database', async () => {
    const response = await request(app).delete(`/api/travel-history/${trip.id}`).set('Cookie', first.cookie);
    assert.equal(response.status, 204);
    assert.equal(await TravelHistory.count({ where: { id: trip.id } }), 0);
  });
});

