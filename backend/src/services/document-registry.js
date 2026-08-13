import { Passport, TravelDocument, Visa } from '../models/index.js';

export const DOCUMENT_DEFINITIONS = {
  passport: {
    kind: 'passport',
    storageType: 'passport',
    Model: Passport,
    expiryField: 'expiryDate',
    label(record) {
      return `Passport ${record.passportNumber}`;
    },
  },
  visa: {
    kind: 'visa',
    storageType: 'visa',
    Model: Visa,
    expiryField: 'validUntil',
    label(record) {
      return `${record.country} ${record.visaType} visa (${record.visaId})`;
    },
  },
  'travel-document': {
    kind: 'travel-document',
    storageType: 'travel_document',
    Model: TravelDocument,
    expiryField: 'expiryDate',
    label(record) {
      return record.documentType;
    },
  },
};

export function getDocumentDefinition(kind) {
  return DOCUMENT_DEFINITIONS[kind] ?? null;
}

export function definitionFromStorageType(storageType) {
  return Object.values(DOCUMENT_DEFINITIONS).find((definition) => definition.storageType === storageType) ?? null;
}

