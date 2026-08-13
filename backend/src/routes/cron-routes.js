import { Router } from 'express';
import { runRemindersFromExternalTrigger } from '../controllers/cron-controller.js';

const router = Router();

router.get('/run-reminders', runRemindersFromExternalTrigger);

export default router;
