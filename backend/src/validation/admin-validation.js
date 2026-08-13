import { body, param } from 'express-validator';

export const adminUserStatusValidation = [
  param('id').isUUID().withMessage('User ID must be a valid UUID'),
  body('status')
    .isIn(['active', 'disabled'])
    .withMessage('Status must be active or disabled'),
];
