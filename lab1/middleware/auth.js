const supabase = require('../supabase');
const { decodeJwt } = require('../utils/jwt');

const resolveRole = async (userId, claims) => {
  if (claims?.user_role === 'admin') {
    return 'admin';
  }
  if (!supabase.admin) {
    return 'user';
  }
  try {
    const { data, error } = await supabase.admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (error) {
      return 'user';
    }
    if (data?.role === 'admin') {
      return 'admin';
    }
  } catch (err) {
    console.warn('Failed to resolve user role:', err);
  }
  return 'user';
};

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
    const role = await resolveRole(data.user.id, claims);

    req.user = {
      id: data.user.id,
      email: data.user.email,
      role
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
