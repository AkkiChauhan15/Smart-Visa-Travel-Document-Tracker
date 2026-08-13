import { body, param } from 'express-validator';

export const idValidation = param('id').isUUID().withMessage('Document ID must be a valid UUID');

const requiredText = (field, label, maxLength) =>
  body(field)
    .isString()
    .withMessage(`${label} is required`)
    .bail()
    .trim()
    .isLength({ min: 1, max: maxLength })
    .withMessage(`${label} must be between 1 and ${maxLength} characters`);

const optionalText = (field, label, maxLength) =>
  body(field)
    .optional()
    .isString()
    .withMessage(`${label} must be text`)
    .bail()
    .trim()
    .isLength({ min: 1, max: maxLength })
    .withMessage(`${label} must be between 1 and ${maxLength} characters`);

const requiredDate = (field, label) =>
  body(field)
    .isString()
    .withMessage(`${label} is required`)
    .bail()
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage(`${label} must be a valid date in YYYY-MM-DD format`);

const optionalDate = (field, label) =>
  body(field)
    .optional()
    .isString()
    .withMessage(`${label} must be a date`)
    .bail()
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage(`${label} must be a valid date in YYYY-MM-DD format`);

function compareDates(startField, endField, message, allowEqual = false) {
  return body(endField).custom((end, { req }) => {
    const start = req.body[startField];
    if (start && end && (allowEqual ? end < start : end <= start)) {
      throw new Error(message);
    }
    return true;
  });
}

export const createPassportValidation = [
  requiredText('passportNumber', 'Passport number', 30).isLength({ min: 3 }),
  requiredText('countryOfIssue', 'Country of issue', 100),
  requiredDate('issueDate', 'Issue date'),
  requiredDate('expiryDate', 'Expiry date'),
  compareDates('issueDate', 'expiryDate', 'Expiry date must be after issue date'),
];

export const updatePassportValidation = [
  optionalText('passportNumber', 'Passport number', 30).isLength({ min: 3 }),
  optionalText('countryOfIssue', 'Country of issue', 100),
  optionalDate('issueDate', 'Issue date'),
  optionalDate('expiryDate', 'Expiry date'),
];

export const createVisaValidation = [
  requiredText('country', 'Country', 100),
  requiredText('visaType', 'Visa type', 80),
  requiredDate('validFrom', 'Valid from'),
  requiredDate('validUntil', 'Valid until'),
  compareDates('validFrom', 'validUntil', 'Valid until cannot be before valid from', true),
  body('entryType').isIn(['single', 'multiple']).withMessage('Entry type must be single or multiple'),
  requiredText('visaId', 'Visa ID', 80),
];

export const updateVisaValidation = [
  optionalText('country', 'Country', 100),
  optionalText('visaType', 'Visa type', 80),
  optionalDate('validFrom', 'Valid from'),
  optionalDate('validUntil', 'Valid until'),
  body('entryType')
    .optional()
    .isIn(['single', 'multiple'])
    .withMessage('Entry type must be single or multiple'),
  optionalText('visaId', 'Visa ID', 80),
];

export const createTravelDocumentValidation = [
  requiredText('documentType', 'Document type', 80),
  body('expiryDate')
    .optional({ values: 'falsy' })
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage('Expiry date must be a valid date in YYYY-MM-DD format'),
];

export const updateTravelDocumentValidation = [
  optionalText('documentType', 'Document type', 80),
  body('expiryDate')
    .optional({ values: 'falsy' })
    .isISO8601({ strict: true, strictSeparator: true })
    .withMessage('Expiry date must be a valid date in YYYY-MM-DD format'),
];
