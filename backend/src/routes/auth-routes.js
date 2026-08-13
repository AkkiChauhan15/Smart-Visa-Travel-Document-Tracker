import { Router } from 'express';
import { body } from 'express-validator';
import { currentUser, login, logout, register } from '../controllers/auth-controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate-request.js';

const router = Router();

const emailValidation = body('email')
  .isString()
  .withMessage('Email is required')
  .bail()
  .trim()
  .isEmail()
  .withMessage('Enter a valid email address')
  .bail()
  .normalizeEmail()
  .isLength({ max: 254 })
  .withMessage('Email is too long');

router.post(
  '/register',
  body('name')
    .isString()
    .withMessage('Name is required')
    .bail()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  emailValidation,
  body('password')
    .isString()
    .withMessage('Password is required')
    .bail()
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be between 8 and 72 characters')
    .matches(/[a-z]/)
    .withMessage('Password must contain a lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number'),
  validateRequest,
  register,
);

router.post(
  '/login',
  emailValidation,
  body('password').isString().notEmpty().withMessage('Password is required').isLength({ max: 72 }),
  validateRequest,
  login,
);

router.post('/logout', logout);
router.get('/me', requireAuth, currentUser);

export default router;

