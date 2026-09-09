import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../../assets/css/landing.css';
import '../../assets/css/tenant-login.css';

export function TenantLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Preencha todos os campos.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha: password })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'E-mail ou senha incorretos.');
        setLoading(false);
        return;
      }

      if (data.usuario.perfil === 'Cliente') {
        setError('Acesso negado. Página exclusiva para a equipe de gestão.');
        setLoading(false);
        return;
      }

      if (data.usuario.perfil === 'SuperAdmin') {
        setError('Acesso Master não permitido por aqui.');
        setLoading(false);
        return;
      }

      const safeToken = typeof data.token === 'string' ? data.token.replace(/[^a-zA-Z0-9._\-]/g, '').trim() : '';
      const safeUser = data.usuario ? JSON.stringify(data.usuario).replace(/[<>\0]/g, '') : '';
      const sanitizeStr = (s: unknown): string => typeof s === 'string' ? s.replace(/[<>"'&]/g, '').trim() : '';

      localStorage.setItem('courtmanager_token', safeToken);
      localStorage.setItem('courtmanager_user', safeUser);
      if (data.usuario.arena_nome) {
        localStorage.setItem('arena_nome', sanitizeStr(data.usuario.arena_nome));
      }
      if (data.usuario.arena_slug) {
        localStorage.setItem('arena_slug', sanitizeStr(data.usuario.arena_slug));
      }

      if (data.usuario.arena_status === 0) {
        navigate('/admin/assinatura');
      } else {
        navigate('/admin/dashboard');
      }

    } catch {
      setError('Erro de conexão com o servidor.');
      setLoading(false);
    }
  };

  return (
    <div className="tenant-login-page">
      {/* LEFT — Dark Pitch Panel */}
      <div className="login-left">
        <Link to="/" className="login-brand">
          <div className="login-brand-icon" style={{ fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.5px' }}>
            CM
          </div>
          <span className="login-brand-name">CourtManager</span>
        </Link>

        <div className="login-pitch">
          <h1 className="login-pitch-title">
            Bem-vindo<br />de volta <em>ao<br />seu portal</em>
          </h1>
          <div className="login-checks">
            <div className="login-check">
              <div className="login-check-dot">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              Reservas em tempo real
            </div>
            <div className="login-check">
              <div className="login-check-dot">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              Controle de caixa e pagamentos
            </div>
            <div className="login-check">
              <div className="login-check-dot">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              Gestão de clientes e mensalistas
            </div>
          </div>
        </div>

        <div className="login-testimonial">
          <p className="login-testimonial-quote">
            "O sistema mudou a forma como lidamos com os agendamentos. Muito mais paz no dia a dia da arena."
          </p>
          <div className="login-testimonial-author">
            <div className="login-testimonial-avatar">RD</div>
            <span className="login-testimonial-name">Rafael D. — Arena Sunset</span>
          </div>
        </div>
      </div>

      {/* RIGHT — Login Form */}
      <div className="login-right">
        <div className="login-form-wrapper">
          <div style={{ textAlign: 'right', marginBottom: '16px' }}>
            <Link to="/" style={{ fontSize: '13px', color: 'var(--muted)', textDecoration: 'none', fontWeight: 500 }}>
              ← Voltar ao início
            </Link>
          </div>

          <div className="login-form-header">
            <h2 className="login-form-title">Acesse sua conta</h2>
            <p className="login-form-sub">Portal exclusivo para gestores de arena.</p>
          </div>

          <form id="login-form" noValidate onSubmit={handleLogin} className={error ? 'shake' : ''}>
            <div className="login-field">
              <label htmlFor="email" className="login-label">E-mail</label>
              <input type="email" id="email" className={`login-input ${error && !email ? 'error' : ''}`} placeholder="seu@email.com"
                value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} />
            </div>

            <div className="login-field">
              <div className="login-password-row">
                <label htmlFor="password" className="login-label" style={{ marginBottom: 0 }}>Senha</label>
                <Link to="/esqueci-senha" className="login-forgot">Esqueci minha senha</Link>
              </div>
              <div className="login-password-wrapper">
                <input type={showPassword ? 'text' : 'password'} id="password" className={`login-input ${error && !password ? 'error' : ''}`} placeholder="••••••••"
                  value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="login-toggle-btn">
                  {showPassword ? 'ocultar' : 'mostrar'}
                </button>
              </div>
            </div>

            {error && (
              <div className="login-error-alert" role="alert" style={{ display: 'flex' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="login-submit-btn" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div className="login-divider">
            <div className="login-divider-line"></div>
            <span className="login-divider-text">ou</span>
            <div className="login-divider-line"></div>
          </div>

          <p className="login-footer">
            Ainda não tem uma conta? <Link to="/cadastro">Cadastre sua arena</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
