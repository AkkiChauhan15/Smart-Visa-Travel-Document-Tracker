import { Router } from 'express';
import { createVisa, deleteVisa, getVisa, listVisas, updateVisa } from '../controllers/visa-controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate-request.js';
import { createVisaValidation, idValidation, updateVisaValidation } from '../validation/document-validation.js';

const router = Router();
router.use(requireAuth);
router.get('/', listVisas);
router.post('/', createVisaValidation, validateRequest, createVisa);
router.get('/:id', idValidation, validateRequest, getVisa);
router.patch('/:id', idValidation, updateVisaValidation, validateRequest, updateVisa);
router.delete('/:id', idValidation, validateRequest, deleteVisa);

export default router;

