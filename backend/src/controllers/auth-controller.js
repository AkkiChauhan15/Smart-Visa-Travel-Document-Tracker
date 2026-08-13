import { authenticateUser, registerUser } from '../services/auth-service.js';
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  clearAuthCookieOptions,
  createToken,
} from '../services/token-service.js';
import { toPublicUser } from '../utils/public-user.js';

function startSession(res, user, status) {
  const token = createToken(user);
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions());
  return res.status(status).json({ user: toPublicUser(user) });
}

export async function register(req, res, next) {
  try {
    const user = await registerUser(req.body);
    return startSession(res, user, 201);
  } catch (error) {
    return next(error);
  }
}

export async function login(req, res, next) {
  try {
    const user = await authenticateUser(req.body);
    return startSession(res, user, 200);
  } catch (error) {
    return next(error);
  }
}

export function logout(_req, res) {
  res.clearCookie(AUTH_COOKIE_NAME, clearAuthCookieOptions());
  return res.status(204).send();
}

export function currentUser(req, res) {
  return res.json({ user: toPublicUser(req.user) });
}

