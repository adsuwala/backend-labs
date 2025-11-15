const request = require('supertest');
const fs = require('fs');
const path = require('path');

const TEST_TASKS_FILE = path.join(__dirname, 'tasks.test.json');
const ORIGINAL_TASKS_FILE = process.env.TASKS_FILE;

let app;

beforeAll(() => {
  process.env.TASKS_FILE = TEST_TASKS_FILE;
});

beforeEach(() => {
  if (fs.existsSync(TEST_TASKS_FILE)) {
    fs.unlinkSync(TEST_TASKS_FILE);
  }
  delete require.cache[require.resolve('./server')];
  app = require('./server');
});

afterEach(() => {
  if (fs.existsSync(TEST_TASKS_FILE)) {
    fs.unlinkSync(TEST_TASKS_FILE);
  }
});

afterAll(() => {
  if (fs.existsSync(TEST_TASKS_FILE)) {
    fs.unlinkSync(TEST_TASKS_FILE);
  }
  if (ORIGINAL_TASKS_FILE) {
    process.env.TASKS_FILE = ORIGINAL_TASKS_FILE;
  } else {
    delete process.env.TASKS_FILE;
  }
  delete require.cache[require.resolve('./server')];
});

describe('GET /', () => {
  test('should return API information', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('endpoints');
    expect(response.body.endpoints).toHaveProperty('GET /health');
  });
});

describe('GET /health', () => {
  test('should return OK status with timestamp', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('timestamp');
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });
});

describe('GET /tasks', () => {
  test('should return empty array when no tasks exist', async () => {
    const response = await request(app).get('/tasks');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(0);
  });

  test('should return all tasks', async () => {
    const testTasks = [
      { id: 1, title: 'Test Task 1', description: 'Description 1', completed: false, createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 2, title: 'Test Task 2', description: 'Description 2', completed: true, createdAt: '2024-01-02T00:00:00.000Z' }
    ];
    fs.writeFileSync(TEST_TASKS_FILE, JSON.stringify(testTasks, null, 2));

    const response = await request(app).get('/tasks');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toHaveProperty('id', 1);
    expect(response.body[0]).toHaveProperty('title', 'Test Task 1');
  });
});

describe('GET /tasks/:id', () => {
  beforeEach(() => {
    const testTasks = [
      { id: 1, title: 'Test Task 1', description: 'Description 1', completed: false, createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 2, title: 'Test Task 2', description: 'Description 2', completed: true, createdAt: '2024-01-02T00:00:00.000Z' }
    ];
    fs.writeFileSync(TEST_TASKS_FILE, JSON.stringify(testTasks, null, 2));
  });

  test('should return task by ID', async () => {
    const response = await request(app).get('/tasks/1');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', 1);
    expect(response.body).toHaveProperty('title', 'Test Task 1');
    expect(response.body).toHaveProperty('description', 'Description 1');
    expect(response.body).toHaveProperty('completed', false);
  });

  test('should return 400 for invalid task ID', async () => {
    const response = await request(app).get('/tasks/invalid');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('should return 404 when task not found', async () => {
    const response = await request(app).get('/tasks/999');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error', 'Task not found');
    expect(response.body).toHaveProperty('id', 999);
  });

  test('should return correct task when multiple exist', async () => {
    const response = await request(app).get('/tasks/2');

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(2);
    expect(response.body.title).toBe('Test Task 2');
    expect(response.body.completed).toBe(true);
  });
});

describe('POST /tasks', () => {
  test('should create a new task', async () => {
    const newTask = {
      title: 'New Task',
      description: 'Task description'
    };

    const response = await request(app)
      .post('/tasks')
      .send(newTask)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('title', 'New Task');
    expect(response.body).toHaveProperty('description', 'Task description');
    expect(response.body).toHaveProperty('completed', false);
    expect(response.body).toHaveProperty('createdAt');
  });

  test('should create task without description', async () => {
    const newTask = {
      title: 'Task without description'
    };

    const response = await request(app)
      .post('/tasks')
      .send(newTask);

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('title', 'Task without description');
    expect(response.body).toHaveProperty('description', '');
  });

  test('should trim title and description', async () => {
    const newTask = {
      title: '  Trimmed Title  ',
      description: '  Trimmed Description  '
    };

    const response = await request(app)
      .post('/tasks')
      .send(newTask);

    expect(response.status).toBe(201);
    expect(response.body.title).toBe('Trimmed Title');
    expect(response.body.description).toBe('Trimmed Description');
  });

  test('should return 400 when title is missing', async () => {
    const response = await request(app)
      .post('/tasks')
      .send({ description: 'Some description' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('should return 400 when title is empty string', async () => {
    const response = await request(app)
      .post('/tasks')
      .send({ title: '   ', description: 'Some description' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('should return 400 when title is not a string', async () => {
    const response = await request(app)
      .post('/tasks')
      .send({ title: 123, description: 'Some description' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('should return 400 when description is not a string', async () => {
    const response = await request(app)
      .post('/tasks')
      .send({ title: 'Valid title', description: 123 });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('should generate unique IDs', async () => {
    const task1 = { title: 'Task 1' };
    const task2 = { title: 'Task 2' };

    const response1 = await request(app).post('/tasks').send(task1);
    const response2 = await request(app).post('/tasks').send(task2);

    expect(response1.body.id).toBe(1);
    expect(response2.body.id).toBe(2);
  });
});

describe('PUT /tasks/:id', () => {
  beforeEach(() => {
    const testTasks = [
      { id: 1, title: 'Original Title', description: 'Original Description', completed: false, createdAt: '2024-01-01T00:00:00.000Z' }
    ];
    fs.writeFileSync(TEST_TASKS_FILE, JSON.stringify(testTasks, null, 2));
  });

  test('should update task title', async () => {
    const response = await request(app)
      .put('/tasks/1')
      .send({ title: 'Updated Title' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('title', 'Updated Title');
    expect(response.body).toHaveProperty('updatedAt');
  });

  test('should update task description', async () => {
    const response = await request(app)
      .put('/tasks/1')
      .send({ description: 'Updated Description' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('description', 'Updated Description');
    expect(response.body).toHaveProperty('updatedAt');
  });

  test('should update task completed status', async () => {
    const response = await request(app)
      .put('/tasks/1')
      .send({ completed: true });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('completed', true);
    expect(response.body).toHaveProperty('updatedAt');
  });

  test('should update multiple fields', async () => {
    const response = await request(app)
      .put('/tasks/1')
      .send({
        title: 'New Title',
        description: 'New Description',
        completed: true
      });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe('New Title');
    expect(response.body.description).toBe('New Description');
    expect(response.body.completed).toBe(true);
    expect(response.body).toHaveProperty('updatedAt');
  });

  test('should trim title and description', async () => {
    const response = await request(app)
      .put('/tasks/1')
      .send({
        title: '  Trimmed Title  ',
        description: '  Trimmed Description  '
      });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe('Trimmed Title');
    expect(response.body.description).toBe('Trimmed Description');
  });

  test('should return 400 for invalid task ID', async () => {
    const response = await request(app)
      .put('/tasks/invalid')
      .send({ title: 'New Title' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('should return 404 when task not found', async () => {
    const response = await request(app)
      .put('/tasks/999')
      .send({ title: 'New Title' });

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error', 'Task not found');
    expect(response.body).toHaveProperty('id', 999);
  });

  test('should return 400 when title is empty string', async () => {
    const response = await request(app)
      .put('/tasks/1')
      .send({ title: '   ' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('should return 400 when title is not a string', async () => {
    const response = await request(app)
      .put('/tasks/1')
      .send({ title: 123 });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('should return 400 when description is not a string', async () => {
    const response = await request(app)
      .put('/tasks/1')
      .send({ description: 123 });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('should return 400 when completed is not a boolean', async () => {
    const response = await request(app)
      .put('/tasks/1')
      .send({ completed: 'true' });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });
});

describe('DELETE /tasks/:id', () => {
  beforeEach(() => {
    const testTasks = [
      { id: 1, title: 'Task 1', description: 'Description 1', completed: false, createdAt: '2024-01-01T00:00:00.000Z' },
      { id: 2, title: 'Task 2', description: 'Description 2', completed: false, createdAt: '2024-01-02T00:00:00.000Z' }
    ];
    fs.writeFileSync(TEST_TASKS_FILE, JSON.stringify(testTasks, null, 2));
  });

  test('should delete task by ID', async () => {
    const response = await request(app).delete('/tasks/1');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', 'Task deleted successfully');
    expect(response.body).toHaveProperty('id', 1);

    const getResponse = await request(app).get('/tasks');
    expect(getResponse.body).toHaveLength(1);
    expect(getResponse.body[0].id).toBe(2);
  });

  test('should return 400 for invalid task ID', async () => {
    const response = await request(app).delete('/tasks/invalid');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });

  test('should return 404 when task not found', async () => {
    const response = await request(app).delete('/tasks/999');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error', 'Task not found');
    expect(response.body).toHaveProperty('id', 999);
  });

  test('should delete correct task when multiple exist', async () => {
    await request(app).delete('/tasks/1');

    const response = await request(app).get('/tasks');
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(2);
  });
});

describe('Integration tests', () => {
  test('should create, read, update and delete task', async () => {
    const newTask = { title: 'Integration Test Task', description: 'Test Description' };

    const createResponse = await request(app).post('/tasks').send(newTask);
    expect(createResponse.status).toBe(201);
    const taskId = createResponse.body.id;

    const getResponse = await request(app).get('/tasks');
    expect(getResponse.body).toHaveLength(1);
    expect(getResponse.body[0].id).toBe(taskId);

    const updateResponse = await request(app)
      .put(`/tasks/${taskId}`)
      .send({ completed: true });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.completed).toBe(true);

    const deleteResponse = await request(app).delete(`/tasks/${taskId}`);
    expect(deleteResponse.status).toBe(200);

    const finalGetResponse = await request(app).get('/tasks');
    expect(finalGetResponse.body).toHaveLength(0);
  });
});

