import { useState } from 'react';
import { apiFetch } from '../utils/apiFetch';

export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return <>
    <button type="button" onClick={() => { setOpen(true); setMessage(''); }}>Alterar minha senha</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form role="dialog" aria-modal="true" aria-label="Alterar minha senha" className="bg-white p-6 rounded-xl space-y-4" onSubmit={async e => {
        e.preventDefault();
        if (new TextEncoder().encode(password).length > 72) { setMessage('Use no máximo 72 bytes na senha.'); return; }
        setBusy(true); setMessage('');
        try {
          const response = await apiFetch('/api/auth/alterar-senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha_atual: current, nova_senha: password }) });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Não foi possível alterar a senha.');
          setCurrent(''); setPassword(''); setMessage(data.message);
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); }
        finally { setBusy(false); }
      }}>
        <label className="block">Senha atual<input className="block border rounded p-2" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} /></label>
        <label className="block">Nova senha<input className="block border rounded p-2" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <p className="text-sm">Pelo menos 8 caracteres, até 72 bytes. As outras sessões serão encerradas.</p>
        {message && <p role="status">{message}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Salvando...' : 'Salvar senha'}</button>
        <button type="button" disabled={busy} onClick={() => { setOpen(false); setCurrent(''); setPassword(''); }}>Fechar</button>
      </form>
    </div>}
  </>;
}
