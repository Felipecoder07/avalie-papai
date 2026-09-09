import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { Card, Button, Input, Field } from '../components/ui';

export function MasterLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, senha: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'E-mail ou senha incorretos.');
        setLoading(false);
        return;
      }

      if (data.usuario.perfil !== 'SuperAdmin') {
        setErrorMsg('Acesso negado. Esta tela é exclusiva para o Administrador Master.');
        setLoading(false);
        return;
      }

      const safeToken = typeof data.token === 'string' ? data.token.replace(/[^a-zA-Z0-9._\-]/g, '').trim() : '';
      const safeUser = data.usuario ? JSON.stringify(data.usuario).replace(/[<>\0]/g, '') : '';

      localStorage.setItem('courtmanager_token', safeToken);
      localStorage.setItem('courtmanager_user', safeUser);

      navigate('/master/dashboard', { replace: true });
    } catch (err) {
      const safeErr = String(err instanceof Error ? err.message : err).replace(/[\r\n]/g, '');
      console.error('Erro no login Master:', safeErr);
      setErrorMsg('Erro de conexão com o servidor.');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#fdfcf9] to-[#eae7e0] p-4 select-none">
      <div className="w-full max-w-sm">
        {/* Header / Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-charcoal text-off-white flex items-center justify-center shadow-lg mb-3">
            <ShieldCheck size={24} />
          </div>
          <h1 className="text-xl font-bold text-charcoal tracking-tight">CourtManager SaaS</h1>
          <p className="text-xs text-muted mt-0.5">Painel Administrativo Master</p>
        </div>

        {/* Card de Login */}
        <Card className="p-6 bg-off-white border border-border-passive rounded-2xl shadow-card">
          <form onSubmit={handleLogin} className="space-y-4">
            {errorMsg && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs text-center font-medium animate-pulse">
                {errorMsg}
              </div>
            )}

            <Field label="E-mail Administrativo">
              <div className="relative">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e: any) => setEmail(e.target.value)}
                  placeholder="master@courtmanager.com"
                  style={{ paddingLeft: '2.5rem' }}
                />
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted/60">
                  <Mail size={15} />
                </div>
              </div>
            </Field>

            <Field label="Senha Master">
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e: any) => setPassword(e.target.value)}
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

            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              className="w-full justify-center py-2 shadow-sm mt-2 font-medium"
            >
              {loading ? 'Acessando...' : 'Acessar Painel Master'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
