import { describe, it, expect } from 'vitest';
import { setupApi, TEST_EMAIL, TEST_PASSWORD } from '../helpers/api.js';

const api = setupApi();

describe('self password change', () => {
  it('changes the password and the new one works at login', async () => {
    const res = await api.patch('/auth/password', {
      currentPassword: TEST_PASSWORD,
      newPassword: 'a-brand-new-password',
    });
    expect(res.status).toBe(204);

    const oldLogin = await api.anon().post('/auth/login').send({ email: TEST_EMAIL, password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await api.anon().post('/auth/login').send({ email: TEST_EMAIL, password: 'a-brand-new-password' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects the wrong current password', async () => {
    const res = await api.patch('/auth/password', {
      currentPassword: 'not-the-right-password',
      newPassword: 'a-brand-new-password',
    });
    expect(res.status).toBe(401);
  });

  it('rejects a new password that is too short', async () => {
    const res = await api.patch('/auth/password', { currentPassword: TEST_PASSWORD, newPassword: 'short' });
    expect(res.status).toBe(400);
  });
});
