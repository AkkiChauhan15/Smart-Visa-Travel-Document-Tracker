import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(currentDirectory, '../../../.env');

dotenv.config({ path: rootEnvPath, quiet: true });

const requiredVariables = ['DATABASE_URL', 'JWT_SECRET'];

function parseBoolean(name, fallback = false) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') return fallback;
  if (!['true', 'false'].includes(rawValue)) {
    throw new Error(`${name} must be true or false`);
  }
  return rawValue === 'true';
}

export function validateEnvironment() {
  const missing = requiredVariables.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const frontendUrl = process.env.FRONTEND_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim();
  if (!frontendUrl) {
    throw new Error('Missing required environment variable: FRONTEND_URL');
  }

  ['DATABASE_SSL', 'COOKIE_SECURE', 'SERVE_FRONTEND', 'REMINDER_JOB_ENABLED', 'REMINDER_RUN_ON_STARTUP']
    .forEach((name) => parseBoolean(name));

  const bcryptRounds = Number.parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10);
  if (!Number.isInteger(bcryptRounds) || bcryptRounds < 10 || bcryptRounds > 15) {
    throw new Error('BCRYPT_ROUNDS must be an integer between 10 and 15');
  }

  const maxUploadBytes = Number.parseInt(process.env.MAX_UPLOAD_BYTES ?? '5242880', 10);
  if (!Number.isInteger(maxUploadBytes) || maxUploadBytes < 1024 || maxUploadBytes > 25 * 1024 * 1024) {
    throw new Error('MAX_UPLOAD_BYTES must be between 1024 and 26214400');
  }

  const reminderJobIntervalMs = Number.parseInt(process.env.REMINDER_JOB_INTERVAL_MS ?? '86400000', 10);
  if (!Number.isInteger(reminderJobIntervalMs) || reminderJobIntervalMs < 60_000) {
    throw new Error('REMINDER_JOB_INTERVAL_MS must be an integer of at least 60000');
  }
}

export function getConfig() {
  validateEnvironment();

  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }

  const databaseUrl = process.env.DATABASE_URL;
  const frontendUrl = process.env.FRONTEND_URL?.trim() || process.env.RENDER_EXTERNAL_URL.trim();
  const sslMode = new URL(databaseUrl).searchParams.get('sslmode');

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port,
    databaseUrl,
    databaseSsl: parseBoolean('DATABASE_SSL', Boolean(sslMode && sslMode !== 'disable')),
    frontendOrigins: frontendUrl.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
    bcryptRounds: Number.parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
    cookieSecure: parseBoolean('COOKIE_SECURE'),
    serveFrontend: parseBoolean('SERVE_FRONTEND'),
    frontendDistDirectory: path.resolve(
      process.env.FRONTEND_DIST_DIR ?? path.resolve(currentDirectory, '../../../frontend/dist'),
    ),
    uploadDirectory: path.resolve(
      process.env.UPLOAD_DIR ?? path.resolve(currentDirectory, '../../storage/uploads'),
    ),
    maxUploadBytes: Number.parseInt(process.env.MAX_UPLOAD_BYTES ?? '5242880', 10),
    reminderJobEnabled: parseBoolean('REMINDER_JOB_ENABLED'),
    reminderJobIntervalMs: Number.parseInt(process.env.REMINDER_JOB_INTERVAL_MS ?? '86400000', 10),
    reminderRunOnStartup: parseBoolean('REMINDER_RUN_ON_STARTUP'),
  };
}

export function getEmailConfig(overrides = {}) {
  const values = { ...process.env, ...overrides };
  const provider = values.EMAIL_PROVIDER?.trim().toLowerCase() || 'smtp';
  if (provider !== 'smtp') {
    throw new Error('EMAIL_PROVIDER must be smtp');
  }

  const missing = ['EMAIL_FROM', 'SMTP_HOST', 'SMTP_PORT'].filter((key) => !values[key]?.trim());
  if (missing.length) {
    throw new Error(`Missing required email environment variables: ${missing.join(', ')}`);
  }
  if (Boolean(values.SMTP_USER) !== Boolean(values.SMTP_PASSWORD)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together');
  }

  const port = Number.parseInt(values.SMTP_PORT, 10);
  const connectionTimeoutMs = Number.parseInt(values.SMTP_CONNECTION_TIMEOUT_MS ?? '10000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be valid');
  if (!Number.isInteger(connectionTimeoutMs) || connectionTimeoutMs < 100 || connectionTimeoutMs > 60_000) {
    throw new Error('SMTP_CONNECTION_TIMEOUT_MS must be between 100 and 60000');
  }

  return {
    provider,
    from: values.EMAIL_FROM.trim(),
    host: values.SMTP_HOST.trim(),
    port,
    secure: values.SMTP_SECURE === 'true',
    user: values.SMTP_USER?.trim() || null,
    password: values.SMTP_PASSWORD || null,
    connectionTimeoutMs,
  };
}
