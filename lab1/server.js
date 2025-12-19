const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const TASKS_FILE = process.env.TASKS_FILE || path.join(__dirname, 'tasks.json');
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, 'api.log');

app.use(express.json());

app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logEntry = `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms\n`;
    fs.appendFile(LOG_FILE, logEntry, err => {
      if (err) {
        console.error('Failed to write request log:', err);
      }
    });
  });
  next();
});

function readTasks() {
  try {
    if (!fs.existsSync(TASKS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(TASKS_FILE, 'utf8');
    return data.trim() === '' ? [] : JSON.parse(data);
  } catch (error) {
    return [];
  }
}

function writeTasks(tasks) {
  try {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf8');
    return true;
  } catch (error) {
    return false;
  }
}

function getNextId(tasks) {
  if (tasks.length === 0) return 1;
  return Math.max(...tasks.map(task => task.id)) + 1;
}

function validateTaskId(idParam) {
  const taskId = parseInt(idParam, 10);
  if (isNaN(taskId)) {
    return { valid: false, error: 'Invalid task ID' };
  }
  return { valid: true, id: taskId };
}

function findTaskById(tasks, taskId) {
  const taskIndex = tasks.findIndex(task => task.id === taskId);
  if (taskIndex === -1) {
    return { found: false, index: -1, task: null };
  }
  return { found: true, index: taskIndex, task: tasks[taskIndex] };
}

function sendError(res, statusCode, message, details = {}) {
  res.status(statusCode).json({
    error: message,
    ...details
  });
}

function sendSuccess(res, statusCode, data) {
  res.status(statusCode).json(data);
}

function handleError(error, req, res) {
  console.error('Error:', error);
  sendError(res, 500, 'Internal server error');
}

app.get('/', (req, res) => {
  res.json({
    message: 'TODO API - Task Manager',
    endpoints: {
      'GET /health': 'Check API status',
      'GET /tasks': 'Get all tasks',
      'GET /tasks/:id': 'Get task by ID',
      'POST /tasks': 'Create a new task',
      'PUT /tasks/:id': 'Update a task',
      'DELETE /tasks/:id': 'Delete a task'
    }
  });
});

app.get('/health', (req, res) => {
  const timestamp = new Date().toISOString();
  res.json({
    status: 'OK',
    timestamp: timestamp
  });
});

app.get('/tasks', (req, res) => {
  try {
    const tasks = readTasks();
    const { completed, sort, page, limit } = req.query;
    let filteredTasks = tasks;

    if (completed !== undefined) {
      const normalized = String(completed).toLowerCase();
      if (normalized !== 'true' && normalized !== 'false') {
        return sendError(res, 400, 'Completed query parameter must be true or false');
      }

      const completedValue = normalized === 'true';
      filteredTasks = tasks.filter(task => Boolean(task.completed) === completedValue);
    }

    let responseTasks = filteredTasks;

    if (sort !== undefined) {
      if (sort !== 'createdAt') {
        return sendError(res, 400, 'Sort parameter must be createdAt');
      }

      const getCreatedAtTime = task => {
        const timestamp = Date.parse(task.createdAt || '');
        return Number.isNaN(timestamp) ? 0 : timestamp;
      };

      responseTasks = [...filteredTasks].sort((a, b) => getCreatedAtTime(a) - getCreatedAtTime(b));
    }

    let pageValue = 1;
    if (page !== undefined) {
      pageValue = Number(page);
      if (!Number.isInteger(pageValue) || pageValue < 1) {
        return sendError(res, 400, 'Page must be a positive integer');
      }
    }

    let limitValue = 10;
    if (limit !== undefined) {
      limitValue = Number(limit);
      if (!Number.isInteger(limitValue) || limitValue < 1) {
        return sendError(res, 400, 'Limit must be a positive integer');
      }
    }

    const totalItems = responseTasks.length;
    const startIndex = (pageValue - 1) * limitValue;
    const paginatedTasks =
      startIndex >= totalItems
        ? []
        : responseTasks.slice(startIndex, startIndex + limitValue);

    res.set('X-Total-Count', String(totalItems));
    res.set('X-Page', String(pageValue));
    res.set('X-Limit', String(limitValue));

    sendSuccess(res, 200, paginatedTasks);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.get('/tasks/:id', (req, res) => {
  try {
    const idValidation = validateTaskId(req.params.id);
    if (!idValidation.valid) {
      return sendError(res, 400, idValidation.error);
    }

    const taskId = idValidation.id;
    const tasks = readTasks();
    const taskResult = findTaskById(tasks, taskId);

    if (!taskResult.found) {
      return sendError(res, 404, 'Task not found', { id: taskId });
    }

    sendSuccess(res, 200, taskResult.task);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.post('/tasks', (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return sendError(res, 400, 'Title is required and must be a non-empty string');
    }

    if (description && typeof description !== 'string') {
      return sendError(res, 400, 'Description must be a string');
    }

    const tasks = readTasks();
    const newTask = {
      id: getNextId(tasks),
      title: title.trim(),
      description: description ? description.trim() : '',
      completed: false,
      createdAt: new Date().toISOString()
    };

    tasks.push(newTask);

    if (!writeTasks(tasks)) {
      return sendError(res, 500, 'Failed to save task');
    }

    sendSuccess(res, 201, newTask);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.put('/tasks/:id', (req, res) => {
  try {
    const idValidation = validateTaskId(req.params.id);
    if (!idValidation.valid) {
      return sendError(res, 400, idValidation.error);
    }

    const taskId = idValidation.id;
    const { title, description, completed } = req.body;

    if (title !== undefined && (typeof title !== 'string' || title.trim() === '')) {
      return sendError(res, 400, 'Title must be a non-empty string');
    }

    if (description !== undefined && typeof description !== 'string') {
      return sendError(res, 400, 'Description must be a string');
    }

    if (completed !== undefined && typeof completed !== 'boolean') {
      return sendError(res, 400, 'Completed must be a boolean');
    }

    const tasks = readTasks();
    const taskResult = findTaskById(tasks, taskId);

    if (!taskResult.found) {
      return sendError(res, 404, 'Task not found', { id: taskId });
    }

    const task = taskResult.task;

    if (title !== undefined) task.title = title.trim();
    if (description !== undefined) task.description = description.trim();
    if (completed !== undefined) task.completed = completed;

    task.updatedAt = new Date().toISOString();

    if (!writeTasks(tasks)) {
      return sendError(res, 500, 'Failed to update task');
    }

    sendSuccess(res, 200, task);
  } catch (error) {
    handleError(error, req, res);
  }
});

app.delete('/tasks/:id', (req, res) => {
  try {
    const idValidation = validateTaskId(req.params.id);
    if (!idValidation.valid) {
      return sendError(res, 400, idValidation.error);
    }

    const taskId = idValidation.id;
    const tasks = readTasks();
    const taskResult = findTaskById(tasks, taskId);

    if (!taskResult.found) {
      return sendError(res, 404, 'Task not found', { id: taskId });
    }

    tasks.splice(taskResult.index, 1);

    if (!writeTasks(tasks)) {
      return sendError(res, 500, 'Failed to delete task');
    }

    sendSuccess(res, 200, { message: 'Task deleted successfully', id: taskId });
  } catch (error) {
    handleError(error, req, res);
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;
