import { clearLocalSession } from './apiFetch';

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
  clearLocalSession();
}
