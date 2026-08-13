import { serializePassport, serializeTravelDocument, serializeVisa } from '../utils/document-serializers.js';
import { calculateExpiryStatus } from '../utils/expiry-status.js';
import { getDocumentDefinition } from './document-registry.js';
import { getReminderDaysMap } from './reminder-service.js';

const serializers = {
  passport: serializePassport,
  visa: serializeVisa,
  'travel-document': serializeTravelDocument,
};

export async function presentDocuments(ownerId, kind, records, now = new Date(), reminderRows = null) {
  const definition = getDocumentDefinition(kind);
  const reminderDaysMap = reminderRows
    ? reminderRows.reduce((map, reminder) => {
        if (
          reminder.relatedDocumentType === definition.storageType &&
          reminder.enabled &&
          map.has(reminder.relatedDocumentId)
        ) {
          map.get(reminder.relatedDocumentId).push(reminder.daysBefore);
        }
        return map;
      }, new Map(records.map((record) => [record.id, []])))
    : await getReminderDaysMap(ownerId, kind, records);
  return records.map((record) => ({
    ...serializers[kind](record),
    ...calculateExpiryStatus(record[definition.expiryField], reminderDaysMap.get(record.id), now),
  }));
}

export async function presentDocument(ownerId, kind, record, now = new Date()) {
  return (await presentDocuments(ownerId, kind, [record], now))[0];
}
