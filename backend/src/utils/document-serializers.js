export function serializePassport(record) {
  return {
    id: record.id,
    kind: 'passport',
    passportNumber: record.passportNumber,
    countryOfIssue: record.countryOfIssue,
    issueDate: record.issueDate,
    expiryDate: record.expiryDate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function serializeVisa(record) {
  return {
    id: record.id,
    kind: 'visa',
    country: record.country,
    visaType: record.visaType,
    validFrom: record.validFrom,
    validUntil: record.validUntil,
    entryType: record.entryType,
    visaId: record.visaId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function serializeTravelDocument(record) {
  return {
    id: record.id,
    kind: 'travel-document',
    documentType: record.documentType,
    originalFileName: record.originalFileName,
    fileMimeType: record.fileMimeType,
    fileSize: record.fileSize,
    uploadDate: record.uploadDate,
    expiryDate: record.expiryDate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

