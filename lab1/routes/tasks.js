const express = require('express');
const supabase = require('../supabase');
const { UUID_REGEX } = require('../utils/validation');

const router = express.Router();

const TASK_NOT_FOUND_MESSAGE = 'Task not found';
const ACCESS_DENIED_MESSAGE = 'Access denied';

const isTaskNotFoundError = error =>
  error?.code === 'PGRST116' ||
  error?.message?.includes('Cannot coerce the result to a single JSON object');

const handleTaskError = (res, error, fallbackMessage) => {
  if (isTaskNotFoundError(error)) {
    return res.status(404).json({ error: TASK_NOT_FOUND_MESSAGE });
  }
  return res.status(500).json({ error: fallbackMessage });
};

router.get('/', async (req, res) => {
  try {
    const {
      completed,
      sort = '-createdAt',
      page,
      limit,
      createdFrom,
      createdTo
    } = req.query;
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const usesPagination = limit !== undefined;
    if (page !== undefined && !usesPagination) {
      return res.status(400).json({ error: 'Limit must be provided when using page' });
    }

    let pageValue = 1;
    if (page !== undefined) {
      pageValue = Number(page);
      if (!Number.isInteger(pageValue) || pageValue < 1) {
        return res.status(400).json({ error: 'Page must be a positive integer' });
      }
    }

    let limitValue;
    if (usesPagination) {
      limitValue = Number(limit);
      if (!Number.isInteger(limitValue) || limitValue < 1) {
        return res.status(400).json({ error: 'Limit must be a positive integer' });
      }
    }

    let completedValue;
    if (completed !== undefined) {
      const normalized = String(completed).toLowerCase();
      if (normalized !== 'true' && normalized !== 'false') {
        return res.status(400).json({ error: 'Completed must be true or false' });
      }
      completedValue = normalized === 'true';
    }

    let createdFromIso;
    if (createdFrom) {
      const fromDate = Date.parse(createdFrom);
      if (Number.isNaN(fromDate)) {
        return res.status(400).json({ error: 'createdFrom must be a valid date' });
      }
      createdFromIso = new Date(fromDate).toISOString();
    }

    let createdToIso;
    if (createdTo) {
      const toDate = Date.parse(createdTo);
      if (Number.isNaN(toDate)) {
        return res.status(400).json({ error: 'createdTo must be a valid date' });
      }
      createdToIso = new Date(toDate).toISOString();
    }

    let query = usesPagination
      ? supabase.from('tasks').select('*', { count: 'exact' })
      : supabase.from('tasks').select('*');

    if (!isAdmin) {
      query = query.eq('user_id', userId);
    }

    if (completedValue !== undefined) {
      query = query.eq('completed', completedValue);
    }

    if (createdFromIso) {
      query = query.gte('created_at', createdFromIso);
    }

    if (createdToIso) {
      query = query.lte('created_at', createdToIso);
    }

    let sortField = sort;
    let ascending = false;
    if (sortField.startsWith('-')) {
      sortField = sortField.substring(1);
    } else {
      ascending = true;
    }

    if (sortField && sortField !== 'createdAt') {
      return res.status(400).json({ error: 'Sort parameter must be createdAt or -createdAt' });
    }

    query = query.order('created_at', { ascending });

    if (usesPagination) {
      const startIndex = (pageValue - 1) * limitValue;
      const endIndex = startIndex + limitValue - 1;
      const { data, error, count } = await query.range(startIndex, endIndex);

      if (error) {
        return res.status(500).json({ error: 'Failed to fetch tasks' });
      }

      res.set('X-Total-Count', String(count ?? 0));
      res.set('X-Page', String(pageValue));
      res.set('X-Limit', String(limitValue));
      return res.json(data || []);
    }

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch tasks' });
    }
    return res.json(data || []);
  } catch (err) {
    console.error('Fetch tasks error:', err);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Task ID must be a valid UUID' });
  }
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      return handleTaskError(res, error, 'Failed to fetch task');
    }

    if (!data) {
      return res.status(404).json({ error: TASK_NOT_FOUND_MESSAGE });
    }

    if (!isAdmin && data.user_id !== userId) {
      return res.status(403).json({ error: ACCESS_DENIED_MESSAGE });
    }

    return res.json(data);
  } catch (err) {
    console.error('Fetch single task error:', err);
    return res.status(500).json({ error: 'Failed to fetch task' });
  }
});

router.post('/', async (req, res) => {
  const { title } = req.body;
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const { data, error } = await supabase
      .from('tasks')
      .insert({ title: title.trim(), user_id: userId })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to create task' });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('Create task error:', err);
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  const userId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Task ID must be a valid UUID' });
  }

  if (completed === undefined || typeof completed !== 'boolean') {
    return res.status(400).json({
      error: 'Provide a true/false flag in the request body'
    });
  }

  try {
    const { data: existingTask, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      return handleTaskError(res, fetchError, 'Failed to update task');
    }

    if (!existingTask) {
      return res.status(404).json({ error: TASK_NOT_FOUND_MESSAGE });
    }

    if (!isAdmin && existingTask.user_id !== userId) {
      return res.status(403).json({ error: ACCESS_DENIED_MESSAGE });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({ completed })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return handleTaskError(res, error, 'Failed to update task');
    }

    return res.json(data);
  } catch (err) {
    console.error('Update task error:', err);
    return res.status(500).json({ error: 'Failed to update task' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const isAdmin = req.user?.role === 'admin';
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!UUID_REGEX.test(id)) {
    return res.status(400).json({ error: 'Task ID must be a valid UUID' });
  }
  try {
    const { data: existingTask, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      return handleTaskError(res, fetchError, 'Failed to delete task');
    }

    if (!existingTask) {
      return res.status(404).json({ error: TASK_NOT_FOUND_MESSAGE });
    }

    if (!isAdmin && existingTask.user_id !== userId) {
      return res.status(403).json({ error: ACCESS_DENIED_MESSAGE });
    }

    const { error } = await supabase.from('tasks').delete().eq('id', id);

    if (error) {
      return handleTaskError(res, error, 'Failed to delete task');
    }

    return res.status(204).send();
  } catch (err) {
    console.error('Delete task error:', err);
    return res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
