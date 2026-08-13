import { HttpError } from '../utils/http-error.js';

export async function listOwned(Model, ownerId) {
  return Model.findAll({ where: { ownerId }, order: [['createdAt', 'DESC']] });
}

export async function findOwned(Model, ownerId, id, label = 'Document') {
  const record = await Model.findOne({ where: { id, ownerId } });
  if (!record) {
    throw new HttpError(404, `${label} not found`);
  }
  return record;
}

export async function updateOwned(Model, ownerId, id, values, fields, label = 'Document') {
  const current = await findOwned(Model, ownerId, id, label);
  const completeValues = Object.fromEntries(
    fields.map((field) => [field, values[field] === undefined ? current[field] : values[field]]),
  );

  const [, updatedRecords] = await Model.update(completeValues, {
    where: { id, ownerId },
    returning: true,
    validate: true,
  });

  if (!updatedRecords[0]) {
    throw new HttpError(404, `${label} not found`);
  }
  return updatedRecords[0];
}

export async function deleteOwned(Model, ownerId, id, label = 'Document') {
  const deletedCount = await Model.destroy({ where: { id, ownerId } });
  if (deletedCount === 0) {
    throw new HttpError(404, `${label} not found`);
  }
}

