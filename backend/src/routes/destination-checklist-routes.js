import { Router } from 'express';
import { param } from 'express-validator';
import { getChecklist, listChecklists } from '../controllers/destination-checklist-controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate-request.js';

const router = Router();
router.use(requireAuth);
router.get('/', listChecklists);
router.get(
  '/:id',
  param('id').isUUID().withMessage('Checklist ID must be a valid UUID'),
  validateRequest,
  getChecklist,
);

export default router;

