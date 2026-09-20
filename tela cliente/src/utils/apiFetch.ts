// Session credentials are HttpOnly cookies. No bearer credential is read from storage.
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  if (!url.pathname.startsWith('/api/')) return globalThis.fetch(input,init);
  if (url.origin !== window.location.origin) throw new Error('A API deve usar o proxy da mesma origem.');
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value,key)=>headers.set(key,value));
  headers.delete('Authorization');
  const cookies = Object.fromEntries(document.cookie.split(';').map(v=>v.trim().split('=')));
  if(cookies.cm_csrf) headers.set('x-csrf-token',cookies.cm_csrf);
  if(cookies.cm_guest_csrf) headers.set('x-guest-csrf',cookies.cm_guest_csrf);
  const response = await globalThis.fetch(input,{...init,headers,credentials:'same-origin'});
  // Invalid login/password proof must remain on its form. 403 means forbidden,
  // not an expired session, and must never sign out a valid user.
  if (response.status === 401 && !/\/(login|google|register|cadastro|esqueci-senha|redefinir-senha|forgot-password|reset-password)$/.test(url.pathname)) {
    clearLocalSession();
    window.dispatchEvent(new Event('cm:session-expired'));
  }
  return response;
}
export function discardLegacyCredentials() {
  for(const key of ['courtmanager_token','atleta_token','courtmanager_athlete_token','atleta_session']) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }
}
export function clearLocalSession() {
  discardLegacyCredentials();
  for (const key of ['courtmanager_user','athlete_profile']) {
    try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }
}
export async function logout() {
  const response = await apiFetch('/api/auth/logout', { method: 'POST' });
  if (!response.ok && response.status !== 401) throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
  clearLocalSession();
}
