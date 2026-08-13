import { runReminderJob } from './reminder-job.js';

let activeRun = null;

export function triggerReminderJob({ source = 'manual', logger = console, jobOptions = {} } = {}) {
  if (activeRun) return { started: false, completion: activeRun };

  const completion = runReminderJob({ ...jobOptions, logger })
    .then((summary) => {
      logger.log(`Reminder job (${source}) finished: ${JSON.stringify(summary)}`);
      return summary;
    })
    .catch((error) => {
      logger.error(`Reminder job (${source}) failed: ${error.message}`);
      return { considered: 0, sent: 0, failed: 1, skipped: 0 };
    })
    .finally(() => {
      if (activeRun === completion) activeRun = null;
    });

  activeRun = completion;
  return { started: true, completion };
}
