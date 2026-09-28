import { describe, it, expect } from 'vitest';
import { setupApi, TEST_EMAIL, TEST_PASSWORD } from '../helpers/api.js';

const api = setupApi();

const PROTECTED = [
  ['get', '/auth/me'],
  ['get', '/transactions'],
  ['get', '/transactions/1'],
  ['post', '/transactions'],
  ['patch', '/transactions/1'],
  ['delete', '/transactions/1'],
  ['get', '/portfolio/summary'],
  ['get', '/portfolio/ledger'],
  ['get', '/portfolio/history'],
  ['get', '/portfolio/monthly'],
  ['get', '/settings'],
  ['patch', '/settings'],
  ['get', '/prices/latest'],
  ['post', '/prices/refresh'],
  ['get', '/prices/history'],
  ['get', '/prices/fx?date=2026-01-10'],
  ['patch', '/auth/password'],
  ['get', '/admin/users'],
  ['post', '/admin/users'],
  ['patch', '/admin/users/1'],
  ['post', '/admin/users/1/reset-password'],
];

const ADMIN_ONLY = [
  ['get', '/admin/users'],
  ['post', '/admin/users'],
  ['patch', '/admin/users/1'],
  ['post', '/admin/users/1/reset-password'],
];

describe('auth guard', () => {
  it.each(PROTECTED)('%s %s -> 401 without a token', async (method, url) => {
    const res = await api.anon()[method](url);
    expect(res.status).toBe(401);
  });

  it.each(PROTECTED)('%s %s -> 401 with a bad token', async (method, url) => {
    const res = await api.anon()[method](url).set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  it('a token from /auth/login works on protected routes', async () => {
    const login = await api.anon().post('/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(login.status).toBe(200);

    const res = await api.anon().get('/settings').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
  });

  it.each(ADMIN_ONLY)('%s %s -> 403 for a non-admin user', async (method, url) => {
    const res = await api[method](url);
    expect(res.status).toBe(403);
  });

  it('a deactivated user is rejected even with a previously valid token', async () => {
    await api.prisma.user.update({ where: { id: api.state.user.id }, data: { isActive: false } });
    const res = await api.get('/settings');
    expect(res.status).toBe(401);
  });
});
