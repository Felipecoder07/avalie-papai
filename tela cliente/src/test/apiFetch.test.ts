import { beforeEach, expect, it, vi } from 'vitest';
import { apiFetch, discardLegacyCredentials, logout } from '../utils/apiFetch';

beforeEach(() => { localStorage.clear(); document.cookie = 'cm_csrf=proof; path=/'; });
it('sends cookies and CSRF without forwarding a legacy bearer', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  await apiFetch('/api/clientes', { method:'POST', headers:{Authorization:'Bearer old'} });
  const init = fetch.mock.calls[0][1];
  expect(init.credentials).toBe('same-origin');
  expect(init.headers.get('x-csrf-token')).toBe('proof');
  expect(init.headers.has('authorization')).toBe(false);
});
it.each([401,403])('invalidates local session only for expired authentication (%s)', async status => {
  localStorage.setItem('courtmanager_user','profile');
  const listener = vi.fn();
  window.addEventListener('cm:session-expired',listener);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status})));
  const response = await apiFetch('/api/clientes');
  expect(response.status).toBe(status);
  expect(listener).toHaveBeenCalledTimes(status===401 ? 1 : 0);
  expect(localStorage.getItem('courtmanager_user')).toBe(status===401 ? null : 'profile');
  window.removeEventListener('cm:session-expired',listener);
});
it('keeps login errors on their form and blocks cross-origin API configuration', async () => {
  const listener=vi.fn();window.addEventListener('cm:session-expired',listener);
  const fetch=vi.fn().mockResolvedValue(new Response('{}',{status:401}));vi.stubGlobal('fetch',fetch);
  await apiFetch('/api/auth/login',{method:'POST'});
  expect(listener).not.toHaveBeenCalled();
  await expect(apiFetch('https://other.example/api/clientes')).rejects.toThrow('proxy');
  expect(fetch).toHaveBeenCalledTimes(1);
  window.removeEventListener('cm:session-expired',listener);
});
it('removes every old marker and only reports logout after server revocation', async () => {
  for(const key of ['courtmanager_token','atleta_token','courtmanager_athlete_token']) localStorage.setItem(key,'session');
  discardLegacyCredentials();
  expect(localStorage.length).toBe(0);
  localStorage.setItem('courtmanager_user','profile');
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));
  await expect(logout()).rejects.toThrow('offline');
  expect(localStorage.getItem('courtmanager_user')).toBe('profile');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}')));
  await logout();
  expect(localStorage.getItem('courtmanager_user')).toBeNull();
});
