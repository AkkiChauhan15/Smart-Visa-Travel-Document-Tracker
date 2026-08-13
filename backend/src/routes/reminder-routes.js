import { Router } from 'express';
import { getReminderSettings, listReminderSettings, updateReminderSettings } from '../controllers/reminder-controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate-request.js';
import { reminderDocumentValidation, reminderPreferencesValidation } from '../validation/reminder-validation.js';

const router = Router();
router.use(requireAuth);
router.get('/', listReminderSettings);
router.get('/:kind/:id', reminderDocumentValidation, validateRequest, getReminderSettings);
router.put(
  '/:kind/:id',
  reminderDocumentValidation,
  reminderPreferencesValidation,
  validateRequest,
  updateReminderSettings,
);

export default router;

