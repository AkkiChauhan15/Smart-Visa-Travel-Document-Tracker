import { createHash, timingSafeEqual } from 'node:crypto';
import { getConfig } from '../config/env.js';
import { triggerReminderJob } from '../jobs/reminder-job-runner.js';

function secretsMatch(provided, expected) {
  if (!provided || !expected) return false;
  const providedDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export function runRemindersFromExternalTrigger(req, res) {
  const cronSecret = getConfig().cronSecret;
  if (!cronSecret) {
    return res.status(503).json({ error: { message: 'Reminder trigger is not configured' } });
  }

  if (!secretsMatch(req.get('x-cron-secret'), cronSecret)) {
    return res.status(401).json({ error: { message: 'Invalid reminder trigger credentials' } });
  }

  const trigger = triggerReminderJob({ source: 'external-http-trigger' });
  return res.status(202).json({
    status: 'accepted',
    started: trigger.started,
    message: trigger.started ? 'Reminder check started' : 'Reminder check is already running',
  });
}
