import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config/env.js';

export const AUTH_COOKIE_NAME = 'svt_session';

export function createToken(user) {
  const config = getConfig();
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: user.id,
    expiresIn: config.jwtExpiresIn,
    jwtid: randomUUID(),
    issuer: 'smart-visa-tracker',
    audience: 'smart-visa-tracker-web',
  });
}

export function verifyToken(token) {
  const config = getConfig();
  return jwt.verify(token, config.jwtSecret, {
    issuer: 'smart-visa-tracker',
    audience: 'smart-visa-tracker-web',
  });
}

export function authCookieOptions() {
  const config = getConfig();
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 1000,
  };
}

export function clearAuthCookieOptions() {
  const { maxAge: _maxAge, ...options } = authCookieOptions();
  return options;
}
