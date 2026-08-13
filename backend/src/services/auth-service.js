import bcrypt from 'bcryptjs';
import { UniqueConstraintError } from 'sequelize';
import { getConfig } from '../config/env.js';
import { User } from '../models/index.js';
import { HttpError } from '../utils/http-error.js';

export async function registerUser({ name, email, password }) {
  const existingUser = await User.findOne({ where: { email: email.trim().toLowerCase() } });
  if (existingUser) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, getConfig().bcryptRounds);

  try {
    return await User.create({ name: name.trim(), email, passwordHash, role: 'user', status: 'active' });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    throw error;
  }
}

export async function authenticateUser({ email, password }) {
  const user = await User.scope('withPassword').findOne({
    where: { email: email.trim().toLowerCase() },
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  if (user.status === 'disabled') {
    throw new HttpError(403, 'This account has been disabled');
  }

  return user;
}
