import { Router } from 'express';
import {
  createPassport,
  deletePassport,
  getPassport,
  listPassports,
  updatePassport,
} from '../controllers/passport-controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate-request.js';
import {
  createPassportValidation,
  idValidation,
  updatePassportValidation,
} from '../validation/document-validation.js';

const router = Router();
router.use(requireAuth);
router.get('/', listPassports);
router.post('/', createPassportValidation, validateRequest, createPassport);
router.get('/:id', idValidation, validateRequest, getPassport);
router.patch('/:id', idValidation, updatePassportValidation, validateRequest, updatePassport);
router.delete('/:id', idValidation, validateRequest, deletePassport);

export default router;

