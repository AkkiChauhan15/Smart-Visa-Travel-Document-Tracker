import { connectDatabase, sequelize } from '../src/config/database.js';
import { runReminderJob } from '../src/jobs/reminder-job.js';
import '../src/models/index.js';

try {
  await connectDatabase();
  const summary = await runReminderJob();
  console.log(JSON.stringify(summary));
  if (summary.failed > 0) process.exitCode = 1;
} finally {
  await sequelize.close();
}

