import { useState } from 'react';

export function ReauthenticationAction({ label, onConfirm }: {
  label: string;
  onConfirm: (proof: { senha_atual: string; codigo_2fa: string }) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
    <label>Senha atual
      <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
    </label>
    <label>Código de segundo fator, se configurado
      <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value)} />
    </label>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="btn-primary" disabled={busy || !password} onClick={async () => {
      setBusy(true); setError('');
      try { await onConfirm({ senha_atual: password, codigo_2fa: code }); }
      catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível concluir a operação.'); }
      finally { setPassword(''); setCode(''); setBusy(false); }
    }}>{busy ? 'Confirmando…' : label}</button>
  </div>;
}
