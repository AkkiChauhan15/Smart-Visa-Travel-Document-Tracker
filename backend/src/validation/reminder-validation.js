import { body, param } from 'express-validator';

export const reminderDocumentValidation = [
  param('kind').isIn(['passport', 'visa', 'travel-document']).withMessage('Unsupported document type'),
  param('id').isUUID().withMessage('Document ID must be a valid UUID'),
];

export const reminderPreferencesValidation = [
  body('reminders')
    .isArray({ min: 1, max: 10 })
    .withMessage('Reminders must contain between 1 and 10 thresholds')
    .custom((reminders) => {
      const days = reminders.map((reminder) => reminder.daysBefore);
      if (new Set(days).size !== days.length) throw new Error('Reminder thresholds must be unique');
      return true;
    }),
  body('reminders.*.daysBefore')
    .isInt({ min: 0, max: 3650 })
    .withMessage('Each reminder threshold must be between 0 and 3650 days')
    .toInt(),
  body('reminders.*.enabled').isBoolean().withMessage('Each reminder enabled value must be boolean').toBoolean(),
];

