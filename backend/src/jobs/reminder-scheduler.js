import { triggerReminderJob } from './reminder-job-runner.js';

export function startReminderScheduler({ intervalMs, runOnStartup = false, logger = console }) {
  async function run() {
    const trigger = triggerReminderJob({ source: 'in-process-scheduler', logger });
    if (!trigger.started) logger.log('Reminder job is already running; scheduler trigger skipped');
    return trigger.completion;
  }

  if (runOnStartup) void run();
  const timer = setInterval(run, intervalMs);
  timer.unref();

  return { stop: () => clearInterval(timer), run };
}
