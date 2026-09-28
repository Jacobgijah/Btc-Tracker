import { describe, it, expect } from 'vitest';
import { setupApi } from '../helpers/api.js';

const api = setupApi();

/** Promotes the default test user (created by setupApi) to ADMIN. */
async function asAdmin() {
  await api.prisma.user.update({ where: { id: api.state.user.id }, data: { role: 'ADMIN' } });
  return api;
}

describe('admin user management', () => {
  it('creates a user with default settings and lists it', async () => {
    const admin = await asAdmin();

    const created = await admin.post('/admin/users', { email: 'new@example.com', password: 'a-strong-password' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ email: 'new@example.com', role: 'USER', isActive: true });

    const settings = await api.prisma.setting.findMany({ where: { userId: created.body.id } });
    expect(settings.map((s) => s.key).sort()).toEqual(['costMethod', 'displayCurrency']);

    const list = await admin.get('/admin/users');
    expect(list.status).toBe(200);
    expect(list.body.map((u) => u.email)).toEqual(expect.arrayContaining(['new@example.com', admin.state.user.email]));
  });

  it('rejects creating a user with a duplicate email', async () => {
    const admin = await asAdmin();
    await admin.post('/admin/users', { email: 'dup@example.com', password: 'a-strong-password' });
    const res = await admin.post('/admin/users', { email: 'dup@example.com', password: 'another-password' });
    expect(res.status).toBe(409);
  });

  it('deactivates and reactivates a user', async () => {
    const admin = await asAdmin();
    const created = await admin.post('/admin/users', { email: 'flip@example.com', password: 'a-strong-password' });

    const deactivated = await admin.patch(`/admin/users/${created.body.id}`, { isActive: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.isActive).toBe(false);

    const login = await api.anon().post('/auth/login').send({ email: 'flip@example.com', password: 'a-strong-password' });
    expect(login.status).toBe(401);

    const reactivated = await admin.patch(`/admin/users/${created.body.id}`, { isActive: true });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.isActive).toBe(true);
  });

  it('resets a user password', async () => {
    const admin = await asAdmin();
    const created = await admin.post('/admin/users', { email: 'reset@example.com', password: 'original-password' });

    const res = await admin.post(`/admin/users/${created.body.id}/reset-password`, { password: 'brand-new-password' });
    expect(res.status).toBe(204);

    const badLogin = await api.anon().post('/auth/login').send({ email: 'reset@example.com', password: 'original-password' });
    expect(badLogin.status).toBe(401);

    const goodLogin = await api.anon().post('/auth/login').send({ email: 'reset@example.com', password: 'brand-new-password' });
    expect(goodLogin.status).toBe(200);
  });

  it('refuses to deactivate or demote the last active admin', async () => {
    const admin = await asAdmin();

    const deactivate = await admin.patch(`/admin/users/${admin.state.user.id}`, { isActive: false });
    expect(deactivate.status).toBe(422);

    const demote = await admin.patch(`/admin/users/${admin.state.user.id}`, { role: 'USER' });
    expect(demote.status).toBe(422);
  });

  it('allows deactivating an admin when another active admin remains', async () => {
    const admin = await asAdmin();
    const otherAdmin = await admin.post('/admin/users', { email: 'second-admin@example.com', password: 'a-strong-password', role: 'ADMIN' });

    const res = await admin.patch(`/admin/users/${otherAdmin.body.id}`, { isActive: false });
    expect(res.status).toBe(200);
  });
});
