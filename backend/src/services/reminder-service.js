import { Op } from 'sequelize';
import { Reminder } from '../models/index.js';
import { HttpError } from '../utils/http-error.js';
import { getDocumentDefinition } from './document-registry.js';

export const DEFAULT_REMINDER_DAYS = Object.freeze([90, 60, 30]);

export async function findOwnedDocument(ownerId, kind, id) {
  const definition = getDocumentDefinition(kind);
  if (!definition) throw new HttpError(404, 'Document type not found');
  const document = await definition.Model.findOne({ where: { id, ownerId } });
  if (!document) throw new HttpError(404, 'Document not found');
  return { document, definition };
}

export async function ensureDefaultReminders({ ownerId, kind, documentId, expiryDate }, options = {}) {
  if (!expiryDate) return [];
  const definition = getDocumentDefinition(kind);
  if (!definition) throw new Error(`Unsupported document kind: ${kind}`);

  const where = {
    ownerId,
    relatedDocumentType: definition.storageType,
    relatedDocumentId: documentId,
    archived: false,
  };
  const existing = await Reminder.findAll({ where, transaction: options.transaction });
  if (existing.length > 0) return existing;

  await Reminder.bulkCreate(
    DEFAULT_REMINDER_DAYS.map((daysBefore) => ({
      ...where,
      daysBefore,
      enabled: true,
      status: 'active',
    })),
    { ignoreDuplicates: true, transaction: options.transaction },
  );

  return Reminder.findAll({
    where,
    order: [['daysBefore', 'DESC']],
    transaction: options.transaction,
  });
}

export async function getDocumentReminders(ownerId, kind, documentId, expiryDate) {
  await ensureDefaultReminders({ ownerId, kind, documentId, expiryDate });
  const definition = getDocumentDefinition(kind);
  return Reminder.findAll({
    where: {
      ownerId,
      relatedDocumentType: definition.storageType,
      relatedDocumentId: documentId,
      archived: false,
    },
    order: [['daysBefore', 'DESC']],
  });
}

export async function getReminderDaysMap(ownerId, kind, records) {
  const definition = getDocumentDefinition(kind);
  const reminders = await loadReminderContext(ownerId, { [kind]: records });
  const map = new Map(records.map((record) => [record.id, []]));
  for (const reminder of reminders) {
    if (reminder.enabled && reminder.relatedDocumentType === definition.storageType) {
      map.get(reminder.relatedDocumentId)?.push(reminder.daysBefore);
    }
  }
  return map;
}

export async function loadReminderContext(ownerId, recordsByKind) {
  const entries = Object.entries(recordsByKind).flatMap(([kind, records]) => {
    const definition = getDocumentDefinition(kind);
    if (!definition) throw new Error(`Unsupported document kind: ${kind}`);
    return records.map((record) => ({
      record,
      definition,
      expiryDate: record[definition.expiryField],
    }));
  });
  if (entries.length === 0) return [];

  const documentIds = entries.map(({ record }) => record.id);
  const existing = await Reminder.findAll({
    where: {
      ownerId,
      relatedDocumentId: { [Op.in]: documentIds },
      archived: false,
    },
  });
  const existingKeys = new Set(
    existing.map((reminder) => `${reminder.relatedDocumentType}:${reminder.relatedDocumentId}`),
  );
  const missingDefaults = entries.flatMap(({ record, definition, expiryDate }) => {
    const key = `${definition.storageType}:${record.id}`;
    if (!expiryDate || existingKeys.has(key)) return [];
    return DEFAULT_REMINDER_DAYS.map((daysBefore) => ({
      ownerId,
      relatedDocumentType: definition.storageType,
      relatedDocumentId: record.id,
      daysBefore,
      enabled: true,
      archived: false,
      status: 'active',
    }));
  });

  if (missingDefaults.length === 0) return existing;
  await Reminder.bulkCreate(missingDefaults, { ignoreDuplicates: true });
  return Reminder.findAll({
    where: {
      ownerId,
      relatedDocumentId: { [Op.in]: documentIds },
      archived: false,
    },
  });
}

export async function resetReminderDeliveryState(ownerId, kind, documentId) {
  const definition = getDocumentDefinition(kind);
  if (!definition) return;
  await Reminder.update(
    { status: 'active' },
    {
      where: {
        ownerId,
        relatedDocumentType: definition.storageType,
        relatedDocumentId: documentId,
        enabled: true,
        archived: false,
      },
    },
  );
}

export async function archiveDocumentReminders(ownerId, kind, documentId) {
  const definition = getDocumentDefinition(kind);
  if (!definition) return;
  await Reminder.update(
    { archived: true, enabled: false, status: 'cancelled' },
    {
      where: {
        ownerId,
        relatedDocumentType: definition.storageType,
        relatedDocumentId: documentId,
      },
    },
  );
}
