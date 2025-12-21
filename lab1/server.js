const express = require('express');
const fs = require('fs');
const path = require('path');

const authRoutes = require('./routes/auth');
const tasksRoutes = require('./routes/tasks');
const adminRoutes = require('./routes/admin');
const authMiddleware = require('./middleware/auth');
const requireAdmin = require('./middleware/requireAdmin');

const app = express();
const PORT = process.env.PORT || 3000;
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

app.get('/', (req, res) => {
  res.json({
    message: 'TODO API - Task Manager',
    endpoints: {
      'GET /health': 'Check API status',
      'POST /auth/register': 'Register a new user',
      'POST /auth/login': 'Authenticate user and obtain JWT',
      'GET /tasks': 'Get all tasks (requires Bearer token)',
      'POST /tasks': 'Create a new task (requires Bearer token)',
      'PATCH /tasks/:id': 'Update task status (requires Bearer token)',
      'DELETE /tasks/:id': 'Delete a task (requires Bearer token)'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

app.use('/auth', authRoutes);
app.use('/tasks', authMiddleware, tasksRoutes);
app.use('/admin', authMiddleware, requireAdmin, adminRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  if (err?.status && err.status >= 400 && err.status < 600) {
    return res.status(err.status).json({ error: err.message || 'Request failed' });
  }
  return res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;
