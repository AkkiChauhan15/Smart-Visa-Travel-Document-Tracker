import { connectDatabase, sequelize } from '../src/config/database.js';
import { User } from '../src/models/index.js';

const [emailArgument, roleArgument] = process.argv.slice(2);
const email = emailArgument?.trim().toLowerCase();
const role = roleArgument?.trim().toLowerCase();

if (!email || !['user', 'admin'].includes(role)) {
  console.error('Usage: npm run users:set-role -- <email> <user|admin>');
  process.exitCode = 1;
} else {
  try {
    await connectDatabase();
    const user = await User.findOne({ where: { email } });
    if (!user) throw new Error(`No user exists with email ${email}`);
    await user.update({ role });
    console.log(`Updated ${email} to role ${role}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
}
