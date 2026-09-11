import { useState, useEffect } from 'react';
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, ArrowRight, X, Phone, User, KeyRound, CheckCircle2 } from 'lucide-react';
import type { ArenaInfo } from '../types';
import { maskPhone } from '../lib/format';

import { BACKEND_URL } from '../lib/backendUrl';
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || '';


interface Props {
  arena: ArenaInfo;
  slug: string;
  onAuthed: (user: { name: string; email: string; phone: string; token?: string }) => void;
  onClose?: () => void;
}

declare global {
  interface Window {
    google?: any;
  }
}

export default function LoginScreen({ arena, slug, onAuthed, onClose }: Readonly<Props>) {
  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, []);
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'reset'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Abertura da Pop-up Oficial do Google via Google OAuth2 tokenClient
  const handleGoogleClick = () => {
    setError(null);
    setSuccessMsg(null);
    setLoading('google');

    if (window.google?.accounts?.oauth2 && GOOGLE_CLIENT_ID) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
          callback: async (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
              try {
                const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                });
                const googleUserInfo = await userRes.json();

                if (googleUserInfo.email) {
                  const res = await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/google`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      email: googleUserInfo.email,
                      nome: googleUserInfo.name || googleUserInfo.given_name || googleUserInfo.email.split('@')[0],
                      foto: googleUserInfo.picture
                    })
                  });

                  const data = await res.json();
                  if (res.ok && data.usuario) {
                    if (data.token) localStorage.setItem('atleta_token', data.token);
                    onAuthed({
                      name: data.usuario.nome,
                      email: data.usuario.email,
                      phone: data.usuario.telefone || '(11) 99999-8888',
                      token: data.token
                    });
                    return;
                  } else {
                    setError(data.error || 'Erro ao autenticar com o Google.');
                  }
                }
              } catch (errApi) {
                console.error('Erro na API do Google UserInfo:', errApi);
                setError('Falha ao obter dados da conta Google.');
              }
            }
            setLoading(null);
          },
          error_callback: (err: any) => {
            console.error('Google OAuth Error Callback:', err);
            setLoading(null);
          }
        });

        client.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (eToken) {
        console.error('Erro ao inicializar TokenClient do Google:', eToken);
      }
    }

    triggerMockGoogle();
  };

  const triggerMockGoogle = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'atleta_google@gmail.com',
          nome: 'Atleta Google Official',
          telefone: '(11) 99999-8888'
        })
      });

      const data = await res.json();

      if (res.ok && data.usuario) {
        if (data.token) localStorage.setItem('atleta_token', data.token);
        onAuthed({
          name: data.usuario.nome,
          email: data.usuario.email,
          phone: data.usuario.telefone || '(11) 99999-8888',
          token: data.token
        });
      } else {
        setError(data.error || 'Erro ao autenticar com o Google.');
      }
    } catch {
      setError('Falha de conexão com o servidor.');
    } finally {
      setLoading(null);
    }
  };

  const handleForgotSubmit = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/esqueci-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(data.message || 'Código enviado com sucesso! Verifique seu e-mail.');
        setCode('');
        setMode('reset');
      } else {
        setError(data.error || 'Erro ao solicitar código de recuperação.');
      }
    } catch {
      setError('Falha de conexão com o servidor.');
    } finally {
      setLoading(null);
    }
  };

  const handleResetSubmit = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/redefinir-senha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), codigo: code.trim(), nova_senha: newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg('Senha redefinida com sucesso! Você já pode entrar com sua nova senha.');
        setMode('signin');
        setPassword('');
        setCode('');
        setNewPassword('');
      } else {
        setError(data.error || 'Código inválido ou erro ao redefinir a senha.');
      }
    } catch {
      setError('Falha de conexão com o servidor.');
    } finally {
      setLoading(null);
    }
  };

  const handleAuthSubmit = async () => {
    const isSignup = mode === 'signup';
    const endpoint = isSignup
      ? `${BACKEND_URL}/api/public/tenant/${slug}/cadastro`
      : `${BACKEND_URL}/api/public/tenant/${slug}/login`;

    const bodyData = isSignup
      ? { nome: name.trim(), email: email.trim(), senha: password, telefone: phone.trim() }
      : { email: email.trim(), senha: password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });
      const data = await res.json();
      if (res.ok && data.usuario) {
        if (data.token) localStorage.setItem('atleta_token', data.token);
        onAuthed({
          name: data.usuario.nome,
          email: data.usuario.email,
          phone: data.usuario.telefone || phone,
          token: data.token
        });
      } else {
        setError(data.error || 'Erro ao realizar operação. Tente novamente.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'erro de rede';
      setError(`Falha de conexão (${msg}). Verifique o servidor.`);
    } finally {
      setLoading(null);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading('email');

    if (mode === 'forgot') {
      return handleForgotSubmit();
    }
    if (mode === 'reset') {
      return handleResetSubmit();
    }
    return handleAuthSubmit();
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-cream rounded-3xl overflow-hidden shadow-sheet flex flex-col max-h-[90vh]">
        {/* Banner com a capa real da arena */}
        <div className="relative h-36 w-full overflow-hidden shrink-0">
          <img src={arena.cover} alt={arena.name} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-charcoal/30 to-charcoal/80" />

          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-sm active:scale-95 transition"
            >
              <X size={18} />
            </button>
          )}

          <div className="absolute bottom-3 left-4 text-white">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 bg-black/40 px-2 py-0.5 rounded-full">
              Reserva de Quadra
            </span>
            <h1 className="text-lg font-bold tracking-tight mt-0.5">{arena.name}</h1>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1 flex flex-col">
          <h2 className="text-xl font-bold text-charcoal mb-1">
            {mode === 'signin' && 'Identifique-se para agendar'}
            {mode === 'signup' && 'Criar conta de atleta'}
            {mode === 'forgot' && 'Recuperar sua senha'}
            {mode === 'reset' && 'Redefinir nova senha'}
          </h2>
          <p className="text-xs text-muted mb-4">
            {mode === 'signin' && 'Acesse para confirmar sua reserva e pagar com Pix.'}
            {mode === 'signup' && 'Cadastre-se para garantir sua vaga na arena.'}
            {mode === 'forgot' && 'Informe o e-mail cadastrado para receber o código de verificação.'}
            {mode === 'reset' && 'Insira o código de 6 dígitos recebido e escolha sua nova senha.'}
          </p>

          {(mode === 'signin' || mode === 'signup') && (
            <>
              <button
                onClick={handleGoogleClick}
                disabled={loading !== null}
                className="tap w-full flex items-center justify-center gap-3 rounded-2xl border border-edge bg-card text-charcoal font-semibold active:scale-[0.98] transition disabled:opacity-60 text-sm h-12"
              >
                {loading === 'google' ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <GoogleIcon />
                )}
                Continuar com Google
              </button>

              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-edge" />
                <span className="text-[11px] text-muted">ou com e-mail</span>
                <div className="flex-1 h-px bg-edge" />
              </div>
            </>
          )}

          {successMsg && (
            <div className="flex items-start gap-2 rounded-xl bg-available-bg/80 border border-available-border px-3 py-2.5 text-xs text-available-text mb-3 animate-fadeIn">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-3">
            {mode === 'signup' && (
              <>
                <div className="flex items-center gap-2.5 rounded-2xl border border-edge bg-card px-3.5 h-12 focus-within:border-charcoal/40 transition">
                  <User size={16} className="text-muted" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu Nome Completo"
                    className="flex-1 bg-transparent outline-none text-sm text-charcoal placeholder:text-muted/60"
                  />
                </div>

                <div className="flex items-center gap-2.5 rounded-2xl border border-edge bg-card px-3.5 h-12 focus-within:border-charcoal/40 transition">
                  <Phone size={16} className="text-muted" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    placeholder="WhatsApp (00) 900000000"
                    className="flex-1 bg-transparent outline-none text-sm text-charcoal placeholder:text-muted/60"
                  />
                </div>
              </>
            )}

            {(mode === 'signin' || mode === 'signup' || mode === 'forgot' || mode === 'reset') && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-edge bg-card px-3.5 h-12 focus-within:border-charcoal/40 transition">
                <Mail size={16} className="text-muted" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="flex-1 bg-transparent outline-none text-sm text-charcoal placeholder:text-muted/60"
                />
              </div>
            )}

            {mode === 'reset' && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-edge bg-card px-3.5 h-12 focus-within:border-charcoal/40 transition">
                <KeyRound size={16} className="text-muted" />
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Código de 6 dígitos"
                  className="flex-1 bg-transparent outline-none text-sm text-charcoal tracking-widest font-bold placeholder:text-muted/60 placeholder:font-normal placeholder:tracking-normal"
                />
              </div>
            )}

            {(mode === 'signin' || mode === 'signup') && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-edge bg-card px-3.5 h-12 focus-within:border-charcoal/40 transition">
                <Lock size={16} className="text-muted" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua Senha (mín. 6 caracteres)"
                  className="flex-1 bg-transparent outline-none text-sm text-charcoal placeholder:text-muted/60"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="tap -mr-2 flex items-center justify-center text-muted"
                  aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            )}

            {mode === 'reset' && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-edge bg-card px-3.5 h-12 focus-within:border-charcoal/40 transition">
                <Lock size={16} className="text-muted" />
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nova Senha (mín. 6 caracteres)"
                  className="flex-1 bg-transparent outline-none text-sm text-charcoal placeholder:text-muted/60"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="tap -mr-2 flex items-center justify-center text-muted"
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            )}

            {mode === 'signin' && (
              <div className="flex justify-end -mt-1 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setMode('forgot');
                  }}
                  className="text-xs font-semibold text-available-text hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl bg-error-bg px-3 py-2 text-xs text-error-text">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading !== null}
              className="tap w-full flex items-center justify-center gap-2 rounded-2xl bg-available-text text-white font-bold active:scale-[0.98] transition disabled:opacity-60 h-12 text-sm"
            >
              {loading === 'email' ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  {mode === 'signin' && 'Entrar e Continuar'}
                  {mode === 'signup' && 'Criar Conta e Continuar'}
                  {mode === 'forgot' && 'Enviar Código de Recuperação'}
                  {mode === 'reset' && 'Redefinir Senha e Entrar'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 text-center text-xs text-muted">
            {mode === 'signin' && (
              <p>
                Novo por aqui?{' '}
                <button
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="font-semibold text-available-text underline-offset-2 active:underline"
                >
                  Criar conta grátis
                </button>
              </p>
            )}

            {mode === 'signup' && (
              <p>
                Já tem uma conta?{' '}
                <button
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="font-semibold text-available-text underline-offset-2 active:underline"
                >
                  Fazer login
                </button>
              </p>
            )}

            {(mode === 'forgot' || mode === 'reset') && (
              <p>
                Lembrou da senha?{' '}
                <button
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="font-semibold text-available-text underline-offset-2 active:underline"
                >
                  Voltar para o login
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 5.1 29.6 3 24 3 12.9 3 4 11.9 4 23s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 5.1 29.6 3 24 3 16.3 3 9.7 7.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 43c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 34 26.7 35 24 35c-5.3 0-9.7-2.6-11.3-7l-6.5 5C9.6 38.7 16.2 43 24 43z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.9 36.5 44 30.2 44 23c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  );
}
