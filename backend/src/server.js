import { createApp } from './app.js';
import { connectDatabase, sequelize } from './config/database.js';
import { getConfig } from './config/env.js';
import { startReminderScheduler } from './jobs/reminder-scheduler.js';
import { seedDestinationChecklists } from './services/destination-checklist-service.js';
import './models/index.js';

const config = getConfig();

async function startServer() {
  await connectDatabase();
  await seedDestinationChecklists();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`API listening on port ${config.port}`);
  });
  const reminderScheduler = config.reminderJobEnabled
    ? startReminderScheduler({
        intervalMs: config.reminderJobIntervalMs,
        runOnStartup: config.reminderRunOnStartup,
      })
    : null;

  async function shutdown(signal) {
    console.log(`${signal} received; closing server`);
    reminderScheduler?.stop();
    server.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch(async (error) => {
  console.error('Unable to start API:', error.message);
  await sequelize.close().catch(() => {});
  process.exit(1);
});
