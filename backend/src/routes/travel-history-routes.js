import { Router } from 'express';
import {
  createTravelHistory,
  deleteTravelHistory,
  getTravelHistory,
  listTravelHistory,
  updateTravelHistory,
} from '../controllers/travel-history-controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate-request.js';
import {
  createTravelHistoryValidation,
  tripIdValidation,
  updateTravelHistoryValidation,
} from '../validation/travel-history-validation.js';

const router = Router();
router.use(requireAuth);
router.get('/', listTravelHistory);
router.post('/', createTravelHistoryValidation, validateRequest, createTravelHistory);
router.get('/:id', tripIdValidation, validateRequest, getTravelHistory);
router.patch('/:id', tripIdValidation, updateTravelHistoryValidation, validateRequest, updateTravelHistory);
router.delete('/:id', tripIdValidation, validateRequest, deleteTravelHistory);

export default router;

