import { Passport } from '../models/index.js';
import { presentDocument, presentDocuments } from '../services/document-presentation-service.js';
import { deleteOwned, findOwned, listOwned, updateOwned } from '../services/owned-record-service.js';
import { archiveDocumentReminders, ensureDefaultReminders, resetReminderDeliveryState } from '../services/reminder-service.js';

const fields = ['passportNumber', 'countryOfIssue', 'issueDate', 'expiryDate'];
const pickFields = (body) => Object.fromEntries(fields.filter((field) => body[field] !== undefined).map((field) => [field, body[field]]));

export async function listPassports(req, res, next) {
  try {
    const records = await listOwned(Passport, req.user.id);
    res.json({ passports: await presentDocuments(req.user.id, 'passport', records) });
  } catch (error) {
    next(error);
  }
}

export async function getPassport(req, res, next) {
  try {
    const record = await findOwned(Passport, req.user.id, req.params.id, 'Passport');
    res.json({ passport: await presentDocument(req.user.id, 'passport', record) });
  } catch (error) {
    next(error);
  }
}

export async function createPassport(req, res, next) {
  try {
    const record = await Passport.create({ ...pickFields(req.body), ownerId: req.user.id });
    await ensureDefaultReminders({ ownerId: req.user.id, kind: 'passport', documentId: record.id, expiryDate: record.expiryDate });
    res.status(201).json({ passport: await presentDocument(req.user.id, 'passport', record) });
  } catch (error) {
    next(error);
  }
}

export async function updatePassport(req, res, next) {
  try {
    const record = await updateOwned(
      Passport,
      req.user.id,
      req.params.id,
      pickFields(req.body),
      fields,
      'Passport',
    );
    if (req.body.expiryDate !== undefined) await resetReminderDeliveryState(req.user.id, 'passport', record.id);
    res.json({ passport: await presentDocument(req.user.id, 'passport', record) });
  } catch (error) {
    next(error);
  }
}

export async function deletePassport(req, res, next) {
  try {
    await deleteOwned(Passport, req.user.id, req.params.id, 'Passport');
    await archiveDocumentReminders(req.user.id, 'passport', req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
