const express = require('express');
const supabase = require('../supabase');
const { decodeJwt } = require('../utils/jwt');
const {
  isStrongPassword,
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  isTooLong
} = require('../utils/validation');

const FAILED_LOGIN_LIMIT = Number(process.env.LOGIN_RATE_LIMIT_MAX) || 5;
const FAILED_LOGIN_WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 60 * 1000;
const failedLoginAttempts = new Map();

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
    return data?.role === 'admin' ? 'admin' : 'user';
  } catch (err) {
    console.warn('Failed to resolve login role:', err);
    return 'user';
  }
};

const router = express.Router();

const getLoginKey = req => {
  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const ip = req.ip || '';
  return `${ip}:${email}`;
};

const getActiveFailedAttempt = (key, now) => {
  const entry = failedLoginAttempts.get(key);
  if (!entry) {
    return null;
  }
  if (now - entry.firstAttemptAt > FAILED_LOGIN_WINDOW_MS) {
    failedLoginAttempts.delete(key);
    return null;
  }
  return entry;
};

const registerFailedAttempt = (key, now) => {
  const entry = getActiveFailedAttempt(key, now);
  if (!entry) {
    const freshEntry = { count: 1, firstAttemptAt: now };
    failedLoginAttempts.set(key, freshEntry);
    return freshEntry;
  }
  entry.count += 1;
  return entry;
};

const clearFailedAttempts = key => {
  failedLoginAttempts.delete(key);
};

const normalizeRegisterError = errorMessage => {
  if (!errorMessage) {
    return 'Registration failed';
  }
  if (errorMessage.toLowerCase().includes('already registered')) {
    return 'User already exists';
  }
  return errorMessage;
};

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (isTooLong(email, MAX_EMAIL_LENGTH)) {
    return res.status(400).json({ error: 'Email is too long' });
  }
  if (isTooLong(password, MAX_PASSWORD_LENGTH)) {
    return res.status(400).json({ error: 'Password is too long' });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: 'Password is too weak' });
  }

  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return res.status(400).json({ error: normalizeRegisterError(error.message) });
    }

    return res.status(201).json({
      message: 'User created',
      user: {
        id: data.user.id,
        email: data.user.email,
        role: 'user',
        created_at: data.user.created_at
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (isTooLong(email, MAX_EMAIL_LENGTH)) {
    return res.status(400).json({ error: 'Email is too long' });
  }
  if (isTooLong(password, MAX_PASSWORD_LENGTH)) {
    return res.status(400).json({ error: 'Password is too long' });
  }

  const now = Date.now();
  const loginKey = getLoginKey(req);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn('Supabase login error:', error.message);
      if (FAILED_LOGIN_LIMIT > 0) {
        const entry = registerFailedAttempt(loginKey, now);
        if (entry.count >= FAILED_LOGIN_LIMIT) {
          return res.status(429).json({ error: 'Zbyt wiele prob logowania. Poczekaj minute.' });
        }
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = data.session?.access_token;
    if (!token) {
      return res.status(500).json({ error: 'Login failed' });
    }
    const claims = decodeJwt(token);
    const role = await resolveRole(data.user.id, claims);
    clearFailedAttempts(loginKey);

    return res.json({
      token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
