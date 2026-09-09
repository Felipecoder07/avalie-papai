import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../assets/css/configuracoes.css';

export interface ModalidadeItem {
  nome: string;
  preco: number;
}

interface Quadra {
  id: number;
  nome: string;
  tipo: string;
  modalidades?: (string | ModalidadeItem)[];
  preco_base: number;
  hora_abertura: string;
  hora_fechamento: string;
  status: string;
}

interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: string;
  criado_em: string;
}

interface Motivo {
  id: number;
  motivo: string;
}

interface ArenaData {
  nome: string;
  endereco: string;
  telefone: string;
  email: string;
  fuso_horario?: string;
  notif_reserva_email: number;
  notif_reserva_whatsapp: number;
  notif_cancelamento_email: number;
  notif_pagamento_email: number;
  alerta_pagamento_minutos: number;
  chave_pix?: string;
  titular_pix?: string;
  cidade_pix?: string;
  foto_capa?: string;
}

const OPCOES_MODALIDADES = ['Beach Tennis', 'Vôlei de Praia', 'Futevôlei', 'Funcional', 'Padel', 'Futsal', 'Tênis'];

const PRECOS_SUGERIDOS_PADRAO: Record<string, number> = {
  'Beach Tennis': 120,
  'Vôlei de Praia': 90,
  'Futevôlei': 100,
  'Funcional': 80,
  'Padel': 150,
  'Futsal': 110,
  'Futsal / Society': 130,
  'Tênis': 140,
  'Pickleball': 100,
  'Futmesa': 70
};

const getDefaultSportPrice = (sportNameOrQuadras: Quadra[] | string, sportNameOptional?: string): number => {
  if (Array.isArray(sportNameOrQuadras)) {
    const quadras = sportNameOrQuadras;
    const sportName = sportNameOptional || '';
    for (const q of quadras) {
      if (Array.isArray(q.modalidades)) {
        for (const m of q.modalidades) {
          if (typeof m !== 'string' && m.nome === sportName && m.preco > 0) {
            return m.preco;
          }
        }
      }
    }
    return PRECOS_SUGERIDOS_PADRAO[sportName] || 100;
  } else {
    const sportName = sportNameOrQuadras;
    return PRECOS_SUGERIDOS_PADRAO[sportName] || 100;
  }
};

const formatCurrency = (val: number) => {
  return 'R$ ' + parseFloat(val as any).toFixed(2).replace('.', ',');
};

const formatCurrencyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatFloatToCurrencyInput = (num: number) => {
  if (num == null || isNaN(Number(num))) return '0,00';
  return Number(num).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyToFloat = (value: string) => {
  if (!value) return 0;
  const clean = value.replace(/\./g, '').replace(',', '.');
  return parseFloat(clean) || 0;
};

export function AdminConfiguracoes() {
  const [relAtivo, setRelAtivo] = useState<string>(() => {
    return sessionStorage.getItem('cm_config_tab') || 'quadras';
  });

  const [token] = useState<string>(() => localStorage.getItem('courtmanager_token') || '');

  // Lists state
  const [quadras, setQuadras] = useState<Quadra[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [opcoesModalidades, setOpcoesModalidades] = useState<string[]>(OPCOES_MODALIDADES);
  const [novoEsporteInput, setNovoEsporteInput] = useState('');
  const [arena, setArena] = useState<ArenaData>({
    nome: '',
    endereco: '',
    telefone: '',
    email: '',
    fuso_horario: 'America/Sao_Paulo',
    notif_reserva_email: 0,
    notif_reserva_whatsapp: 0,
    notif_cancelamento_email: 0,
    notif_pagamento_email: 0,
    alerta_pagamento_minutos: 30,
    chave_pix: '',
    titular_pix: '',
    cidade_pix: '',
    foto_capa: ''
  });

  // Configuração Maquineta
  const [maquinetaId, setMaquinetaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  // Loadings
  const [loadingQuadras, setLoadingQuadras] = useState(true);
  const [loadingUsuarios, setLoadingUsuarios] = useState(true);
  const [loadingMotivos, setLoadingMotivos] = useState(true);

  // Modals state
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Plano SaaS Info
  const [planoInfo, setPlanoInfo] = useState<{
    plano: { nome: string; max_quadras: number; max_usuarios: number; valor_mensal: number };
    uso: { quadras_usadas: number; usuarios_usados: number };
  } | null>(null);

  // Forms state: Quadra
  const [nqId, setNqId] = useState<number | null>(null);
  const [nqNome, setNqNome] = useState('');
  const [nqModalidade, setNqModalidade] = useState('');
  const [nqModalidades, setNqModalidades] = useState<ModalidadeItem[]>([
    { nome: 'Beach Tennis', preco: 120 },
    { nome: 'Vôlei de Praia', preco: 90 },
    { nome: 'Futevôlei', preco: 100 }
  ]);
  const [nqPreco, setNqPreco] = useState('100,00');
  const [nqInicio, setNqInicio] = useState('07:00');
  const [nqFim, setNqFim] = useState('22:00');

  const isSportSelected = (m: string) => nqModalidades.some(item => item.nome === m);

  const toggleSport = (m: string) => {
    if (isSportSelected(m)) {
      if (nqModalidades.length > 1) {
        setNqModalidades(prev => prev.filter(i => i.nome !== m));
      }
    } else {
      const defaultPrice = getDefaultSportPrice(quadras, m);
      setNqModalidades(prev => [...prev, { nome: m, preco: defaultPrice }]);
    }
  };

  const updateSportPrice = (m: string, price: number) => {
    setNqModalidades(prev => prev.map(i => i.nome === m ? { ...i, preco: price } : i));
  };

  const handleAddCustomModalidade = () => {
    const trimmed = novoEsporteInput.trim();
    if (!trimmed) return;
    if (!opcoesModalidades.includes(trimmed)) {
      setOpcoesModalidades(prev => [...prev, trimmed]);
    }
    if (!nqModalidades.some(i => i.nome === trimmed)) {
      const defaultPrice = getDefaultSportPrice(quadras, trimmed);
      setNqModalidades(prev => [...prev, { nome: trimmed, preco: defaultPrice }]);
    }
    setNovoEsporteInput('');
  };

  const handleRemoveModalidade = (m: string) => {
    if (nqModalidades.length > 1) {
      setNqModalidades(prev => prev.filter(item => item.nome !== m));
    }
    if (!OPCOES_MODALIDADES.includes(m)) {
      setOpcoesModalidades(prev => prev.filter(item => item !== m));
    }
  };

  // Forms state: Usuario
  const [nuId, setNuId] = useState<number | null>(null);
  const [nuNome, setNuNome] = useState('');
  const [nuEmail, setNuEmail] = useState('');
  const [nuPerfil, setNuPerfil] = useState('');
  const [nuSenha, setNuSenha] = useState('');

  // Forms state: Motivo
  const [nmNome, setNmNome] = useState('');

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleTabChange = (tab: string) => {
    setRelAtivo(tab);
    sessionStorage.setItem('cm_config_tab', tab);
  };

  // --- Fetch API helper ---
  const request = async (url: string, options: RequestInit = {}) => {
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) {
        localStorage.removeItem('courtmanager_token');
        window.location.href = '/login';
        return;
      }
      if (res.status === 403) {
        throw new Error('Acesso negado para este perfil.');
      }
      throw new Error(err.error || 'Erro na requisição');
    }
    return res.json();
  };

  // --- LOAD DATA ---
  const loadQuadras = async () => {
    setLoadingQuadras(true);
    try {
      const data = await request('/api/quadras');
      setQuadras(data);
      if (Array.isArray(data)) {
        const sportsSet = new Set(OPCOES_MODALIDADES);
        data.forEach((q: Quadra) => {
          if (Array.isArray(q.modalidades)) {
            q.modalidades.forEach((m: any) => sportsSet.add(typeof m === 'string' ? m : m.nome));
          }
        });
        setOpcoesModalidades(Array.from(sportsSet));
      }
    } catch (e: any) {
      showToast('Erro ao carregar quadras: ' + e.message, 'error');
    } finally {
      setLoadingQuadras(false);
    }
  };

  const loadUsuarios = async () => {
    setLoadingUsuarios(true);
    try {
      const data = await request('/api/usuarios');
      setUsuarios(data);
    } catch (e: any) {
      showToast('Erro ao carregar usuários: ' + e.message, 'error');
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const loadMotivos = async () => {
    setLoadingMotivos(true);
    try {
      const data = await request('/api/motivos');
      setMotivos(data);
    } catch (e: any) {
      showToast('Erro ao carregar motivos: ' + e.message, 'error');
    } finally {
      setLoadingMotivos(false);
    }
  };

  const loadArena = async () => {
    try {
      const data = await request('/api/arenas/minha');
      setArena({
        nome: data.nome || '',
        endereco: data.endereco || '',
        telefone: data.telefone || '',
        email: data.email || '',
        fuso_horario: data.fuso_horario || 'America/Sao_Paulo',
        notif_reserva_email: data.notif_reserva_email || 0,
        notif_reserva_whatsapp: data.notif_reserva_whatsapp || 0,
        notif_cancelamento_email: data.notif_cancelamento_email || 0,
        notif_pagamento_email: data.notif_pagamento_email || 0,
        alerta_pagamento_minutos: data.alerta_pagamento_minutos || 30,
        chave_pix: data.chave_pix || '',
        titular_pix: data.titular_pix || '',
        cidade_pix: data.cidade_pix || '',
        foto_capa: data.foto_capa || ''
      });
    } catch (e: any) {
      showToast('Erro ao carregar dados da arena: ' + e.message, 'error');
    }
  };

  const loadMaquineta = async () => {
    try {
      const data = await request('/api/gateway/pos');
      if (data) {
        setMaquinetaId(data.pos_serial_number || '');
        setAccessToken(data.access_token || '');
        setPublicKey(data.public_key || '');
      }
    } catch {
      // Configuração opcional
    }
  };

  useEffect(() => {
    const loadPlanoInfo = async () => {
      try {
        const data = await request('/api/tenant/assinatura/plano');
        if (data && data.plano) {
          setPlanoInfo(data);
        }
      } catch {
        // Silencioso se não houver permissão
      }
    };

    if (token) {
      loadQuadras();
      loadUsuarios();
      loadArena();
      loadMaquineta();
      loadMotivos();
      loadPlanoInfo();
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const oauthStatus = params.get('oauth');

    if (code && state) {
      handleTabChange('pagamentos');
      fetch('/api/pagamentos/gateway/oauth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state })
      })
        .then(res => res.json())
        .then(data => {
          if (data.accessToken) {
            setAccessToken(data.accessToken);
            if (data.publicKey) setPublicKey(data.publicKey);
            showToast('✓ Conta do Mercado Pago conectada com sucesso!', 'success');
            loadArena();
            window.history.replaceState({}, document.title, window.location.pathname + '?tab=pagamentos');
          }
        })
        .catch(err => console.error('Erro na troca de código OAuth:', err));
    } else if (oauthStatus === 'success') {
      handleTabChange('pagamentos');
      showToast('✓ Conta do Mercado Pago conectada com sucesso!', 'success');
    }
  }, [token]);

  // --- SAVE QUADRA ---
  const handleSaveQuadra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nqNome || !nqModalidade) {
      showToast('Preencha os campos obrigatórios.', 'warning');
      return;
    }

    try {
      const basePrice = nqModalidades.length > 0 ? nqModalidades[0].preco : (parseCurrencyToFloat(nqPreco) || 80);
      const payload = {
        nome: nqNome,
        tipo: nqModalidade,
        modalidades: nqModalidades.length > 0 ? nqModalidades : [{ nome: nqModalidade, preco: basePrice }],
        preco_base: basePrice,
        hora_abertura: nqInicio,
        hora_fechamento: nqFim
      };

      if (nqId) {
        // Edit
        const currentQuadra = quadras.find(q => q.id === nqId);
        await request(`/api/quadras/${nqId}`, {
          method: 'PUT',
          body: JSON.stringify({ ...payload, status: currentQuadra?.status || 'Ativa' })
        });
        showToast('Quadra atualizada com sucesso!', 'success');
      } else {
        // Create
        await request('/api/quadras', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('Quadra cadastrada com sucesso!', 'success');
      }
      setActiveModal(null);
      loadQuadras();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleStatusQuadra = async (id: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'Ativa' ? 'Inativa' : 'Ativa';
    if (!confirm(`Deseja alterar o status da quadra para ${nextStatus}?`)) return;

    try {
      await request(`/api/quadras/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      });
      showToast('Status da quadra atualizado!', 'success');
      loadQuadras();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteQuadra = async (id: number, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir a quadra "${nome}"?`)) return;

    try {
      const res = await request(`/api/quadras/${id}`, {
        method: 'DELETE'
      });
      showToast(res.message || 'Quadra excluída com sucesso!', 'success');
      setActiveModal(null);
      loadQuadras();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const openEditarQuadraModal = (q: Quadra) => {
    setNqId(q.id);
    setNqNome(q.nome);
    setNqModalidade(q.tipo);
    const normalized = (q.modalidades && q.modalidades.length > 0 ? q.modalidades : [q.tipo || 'Beach Tennis']).map((m: any) => {
      if (typeof m === 'string') return { nome: m, preco: q.preco_base || 80 };
      return { nome: m.nome, preco: Number(m.preco != null ? m.preco : q.preco_base || 80) };
    });
    setNqModalidades(normalized);
    setNqPreco(formatFloatToCurrencyInput(q.preco_base));
    setNqInicio(q.hora_abertura || '07:00');
    setNqFim(q.hora_fechamento || '22:00');
    setActiveModal('editar-quadra');
  };

  const openNovaQuadraModal = () => {
    setNqId(null);
    setNqNome('');
    setNqModalidade('Areia');
    setNqModalidades([
      { nome: 'Beach Tennis', preco: getDefaultSportPrice('Beach Tennis') },
      { nome: 'Vôlei de Praia', preco: getDefaultSportPrice('Vôlei de Praia') },
      { nome: 'Futevôlei', preco: getDefaultSportPrice('Futevôlei') }
    ]);
    setNqPreco('100,00');
    setNqInicio('07:00');
    setNqFim('22:00');
    setActiveModal('nova-quadra');
  };

  // --- SAVE USUARIO ---
  const handleSaveUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuNome || !nuEmail || !nuPerfil) {
      showToast('Preencha nome, e-mail e perfil.', 'warning');
      return;
    }
    if (nuNome.trim().split(/\s+/).length < 2) {
      showToast('Por favor, informe o nome completo (nome e sobrenome).', 'warning');
      return;
    }
    if (!nuId && !nuSenha) {
      showToast('A senha é obrigatória para novos usuários.', 'warning');
      return;
    }

    try {
      const payload: any = { nome: nuNome, email: nuEmail, perfil: nuPerfil };
      if (nuSenha) payload.senha = nuSenha;

      if (nuId) {
        // Edit
        await request(`/api/usuarios/${nuId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        showToast('Usuário atualizado com sucesso!', 'success');

        // Update active sidebar if current user edits themselves
        const loggedUserStr = localStorage.getItem('courtmanager_user');
        if (loggedUserStr) {
          const loggedUser = JSON.parse(loggedUserStr);
          if (loggedUser.id.toString() === nuId.toString()) {
            loggedUser.nome = nuNome;
            loggedUser.perfil = nuPerfil;
            localStorage.setItem('courtmanager_user', JSON.stringify(loggedUser));
            // Trigger local navigation update if page refreshes
          }
        }
      } else {
        // Create
        await request('/api/usuarios', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        showToast('Usuário cadastrado com sucesso!', 'success');
      }
      setActiveModal(null);
      loadUsuarios();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteUsuario = async (id: number, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir o usuário "${nome}"? Esta ação não pode ser desfeita.`)) return;

    try {
      await request(`/api/usuarios/${id}`, {
        method: 'DELETE'
      });
      showToast('Usuário excluído com sucesso!', 'success');
      setActiveModal(null);
      loadUsuarios();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const openEditarUsuarioModal = (u: Usuario) => {
    setNuId(u.id);
    setNuNome(u.nome);
    setNuEmail(u.email);
    setNuPerfil(u.perfil);
    setNuSenha('');
    setActiveModal('usuario');
  };

  const openNovoUsuarioModal = () => {
    setNuId(null);
    setNuNome('');
    setNuEmail('');
    setNuPerfil('');
    setNuSenha('');
    setActiveModal('usuario');
  };

  const handleSaveArena = async (e?: React.FormEvent, silent = false) => {
    if (e) e.preventDefault();
    try {
      await request('/api/arenas/minha', {
        method: 'PUT',
        body: JSON.stringify(arena)
      });
      
      // Salva o Serial Number e Credenciais da maquineta física
      await request('/api/pagamentos/gateway/maquineta', {
        method: 'POST',
        body: JSON.stringify({ 
          gateway_device_id: maquinetaId,
          gateway_access_token: accessToken,
          gateway_public_key: publicKey
        })
      });

      if (!silent) {
        showToast('Configurações salvas com sucesso!', 'success');
      }
      loadArena();
    } catch (err: any) {
      showToast('Erro ao salvar: ' + err.message, 'error');
    }
  };

  const handleToggleNotification = (field: keyof ArenaData, value: number) => {
    setArena({ ...arena, [field]: value });
  };

  const handleAddMotivo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nmNome || !nmNome.trim()) {
      showToast('Digite o motivo do cancelamento.', 'warning');
      return;
    }

    try {
      await request('/api/motivos', {
        method: 'POST',
        body: JSON.stringify({ motivo: nmNome.trim() })
      });
      showToast('Motivo adicionado com sucesso!', 'success');
      setActiveModal(null);
      setNmNome('');
      loadMotivos();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRemoveMotivo = async (id: number, nome: string) => {
    if (!confirm(`Tem certeza que deseja remover o motivo "${nome}"?`)) return;

    try {
      await request(`/api/motivos/${id}`, {
        method: 'DELETE'
      });
      showToast('Motivo removido com sucesso!', 'success');
      loadMotivos();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="admin-configuracoes-page">
      {/* Toast Alert */}
      {toast && (
        <div 
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-white font-medium shadow-lg transition-transform duration-200 ${
            toast.type === 'success' ? 'bg-success' : toast.type === 'warning' ? 'bg-warning' : 'bg-danger'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="config-layout">
        {/* Navegação lateral */}
        <nav className="config-nav" aria-label="Seções de configuração">
          <button 
            className={`config-nav-item w-full text-left ${relAtivo === 'quadras' ? 'active' : ''}`}
            onClick={() => handleTabChange('quadras')}
          >
            Quadras
          </button>
          <button 
            className={`config-nav-item w-full text-left ${relAtivo === 'usuarios' ? 'active' : ''}`}
            onClick={() => handleTabChange('usuarios')}
          >
            Usuários
          </button>
          <button 
            className={`config-nav-item w-full text-left ${relAtivo === 'pagamentos' ? 'active' : ''}`}
            onClick={() => handleTabChange('pagamentos')}
          >
            Pagamentos
          </button>
          <button 
            className={`config-nav-item w-full text-left ${relAtivo === 'notificacoes' ? 'active' : ''}`}
            onClick={() => handleTabChange('notificacoes')}
          >
            Notificações
          </button>
          <button 
            className={`config-nav-item w-full text-left ${relAtivo === 'cancelamentos' ? 'active' : ''}`}
            onClick={() => handleTabChange('cancelamentos')}
          >
            Motivos de Cancelamento
          </button>
          <button 
            className={`config-nav-item w-full text-left ${relAtivo === 'arena' ? 'active' : ''}`}
            onClick={() => handleTabChange('arena')}
          >
            Arena
          </button>
        </nav>

        {/* Conteúdo Dinâmico */}
        <div className="config-content">
          
          {/* QUADRAS */}
          <div className={`config-section card ${relAtivo === 'quadras' ? 'active' : ''}`}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 className="card-title">Quadras</h2>
                {planoInfo && planoInfo.plano.max_quadras > 0 && (
                  <span style={{ fontSize: '12px', color: quadras.filter(q => q.status !== 'Excluida').length >= planoInfo.plano.max_quadras ? '#d97706' : 'var(--muted)' }}>
                    Plano {planoInfo.plano.nome}: {quadras.filter(q => q.status !== 'Excluida').length}/{planoInfo.plano.max_quadras} quadras
                    {quadras.filter(q => q.status !== 'Excluida').length >= planoInfo.plano.max_quadras && ' (Limite atingido)'}
                  </span>
                )}
              </div>
              <button className="btn-primary" onClick={openNovaQuadraModal}>+ Nova Quadra</button>
            </div>
            <div className="table-wrap">
              <table aria-label="Quadras cadastradas">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Modalidade</th>
                    <th>Início</th>
                    <th>Fim</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingQuadras ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>
                        Carregando quadras...
                      </td>
                    </tr>
                  ) : quadras.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>
                        Nenhuma quadra cadastrada.
                      </td>
                    </tr>
                  ) : (
                    quadras.map(q => {
                      const isAtiva = q.status === 'Ativa';
                      return (
                        <tr key={q.id}>
                          <td>
                            <strong>{q.nome}</strong>
                            <br />
                            <small style={{ color: 'var(--muted)' }}>{formatCurrency(q.preco_base)}/h</small>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>{q.tipo}</span>
                            {q.modalidades && q.modalidades.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                {q.modalidades.map((m: any) => {
                                  const name = typeof m === 'string' ? m : m.nome;
                                  const price = typeof m === 'string' ? q.preco_base : (m.preco != null ? m.preco : q.preco_base);
                                  return (
                                    <span 
                                      key={name} 
                                      style={{ 
                                        fontSize: '11px', 
                                        padding: '2px 8px', 
                                        backgroundColor: 'var(--card-subtle, #e2e8f0)', 
                                        borderRadius: '10px', 
                                        color: 'var(--text, #334155)',
                                        fontWeight: 500
                                      }}
                                    >
                                      {name} · {formatCurrency(price)}/h
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td>{q.hora_abertura || '07:00'}</td>
                          <td>{q.hora_fechamento || '22:00'}</td>
                          <td>
                            <span className={`badge ${isAtiva ? 'badge--paid' : 'badge--pending'}`}>
                              {q.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button className="btn-ghost btn-sm" onClick={() => openEditarQuadraModal(q)}>
                                Editar
                              </button>
                              <button className="btn-ghost btn-sm" onClick={() => handleToggleStatusQuadra(q.id, q.status)}>
                                {isAtiva ? 'Desativar' : 'Ativar'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* USUARIOS */}
          <div className={`config-section card ${relAtivo === 'usuarios' ? 'active' : ''}`}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 className="card-title">Usuários do Sistema</h2>
                {planoInfo && planoInfo.plano.max_usuarios > 0 && (
                  <span style={{ fontSize: '12px', color: usuarios.length >= planoInfo.plano.max_usuarios ? '#d97706' : 'var(--muted)' }}>
                    Plano {planoInfo.plano.nome}: {usuarios.length}/{planoInfo.plano.max_usuarios} funcionários
                    {usuarios.length >= planoInfo.plano.max_usuarios && ' (Limite atingido)'}
                  </span>
                )}
              </div>
              <button className="btn-primary" onClick={openNovoUsuarioModal}>+ Novo Usuário</button>
            </div>
            <div className="table-wrap">
              <table aria-label="Usuários do sistema">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Perfil</th>
                    <th>Último acesso</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUsuarios ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>
                        Carregando usuários...
                      </td>
                    </tr>
                  ) : usuarios.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>
                        Nenhum usuário cadastrado.
                      </td>
                    </tr>
                  ) : (
                    usuarios.map(u => {
                      let badgeClass = 'badge--pending';
                      if (u.perfil === 'Administrador') badgeClass = 'badge--paid';
                      if (u.perfil === 'Gerente') badgeClass = 'badge--partial';

                      const dataCriacao = new Date(u.criado_em).toLocaleDateString('pt-BR');
                      return (
                        <tr key={u.id}>
                          <td><strong>{u.nome}</strong></td>
                          <td>{u.email}</td>
                          <td><span className={`badge ${badgeClass}`}>{u.perfil}</span></td>
                          <td>{dataCriacao}</td>
                          <td>Ativo</td>
                          <td>
                            <button className="btn-ghost btn-sm" onClick={() => openEditarUsuarioModal(u)}>
                              Editar
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* NOTIFICACOES */}
          <form className={`config-section card ${relAtivo === 'notificacoes' ? 'active' : ''}`} onSubmit={handleSaveArena}>
            <div className="card-header">
              <h2 className="card-title">Notificações</h2>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">Confirmação de reserva por e-mail</div>
                <div className="setting-desc">Envia e-mail ao cliente quando uma reserva é criada</div>
              </div>
              <label className="toggle">
                <input 
                  type="checkbox" 
                  checked={arena.notif_reserva_email === 1}
                  onChange={(e) => handleToggleNotification('notif_reserva_email', e.target.checked ? 1 : 0)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">Confirmação de reserva por WhatsApp</div>
                <div className="setting-desc">Envia link de WhatsApp ao cliente quando uma reserva é criada</div>
              </div>
              <label className="toggle">
                <input 
                  type="checkbox" 
                  checked={arena.notif_reserva_whatsapp === 1}
                  onChange={(e) => handleToggleNotification('notif_reserva_whatsapp', e.target.checked ? 1 : 0)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">Cancelamento por e-mail</div>
                <div className="setting-desc">Notifica o cliente quando sua reserva é cancelada</div>
              </div>
              <label className="toggle">
                <input 
                  type="checkbox" 
                  checked={arena.notif_cancelamento_email === 1}
                  onChange={(e) => handleToggleNotification('notif_cancelamento_email', e.target.checked ? 1 : 0)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">Comprovante de pagamento por e-mail</div>
                <div className="setting-desc">Envia comprovante PDF ao cliente após pagamento confirmado</div>
              </div>
              <label className="toggle">
                <input 
                  type="checkbox" 
                  checked={arena.notif_pagamento_email === 1}
                  onChange={(e) => handleToggleNotification('notif_pagamento_email', e.target.checked ? 1 : 0)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-name">Alerta de pagamento pendente (minutos)</div>
                <div className="setting-desc">Alerta no dashboard quando uma reserva iniciada tem saldo devedor há X minutos</div>
              </div>
              <input 
                type="number" 
                min="5" 
                style={{ width: '72px', textAlign: 'center' }}
                value={arena.alerta_pagamento_minutos}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 5;
                  setArena({ ...arena, alerta_pagamento_minutos: val });
                }}
                aria-label="Minutos para alerta de pagamento pendente"
              />
            </div>
            <div style={{ marginTop: 'var(--s-4)', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-primary" id="btn-salvar-notificacoes">Salvar Notificações</button>
            </div>
          </form>

          {/* CANCELAMENTOS */}
          <div className={`config-section card ${relAtivo === 'cancelamentos' ? 'active' : ''}`}>
            <div className="card-header">
              <h2 className="card-title">Motivos de Cancelamento</h2>
              <button className="btn-ghost" onClick={() => setActiveModal('motivo')}>+ Adicionar</button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: 'var(--s-4)' }}>
              Estes motivos são exibidos ao cancelar uma reserva (RF-RES-015).
            </p>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
              {loadingMotivos ? (
                <li style={{ padding: '8px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                  Carregando motivos...
                </li>
              ) : motivos.length === 0 ? (
                <li style={{ padding: '8px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
                  Nenhum motivo cadastrado.
                </li>
              ) : (
                motivos.map((m, index) => (
                  <li 
                    key={m.id}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '8px 0',
                      borderBottom: index !== motivos.length - 1 ? '1px solid var(--charcoal-03)' : 'none'
                    }}
                  >
                    <span style={{ fontSize: '13px' }}>{m.motivo}</span>
                    <button className="btn-ghost btn-sm" onClick={() => handleRemoveMotivo(m.id, m.motivo)}>
                      Remover
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* SEÇÃO SEPARADA: PAGAMENTOS & MAQUINETA */}
          <form className={`config-section card ${relAtivo === 'pagamentos' ? 'active' : ''}`} onSubmit={handleSaveArena}>
            <div className="card-header">
              <h2 className="card-title">Pagamentos</h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: 'var(--s-4)' }}>
              Configure as credenciais bancárias e as maquinetas físicas da sua Arena para receber pagamentos de Pix e Cartão diretamente na sua conta.
            </p>

            {/* BANNER OAUTH CONEXÃO AUTOMÁTICA */}
            <div style={{
              backgroundColor: 'rgba(0, 158, 227, 0.08)',
              border: '1px solid rgba(0, 158, 227, 0.3)',
              borderRadius: 'var(--r-md)',
              padding: 'var(--s-4)',
              marginBottom: 'var(--s-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#007eb5', margin: 0 }}>
                    Conexão Automática Mercado Pago
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--charcoal)', margin: '4px 0 0 0' }}>
                    Conecte a conta bancária da sua arena em 1 clique sem precisar copiar chaves ou códigos manuais.
                  </p>
                </div>
                {accessToken ? (
                  <span style={{ background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                    ✓ Conta Conectada
                  </span>
                ) : (
                  <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                    ⚠️ Pendente (Não Conectado)
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  style={{
                    background: '#009ee3',
                    color: 'white',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onClick={async () => {
                    try {
                      const authToken = localStorage.getItem('courtmanager_token') || token;
                      const res = await fetch('/api/pagamentos/gateway/oauth/url', {
                        headers: { 'Authorization': `Bearer ${authToken}` }
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar conexão automática.');
                      if (data.url) {
                        window.location.href = data.url;
                      }
                    } catch (e: any) {
                      setToast({ message: e.message || 'Erro ao iniciar conexão automática.', type: 'error' });
                    }
                  }}
                >
                  {accessToken ? '🔗 Reautorizar ou Trocar Conta' : '🔗 Conectar com Mercado Pago'}
                </button>

                {accessToken && (
                  <button
                    type="button"
                    style={{
                      background: 'rgba(224, 86, 86, 0.1)',
                      color: 'var(--danger)',
                      border: '1px solid rgba(224, 86, 86, 0.3)',
                      padding: '10px 16px',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                    onClick={async () => {
                      try {
                        const authToken = localStorage.getItem('courtmanager_token') || token;
                        const res = await fetch('/api/pagamentos/gateway/oauth/desconectar', {
                          method: 'POST',
                          headers: { 'Authorization': `Bearer ${authToken}` }
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Erro ao desconectar.');
                        
                        setAccessToken('');
                        setPublicKey('');
                        showToast('Conta Mercado Pago desconectada com sucesso!', 'success');
                        loadArena();
                      } catch (e: any) {
                        showToast('Erro ao desconectar: ' + e.message, 'error');
                      }
                    }}
                  >
                    ❌ Desconectar Conta
                  </button>
                )}
              </div>
            </div>

            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: 'var(--s-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Ou insira as chaves manuais (Avançado)
            </div>

            <div className="form-group">
              <label htmlFor="arena-token">Chave de API / Access Token da Arena (Mercado Pago / PagBank)</label>
              <input 
                type="password" 
                id="arena-token" 
                placeholder="Ex: APP_USR-1234567890..."
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
              <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                Chave secreta obtida no painel da conta bancária da Arena. Garante que os pagamentos caiam direto na sua conta.
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="arena-public-key">Chave Pública / Public Key (Opcional)</label>
              <input 
                type="text" 
                id="arena-public-key" 
                placeholder="Ex: APP_USR-9876543210..."
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
              />
              <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                Utilizada para a geração de formulários transparentes de cartão de crédito no Portal do Cliente.
              </span>
            </div>

            <div style={{ height: '1px', background: 'var(--border-passive)', margin: 'var(--s-4) 0' }}></div>

            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--s-3)' }}>Chave Pix Direta da Arena (Sem Intermediários)</h3>

            <div className="form-group">
              <label htmlFor="arena-chave-pix">Chave Pix da Arena (E-mail / CNPJ / Telefone / EVP)</label>
              <input 
                type="text" 
                id="arena-chave-pix" 
                placeholder="Ex: financeiro@suaarena.com.br ou 12.345.678/0001-90"
                value={arena.chave_pix || ''}
                onChange={(e) => setArena({ ...arena, chave_pix: e.target.value })}
              />
              <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                Cadastre a sua chave Pix para gerar o QR Code oficial diretamente na conta da sua Arena.
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-3)' }}>
              <div className="form-group">
                <label htmlFor="arena-titular-pix">Titular da Conta Pix</label>
                <input 
                  type="text" 
                  id="arena-titular-pix" 
                  placeholder="Ex: Felp Arena Ltda"
                  value={arena.titular_pix || ''}
                  onChange={(e) => setArena({ ...arena, titular_pix: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="arena-cidade-pix">Cidade do Titular</label>
                <input 
                  type="text" 
                  id="arena-cidade-pix" 
                  placeholder="Ex: SAO PAULO"
                  value={arena.cidade_pix || ''}
                  onChange={(e) => setArena({ ...arena, cidade_pix: e.target.value })}
                />
              </div>
            </div>

            <div style={{ height: '1px', background: 'var(--border-passive)', margin: 'var(--s-4) 0' }}></div>
            
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--s-3)' }}>Maquineta Física do Balcão (POS Smart Cloud)</h3>

            <div className="form-group">
              <label htmlFor="arena-maquineta">Número de Série da Maquineta (Serial Number / Device ID)</label>
              <input 
                type="text" 
                id="arena-maquineta" 
                placeholder="Ex: MP-POINT-12345"
                value={maquinetaId}
                onChange={(e) => setMaquinetaId(e.target.value)}
              />
              <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                Código localizado na etiqueta atrás do aparelho. Conecta o caixa do sistema diretamente ao visor da maquineta via Wi-Fi/4G.
              </span>
            </div>

            <div style={{ marginTop: 'var(--s-4)', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-primary" id="btn-salvar-pagamentos">Salvar Configurações de Pagamento</button>
            </div>
          </form>

          {/* ARENA */}
          <form className={`config-section card ${relAtivo === 'arena' ? 'active' : ''}`} onSubmit={handleSaveArena}>
            <div className="card-header">
              <h2 className="card-title">Dados da Arena</h2>
            </div>
            <div className="form-group">
              <label htmlFor="arena-nome">Nome da Arena</label>
              <input 
                type="text" 
                id="arena-nome" 
                value={arena.nome}
                onChange={(e) => setArena({ ...arena, nome: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="arena-endereco">Endereço</label>
              <input 
                type="text" 
                id="arena-endereco" 
                value={arena.endereco}
                onChange={(e) => setArena({ ...arena, endereco: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="arena-telefone">Telefone</label>
              <input 
                type="tel" 
                id="arena-telefone" 
                value={arena.telefone}
                onChange={(e) => setArena({ ...arena, telefone: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="arena-email">E-mail de contato</label>
              <input 
                type="email" 
                id="arena-email" 
                value={arena.email}
                onChange={(e) => setArena({ ...arena, email: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="arena-fuso">Horário Local da Arena (Fuso Horário)</label>
              <select 
                id="arena-fuso"
                value={arena.fuso_horario || 'America/Sao_Paulo'}
                onChange={(e) => setArena({ ...arena, fuso_horario: e.target.value })}
              >
                <option value="America/Sao_Paulo">Horário de Brasília (SP, RJ, MG, ES, Sul, Nordeste, GO, DF, TO, PA, AP - UTC-3)</option>
                <option value="America/Manaus">Horário do Amazonas / MT / MS / RO / RR (AM, MT, MS, RO, RR - UTC-4)</option>
                <option value="America/Rio_Branco">Horário do Acre (AC - UTC-5)</option>
                <option value="America/Noronha">Horário de Fernando de Noronha (UTC-2)</option>
              </select>
              <span style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginTop: '4px' }}>
                Garante que a agenda, caixa e relatórios funcionem exatamente na hora da sua cidade.
              </span>
            </div>
            <div style={{ height: '1px', background: 'var(--border-passive)', margin: 'var(--s-4) 0' }}></div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: 'var(--s-2)' }}>Foto de Capa da Arena (Aparência para os Clientes)</h3>
            <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: 'var(--s-4)' }}>
              Esta imagem será exibida no cabeçalho e na tela de login da sua arena para os atletas.
            </p>

            {/* Preview da Imagem */}
            <div style={{ marginBottom: 'var(--s-4)', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{
                width: '200px',
                height: '110px',
                borderRadius: '10px',
                overflow: 'hidden',
                border: '2px solid var(--border-passive)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                background: '#1e293b',
                position: 'relative'
              }}>
                <img 
                  src={
                    !arena.foto_capa 
                      ? 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&q=80&w=1200' 
                      : arena.foto_capa.startsWith('http://') || arena.foto_capa.startsWith('https://') || arena.foto_capa.startsWith('data:')
                        ? arena.foto_capa 
                        : `${arena.foto_capa}`
                  } 
                  alt="Preview da capa" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label 
                  htmlFor="file-upload-input" 
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '9px 16px',
                    background: '#3b82f6',
                    color: '#fff',
                    borderRadius: '6px',
                    cursor: uploadingImage ? 'wait' : 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                    width: 'fit-content'
                  }}
                >
                  {uploadingImage ? 'Enviando foto...' : 'Escolher Foto do Dispositivo (PC / Celular)'}
                </label>
                <input 
                  type="file" 
                  id="file-upload-input" 
                  accept="image/*" 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    if (!file.type.startsWith('image/')) {
                      showToast('Por favor, selecione um arquivo de imagem válido.', 'warning');
                      return;
                    }

                    if (file.size > 5 * 1024 * 1024) {
                      showToast('A foto selecionada é maior que 5MB.', 'warning');
                      return;
                    }

                    setUploadingImage(true);
                    const reader = new FileReader();
                    reader.onload = async () => {
                      try {
                        const base64 = reader.result as string;
                        const res = await request('/api/arenas/upload-capa', {
                          method: 'POST',
                          body: JSON.stringify({ image: base64 })
                        });
                        if (res.foto_capa) {
                          setArena(prev => ({ ...prev, foto_capa: res.foto_capa }));
                          showToast('✓ Imagem do dispositivo enviada com sucesso!', 'success');
                        }
                      } catch (err: any) {
                        showToast('Erro ao enviar imagem: ' + err.message, 'error');
                      } finally {
                        setUploadingImage(false);
                      }
                    };
                    reader.onerror = () => {
                      showToast('Erro ao ler arquivo da imagem.', 'error');
                      setUploadingImage(false);
                    };
                    reader.readAsDataURL(file);
                  }} 
                  style={{ display: 'none' }} 
                  disabled={uploadingImage}
                />
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  Suporta arquivos PNG, JPG, JPEG e WEBP (Máx: 5MB).
                </span>
              </div>
            </div>

            {/* URL Externa */}
            <div className="form-group" style={{ marginBottom: 'var(--s-4)' }}>
              <label htmlFor="arena-foto-url">Ou Cole uma URL de Imagem Externa</label>
              <input 
                type="text" 
                id="arena-foto-url" 
                placeholder="Ex: https://suaarena.com.br/foto-capa.jpg"
                value={arena.foto_capa || ''}
                onChange={(e) => setArena({ ...arena, foto_capa: e.target.value })}
              />
            </div>

            {/* Preséts Sugeridos */}
            <div style={{ marginBottom: 'var(--s-4)' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>
                Ou escolha uma sugestão pronta de quadra esportiva:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                {[
                  { title: 'Vôlei / Beach Tennis (Areia)', url: 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&q=80&w=1200' },
                  { title: 'Quadra de Areia Tropical', url: 'https://images.unsplash.com/photo-1592656094267-764a45160876?auto=format&fit=crop&q=80&w=1200' },
                  { title: 'Quadra Esportiva Coberta', url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=1200' },
                  { title: 'Futebol Society / Gramado', url: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=1200' }
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setArena({ ...arena, foto_capa: preset.url })}
                    style={{
                      border: arena.foto_capa === preset.url ? '2px solid #3b82f6' : '1px solid var(--border-passive)',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      padding: 0,
                      background: 'none',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <img src={preset.url} alt={preset.title} style={{ width: '100%', height: '65px', objectFit: 'cover', display: 'block' }} />
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '4px 6px', display: 'block', color: 'var(--text-main)' }}>
                      {preset.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height: '1px', background: 'var(--border-passive)', margin: 'var(--s-4) 0' }}></div>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--s-3)' }}>Aparência do Sistema</h3>
            <div className="form-group">
              <label htmlFor="arena-intervalo-grade">Intervalo da grade de horários (Reservas)</label>
              <select 
                id="arena-intervalo-grade" 
                style={{ maxWidth: '200px' }}
                value={localStorage.getItem('grade_interval') || '60'}
                onChange={(e) => {
                  localStorage.setItem('grade_interval', e.target.value);
                  showToast('Intervalo da grade salvo!', 'success');
                }}
              >
                <option value="60">60 em 60 minutos</option>
                <option value="30">30 em 30 minutos</option>
              </select>
            </div>

            <div style={{ marginTop: 'var(--s-5)', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn-primary" id="btn-salvar-arena" style={{ padding: '12px 28px', fontSize: '14px', fontWeight: 600 }}>
                Salvar Todas as Configurações da Arena
              </button>
            </div>
          </form>

        </div>
      </div>

      {/* MODAL: NOVA QUADRA */}
      <div
        className={`modal-overlay ${activeModal === 'nova-quadra' ? 'open' : ''}`}
        role="presentation"
        onClick={() => setActiveModal(null)}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setActiveModal(null); }}
      >
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-nq-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {planoInfo && planoInfo.plano.max_quadras > 0 && quadras.filter(q => q.status !== 'Excluida').length >= planoInfo.plano.max_quadras ? (
            <div>
              <div className="modal-header">
                <div>
                  <h2 className="modal-title" id="modal-nq-title">Limite de Quadras Atingido</h2>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>Plano {planoInfo.plano.nome} · {quadras.filter(q => q.status !== 'Excluida').length}/{planoInfo.plano.max_quadras} quadras em uso</p>
                </div>
                <button type="button" className="modal-close" aria-label="Fechar" onClick={() => setActiveModal(null)}>✕</button>
              </div>

              <div className="modal-body" style={{ padding: '24px 20px', textAlign: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '8px' }}>
                  Capacidade máxima do plano atingida
                </h3>

                <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5', maxWidth: '380px', margin: '0 auto 20px auto' }}>
                  Sua arena já está utilizando o limite de <strong>{planoInfo.plano.max_quadras} quadras</strong> do plano <strong>{planoInfo.plano.nome}</strong>. Para cadastrar novas quadras, faça o upgrade da sua assinatura.
                </p>

                <div 
                  style={{ 
                    background: '#f8fafc', 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '8px', 
                    padding: '12px 16px', 
                    fontSize: '12.5px', 
                    color: 'var(--charcoal)', 
                    textAlign: 'left',
                    marginBottom: '20px'
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#2563eb', marginBottom: '4px' }}>
                    💡 Benefícios do Upgrade de Plano:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: '1.5', color: '#475569' }}>
                    <li>Mais quadras disponíveis simultâneas</li>
                    <li>Cadastro de novos funcionários e colaboradores</li>
                    <li>Ativação imediata e sem perda de histórico</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <Link 
                    to="/admin/assinatura" 
                    className="btn-primary" 
                    style={{ background: '#2563eb', color: '#fff', textDecoration: 'none', padding: '10px 22px', fontSize: '13.5px', fontWeight: 600, borderRadius: '6px', display: 'inline-flex', alignItems: 'center' }}
                  >
                    Fazer Upgrade de Plano
                  </Link>
                  <button type="button" className="btn-ghost" onClick={() => setActiveModal(null)}>
                    Voltar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveQuadra}>
              <div className="modal-header">
                <h2 className="modal-title" id="modal-nq-title">Nova Quadra</h2>
                <button type="button" className="modal-close" aria-label="Fechar" onClick={() => setActiveModal(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="nq-nome">Nome da quadra *</label>
                  <input 
                    type="text" 
                    id="nq-nome" 
                    placeholder="Ex: Quadra 5" 
                    value={nqNome}
                    onChange={(e) => setNqNome(e.target.value)}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="nq-modalidade">Tipo Principal de Piso *</label>
                  <select 
                    id="nq-modalidade" 
                    value={nqModalidade}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNqModalidade(val);
                      if (val === 'Areia') {
                        setNqModalidades([
                          { nome: 'Beach Tennis', preco: getDefaultSportPrice('Beach Tennis') },
                          { nome: 'Vôlei de Praia', preco: getDefaultSportPrice('Vôlei de Praia') },
                          { nome: 'Futevôlei', preco: getDefaultSportPrice('Futevôlei') }
                        ]);
                      } else if (val === 'Padel') {
                        setNqModalidades([{ nome: 'Padel', preco: getDefaultSportPrice('Padel') }]);
                      } else if (val === 'Tênis') {
                        setNqModalidades([{ nome: 'Tênis', preco: getDefaultSportPrice('Tênis') }]);
                      } else if (val === 'Futsal / Society') {
                        setNqModalidades([{ nome: 'Futsal', preco: getDefaultSportPrice('Futsal') }]);
                      }
                    }}
                    required
                  >
                    <option value="">Selecione</option>
                    <option value="Areia">Areia</option>
                    <option value="Beach Tennis">Beach Tennis</option>
                    <option value="Vôlei">Vôlei de Praia</option>
                    <option value="Futevôlei">Futevôlei</option>
                    <option value="Padel">Padel</option>
                    <option value="Futsal / Society">Futsal / Society</option>
                    <option value="Tênis">Tênis</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div className="form-group">
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>Modalidades Suportadas nesta Quadra:</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    {opcoesModalidades.map(m => {
                      const sel = isSportSelected(m);
                      const isCustom = !OPCOES_MODALIDADES.includes(m);
                      return (
                        <div
                          key={m}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            border: sel ? '1.5px solid var(--accent, #3b82f6)' : '1px solid #cbd5e1',
                            backgroundColor: sel ? 'rgba(59, 130, 246, 0.12)' : '#fff',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSport(m)}
                            style={{
                              padding: '5px 10px',
                              fontSize: '12px',
                              fontWeight: 600,
                              border: 'none',
                              background: 'transparent',
                              color: sel ? 'var(--accent, #2563eb)' : '#64748b',
                              cursor: 'pointer'
                            }}
                          >
                            {sel ? '✓ ' : '+ '} {m}
                          </button>
                          {isCustom && (
                            <button
                              type="button"
                              title="Excluir modalidade"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveModalidade(m);
                              }}
                              style={{
                                border: 'none',
                                background: 'transparent',
                                padding: '5px 8px 5px 2px',
                                fontSize: '11px',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontWeight: 'bold'
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
              {/* Campo para adicionar modalidade personalizada */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input
                  type="text"
                  placeholder="Novo esporte (ex: Pickleball, Futmesa)..."
                  value={novoEsporteInput}
                  onChange={(e) => setNovoEsporteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomModalidade();
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1'
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddCustomModalidade}
                  style={{
                    padding: '8px 14px',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f1f5f9',
                    color: '#334155',
                    cursor: 'pointer'
                  }}
                >
                  + Adicionar
                </button>
              </div>

              {/* Lista de Preços por Modalidade Individual */}
              {nqModalidades.length > 0 && (
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '2px' }}>
                    Preço por hora para cada modalidade nesta quadra:
                  </label>
                  {nqModalidades.map(m => (
                    <div 
                      key={m.nome} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        padding: '10px 14px', 
                        backgroundColor: 'var(--card-subtle, #f8fafc)', 
                        borderRadius: '10px', 
                        border: '1px solid #e2e8f0' 
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--accent, #2563eb)' }}>●</span>
                        <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e293b' }}>{m.nome}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>R$</span>
                        <input
                          type="text"
                          value={formatFloatToCurrencyInput(m.preco)}
                          onChange={(e) => updateSportPrice(m.nome, parseCurrencyToFloat(formatCurrencyInput(e.target.value)))}
                          style={{ width: '110px', padding: '7px 10px', fontSize: '13.5px', textAlign: 'right', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 600, minHeight: '36px' }}
                          placeholder="0,00"
                          required
                        />
                        <span style={{ fontSize: '12px', color: '#64748b' }}>/h</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-4)' }}>
                  <div className="form-group">
                    <label htmlFor="nq-inicio">Horário de abertura *</label>
                    <input 
                      type="time" 
                      id="nq-inicio" 
                      value={nqInicio}
                      onChange={(e) => setNqInicio(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="nq-fim">Horário de fechamento *</label>
                    <input 
                      type="time" 
                      id="nq-fim" 
                      value={nqFim}
                      onChange={(e) => setNqFim(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-ghost" onClick={() => setActiveModal(null)}>Cancelar</button>
                <button type="submit" className="btn-primary">Salvar Quadra</button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* MODAL: EDITAR QUADRA */}
      <div
        className={`modal-overlay ${activeModal === 'editar-quadra' ? 'open' : ''}`}
        role="presentation"
        onClick={() => setActiveModal(null)}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setActiveModal(null); }}
      >
        <form className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-eq-title" onSubmit={handleSaveQuadra} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title" id="modal-eq-title">Editar Quadra</h2>
            <button type="button" className="modal-close" aria-label="Fechar" onClick={() => setActiveModal(null)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-group">
            <label htmlFor="eq-nome">Nome da quadra *</label>
            <input 
              type="text" 
              id="eq-nome" 
              value={nqNome}
              onChange={(e) => setNqNome(e.target.value)}
              required 
            />
          </div>
          <div className="form-group">
            <label htmlFor="eq-modalidade">Tipo Principal de Piso *</label>
            <select 
              id="eq-modalidade" 
              value={nqModalidade}
              onChange={(e) => setNqModalidade(e.target.value)}
              required
            >
              <option value="">Selecione</option>
              <option value="Areia">Areia</option>
              <option value="Beach Tennis">Beach Tennis</option>
              <option value="Vôlei">Vôlei de Praia</option>
              <option value="Futevôlei">Futevôlei</option>
              <option value="Padel">Padel</option>
              <option value="Futsal / Society">Futsal / Society</option>
              <option value="Tênis">Tênis</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>Modalidades Suportadas nesta Quadra:</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {opcoesModalidades.map(m => {
                const sel = isSportSelected(m);
                const isCustom = !OPCOES_MODALIDADES.includes(m);
                return (
                  <div
                    key={m}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      border: sel ? '1.5px solid var(--accent, #3b82f6)' : '1px solid #cbd5e1',
                      backgroundColor: sel ? 'rgba(59, 130, 246, 0.12)' : '#fff',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSport(m)}
                      style={{
                        padding: '5px 10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: 'none',
                        background: 'transparent',
                        color: sel ? 'var(--accent, #2563eb)' : '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      {sel ? '✓ ' : '+ '} {m}
                    </button>
                    {isCustom && (
                      <button
                        type="button"
                        title="Excluir modalidade"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveModalidade(m);
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          padding: '5px 8px 5px 2px',
                          fontSize: '11px',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Campo para adicionar modalidade personalizada */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              <input
                type="text"
                placeholder="Novo esporte (ex: Pickleball, Futmesa)..."
                value={novoEsporteInput}
                onChange={(e) => setNovoEsporteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomModalidade();
                  }
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '13px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1'
                }}
              />
              <button
                type="button"
                onClick={handleAddCustomModalidade}
                style={{
                  padding: '8px 14px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f1f5f9',
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                + Adicionar
              </button>
            </div>

            {/* Lista de Preços por Modalidade Individual */}
            {nqModalidades.length > 0 && (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '2px' }}>
                  Preço por hora para cada modalidade nesta quadra:
                </label>
                {nqModalidades.map(m => (
                  <div 
                    key={m.nome} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: '10px 14px', 
                      backgroundColor: 'var(--card-subtle, #f8fafc)', 
                      borderRadius: '10px', 
                      border: '1px solid #e2e8f0' 
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--accent, #2563eb)' }}>●</span>
                      <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e293b' }}>{m.nome}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>R$</span>
                      <input
                        type="text"
                        value={formatFloatToCurrencyInput(m.preco)}
                        onChange={(e) => updateSportPrice(m.nome, parseCurrencyToFloat(formatCurrencyInput(e.target.value)))}
                        style={{ width: '110px', padding: '7px 10px', fontSize: '13.5px', textAlign: 'right', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 600, minHeight: '36px' }}
                        placeholder="0,00"
                        required
                      />
                      <span style={{ fontSize: '12px', color: '#64748b' }}>/h</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-4)' }}>
            <div className="form-group">
              <label htmlFor="eq-inicio">Horário de abertura *</label>
              <input 
                type="time" 
                id="eq-inicio" 
                value={nqInicio}
                onChange={(e) => setNqInicio(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="eq-fim">Horário de fechamento *</label>
              <input 
                type="time" 
                id="eq-fim" 
                value={nqFim}
                onChange={(e) => setNqFim(e.target.value)}
              />
            </div>
          </div>
          </div>
          <div className="modal-footer" style={{ display: 'flex' }}>
            <button 
              type="button" 
              className="btn-ghost" 
              style={{ color: 'var(--danger)', borderColor: 'var(--danger-bg)', marginRight: 'auto' }}
              onClick={() => nqId && handleDeleteQuadra(nqId, nqNome)}
            >
              Excluir
            </button>
            <button type="button" className="btn-ghost" onClick={() => setActiveModal(null)}>Cancelar</button>
            <button type="submit" className="btn-primary">Salvar Alterações</button>
          </div>
        </form>
      </div>

      {/* MODAL: CRIAR/EDITAR USUÁRIO */}
      <div
        className={`modal-overlay ${activeModal === 'usuario' ? 'open' : ''}`}
        role="presentation"
        onClick={() => setActiveModal(null)}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setActiveModal(null); }}
      >
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-u-title" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {!nuId && planoInfo && planoInfo.plano.max_usuarios > 0 && usuarios.length >= planoInfo.plano.max_usuarios ? (
            <div>
              <div className="modal-header">
                <div>
                  <h2 className="modal-title" id="modal-u-title">Limite de Usuários Atingido</h2>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>Plano {planoInfo.plano.nome} · {usuarios.length}/{planoInfo.plano.max_usuarios} funcionários em uso</p>
                </div>
                <button type="button" className="modal-close" aria-label="Fechar" onClick={() => setActiveModal(null)}>✕</button>
              </div>

              <div className="modal-body" style={{ padding: '24px 20px', textAlign: 'center' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '8px' }}>
                  Limite de equipe atingido
                </h3>

                <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.5', maxWidth: '380px', margin: '0 auto 20px auto' }}>
                  Sua arena já está utilizando o limite de <strong>{planoInfo.plano.max_usuarios} funcionários</strong> do plano <strong>{planoInfo.plano.nome}</strong>. Para adicionar novos recepcionistas ou gerentes, faça o upgrade da sua assinatura.
                </p>

                <div 
                  style={{ 
                    background: '#f8fafc', 
                    border: '1px solid #e2e8f0', 
                    borderRadius: '8px', 
                    padding: '12px 16px', 
                    fontSize: '12.5px', 
                    color: 'var(--charcoal)', 
                    textAlign: 'left',
                    marginBottom: '20px'
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#2563eb', marginBottom: '4px' }}>
                    💡 Vantagens ao expandir sua equipe:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: '1.5', color: '#475569' }}>
                    <li>Acesso simultâneo para atendentes em diferentes turnos</li>
                    <li>Rastreabilidade de auditoria individual por colaborador</li>
                    <li>Mais quadras e relatórios avançados</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <Link 
                    to="/admin/assinatura" 
                    className="btn-primary" 
                    style={{ background: '#2563eb', color: '#fff', textDecoration: 'none', padding: '10px 22px', fontSize: '13.5px', fontWeight: 600, borderRadius: '6px', display: 'inline-flex', alignItems: 'center' }}
                  >
                    Fazer Upgrade de Plano
                  </Link>
                  <button type="button" className="btn-ghost" onClick={() => setActiveModal(null)}>
                    Voltar
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveUsuario}>
              <div className="modal-header">
                <h2 className="modal-title" id="modal-u-title">
                  {nuId ? 'Editar Usuário' : 'Novo Usuário'}
                </h2>
                <button type="button" className="modal-close" aria-label="Fechar" onClick={() => setActiveModal(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="u-nome">Nome completo *</label>
                  <input 
                    type="text" 
                    id="u-nome" 
                    value={nuNome}
                    onChange={(e) => setNuNome(e.target.value)}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="u-email">E-mail *</label>
                  <input 
                    type="email" 
                    id="u-email" 
                    value={nuEmail}
                    onChange={(e) => setNuEmail(e.target.value)}
                    required 
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="u-perfil">Perfil de acesso *</label>
                  <select 
                    id="u-perfil" 
                    value={nuPerfil}
                    onChange={(e) => setNuPerfil(e.target.value)}
                    required
                  >
                    <option value="">Selecione</option>
                    <option value="Recepcionista">Recepcionista</option>
                    <option value="Gerente">Gerente</option>
                    <option value="Administrador">Administrador</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="u-senha">
                    Senha {!nuId && <span style={{ color: 'var(--danger)' }}>*</span>}
                  </label>
                  <input 
                    type="password" 
                    id="u-senha" 
                    placeholder="Digite a senha" 
                    value={nuSenha}
                    onChange={(e) => setNuSenha(e.target.value)}
                    required={!nuId}
                  />
                  {nuId && (
                    <small style={{ color: 'var(--muted)', fontSize: '11px', display: 'block' }}>
                      Deixe em branco para manter a senha atual.
                    </small>
                  )}
                </div>
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {nuId ? (
                  <>
                    <button 
                      type="button" 
                      className="btn-ghost" 
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger-bg)', marginRight: 'auto' }}
                      onClick={() => handleDeleteUsuario(nuId, nuNome)}
                    >
                      Excluir
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setActiveModal(null)}>Cancelar</button>
                    <button type="submit" className="btn-primary">Salvar Alterações</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn-ghost" onClick={() => setActiveModal(null)}>Cancelar</button>
                    <button type="submit" className="btn-primary">Criar Usuário</button>
                  </>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      {/* MODAL: NOVO MOTIVO DE CANCELAMENTO */}
      <div
        className={`modal-overlay ${activeModal === 'motivo' ? 'open' : ''}`}
        role="presentation"
        onClick={() => setActiveModal(null)}
        onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setActiveModal(null); }}
      >
        <form className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-motivo-title" onSubmit={handleAddMotivo} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title" id="modal-motivo-title">Adicionar Motivo de Cancelamento</h2>
            <button type="button" className="modal-close" aria-label="Fechar" onClick={() => setActiveModal(null)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="nm-nome">Motivo *</label>
              <input 
                type="text" 
                id="nm-nome" 
                placeholder="Ex: Chuva forte" 
                value={nmNome}
                onChange={(e) => setNmNome(e.target.value)}
                required 
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-ghost" onClick={() => setActiveModal(null)}>Cancelar</button>
            <button type="submit" className="btn-primary">Adicionar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
