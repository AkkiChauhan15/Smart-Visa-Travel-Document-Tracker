import { UniqueConstraintError } from 'sequelize';
import { Notification, Reminder, User } from '../models/index.js';
import { daysUntilExpiry } from '../utils/expiry-status.js';
import { definitionFromStorageType } from '../services/document-registry.js';
import { createEmailService } from '../services/email-service.js';

function safeFailureReason(error) {
  return (error instanceof Error ? error.message : 'Unknown email delivery error').slice(0, 1000);
}

async function claimNotification({ reminder, user, definition, document, expiryDate, subject }) {
  try {
    return await Notification.create({
      ownerId: user.id,
      relatedReminderId: reminder.id,
      sentStatus: 'pending',
      sentDate: null,
      channel: 'email',
      recipientEmail: user.email,
      subject,
      documentType: definition.storageType,
      documentId: document.id,
      documentLabel: definition.label(document),
      thresholdDays: reminder.daysBefore,
      expiryDate,
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      const existing = await Notification.findOne({
        where: { relatedReminderId: reminder.id, expiryDate },
      });
      if (existing?.sentStatus === 'failed') {
        await existing.update({ sentStatus: 'pending', sentDate: null, failureReason: null });
        return existing;
      }
      return null;
    }
    throw error;
  }
}

export async function runReminderJob({ now = new Date(), emailService, emailConfig, logger = console } = {}) {
  let mailer = emailService;
  const summary = { considered: 0, sent: 0, failed: 0, skipped: 0 };
  const reminders = await Reminder.findAll({
    where: { enabled: true, archived: false },
    order: [['createdAt', 'ASC']],
  });

  for (const reminder of reminders) {
    summary.considered += 1;
    try {
      const definition = definitionFromStorageType(reminder.relatedDocumentType);
      if (!definition) {
        summary.skipped += 1;
        continue;
      }

      const [user, document] = await Promise.all([
        User.findByPk(reminder.ownerId),
        definition.Model.findOne({
          where: { id: reminder.relatedDocumentId, ownerId: reminder.ownerId },
        }),
      ]);
      if (!user || !document) {
        await reminder.update({ archived: true, enabled: false, status: 'cancelled' });
        summary.skipped += 1;
        continue;
      }

      const expiryDate = document[definition.expiryField];
      const remaining = daysUntilExpiry(expiryDate, now);
      if (remaining === null || remaining < 0 || remaining > reminder.daysBefore) {
        summary.skipped += 1;
        continue;
      }

      const documentLabel = definition.label(document);
      const subject = `${documentLabel}: ${reminder.daysBefore}-day expiry reminder`;
      const notification = await claimNotification({
        reminder,
        user,
        definition,
        document,
        expiryDate,
        subject,
      });
      if (!notification) {
        summary.skipped += 1;
        continue;
      }

      try {
        mailer ??= createEmailService(emailConfig);
        const result = await mailer.sendExpiryReminder({
          to: user.email,
          userName: user.name,
          documentLabel,
          expiryDate,
          daysBefore: reminder.daysBefore,
        });
        await notification.update({
          sentStatus: 'sent',
          sentDate: new Date(),
          providerMessageId: result.messageId,
          subject: result.subject ?? subject,
        });
        await reminder.update({ status: 'triggered' });
        summary.sent += 1;
      } catch (error) {
        await notification.update({
          sentStatus: 'failed',
          sentDate: new Date(),
          failureReason: safeFailureReason(error),
        });
        summary.failed += 1;
        logger.error(`Reminder email failed for notification ${notification.id}: ${safeFailureReason(error)}`);
      }
    } catch (error) {
      summary.failed += 1;
      logger.error(`Reminder ${reminder.id} could not be processed: ${safeFailureReason(error)}`);
    }
  }

  return summary;
}
