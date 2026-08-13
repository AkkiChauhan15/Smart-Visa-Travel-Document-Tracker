import { Visa } from '../models/index.js';
import { presentDocument, presentDocuments } from '../services/document-presentation-service.js';
import { deleteOwned, findOwned, listOwned, updateOwned } from '../services/owned-record-service.js';
import { archiveDocumentReminders, ensureDefaultReminders, resetReminderDeliveryState } from '../services/reminder-service.js';

const fields = ['country', 'visaType', 'validFrom', 'validUntil', 'entryType', 'visaId'];
const pickFields = (body) => Object.fromEntries(fields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]));

export async function listVisas(req, res, next) {
  try {
    const records = await listOwned(Visa, req.user.id);
    res.json({ visas: await presentDocuments(req.user.id, 'visa', records) });
  } catch (error) {
    next(error);
  }
}

export async function getVisa(req, res, next) {
  try {
    const record = await findOwned(Visa, req.user.id, req.params.id, 'Visa');
    res.json({ visa: await presentDocument(req.user.id, 'visa', record) });
  } catch (error) {
    next(error);
  }
}

export async function createVisa(req, res, next) {
  try {
    const record = await Visa.create({ ...pickFields(req.body), ownerId: req.user.id });
    await ensureDefaultReminders({ ownerId: req.user.id, kind: 'visa', documentId: record.id, expiryDate: record.validUntil });
    res.status(201).json({ visa: await presentDocument(req.user.id, 'visa', record) });
  } catch (error) {
    next(error);
  }
}

export async function updateVisa(req, res, next) {
  try {
    const record = await updateOwned(
      Visa,
      req.user.id,
      req.params.id,
      pickFields(req.body),
      fields,
      'Visa',
    );
    if (req.body.validUntil !== undefined) await resetReminderDeliveryState(req.user.id, 'visa', record.id);
    res.json({ visa: await presentDocument(req.user.id, 'visa', record) });
  } catch (error) {
    next(error);
  }
}

export async function deleteVisa(req, res, next) {
  try {
    await deleteOwned(Visa, req.user.id, req.params.id, 'Visa');
    await archiveDocumentReminders(req.user.id, 'visa', req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
