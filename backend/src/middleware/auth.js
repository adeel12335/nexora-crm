import jwt from 'jsonwebtoken';

export function isImpersonating(req) {
  return Boolean(req.user?.impersonatorId);
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, role, name, email, impersonatorId?, impersonatorName? }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role for this action' });
    }
    next();
  };
}

/** Block nested impersonation (e.g. switch-user while already switched). */
export function rejectIfImpersonating(req, res, next) {
  if (isImpersonating(req)) {
    return res.status(403).json({ error: 'Already switched — switch back first' });
  }
  next();
}
