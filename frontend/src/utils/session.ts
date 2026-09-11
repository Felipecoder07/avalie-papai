import { safeStorage } from './safeStorage';

export interface SessionUser {
  id?: string | number;
  nome?: string;
  perfil: string;
  [key: string]: unknown;
}

function parseStoredUser(raw: string): unknown {
  try {
    // Older sessions stored plain JSON. Parse it first to preserve literal % escapes.
    return JSON.parse(raw);
  } catch {
    return JSON.parse(decodeURIComponent(raw));
  }
}

export function getStoredUser(): SessionUser | null {
  try {
    const raw = window.localStorage.getItem('courtmanager_user');
    if (!raw) return null;
    const user = parseStoredUser(raw);
    if (!user || typeof user !== 'object' || Array.isArray(user)) return null;
    const record = user as Record<string, unknown>;
    if (typeof record.perfil !== 'string') return null;
    if (record.nome !== undefined && typeof record.nome !== 'string') return null;
    if (record.id !== undefined && typeof record.id !== 'string' && typeof record.id !== 'number') return null;
    return record as SessionUser;
  } catch {
    // An unreadable session must not crash rendering or grant access to a role.
    return null;
  }
}

export function clearSession(): void {
  safeStorage.removeItem('courtmanager_token');
  safeStorage.removeItem('courtmanager_user');
}

export function restoreRemoteLogin(): void {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  const urlUser = params.get('user');
  if (!urlToken || !urlUser) return;

  const sanitizedToken = urlToken.replace(/[^a-zA-Z0-9._-]/g, '').trim();
  safeStorage.setItem('courtmanager_token', sanitizedToken);
  try {
    const decodedUser = decodeURIComponent(atob(urlUser)).replace(/[<>\0]/g, '');
    safeStorage.setItem('courtmanager_user', decodedUser);
  } catch {
    safeStorage.removeItem('courtmanager_user');
  }
  window.history.replaceState({}, document.title, window.location.pathname);
}
