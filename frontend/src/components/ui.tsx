import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;
  const maxW = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-charcoal/40 backdrop-blur-[2px]"
        role="presentation"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') onClose(); }}
      />
      <div
        ref={ref}
        className={`relative w-full ${maxW} bg-off-white rounded-2xl shadow-overlay animate-scale-in border border-border-passive`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-border-passive">
          <div>
            <h3 className="text-base font-semibold text-charcoal">{title}</h3>
            {description && <p className="text-sm text-muted mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} className="text-muted hover:text-charcoal p-1 -mr-1 rounded-md hover:bg-cream-surface transition-colors" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-border-passive bg-cream/40 rounded-b-2xl flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (password: string) => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requirePassword?: boolean;
}

export function ConfirmModal({
  open, onClose, onConfirm, title, message, confirmLabel = 'Confirmar', destructive, requirePassword,
}: ConfirmModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Reset local state when the modal opens/closes
  useEffect(() => {
    if (open) {
      setPassword('');
      setShowPassword(false);
    }
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={() => onConfirm(password)}>{confirmLabel}</Button>
        </>
      }
    >
      <div className={`text-sm ${destructive ? 'text-danger' : 'text-muted'}`}>{message}</div>
      {requirePassword && (
        <div className="mt-4">
          <label className="block text-xs font-medium text-charcoal mb-1.5">Confirme com sua senha master</label>
          <div className="relative">
            <input 
              type={showPassword ? "text" : "password"} 
              className="input pr-10" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus 
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-charcoal focus:outline-none"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
  size?: 'sm' | 'md';
};

export function Button({ variant = 'secondary', size = 'md', className = '', children, ...rest }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed select-none';
  const sizes = size === 'sm' ? 'text-xs px-2.5 py-1.5' : 'text-sm px-3.5 py-2';
  const variants: Record<string, string> = {
    primary: 'bg-charcoal text-off-white hover:bg-charcoal/82 shadow-card',
    secondary: 'bg-off-white text-charcoal border border-border-passive hover:bg-cream-surface hover:border-charcoal/20',
    ghost: 'text-muted hover:text-charcoal hover:bg-cream-surface',
    danger: 'bg-danger text-off-white hover:bg-danger/90 shadow-card',
    warning: 'bg-warning text-off-white hover:bg-warning/90 shadow-card',
  };
  return (
    <button className={`${base} ${sizes} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Badge({ status, children }: { status: 'ativa' | 'bloqueada' | 'trial' | 'pago' | 'pendente' | 'atrasado' | 'ativo' | 'desativado' | 'success' | 'warning' | 'danger' | 'neutral'; children: ReactNode }) {
  const map: Record<string, string> = {
    ativa: 'bg-success-soft text-success border-success/20',
    ativo: 'bg-success-soft text-success border-success/20',
    pago: 'bg-success-soft text-success border-success/20',
    success: 'bg-success-soft text-success border-success/20',
    trial: 'bg-warning-soft text-warning border-warning/20',
    pendente: 'bg-warning-soft text-warning border-warning/20',
    warning: 'bg-warning-soft text-warning border-warning/20',
    bloqueada: 'bg-danger-soft text-danger border-danger/20',
    atrasado: 'bg-danger-soft text-danger border-danger/20',
    desativado: 'bg-cream-surface text-muted border-border-passive',
    neutral: 'bg-cream-surface text-muted border-border-passive',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] || map.neutral}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`bg-off-white border border-border-passive rounded-2xl shadow-card ${className}`}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-charcoal tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-10 h-10 rounded-full bg-cream-surface flex items-center justify-center mb-3 border border-border-passive">
        <span className="w-2 h-2 rounded-full bg-muted/40" />
      </div>
      <p className="text-sm text-muted max-w-xs">{message}</p>
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-1 pt-3">
      <span className="text-xs text-muted">Página {page} de {totalPages}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => onPage(page - 1)}>Anterior</Button>
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          const p = i + 1;
          return (
            <button key={p} onClick={() => onPage(p)}
              className={`min-w-[28px] h-7 px-1.5 rounded-md text-xs font-medium transition-colors ${page === p ? 'bg-charcoal text-off-white' : 'text-muted hover:bg-cream-surface'}`}>
              {p}
            </button>
          );
        })}
        <Button size="sm" variant="ghost" disabled={page === totalPages} onClick={() => onPage(page + 1)}>Próxima</Button>
      </div>
    </div>
  );
}

// Field components
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-charcoal mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className || ''}`} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input ${props.className || ''}`} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input ${props.className || ''}`} />;
}
