import { apiFetch as fetch } from '../../utils/apiFetch';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldCheck, Lock, ArrowLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { Card, Button, Input, Field } from '../../components/ui';

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const loginPath = window.location.port === '5174' ? '/master-login' : '/login';

  const [password, setPassword] = useState('');
  const [factor, setFactor] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!password || !confirmPassword) {
      setErrorMsg('Por favor, preencha todos os campos.');
      return;
    }

    if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
      setErrorMsg('A senha deve ter no mínimo 8 caracteres e no máximo 72 bytes.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('As senhas digitadas não coincidem.');
      return;
    }

    if (!token) {
      setErrorMsg('Token de recuperação inválido ou ausente. Por favor, solicite um novo link por e-mail.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, novaSenha: password, codigo_2fa: factor })
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erro ao redefinir a senha.');

      setSubmitted(true);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        {/* Logo / Header */}
        <div className="login-logo">
          <div className="brand-icon">CM</div>
          <span className="brand-name">CourtManager</span>
        </div>

        {/* Estado do Formulário */}
        {!submitted ? (
          <div className="login-card shadow-lg" id="form-card">
            <h1 className="login-title">Redefinir senha</h1>
            <p className="login-sub">Escolha uma nova senha forte para acessar sua conta.</p>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <Field label="Código do autenticador (conta master)"><Input value={factor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFactor(e.target.value)} autoComplete="one-time-code" /></Field>
              {errorMsg && (
                <div className="login-error-alert" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>{errorMsg}</span>
                </div>
              )}

              <Field label="Nova senha">
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e: any) => { setPassword(e.target.value); setErrorMsg(''); }}
                    placeholder="••••••••"
                    style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted/60">
                    <Lock size={15} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-charcoal focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>

              <Field label="Confirmar nova senha">
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e: any) => { setConfirmPassword(e.target.value); setErrorMsg(''); }}
                    placeholder="••••••••"
                    style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                  />
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted/60">
                    <Lock size={15} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-charcoal focus:outline-none"
                  >
                    {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>

              <button
                type="submit"
                className="btn-primary btn-full"
                style={{ marginTop: 'var(--s-5)', cursor: 'pointer' }}
                disabled={loading}
              >
                {loading ? 'Alterando...' : 'Alterar Senha'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 'var(--s-5)' }}>
              <Link
                to={loginPath}
                style={{ fontSize: '14px', color: 'var(--charcoal)', textDecoration: 'none', fontWeight: 500 }}
              >
                &larr; Voltar para o login
              </Link>
            </div>
          </div>
        ) : (
          /* Estado de Sucesso */
          <div className="login-card shadow-lg" id="success-card" style={{ display: 'block', textAlign: 'center' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                background: 'var(--charcoal-04)',
                color: 'var(--charcoal)',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: '20px',
                margin: '0 auto var(--s-4)',
              }}
            >
              ✓
            </div>
            <h1 className="login-title">Senha alterada!</h1>
            <p className="login-sub" style={{ marginBottom: 'var(--s-6)' }}>
              Sua senha foi redefinida com sucesso. Você já pode acessar sua conta com a nova credencial.
            </p>

            <Link
              to={loginPath}
              className="btn-ghost btn-full"
              style={{ textDecoration: 'none', display: 'inline-flex', justifyContent: 'center' }}
            >
              Ir para o login
            </Link>
          </div>
        )}

        <p className="login-footer-text">
          CourtManager &copy; 2026 — Gestão de arenas esportivas
        </p>
      </div>
    </div>
  );
}
