const express = require('express');
const supabaseClient = require('../supabase');
const { isValidUUID } = require('../utils/validation');

const router = express.Router();
const supabaseAdmin = supabaseClient.admin;

router.get('/users', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id,email,role,created_at')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Fetch users error:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    return res.json(data || []);
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.delete('/users/:id', async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'User ID must be a valid UUID' });
  }

  if (!supabaseAdmin) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required for admin user deletion.');
    return res.status(500).json({ error: 'Admin operations are not configured' });
  }

  try {
    const { error: fetchError } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) {
      if (error.message?.toLowerCase().includes('not found')) {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('Delete user error:', error);
      return res.status(500).json({ error: 'Failed to delete user' });
    }

    return res.status(204).send();
  } catch (err) {
    console.error('Admin delete user error:', err);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
