import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb, tenantToClient } from '../db/index.js';
import { getTenantBySlug } from '../tenantContext.js';

const JWT_SECRET = process.env.JWT_SECRET || 'clinic-dev-secret-change-in-production';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || JWT_SECRET === 'clinic-dev-secret-change-in-production') {
    throw new Error('JWT_SECRET is required in production');
  }
}

export function signToken(user, tenant = null) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      tenantId: tenant?.id ?? user.tenant_id,
      role: user.role,
      isPlatformAdmin: !!user.is_platform_admin,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const allowQueryToken = process.env.NODE_ENV !== 'production';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : (allowQueryToken ? req.query.token : null);
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function loginUser(identifier, password, options = {}) {
  const db = getDb();
  const raw = String(identifier || '').trim();
  const tenantSlug = String(options.tenantSlug || '').trim();

  let user;
  let tenant = null;

  if (raw.includes('@')) {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(raw.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return { error: 'Invalid email or password' };
    }
    if (user.tenant_id) {
      tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenant_id);
    }
  } else {
    if (!tenantSlug) return { error: 'Business slug required for username login' };
    tenant = getTenantBySlug(tenantSlug);
    if (!tenant) return { error: 'Business not found' };
    user = db.prepare('SELECT * FROM users WHERE tenant_id = ? AND username = ?').get(tenant.id, raw);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return { error: 'Invalid username or password' };
    }
  }

  return {
    token: signToken(user, tenant),
    user: {
      id: user.id,
      username: user.username || null,
      email: user.email,
      name: user.name,
      role: user.role,
      isPlatformAdmin: !!user.is_platform_admin,
    },
    tenant: tenant ? tenantToClient(tenant) : null,
  };
}

export function requireOwner(req, res, next) {
  if (!req.user?.tenantId) return res.status(403).json({ error: 'Tenant access required' });
  if (req.user.isPlatformAdmin) return res.status(403).json({ error: 'Owner access required' });
  if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner access required' });
  next();
}

export function getUserProfile(userId) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  let tenant = null;
  if (user.tenant_id) {
    tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenant_id);
  }
  return {
    user: {
      id: user.id,
      username: user.username || null,
      email: user.email,
      name: user.name,
      role: user.role,
      isPlatformAdmin: !!user.is_platform_admin,
    },
    tenant: tenant ? tenantToClient(tenant) : null,
  };
}
