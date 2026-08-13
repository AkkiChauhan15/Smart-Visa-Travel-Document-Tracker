import { TravelHistory, Visa } from '../models/index.js';
import { HttpError } from '../utils/http-error.js';

const editableFields = ['countryVisited', 'entryDate', 'exitDate', 'purpose', 'visaUsedId'];

export function pickTripFields(body) {
  return Object.fromEntries(
    editableFields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]),
  );
}

export async function findOwnedVisa(ownerId, visaId) {
  const visa = await Visa.findOne({ where: { id: visaId, ownerId } });
  if (!visa) throw new HttpError(422, 'Selected visa does not belong to this account');
  return visa;
}

export async function listOwnedTrips(ownerId, { limit } = {}) {
  return TravelHistory.findAll({
    where: { ownerId },
    include: [
      {
        model: Visa,
        as: 'visaUsed',
        required: false,
        where: { ownerId },
        attributes: ['id', 'country', 'visaType', 'visaId'],
      },
    ],
    order: [['entryDate', 'DESC'], ['createdAt', 'DESC']],
    ...(limit ? { limit } : {}),
  });
}

export async function findOwnedTrip(ownerId, id) {
  const trip = await TravelHistory.findOne({
    where: { id, ownerId },
    include: [
      {
        model: Visa,
        as: 'visaUsed',
        required: false,
        where: { ownerId },
        attributes: ['id', 'country', 'visaType', 'visaId'],
      },
    ],
  });
  if (!trip) throw new HttpError(404, 'Trip not found');
  return trip;
}

export function serializeTrip(trip) {
  return {
    id: trip.id,
    countryVisited: trip.countryVisited,
    entryDate: trip.entryDate,
    exitDate: trip.exitDate,
    purpose: trip.purpose,
    visaUsedId: trip.visaUsedId,
    visaUsed: trip.visaUsed
      ? {
          id: trip.visaUsed.id,
          country: trip.visaUsed.country,
          visaType: trip.visaUsed.visaType,
          visaId: trip.visaUsed.visaId,
        }
      : null,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

export async function createOwnedTrip(ownerId, values) {
  await findOwnedVisa(ownerId, values.visaUsedId);
  const trip = await TravelHistory.create({ ownerId, ...values });
  return findOwnedTrip(ownerId, trip.id);
}

export async function updateOwnedTrip(ownerId, id, values) {
  const current = await TravelHistory.findOne({ where: { id, ownerId } });
  if (!current) throw new HttpError(404, 'Trip not found');

  const completeValues = Object.fromEntries(
    editableFields.map((field) => [field, values[field] === undefined ? current[field] : values[field]]),
  );
  await findOwnedVisa(ownerId, completeValues.visaUsedId);
  if (completeValues.exitDate < completeValues.entryDate) {
    throw new HttpError(422, 'Exit date cannot be before entry date');
  }

  const [updatedCount] = await TravelHistory.update(completeValues, {
    where: { id, ownerId },
    validate: true,
  });
  if (updatedCount === 0) throw new HttpError(404, 'Trip not found');
  return findOwnedTrip(ownerId, id);
}

export async function deleteOwnedTrip(ownerId, id) {
  const deletedCount = await TravelHistory.destroy({ where: { id, ownerId } });
  if (deletedCount === 0) throw new HttpError(404, 'Trip not found');
}
