import { Router } from 'express';
import { getStatistics, listUsers, updateUserStatus } from '../controllers/admin-controller.js';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate-request.js';
import { adminUserStatusValidation } from '../validation/admin-validation.js';

const router = Router();
router.use(requireAuth, allowRoles('admin'));
router.get('/users', listUsers);
router.patch('/users/:id/status', adminUserStatusValidation, validateRequest, updateUserStatus);
router.get('/statistics', getStatistics);

export default router;
