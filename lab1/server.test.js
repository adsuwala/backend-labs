const request = require('supertest');

jest.mock('./supabase', () => {
  const auth = {
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    getUser: jest.fn()
  };

  return {
    from: jest.fn(),
    auth,
    admin: {
      auth: {
        admin: {
          deleteUser: jest.fn()
        }
      }
    }
  };
});

const supabase = require('./supabase');

let app;

const VALID_TASK_ID = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_TASK_ID = '550e8400-e29b-41d4-a716-446655440002';
const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440000';

const buildListQueryChain = ({ data = [], count = data.length, error = null } = {}) => {
  const chain = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.gte = jest.fn(() => chain);
  chain.lte = jest.fn(() => chain);
  chain.order = jest.fn(() => chain);
  chain.range = jest.fn().mockResolvedValue({ data, count, error });
  chain.then = jest.fn((resolve, reject) =>
    Promise.resolve({ data, error }).then(resolve, reject)
  );
  return chain;
};

const buildSingleQueryChain = ({ data, error } = {}) => {
  const chain = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.single = jest.fn().mockResolvedValue({ data, error });
  return chain;
};

const authorizeRequest = ({ userId = 'user-1', email = 'test@example.com' } = {}) => {
  supabase.auth.getUser.mockResolvedValue({
    data: { user: { id: userId, email } },
    error: null
  });
};

const loadServer = () => {
  delete require.cache[require.resolve('./server')];
  delete require.cache[require.resolve('./routes/auth')];
  delete require.cache[require.resolve('./routes/tasks')];
  delete require.cache[require.resolve('./middleware/auth')];
  app = require('./server');
};

beforeEach(() => {
  jest.clearAllMocks();
  loadServer();
});

describe('Base routes', () => {
  test('GET / should return API information', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message');
    expect(response.body.endpoints).toHaveProperty('POST /auth/login');
  });

  test('GET /health should return OK status', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'OK',
        timestamp: expect.any(String)
      })
    );
  });
});

describe('Auth routes', () => {
  test('POST /auth/register should register a user', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          created_at: '2024-01-01T00:00:00Z'
        }
      },
      error: null
    });

    const response = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'Password123!' });

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'Password123!'
    });
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('message', 'User created');
    expect(response.body.user).toEqual({
      id: 'user-1',
      email: 'test@example.com',
      role: 'user',
      created_at: '2024-01-01T00:00:00Z'
    });
  });

  test('POST /auth/login should return a token', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: { access_token: 'header.eyJ1c2VyX3JvbGUiOiJhZG1pbiJ9.signature' },
        user: { id: 'user-1', email: 'test@example.com' }
      },
      error: null
    });

    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'Password123!' });

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'Password123!'
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      token: 'header.eyJ1c2VyX3JvbGUiOiJhZG1pbiJ9.signature',
      user: { id: 'user-1', email: 'test@example.com', role: 'admin' }
    });
  });
});

describe('Task routes', () => {

  test('GET /tasks should require authorization', async () => {
    const response = await request(app).get('/tasks');
    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('GET /tasks should return Supabase data without pagination when no limit provided', async () => {
    authorizeRequest();
    const tasks = [
      { id: '1', title: 'Task A', completed: false },
      { id: '2', title: 'Task B', completed: true }
    ];
    const chain = buildListQueryChain({ data: tasks });
    supabase.from.mockReturnValue(chain);

    const response = await request(app)
      .get('/tasks')
      .set('Authorization', 'Bearer token-123');

    expect(chain.range).not.toHaveBeenCalled();
    expect(chain.then).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(tasks);
    expect(response.headers['x-total-count']).toBeUndefined();
  });

  test('GET /tasks should return paginated data when limit provided', async () => {
    authorizeRequest();
    const tasks = [
      { id: '1', title: 'Task A', completed: false },
      { id: '2', title: 'Task B', completed: true }
    ];
    const chain = buildListQueryChain({ data: tasks, count: 2 });
    supabase.from.mockReturnValue(chain);

    const response = await request(app)
      .get('/tasks?page=1&limit=2&sort=createdAt')
      .set('Authorization', 'Bearer token-123');

    expect(chain.select).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(chain.range).toHaveBeenCalledWith(0, 1);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(tasks);
    expect(response.headers['x-total-count']).toBe('2');
    expect(response.headers['x-page']).toBe('1');
    expect(response.headers['x-limit']).toBe('2');
  });

  test('GET /tasks should filter by completion flag', async () => {
    authorizeRequest();
    const chain = buildListQueryChain({ data: [], count: 0 });
    supabase.from.mockReturnValue(chain);

    const response = await request(app)
      .get('/tasks?completed=true')
      .set('Authorization', 'Bearer token-123');

    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(chain.eq).toHaveBeenCalledWith('completed', true);
    expect(response.status).toBe(200);
  });

  test('GET /tasks should require limit when page is provided', async () => {
    authorizeRequest();

    const response = await request(app)
      .get('/tasks?page=2')
      .set('Authorization', 'Bearer token-123');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Limit must be provided when using page');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('GET /tasks should return 400 for invalid completed filter', async () => {
    authorizeRequest();

    const response = await request(app)
      .get('/tasks?completed=maybe')
      .set('Authorization', 'Bearer token-123');

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Completed must be true or false');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('GET /tasks should filter by created date range', async () => {
    authorizeRequest();
    const chain = buildListQueryChain({ data: [], count: 0 });
    supabase.from.mockReturnValue(chain);

    await request(app)
      .get('/tasks?createdFrom=2024-01-01&createdTo=2024-01-31')
      .set('Authorization', 'Bearer token-123');

    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(chain.gte).toHaveBeenCalledWith('created_at', new Date('2024-01-01').toISOString());
    expect(chain.lte).toHaveBeenCalledWith('created_at', new Date('2024-01-31').toISOString());
  });

  test('GET /tasks/:id should return single task', async () => {
    authorizeRequest();
    const task = { id: VALID_TASK_ID, title: 'Single', completed: false, user_id: 'user-1' };
    const chain = buildSingleQueryChain({ data: task, error: null });
    supabase.from.mockReturnValue(chain);

    const response = await request(app)
      .get(`/tasks/${VALID_TASK_ID}`)
      .set('Authorization', 'Bearer token-123');

    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('id', VALID_TASK_ID);
    expect(chain.single).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.body).toEqual(task);
  });

  test('GET /tasks/:id should return 404 when not found', async () => {
    authorizeRequest();
    const chain = buildSingleQueryChain({
      data: null,
      error: { code: 'PGRST116', message: 'Not found' }
    });
    supabase.from.mockReturnValue(chain);

    const response = await request(app)
      .get('/tasks/660e8400-e29b-41d4-a716-446655440099')
      .set('Authorization', 'Bearer token-123');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error', 'Task not found');
  });

  test('GET /tasks/:id should return 403 when user does not own the task', async () => {
    authorizeRequest();
    const task = { id: VALID_TASK_ID, title: 'Other', completed: false, user_id: 'user-2' };
    const chain = buildSingleQueryChain({ data: task, error: null });
    supabase.from.mockReturnValue(chain);

    const response = await request(app)
      .get(`/tasks/${VALID_TASK_ID}`)
      .set('Authorization', 'Bearer token-123');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Access denied' });
  });

  test('POST /tasks should validate payload', async () => {
    authorizeRequest();
    const response = await request(app)
      .post('/tasks')
      .set('Authorization', 'Bearer token-123')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Title is required');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('POST /tasks should create task in Supabase', async () => {
    authorizeRequest();
    const createdTask = { id: VALID_TASK_ID, title: 'New Task', completed: false };

    const singleMock = jest.fn().mockResolvedValue({ data: createdTask, error: null });
    const selectMock = jest.fn().mockReturnValue({ single: singleMock });
    const insertMock = jest.fn().mockReturnValue({ select: selectMock });

    supabase.from.mockReturnValue({
      insert: insertMock
    });

    const response = await request(app)
      .post('/tasks')
      .set('Authorization', 'Bearer token-123')
      .send({ title: ' New Task ' });

    expect(insertMock).toHaveBeenCalledWith({ title: 'New Task', user_id: 'user-1' });
    expect(singleMock).toHaveBeenCalled();
    expect(response.status).toBe(201);
    expect(response.body).toEqual(createdTask);
  });

  test('PATCH /tasks/:id should update completion flag', async () => {
    authorizeRequest();
    const updatedTask = { id: VALID_TASK_ID, title: 'Task', completed: true };

    const fetchChain = buildSingleQueryChain({
      data: { id: VALID_TASK_ID, user_id: 'user-1', completed: false },
      error: null
    });
    const updateChain = buildSingleQueryChain({ data: updatedTask, error: null });
    const updateMock = jest.fn(() => updateChain);

    supabase.from
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce({ update: updateMock });

    const response = await request(app)
      .patch(`/tasks/${VALID_TASK_ID}`)
      .set('Authorization', 'Bearer token-123')
      .send({ completed: true });

    expect(updateMock).toHaveBeenCalledWith({ completed: true });
    expect(fetchChain.eq).toHaveBeenCalledWith('id', VALID_TASK_ID);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedTask);
  });

  test('PATCH /tasks/:id should return 403 when updating foreign task', async () => {
    authorizeRequest();
    const fetchChain = buildSingleQueryChain({
      data: { id: VALID_TASK_ID, user_id: 'user-2', completed: false },
      error: null
    });

    supabase.from.mockReturnValueOnce(fetchChain);

    const response = await request(app)
      .patch(`/tasks/${VALID_TASK_ID}`)
      .set('Authorization', 'Bearer token-123')
      .send({ completed: true });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Access denied' });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  test('DELETE /tasks/:id should delete task', async () => {
    authorizeRequest();
    const fetchChain = buildSingleQueryChain({
      data: { id: VALID_TASK_ID, user_id: 'user-1' },
      error: null
    });

    const deleteChain = {
      eq: jest.fn(() => Promise.resolve({ error: null }))
    };
    const deleteMock = jest.fn(() => deleteChain);

    supabase.from
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce({ delete: deleteMock });

    const response = await request(app)
      .delete(`/tasks/${VALID_TASK_ID}`)
      .set('Authorization', 'Bearer token-123');

    expect(deleteMock).toHaveBeenCalled();
    expect(fetchChain.eq).toHaveBeenCalledWith('id', VALID_TASK_ID);
    expect(deleteChain.eq).toHaveBeenCalledWith('id', VALID_TASK_ID);
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  test('DELETE /tasks/:id should return 403 when removing foreign task', async () => {
    authorizeRequest();
    const fetchChain = buildSingleQueryChain({
      data: { id: VALID_TASK_ID, user_id: 'user-2' },
      error: null
    });
    supabase.from.mockReturnValueOnce(fetchChain);

    const response = await request(app)
      .delete(`/tasks/${VALID_TASK_ID}`)
      .set('Authorization', 'Bearer token-123');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Access denied' });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
});

describe('Admin routes', () => {
  const adminToken = 'Bearer header.eyJ1c2VyX3JvbGUiOiJhZG1pbiJ9.signature';

  test('GET /admin/users should reject non-admins', async () => {
    authorizeRequest();

    const response = await request(app)
      .get('/admin/users')
      .set('Authorization', 'Bearer token-123');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Admin access required' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test('GET /admin/users should return user list for admins', async () => {
    authorizeRequest({ userId: ADMIN_ID, email: 'admin@example.com' });
    const users = [
      { id: 'u1', email: 'one@example.com', role: 'user', created_at: '2024-01-01' }
    ];
    const chain = buildListQueryChain({ data: users, error: null });
    supabase.from.mockReturnValue(chain);

    const response = await request(app)
      .get('/admin/users')
      .set('Authorization', adminToken);

    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(chain.select).toHaveBeenCalledWith('id,email,role,created_at');
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(users);
  });

  test('DELETE /admin/users/:id should delete users via Supabase admin API', async () => {
    authorizeRequest({ userId: ADMIN_ID, email: 'admin@example.com' });
    const fetchChain = buildSingleQueryChain({
      data: { id: '550e8400-e29b-41d4-a716-446655440000' },
      error: null
    });
    supabase.from.mockReturnValueOnce(fetchChain);
    supabase.admin.auth.admin.deleteUser.mockResolvedValue({ error: null });

    const response = await request(app)
      .delete('/admin/users/550e8400-e29b-41d4-a716-446655440000')
      .set('Authorization', adminToken);

    expect(response.status).toBe(204);
    expect(supabase.admin.auth.admin.deleteUser).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000'
    );
  });
});
