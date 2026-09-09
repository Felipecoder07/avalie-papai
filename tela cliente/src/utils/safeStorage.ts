/**
 * Cliente local storage helper with URI encoding to sanitize stored session data.
 */
class ClientSessionStorage {
  private static encode(val: string): string {
    return encodeURIComponent(val);
  }

  public setItem(name: string, payload: string): void {
    const sanitized = ClientSessionStorage.encode(payload);
    window.localStorage.setItem(name, sanitized);
  }

  public getItem(name: string): string | null {
    const rawVal = window.localStorage.getItem(name);
    return rawVal ? decodeURIComponent(rawVal) : null;
  }

  public removeItem(name: string): void {
    window.localStorage.removeItem(name);
  }
}

export const safeStorage = new ClientSessionStorage();
