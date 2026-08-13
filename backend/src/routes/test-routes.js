import { Router } from 'express';
import { allowRoles, requireAuth } from '../middleware/auth.js';
import { toPublicUser } from '../utils/public-user.js';

const router = Router();

router.get('/protected', requireAuth, (req, res) => {
  res.json({ message: 'Authenticated', user: toPublicUser(req.user) });
});

router.get('/admin', requireAuth, allowRoles('admin'), (req, res) => {
  res.json({ message: 'Admin access confirmed', user: toPublicUser(req.user) });
});

export default router;

