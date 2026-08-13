import { TravelDocument } from '../models/index.js';
import { presentDocument, presentDocuments } from '../services/document-presentation-service.js';
import { openStoredFile, removeStoredFile, storeUpload } from '../services/file-storage-service.js';
import { findOwned, listOwned, updateOwned } from '../services/owned-record-service.js';
import { archiveDocumentReminders, ensureDefaultReminders, resetReminderDeliveryState } from '../services/reminder-service.js';
import { HttpError } from '../utils/http-error.js';

const fields = [
  'documentType',
  'fileReference',
  'originalFileName',
  'fileMimeType',
  'fileSize',
  'uploadDate',
  'expiryDate',
];

function metadataFromBody(body) {
  const values = {};
  if (body.documentType !== undefined) values.documentType = body.documentType;
  if (body.expiryDate !== undefined) values.expiryDate = body.expiryDate || null;
  return values;
}

export async function listTravelDocuments(req, res, next) {
  try {
    const records = await listOwned(TravelDocument, req.user.id);
    res.json({ travelDocuments: await presentDocuments(req.user.id, 'travel-document', records) });
  } catch (error) {
    next(error);
  }
}

export async function getTravelDocument(req, res, next) {
  try {
    const record = await findOwned(TravelDocument, req.user.id, req.params.id, 'Travel document');
    res.json({ travelDocument: await presentDocument(req.user.id, 'travel-document', record) });
  } catch (error) {
    next(error);
  }
}

export async function createTravelDocument(req, res, next) {
  let storedFile;
  try {
    storedFile = await storeUpload(req.file);
    const record = await TravelDocument.create({
      ownerId: req.user.id,
      ...metadataFromBody(req.body),
      ...storedFile,
    });
    await ensureDefaultReminders({ ownerId: req.user.id, kind: 'travel-document', documentId: record.id, expiryDate: record.expiryDate });
    res.status(201).json({ travelDocument: await presentDocument(req.user.id, 'travel-document', record) });
  } catch (error) {
    if (storedFile) await removeStoredFile(storedFile.fileReference).catch(() => {});
    next(error);
  }
}

export async function updateTravelDocument(req, res, next) {
  let replacementFile;
  try {
    const current = await findOwned(TravelDocument, req.user.id, req.params.id, 'Travel document');
    if (req.file) replacementFile = await storeUpload(req.file);

    const record = await updateOwned(
      TravelDocument,
      req.user.id,
      req.params.id,
      {
        ...metadataFromBody(req.body),
        ...(replacementFile && { ...replacementFile, uploadDate: new Date() }),
      },
      fields,
      'Travel document',
    );

    if (replacementFile) {
      await removeStoredFile(current.fileReference).catch((error) => {
        console.error('Unable to remove replaced private file:', error.message);
      });
    }
    if (req.body.expiryDate !== undefined) await resetReminderDeliveryState(req.user.id, 'travel-document', record.id);
    res.json({ travelDocument: await presentDocument(req.user.id, 'travel-document', record) });
  } catch (error) {
    if (replacementFile) await removeStoredFile(replacementFile.fileReference).catch(() => {});
    next(error);
  }
}

export async function deleteTravelDocument(req, res, next) {
  try {
    const record = await findOwned(TravelDocument, req.user.id, req.params.id, 'Travel document');
    const deletedCount = await TravelDocument.destroy({ where: { id: req.params.id, ownerId: req.user.id } });
    if (deletedCount === 0) throw new HttpError(404, 'Travel document not found');
    await archiveDocumentReminders(req.user.id, 'travel-document', req.params.id);
    await removeStoredFile(record.fileReference).catch((error) => {
      console.error('Unable to remove deleted document file:', error.message);
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function downloadTravelDocument(req, res, next) {
  try {
    const record = await findOwned(TravelDocument, req.user.id, req.params.id, 'Travel document');
    const { stream, size } = await openStoredFile(record.fileReference);
    const encodedName = encodeURIComponent(record.originalFileName);
    res.set({
      'Content-Type': record.fileMimeType,
      'Content-Length': String(size),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    stream.on('error', next);
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
}
