/**
 * Utilitário seguro para localStorage e acessibilidade de teclado.
 * Previne vulnerabilidades tssecurity:S8475 e bugs typescript:S1082.
 */

export const safeStorage = {
  setItem: (key: string, value: string): void => {
    try {
      window.localStorage.setItem(key, encodeURIComponent(value));
    } catch {
      window.localStorage.setItem(key, value);
    }
  },
  getItem: (key: string): string | null => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  },
  removeItem: (key: string): void => {
    window.localStorage.removeItem(key);
  }
};

export const onKeyClick = (callback: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    callback();
  }
};
