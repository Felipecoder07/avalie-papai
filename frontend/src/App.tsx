import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { MasterLayout } from './layouts/MasterLayout';
import { MasterDashboard } from './screens/MasterDashboard';
import { MasterArenas } from './screens/MasterArenas';
import { MasterArenaDetalhe } from './screens/MasterArenaDetalhe';
import { MasterFinanceiro } from './screens/MasterFinanceiro';
import { MasterUsuarios } from './screens/MasterUsuarios';
import { MasterComunicacao } from './screens/MasterComunicacao';
import { MasterAuditoria } from './screens/MasterAuditoria';
import { MasterConfiguracoes } from './screens/MasterConfiguracoes';
import { MasterLogin } from './screens/MasterLogin';
import { TenantLogin } from './screens/public/TenantLogin';
import { LandingPage } from './screens/public/LandingPage';
import { Checkout } from './screens/public/Checkout';
import { ForgotPassword } from './screens/public/ForgotPassword';
import { ResetPassword } from './screens/public/ResetPassword';
import { PublicTenantView } from './screens/public/PublicTenantView';
import { PortalCliente } from './screens/public/PortalCliente';
import { PortalNovaReserva } from './screens/public/PortalNovaReserva';
import { AdminLayout } from './layouts/AdminLayout';
import { AdminDashboard } from './screens/admin/AdminDashboard';
import { AdminReservas } from './screens/admin/AdminReservas';
import { AdminClientes } from './screens/admin/AdminClientes';
import { AdminPagamentos } from './screens/admin/AdminPagamentos';
import { AdminRelatorios } from './screens/admin/AdminRelatorios';
import { AdminAssinatura } from './screens/admin/AdminAssinatura';
import { AdminConfiguracoes } from './screens/admin/AdminConfiguracoes';
import { AdminAuditoria } from './screens/admin/AdminAuditoria';
import { safeStorage } from './utils/safeStorage';

interface AdminSessionResult {
  blockedMsg?: string;
  maintMsg?: string;
  user?: any;
  error?: string;
}

async function fetchAdminSession(token: string): Promise<AdminSessionResult> {
  const res = await fetch('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();

  if (res.status === 403 && data.blocked) {
    return { blockedMsg: data.error || 'Acesso suspenso. Entre em contato com o suporte.' };
  }

  if (res.status === 503 && data.maintenance) {
    return { maintMsg: data.error || 'O sistema está em manutenção programada.' };
  }

  if (res.status === 401) {
    return { error: 'Sessão expirada. Faça login novamente.' };
  }

  if (!res.ok) {
    return { error: data.error || 'Erro ao validar sessão.' };
  }

  const user = data.usuario;
  const roles = ['Administrador', 'Gerente', 'Recepcionista', 'Colaborador'];
  if (!roles.includes(user?.perfil)) {
    return { error: 'Acesso não permitido para este perfil' };
  }

  return { user };
}

function processAdminSessionResult(
  result: AdminSessionResult,
  handlers: {
    setBlockedMsg: (msg: string) => void;
    setMaintMsg: (msg: string) => void;
    setIsAuth: (auth: boolean) => void;
    setChecking: (chk: boolean) => void;
    navigate: (url: string, opt?: { replace?: boolean }) => void;
  }
) {
  if (result.blockedMsg) {
    handlers.setBlockedMsg(result.blockedMsg);
    handlers.setChecking(false);
    return;
  }
  if (result.maintMsg) {
    handlers.setMaintMsg(result.maintMsg);
    handlers.setChecking(false);
    return;
  }
  if (result.error || !result.user) {
    throw new Error(result.error || 'Sessão inválida');
  }

  safeStorage.setItem('courtmanager_user', JSON.stringify(result.user));
  handlers.setIsAuth(true);
  handlers.setChecking(false);

  if (result.user.arena_status === 0 && window.location.pathname !== '/admin/assinatura') {
    handlers.navigate('/admin/assinatura', { replace: true });
  }
}

// Componente Wrapper para proteger as rotas do Admin da Arena
function AdminGuard({ children }: { children: React.ReactNode }) {
  const [isAuth, setIsAuth] = useState(false);
  const [checking, setChecking] = useState(true);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const [maintMsg, setMaintMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const verifySession = async () => {
      const token = safeStorage.getItem('courtmanager_token');
      if (!token) {
        if (active) navigate('/login', { replace: true });
        return;
      }

      try {
        const result = await fetchAdminSession(token);
        if (active) {
          processAdminSessionResult(result, {
            setBlockedMsg,
            setMaintMsg,
            setIsAuth,
            setChecking,
            navigate
          });
        }
      } catch (err) {
        const safeErr = String(err instanceof Error ? err.message : err).replace(/[\r\n]/g, '');
        console.error('Erro na validação do Admin:', safeErr);
        if (active) {
          safeStorage.removeItem('courtmanager_token');
          safeStorage.removeItem('courtmanager_user');
          navigate('/login', { replace: true });
        }
      }
    };

    verifySession();
    return () => { active = false; };
  }, [navigate]);

  if (checking) return <div className="flex min-h-screen items-center justify-center bg-cream text-charcoal">Verificando...</div>;

  if (blockedMsg) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#1a1c23] p-4 text-center text-white">
        <div className="max-w-md rounded-2xl bg-[#242731] p-8 shadow-2xl border border-red-500/30">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-3xl text-red-500">
            🔒
          </div>
          <h2 className="mb-2 text-2xl font-bold text-white">Acesso Suspenso</h2>
          <p className="mb-6 text-sm text-gray-400">{blockedMsg}</p>
          <div className="rounded-lg bg-[#1a1c23] p-4 text-xs text-gray-300 mb-6">
            Sua conta de arena foi temporariamente desativada pelo administrador da plataforma SaaS.
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                setBlockedMsg(null);
                setIsAuth(true);
                navigate('/admin/assinatura');
              }}
              className="w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 flex items-center justify-center gap-2"
            >
              ⚡ Regularizar & Pagar Mensalidade (Pix)
            </button>
            <button
              onClick={() => {
                localStorage.removeItem('courtmanager_token');
                localStorage.removeItem('courtmanager_user');
                window.location.href = '/login';
              }}
              className="w-full rounded-lg bg-gray-700 py-2.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-600"
            >
              Voltar para o Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (maintMsg) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#1a1c23] p-4 text-center text-white">
        <div className="max-w-md rounded-2xl bg-[#242731] p-8 shadow-2xl border border-amber-500/30">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-3xl text-amber-500">
            🛠️
          </div>
          <h2 className="mb-2 text-2xl font-bold text-white">Modo Manutenção</h2>
          <p className="mb-6 text-sm text-gray-400">{maintMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-lg bg-amber-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (!isAuth) return null;
  return <>{children}</>;
}

// Componente Wrapper para proteger as rotas do Master
function MasterGuard({ children }: { children: React.ReactNode }) {
  const [isAuth, setIsAuth] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    // Verifica parâmetros de redirecionamento (caso de ativação remota de login)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlUser = params.get('user');

    if (urlToken && urlUser) {
      const sanitizedToken = urlToken.replace(/[^a-zA-Z0-9._-]/g, '').trim();
      safeStorage.setItem('courtmanager_token', sanitizedToken);
      try {
        const decodedUser = decodeURIComponent(atob(urlUser)).replace(/[<>\0]/g, '');
        safeStorage.setItem('courtmanager_user', decodedUser);
      } catch (e) { }
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const verifySession = async () => {
      const token = safeStorage.getItem('courtmanager_token');
      if (!token) {
        if (active) navigate('/master-login', { replace: true });
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Sessão expirada ou não autorizada');

        const data = await res.json();
        const user = data.usuario;

        if (user.perfil === 'SuperAdmin') {
          if (active) {
            safeStorage.setItem('courtmanager_user', JSON.stringify(user));
            setIsAuth(true);
            setChecking(false);
          }
        } else {
          throw new Error('Acesso restrito ao Super Administrador');
        }
      } catch (err) {
        const safeErr = String(err instanceof Error ? err.message : err).replace(/[\r\n]/g, '');
        console.error('Erro na validação do Master:', safeErr);
        if (active) {
          safeStorage.removeItem('courtmanager_token');
          safeStorage.removeItem('courtmanager_user');
          navigate('/master-login', { replace: true });
        }
      }
    };

    verifySession();
    return () => { active = false; };
  }, [navigate]);

  if (checking) return <div className="flex min-h-screen items-center justify-center bg-cream text-charcoal">Verificando...</div>;
  if (!isAuth) return null;
  return <>{children}</>;
}

// Componente Wrapper para proteger as rotas de Cliente/Jogador
function ClientGuard({ children }: { children: React.ReactNode }) {
  const [isAuth, setIsAuth] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const verifySession = async () => {
      const token = safeStorage.getItem('courtmanager_token');
      if (!token) {
        if (active) navigate('/login', { replace: true });
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Sessão expirada ou não autorizada');

        const data = await res.json();
        const user = data.usuario;

        if (user.perfil === 'Cliente') {
          if (active) {
            safeStorage.setItem('courtmanager_user', JSON.stringify(user));
            setIsAuth(true);
            setChecking(false);
          }
        } else {
          throw new Error('Acesso restrito ao Cliente');
        }
      } catch (err) {
        const safeErr = String(err instanceof Error ? err.message : err).replace(/[\r\n]/g, '');
        console.error('Erro na validação do Cliente:', safeErr);
        if (active) {
          safeStorage.removeItem('courtmanager_token');
          safeStorage.removeItem('courtmanager_user');
          navigate('/login', { replace: true });
        }
      }
    };

    verifySession();
    return () => { active = false; };
  }, [navigate]);

  if (checking) return <div className="flex min-h-screen items-center justify-center bg-cream text-charcoal">Verificando...</div>;
  if (!isAuth) return null;
  return <>{children}</>;
}

// Wrapper para verificar permissões de perfil em rotas específicas
function RoleRoute({ allowedRoles, children }: { allowedRoles: string[]; children: React.ReactNode }) {
  const userStr = localStorage.getItem('courtmanager_user');
  let hasAccess = false;
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (allowedRoles.includes(user.perfil)) {
        hasAccess = true;
      }
    } catch (e) { }
  }
  return hasAccess ? <>{children}</> : <Navigate to="/admin/dashboard" replace />;
}

function App() {
  const navigate = useNavigate();

  return (
    <Routes>
      {/* Rotas Públicas Mockadas (Fase 2) */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<TenantLogin />} />
      <Route path="/cadastro" element={<Checkout />} />
      <Route path="/master-login" element={<MasterLogin />} />
      <Route path="/esqueci-senha" element={<ForgotPassword />} />
      {/* Rotas Públicas sem necessidade de Login (Link Único da Arena) */}
      <Route path="/arena/:slug" element={<PublicTenantView />} />
      <Route path="/v/:slug" element={<PublicTenantView />} />

      {/* Portal do Cliente / Jogador (Fase 2 - Gateway Pix/Card) */}
      <Route path="/portal" element={<ClientGuard><PortalCliente /></ClientGuard>} />
      <Route path="/portal/novo-agendamento" element={<ClientGuard><PortalNovaReserva /></ClientGuard>} />

      {/* Rotas Inquilino (Fase 3/4) */}
      <Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="reservas" element={<AdminReservas />} />
        <Route path="clientes" element={<AdminClientes />} />
        <Route path="pagamentos" element={<AdminPagamentos />} />
        <Route path="relatorios" element={<RoleRoute allowedRoles={['Administrador', 'Gerente']}><AdminRelatorios /></RoleRoute>} />
        <Route path="assinatura" element={<RoleRoute allowedRoles={['Administrador', 'Gerente']}><AdminAssinatura /></RoleRoute>} />
        <Route path="plano" element={<Navigate to="/admin/assinatura" replace />} />
        <Route path="configuracoes" element={<RoleRoute allowedRoles={['Administrador', 'Gerente']}><AdminConfiguracoes /></RoleRoute>} />
        <Route path="auditoria" element={<RoleRoute allowedRoles={['Administrador']}><AdminAuditoria /></RoleRoute>} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Route>

      {/* Rotas Master Admin */}
      <Route path="/master" element={<MasterGuard><MasterLayout /></MasterGuard>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<MasterDashboard onNavigate={(screen) => navigate(`/master/${screen}`)} />} />
        <Route path="arenas" element={<MasterArenas onNavigate={(screen) => navigate(`/master/${screen}`)} />} />
        <Route path="arena-detalhe" element={<MasterArenaDetalhe onNavigate={(screen) => navigate(`/master/${screen}`)} />} />
        <Route path="financeiro" element={<MasterFinanceiro />} />
        <Route path="usuarios" element={<MasterUsuarios />} />
        <Route path="comunicacao" element={<MasterComunicacao />} />
        <Route path="auditoria" element={<MasterAuditoria />} />
        <Route path="configuracoes" element={<MasterConfiguracoes />} />
      </Route>

      {/* Rota Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
