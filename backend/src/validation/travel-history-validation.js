import { body, param } from 'express-validator';

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

function validateDateOrder(value, { req }) {
  if (req.body.entryDate && value && value < req.body.entryDate) {
    throw new Error('Exit date cannot be before entry date');
  }
  return true;
}

export const tripIdValidation = param('id').isUUID().withMessage('Trip ID must be a valid UUID');

export const createTravelHistoryValidation = [
  requiredText('countryVisited', 'Country visited', 100),
  requiredDate('entryDate', 'Entry date'),
  requiredDate('exitDate', 'Exit date').custom(validateDateOrder),
  requiredText('purpose', 'Purpose', 200),
  body('visaUsedId').isUUID().withMessage('Select a valid visa'),
];

export const updateTravelHistoryValidation = [
  optionalText('countryVisited', 'Country visited', 100),
  optionalDate('entryDate', 'Entry date'),
  optionalDate('exitDate', 'Exit date').custom(validateDateOrder),
  optionalText('purpose', 'Purpose', 200),
  body('visaUsedId').optional().isUUID().withMessage('Select a valid visa'),
];

