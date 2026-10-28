/** Platform operators only — not clinic desk roles. */
export function requirePlatformAdmin(req, res, next) {
  if (!req.user?.sub) return res.status(401).json({ error: 'Authentication required' });
  if (!req.user.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform administrator access required' });
  }
  next();
}
