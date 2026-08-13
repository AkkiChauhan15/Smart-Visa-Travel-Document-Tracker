import { User } from '../models/index.js';
import { AUTH_COOKIE_NAME, verifyToken } from '../services/token-service.js';

function getRequestToken(req) {
  const authorization = req.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice(7).trim();
  }
  return req.cookies?.[AUTH_COOKIE_NAME];
}

export async function requireAuth(req, res, next) {
  const token = getRequestToken(req);
  if (!token) {
    return res.status(401).json({ error: { message: 'Authentication required' } });
  }

  try {
    const payload = verifyToken(token);
    const user = await User.findByPk(payload.sub);

    if (!user) {
      return res.status(401).json({ error: { message: 'Invalid session' } });
    }
    if (user.status === 'disabled') {
      return res.status(403).json({ error: { message: 'This account has been disabled' } });
    }

    req.user = user;
    req.auth = { tokenId: payload.jti };
    return next();
  } catch {
    return res.status(401).json({ error: { message: 'Invalid or expired session' } });
  }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: { message: 'Authentication required' } });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: { message: 'Insufficient permissions' } });
    }

    return next();
  };
}
