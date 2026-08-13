import { runReminderJob } from './reminder-job.js';

export function startReminderScheduler({ intervalMs, runOnStartup = false, logger = console }) {
  let running = false;

  async function run() {
    if (running) return;
    running = true;
    try {
      const summary = await runReminderJob({ logger });
      logger.log(`Reminder job finished: ${JSON.stringify(summary)}`);
    } catch (error) {
      logger.error(`Reminder job failed: ${error.message}`);
    } finally {
      running = false;
    }
  }

  if (runOnStartup) void run();
  const timer = setInterval(run, intervalMs);
  timer.unref();

  return { stop: () => clearInterval(timer), run };
}

