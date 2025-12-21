const supabase = require('../supabase');
const { decodeJwt } = require('../utils/jwt');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const claims = decodeJwt(token);
    const roleFromToken = claims?.user_role;

    req.user = {
      id: data.user.id,
      email: data.user.email,
      role: roleFromToken === 'admin' ? 'admin' : 'user'
    };
    req.auth = {
      token,
      claims
    };
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = authMiddleware;
