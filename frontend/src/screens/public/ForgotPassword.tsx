import { errorMessage } from '../../utils/errorMessage';
import { apiFetch as fetch } from '../../utils/apiFetch';
import { useState } from 'react';
import { Link } from 'react-router-dom';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erro ao processar solicitação.');

      setSubmitted(true);
    } catch (err) {
      setErrorMsg(errorMessage(err));
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
            <h1 className="login-title">Recuperar senha</h1>
            {errorMsg && (
              <div style={{ color: 'red', fontSize: '14px', marginBottom: '15px', backgroundColor: '#FFF5F5', border: '1px solid #FEB2B2', padding: '10px', borderRadius: '5px', textAlign: 'center' }}>
                {errorMsg}
              </div>
            )}

            <form id="recover-form" onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="email">E-mail cadastrado</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  placeholder="seu@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn-primary btn-full"
                id="btn-recover"
                style={{ marginTop: 'var(--s-4)' }}
                disabled={loading}
              >
                {loading ? 'Enviando...' : 'Enviar instruções'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 'var(--s-5)' }}>
              <Link
                to="/login"
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
            <h1 className="login-title">E-mail enviado!</h1>
            <p className="login-sub" style={{ marginBottom: 'var(--s-6)' }}>
              Se houver uma conta associada a este e-mail, você receberá um link para redefinir sua senha em instantes.
            </p>

            <Link
              to="/login"
              className="btn-ghost btn-full"
              style={{ textDecoration: 'none', display: 'inline-flex', justifyContent: 'center' }}
            >
              Voltar para o login
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
