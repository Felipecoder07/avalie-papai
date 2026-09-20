import { describe, expect, it } from 'vitest';
import { clearSession, getStoredUser } from '../src/utils/session';
import { safeStorage } from '../src/utils/safeStorage';

const user = { id: 7, nome: 'João %20 Silva', perfil: 'Administrador', cliente_id: 11 };

describe('persisted sessions', () => {
  it('reads the encoded user written by the login and session guards', () => {
    safeStorage.setItem('courtmanager_user', JSON.stringify(user));
    expect(getStoredUser()).toEqual(user);
  });

  it('reads legacy plain JSON without interpreting percent escapes in names', () => {
    localStorage.setItem('courtmanager_user', JSON.stringify(user));
    expect(getStoredUser()).toEqual(user);
  });

  it.each(['', '%broken', '{bad', 'null', '42', '[]', '{}', '{"perfil":7}', '{"perfil":"Administrador","nome":42}', '{"perfil":"Administrador","id":{}}'])('rejects malformed session %s without throwing', (raw) => {
    localStorage.setItem('courtmanager_user', raw);
    expect(getStoredUser()).toBeNull();
  });

  it('returns no user when the session is absent', () => {
    expect(getStoredUser()).toBeNull();
  });

  it('clears authentication without removing unrelated preferences', () => {
    safeStorage.setItem('courtmanager_user', JSON.stringify(user));
    safeStorage.setItem('courtmanager_token', 'token');
    localStorage.setItem('theme', 'dark');
    clearSession();
    expect(getStoredUser()).toBeNull();
    expect(safeStorage.getItem('courtmanager_token')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('ignores credentials supplied in the URL', () => {
    window.history.replaceState({}, '', '/master/dashboard?token=forged&user=forged');
    expect(getStoredUser()).toBeNull();
    expect(safeStorage.getItem('courtmanager_token')).toBeNull();
  });
});
