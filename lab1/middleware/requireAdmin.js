const ADMIN_FORBIDDEN_MESSAGE = 'Admin access required';

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    console.warn('requireAdmin: access denied for role', req.user?.role);
    return res.status(403).json({ error: ADMIN_FORBIDDEN_MESSAGE });
  }
  next();
}

module.exports = requireAdmin;
