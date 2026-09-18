// Session credentials are HttpOnly cookies. No bearer credential is read from storage.
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  const apiOrigin = new URL(import.meta.env.VITE_BACKEND_URL || window.location.origin, window.location.origin).origin;
  if (!url.pathname.startsWith('/api/') || ![window.location.origin,apiOrigin].includes(url.origin)) return globalThis.fetch(input,init);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value,key)=>headers.set(key,value));
  headers.delete('Authorization');
  const cookies = Object.fromEntries(document.cookie.split(';').map(v=>v.trim().split('=')));
  if(cookies.cm_csrf) headers.set('x-csrf-token',cookies.cm_csrf);
  if(cookies.cm_guest_csrf) headers.set('x-guest-csrf',cookies.cm_guest_csrf);
  return globalThis.fetch(input,{...init,headers,credentials:'include'});
}
export function discardLegacyCredentials() {
  for(const key of ['courtmanager_token','atleta_token','courtmanager_athlete_token']) {
    try { if(localStorage.getItem(key)!=='session') localStorage.removeItem(key); } catch { /* storage unavailable */ }
  }
}
