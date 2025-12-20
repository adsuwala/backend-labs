const request = require('supertest');

jest.mock('./supabase', () => {
  const auth = {
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    getUser: jest.fn()
  };

  return {
    from: jest.fn(),
    auth
  };
});

const supabase = require('./supabase');

let app;

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
      data: { user: { id: 'user-1', email: 'test@example.com' } },
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
    expect(response.body.user).toEqual({ id: 'user-1', email: 'test@example.com' });
  });

  test('POST /auth/login should return a token', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: { access_token: 'token-123' },
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
      token: 'token-123',
      user: { id: 'user-1', email: 'test@example.com' }
    });
  });
});

describe('Task routes', () => {
  const authorizeRequest = () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'test@example.com' } },
      error: null
    });
  };

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
    const task = { id: 'uuid-1', title: 'Single', completed: false };
    const chain = buildSingleQueryChain({ data: task, error: null });
    supabase.from.mockReturnValue(chain);

    const response = await request(app)
      .get('/tasks/uuid-1')
      .set('Authorization', 'Bearer token-123');

    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('id', 'uuid-1');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
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
      .get('/tasks/missing')
      .set('Authorization', 'Bearer token-123');

    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error', 'Task not found');
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
    const createdTask = { id: 'uuid-1', title: 'New Task', completed: false };

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
    const updatedTask = { id: 'uuid-1', title: 'Task', completed: true };

    const chain = {};
    const singleMock = jest.fn().mockResolvedValue({ data: updatedTask, error: null });
    chain.eq = jest.fn(() => chain);
    chain.select = jest.fn(() => chain);
    chain.single = singleMock;
    const updateMock = jest.fn(() => chain);

    supabase.from.mockReturnValue({
      update: updateMock
    });

    const response = await request(app)
      .patch('/tasks/uuid-1')
      .set('Authorization', 'Bearer token-123')
      .send({ completed: true });

    expect(updateMock).toHaveBeenCalledWith({ completed: true });
    expect(chain.eq).toHaveBeenCalledWith('id', 'uuid-1');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(updatedTask);
  });

  test('DELETE /tasks/:id should delete task', async () => {
    authorizeRequest();
    const chain = {};
    const singleMock = jest.fn().mockResolvedValue({ data: { id: 'uuid-1' }, error: null });
    chain.eq = jest.fn(() => chain);
    chain.select = jest.fn(() => chain);
    chain.single = singleMock;
    const deleteMock = jest.fn(() => chain);

    supabase.from.mockReturnValue({
      delete: deleteMock
    });

    const response = await request(app)
      .delete('/tasks/uuid-1')
      .set('Authorization', 'Bearer token-123');

    expect(deleteMock).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', 'uuid-1');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });
});
