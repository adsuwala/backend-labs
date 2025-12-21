const express = require('express');
const supabase = require('../supabase');
const { decodeJwt } = require('../utils/jwt');

const router = express.Router();

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
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
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
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn('Supabase login error:', error.message);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = data.session?.access_token;
    if (!token) {
      return res.status(500).json({ error: 'Login failed' });
    }
    const claims = decodeJwt(token);
    const role = claims?.user_role === 'admin' ? 'admin' : 'user';

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
