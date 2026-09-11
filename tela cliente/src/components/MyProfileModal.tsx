import { useState, useEffect, useRef } from 'react';
import { User, Phone, Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle, X, Shield, CreditCard, Trash2, KeyRound, Camera, Sparkles, BadgeCheck, LogOut } from 'lucide-react';
import { maskPhone, maskCPF } from '../lib/format';


import { BACKEND_URL } from '../lib/backendUrl';


interface Props {
  slug: string;
  athlete: { name: string; email: string; phone: string };
  open: boolean;
  onClose: () => void;
  onUpdate: (updated: { name: string; phone: string }) => void;
  onLogout?: () => void;
}

export default function MyProfileModal({ slug, athlete, open, onClose, onUpdate, onLogout }: Readonly<Props>) {
  const [name, setName] = useState(athlete.name);
  const [phone, setPhone] = useState(athlete.phone);
  const [cpf, setCpf] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarSaved, setAvatarSaved] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Senha
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  // Estados de loading e feedback
  const [loadingData, setLoadingData] = useState(false);
  const [loadingPwd, setLoadingPwd] = useState(false);
  const [errorData, setErrorData] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<string | null>(null);
  const [errorPwd, setErrorPwd] = useState<string | null>(null);
  const [successPwd, setSuccessPwd] = useState<string | null>(null);

  // Estados exclusão LGPD
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [open]);

  // Carrega os dados reais do atleta do backend ao abrir
  useEffect(() => {
    if (!open) return;
    const token = localStorage.getItem('atleta_token');
    if (!token) return;

    fetch(`${BACKEND_URL}/api/public/tenant/${slug}/meu-perfil`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.perfil) {
          setName(data.perfil.nome || athlete.name);
          setPhone(data.perfil.telefone || athlete.phone);
          setCpf(data.perfil.cpf || '');
          if (data.perfil.avatar_url) {
            setAvatarUrl(data.perfil.avatar_url);
          }
        }
      })
      .catch(() => { });
  }, [open, slug, athlete]);

  // Redimensionamento, compressão e AUTO-SAVE da foto de perfil no backend
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('A imagem selecionada é muito grande. Escolha um arquivo de até 5MB.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      setAvatarError('Por favor, selecione um arquivo de imagem válido (JPG, PNG, WEBP).');
      return;
    }

    setAvatarError(null);
    setAvatarSaved(false);
    setAvatarSaving(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const SIZE = 200;
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Crop quadrado centralizado perfeito para avatar
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, SIZE, SIZE);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
          
          // 1. Atualiza preview na tela imediatamente
          setAvatarUrl(compressedBase64);

          // 2. AUTO-SAVE Instantâneo em segundo plano no Backend
          try {
            const token = localStorage.getItem('atleta_token');
            const res = await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/meu-perfil`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ avatar_url: compressedBase64 })
            });

            if (res.ok) {
              setAvatarSaved(true);
              setTimeout(() => setAvatarSaved(false), 3000);
            } else {
              const data = await res.json();
              setAvatarError(data.error || 'Erro ao salvar a foto de perfil.');
            }
          } catch {
            setAvatarError('Erro de conexão ao salvar foto de perfil.');
          } finally {
            setAvatarSaving(false);
          }
        } else {
          setAvatarSaving(false);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };


  if (!open) return null;

  // Handler para salvar Dados Pessoais
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorData(null);
    setSuccessData(null);
    setLoadingData(true);

    const token = localStorage.getItem('atleta_token');

    try {
      const res = await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/meu-perfil`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          nome: name.trim(),
          telefone: phone.trim(),
          cpf: cpf.trim(),
          avatar_url: avatarUrl
        })

      });

      const data = await res.json();

      if (res.ok && data.usuario) {
        setSuccessData('Dados pessoais atualizados!');
        onUpdate({
          name: data.usuario.nome,
          phone: data.usuario.telefone
        });
        setTimeout(() => setSuccessData(null), 3000);
      } else {
        setErrorData(data.error || 'Erro ao atualizar informações.');
      }
    } catch (err: any) {
      console.error('[MyProfileModal Error]', err);
      setErrorData(`Falha de conexão (${err?.message || 'erro de rede'}).`);
    } finally {
      setLoadingData(false);
    }
  };


  // Handler para atualizar Senha
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorPwd(null);
    setSuccessPwd(null);

    if (password.length < 6) {
      setErrorPwd('A senha deve possuir no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorPwd('A confirmação de senha não coincide.');
      return;
    }

    setLoadingPwd(true);
    const token = localStorage.getItem('atleta_token');

    try {
      const res = await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/meu-perfil`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ nova_senha: password })
      });

      const data = await res.json();

      if (res.ok && data.usuario) {
        setSuccessPwd('Senha alterada com sucesso!');
        setPassword('');
        setConfirmPassword('');
        setTimeout(() => setSuccessPwd(null), 3000);
      } else {
        setErrorPwd(data.error || 'Erro ao atualizar senha.');
      }
    } catch {
      setErrorPwd('Falha de conexão com o servidor.');
    } finally {
      setLoadingPwd(false);
    }
  };

  // Handler para Exclusão de Conta LGPD
  const handleDeleteAccount = async () => {
    setDeletingLoading(true);
    setDeleteError(null);
    try {
      const token = localStorage.getItem('courtmanager_athlete_token') || localStorage.getItem('atleta_token');
      if (!token) {
        setDeleteError('Você precisa estar autenticado para excluir sua conta.');
        setDeletingLoading(false);
        return;
      }
      const res = await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/excluir-conta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          phone: athlete.phone,
          email: athlete.email
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.removeItem('atleta_token');
        localStorage.removeItem('atleta_session');
        setShowDeleteModal(false);
        setTimeout(() => {
          onClose();
          window.location.reload();
        }, 800);
      } else {
        setDeleteError(data.error || 'Erro ao excluir a conta. Tente novamente.');
      }
    } catch {
      setDeleteError('Falha de conexão com o servidor.');
    } finally {
      setDeletingLoading(false);
    }
  };

  const userInitial = (name || athlete.name || 'A').charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-cream rounded-3xl overflow-hidden shadow-sheet flex flex-col max-h-[82vh]">

        {/* Botão de Fechar Fixo no Canto Superior */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-white/90 border border-edge text-charcoal/80 flex items-center justify-center active:scale-95 transition hover:bg-white shadow-xs"
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        {/* Conteúdo Rolável Único (Header + Form entram no scroll juntos) */}
        <div className="overflow-y-auto flex-1 text-charcoal">

          {/* Header Hero com Foto / Inicial + Nome + E-mail em Destaque */}
          <div className="p-4 pt-6 pb-4 bg-gradient-to-b from-available-bg/35 via-card to-cream border-b border-edge text-center flex flex-col items-center">
            {/* Input de Arquivo Escondido */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />

            {/* Avatar Centralizado com Foto ou Inicial + Badge de Câmera & Auto-Save */}
            <div className="relative mb-2.5 flex flex-col items-center">
              <button
                type="button"
                disabled={avatarSaving}
                onClick={() => fileInputRef.current?.click()}
                className="relative group block cursor-pointer outline-none"
                title="Clique para alterar foto de perfil"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={name || athlete.name}
                    className={`w-16 h-16 rounded-full object-cover border-2 shadow-sm transition ${
                      avatarSaved ? 'border-available-text ring-2 ring-available-text/30' : 'border-white group-hover:opacity-90'
                    }`}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-available-bg to-emerald-100 border-2 border-white text-available-text flex items-center justify-center font-black text-2xl shadow-sm">
                    {userInitial}
                  </div>
                )}

                {/* Overlay de Loading quando está salvando */}
                {avatarSaving ? (
                  <div className="absolute inset-0 rounded-full bg-charcoal/60 flex items-center justify-center text-white backdrop-blur-[1px]">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : (
                  <div
                    className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-available-text text-white flex items-center justify-center border-2 border-white shadow-xs group-hover:scale-110 transition"
                    title="Alterar Foto de Perfil"
                  >
                    <Camera size={11} />
                  </div>
                )}
              </button>

              {/* Feedback de Auto-Save de Foto */}
              {avatarSaved && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] font-extrabold text-available-text animate-fadeIn">
                  <CheckCircle size={13} />
                  <span>Foto atualizada!</span>
                </div>
              )}
              {avatarError && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-error-text animate-fadeIn">
                  <AlertCircle size={13} />
                  <span>{avatarError}</span>
                </div>
              )}
            </div>


            <div className="space-y-0.5">
              <h2 className="text-base font-extrabold text-charcoal flex items-center justify-center gap-1.5">
                {name || athlete.name}
                <BadgeCheck size={16} className="text-available-text" />
              </h2>
              <p className="text-[11px] text-muted font-medium bg-white/90 px-2.5 py-0.5 rounded-full inline-block border border-edge/60">
                {athlete.email}
              </p>
            </div>
          </div>

          {/* Corpo das Seções em Cards */}
          <div className="p-4 space-y-4">


            {/* SEÇÃO 1: Dados Pessoais */}
            <section className="bg-card p-4 rounded-2xl border border-edge space-y-3.5 shadow-2xs">
              <div className="flex items-center gap-2 border-b border-edge/60 pb-2">
                <User size={16} className="text-available-text" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-charcoal/80">Dados Pessoais</h3>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-charcoal/70 block mb-1">Nome Completo</label>
                  <div className="flex items-center gap-2.5 rounded-xl border border-edge bg-cream px-3 h-11">
                    <User size={15} className="text-muted" />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Seu Nome Completo"
                      className="flex-1 bg-transparent outline-none text-xs text-charcoal"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-charcoal/70 block mb-1">WhatsApp / Telefone</label>
                  <div className="flex items-center gap-2.5 rounded-xl border border-edge bg-cream px-3 h-11">
                    <Phone size={15} className="text-muted" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(maskPhone(e.target.value))}
                      placeholder="(00) 900000000"
                      className="flex-1 bg-transparent outline-none text-xs text-charcoal"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-charcoal/70 block mb-1">CPF (Opcional)</label>
                  <div className="flex items-center gap-2.5 rounded-xl border border-edge bg-cream px-3 h-11">
                    <CreditCard size={15} className="text-muted" />
                    <input
                      type="text"
                      value={cpf}
                      onChange={(e) => setCpf(maskCPF(e.target.value))}
                      placeholder="000.000.000-00"
                      className="flex-1 bg-transparent outline-none text-xs text-charcoal"
                    />
                  </div>
                </div>

                {errorData && (
                  <div className="flex items-start gap-2 rounded-xl bg-error-bg px-3 py-2 text-xs text-error-text">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{errorData}</span>
                  </div>
                )}

                {successData && (
                  <div className="flex items-start gap-2 rounded-xl bg-available-bg px-3 py-2 text-xs text-available-text font-semibold">
                    <CheckCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{successData}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loadingData}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-available-text hover:bg-available-text/90 text-white font-bold active:scale-[0.98] transition disabled:opacity-60 h-10 text-xs shadow-xs"
                >
                  {loadingData ? <Loader2 size={16} className="animate-spin" /> : 'Salvar Dados Pessoais'}
                </button>
              </form>
            </section>

            {/* SEÇÃO 2: Segurança & Senha */}
            <section className="bg-card p-4 rounded-2xl border border-edge space-y-3.5 shadow-2xs">
              <div className="flex items-center gap-2 border-b border-edge/60 pb-2">
                <Shield size={16} className="text-available-text" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-charcoal/80">Segurança & Senha</h3>
              </div>

              <form onSubmit={handleSavePassword} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-charcoal/70 block mb-1">Nova Senha</label>
                  <div className="flex items-center gap-2.5 rounded-xl border border-edge bg-cream px-3 h-11">
                    <Lock size={15} className="text-muted" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="flex-1 bg-transparent outline-none text-xs text-charcoal"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((s) => !s)}
                      className="text-muted"
                    >
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-charcoal/70 block mb-1">Confirmar Senha</label>
                  <div className="flex items-center gap-2.5 rounded-xl border border-edge bg-cream px-3 h-11">
                    <Lock size={15} className="text-muted" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      className="flex-1 bg-transparent outline-none text-xs text-charcoal"
                    />
                  </div>
                </div>

                {errorPwd && (
                  <div className="flex items-start gap-2 rounded-xl bg-error-bg px-3 py-2 text-xs text-error-text">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{errorPwd}</span>
                  </div>
                )}

                {successPwd && (
                  <div className="flex items-start gap-2 rounded-xl bg-available-bg px-3 py-2 text-xs text-available-text font-semibold">
                    <CheckCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{successPwd}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loadingPwd}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-charcoal hover:bg-charcoal/90 text-white font-bold active:scale-[0.98] transition disabled:opacity-60 h-10 text-xs shadow-xs"
                >
                  {loadingPwd ? <Loader2 size={16} className="animate-spin" /> : <span className="flex items-center gap-1.5"><KeyRound size={14} /> Atualizar Senha</span>}
                </button>
              </form>
            </section>

            {/* SEÇÃO: Ações de Sessão */}
            {onLogout && (
              <section className="pt-1 pb-1">
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    onClose();
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-white border border-edge text-charcoal/80 hover:text-charcoal hover:bg-surface font-bold text-xs h-11 active:scale-[0.98] transition shadow-xs"
                >
                  <LogOut size={15} className="text-muted" />
                  Sair da Minha Conta
                </button>
              </section>
            )}

            {/* SEÇÃO 3: Privacidade & LGPD (Zona de Perigo) */}
            <section className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200/80 space-y-3">
              <div className="flex items-center gap-2 border-b border-rose-200/60 pb-2 text-rose-700">
                <Trash2 size={16} />
                <h3 className="text-xs font-bold uppercase tracking-wider">Privacidade & Dados</h3>
              </div>

              <p className="text-[11px] text-rose-900/80 leading-relaxed">
                Solicite a remoção definitiva da sua conta e dados pessoais do nosso aplicativo em conformidade com a LGPD.
              </p>

              <button
                type="button"
                onClick={() => { setShowDeleteModal(true); setDeleteError(null); }}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-100/50 text-rose-700 font-bold text-xs h-10 active:scale-[0.98] transition shadow-2xs"
              >
                <Trash2 size={14} />
                Excluir Minha Conta (LGPD)
              </button>
            </section>

          </div>
        </div>
      </div>

      {/* Modal de Confirmação de Exclusão LGPD */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-charcoal/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-cream rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scaleIn">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 size={22} className="text-rose-600" />
              </div>
              <div>
                <h3 className="font-bold text-charcoal text-base">Excluir Conta (LGPD)</h3>
                <p className="text-xs text-muted">Ação permanente e irreversível</p>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-2xl border border-edge space-y-2 text-xs text-charcoal/90">
              <p className="font-bold text-rose-700">Deseja realmente apagar seu cadastro?</p>
              <p className="leading-relaxed">
                Em conformidade com a LGPD, seus dados pessoais (nome, e-mail, telefone e CPF) serão <strong>excluídos permanentemente</strong> do sistema.
              </p>
              <p className="text-[11px] text-muted pt-1 border-t border-edge/60">
                Os registros de reservas passadas serão mantidos de forma <strong>100% anônima</strong> para fins fiscais da arena.
              </p>
            </div>

            {deleteError && (
              <div className="flex items-start gap-2 rounded-xl bg-error-bg px-3 py-2 text-xs text-error-text">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingLoading}
                className="px-4 py-2.5 text-xs font-bold text-muted hover:text-charcoal transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deletingLoading}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition disabled:opacity-50"
              >
                {deletingLoading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={15} />}
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

