import { apiFetch as fetch } from '../utils/apiFetch';
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { safeStorage } from '../utils/safeStorage';
import { clearSession, getStoredUser } from '../utils/session';

interface SessionGuardProps {
  readonly children: ReactNode;
  readonly requiredProfile: 'SuperAdmin' | 'Cliente';
  readonly loginPath: string;
  readonly roleLabel: string;
  readonly acceptRemoteLogin?: boolean;
}

export function SessionGuard(props: SessionGuardProps) {
  // Changing from the client portal to Master must start a fresh verification.
  return <ProfileSessionGuard key={props.requiredProfile} {...props} />;
}

function ProfileSessionGuard({ children, requiredProfile, loginPath, roleLabel, acceptRemoteLogin = false }: Readonly<SessionGuardProps>) {
  const [isAuth, setIsAuth] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const verifySession = async () => {


      try {
        const res = await fetch('/api/auth/me', {
          headers: {}
        });
        if (!res.ok) throw new Error('Sessão expirada ou não autorizada');
        const data = await res.json();
        const user = data.usuario;
        if (user?.perfil !== requiredProfile) throw new Error(`Acesso restrito ao ${roleLabel}`);

        if (active) {
          safeStorage.setItem('courtmanager_user', JSON.stringify(user));
          setIsAuth(true);
          setChecking(false);
        }
      } catch (err) {
        const safeErr = String(err instanceof Error ? err.message : err).replace(/[\r\n]/g, '');
        console.error('Erro na validação da sessão:', safeErr);
        if (active) {
          clearSession();
          navigate(loginPath, { replace: true });
        }
      }
    };

    const expired = () => { setIsAuth(false); navigate(loginPath, { replace: true }); };
    window.addEventListener('cm:session-expired', expired);
    void verifySession();
    return () => { active = false; window.removeEventListener('cm:session-expired', expired); };
  }, [acceptRemoteLogin, loginPath, navigate, requiredProfile, roleLabel]);

  if (checking) return <div className="flex min-h-screen items-center justify-center bg-cream text-charcoal">Verificando...</div>;
  return isAuth ? <>{children}</> : null;
}

export function RoleRoute({ allowedRoles, children }: Readonly<{ readonly allowedRoles: readonly string[]; readonly children: ReactNode }>) {
  const user = getStoredUser();
  const hasAccess = user !== null && allowedRoles.includes(user.perfil);
  return hasAccess ? <>{children}</> : <Navigate to="/admin/dashboard" replace />;
}
