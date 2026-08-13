import { Reminder, sequelize } from '../models/index.js';
import { DOCUMENT_DEFINITIONS } from '../services/document-registry.js';
import { findOwnedDocument, getDocumentReminders } from '../services/reminder-service.js';
import { calculateExpiryStatus } from '../utils/expiry-status.js';

function serializeReminder(reminder) {
  return {
    id: reminder.id,
    daysBefore: reminder.daysBefore,
    enabled: reminder.enabled,
    deliveryStatus: reminder.status,
  };
}

function serializeSettings(document, definition, reminders) {
  const expiryDate = document[definition.expiryField];
  const enabledDays = reminders.filter((reminder) => reminder.enabled).map((reminder) => reminder.daysBefore);
  return {
    documentId: document.id,
    kind: definition.kind,
    label: definition.label(document),
    expiryDate,
    reminders: reminders.map(serializeReminder),
    ...calculateExpiryStatus(expiryDate, enabledDays),
  };
}

export async function listReminderSettings(req, res, next) {
  try {
    const groups = await Promise.all(
      Object.values(DOCUMENT_DEFINITIONS).map(async (definition) => {
        const documents = await definition.Model.findAll({
          where: { ownerId: req.user.id },
          order: [['createdAt', 'DESC']],
        });
        return Promise.all(
          documents.map(async (document) => {
            const reminders = await getDocumentReminders(
              req.user.id,
              definition.kind,
              document.id,
              document[definition.expiryField],
            );
            return serializeSettings(document, definition, reminders);
          }),
        );
      }),
    );
    res.json({ reminderSettings: groups.flat().sort((a, b) => a.label.localeCompare(b.label)) });
  } catch (error) {
    next(error);
  }
}

export async function getReminderSettings(req, res, next) {
  try {
    const { document, definition } = await findOwnedDocument(req.user.id, req.params.kind, req.params.id);
    const reminders = await getDocumentReminders(
      req.user.id,
      definition.kind,
      document.id,
      document[definition.expiryField],
    );
    res.json({ reminderSetting: serializeSettings(document, definition, reminders) });
  } catch (error) {
    next(error);
  }
}

export async function updateReminderSettings(req, res, next) {
  try {
    const { document, definition } = await findOwnedDocument(req.user.id, req.params.kind, req.params.id);
    const expiryDate = document[definition.expiryField];
    if (!expiryDate) {
      return res.status(422).json({ error: { message: 'This document has no expiry date' } });
    }

    await sequelize.transaction(async (transaction) => {
      await Reminder.update(
        { archived: true, enabled: false, status: 'cancelled' },
        {
          where: {
            ownerId: req.user.id,
            relatedDocumentType: definition.storageType,
            relatedDocumentId: document.id,
            archived: false,
          },
          transaction,
        },
      );

      for (const preference of req.body.reminders) {
        const [reminder] = await Reminder.findOrCreate({
          where: {
            ownerId: req.user.id,
            relatedDocumentType: definition.storageType,
            relatedDocumentId: document.id,
            daysBefore: preference.daysBefore,
          },
          defaults: {
            enabled: preference.enabled,
            archived: false,
            status: preference.enabled ? 'active' : 'cancelled',
          },
          transaction,
        });
        await reminder.update(
          {
            enabled: preference.enabled,
            archived: false,
            status: preference.enabled ? 'active' : 'cancelled',
          },
          { transaction },
        );
      }
    });

    const reminders = await getDocumentReminders(req.user.id, definition.kind, document.id, expiryDate);
    return res.json({ reminderSetting: serializeSettings(document, definition, reminders) });
  } catch (error) {
    return next(error);
  }
}

