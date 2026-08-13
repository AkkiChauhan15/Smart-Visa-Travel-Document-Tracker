import { Router } from 'express';
import { listNotifications } from '../controllers/notification-controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
router.get('/', listNotifications);

export default router;

