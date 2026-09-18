import { apiFetch as fetch } from '../../utils/apiFetch';
import React, { useState, useEffect } from 'react';
import '../../assets/css/pagamentos.css';


interface Reserva {
  id: number;
  data_reserva: string;
  hora_inicio: string;
  status: string;
  status_pagamento: string;
  quadra_nome: string;
}

interface Cliente {
  id: number;
  nome: string;
  email: string | null;
  telefone: string;
  ativo: number;
  criado_em: string;
  reservasCount?: number;
  saldoDevedor?: number;
}

interface ClienteDetalhe extends Cliente {
  ultimasReservas: Reserva[];
}

const formatPhone = (val: string) => {
  const clean = val.replace(/\D/g, '');
  if (clean.length === 0) return '';
  if (clean.length <= 2) return `(${clean}`;
  if (clean.length <= 7) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`;
};

const formatCurrency = (val: number) => {
  return 'R$ ' + val.toFixed(2).replace('.', ',');
};

interface FormErrors {
  nome?: string;
  telefone?: string;
  email?: string;
}

const validarCamposCliente = (nome: string, telefone: string, email: string): FormErrors => {
  const errs: FormErrors = {};
  if (!nome.trim()) {
    errs.nome = 'O nome é obrigatório.';
  } else if (nome.trim().split(/\s+/).length < 2) {
    errs.nome = 'Informe pelo menos o nome e sobrenome.';
  }

  if (!telefone.trim()) {
    errs.telefone = 'O telefone é obrigatório.';
  } else if (!/^\(\d{2}\)\s\d{5}-\d{4}$/.test(telefone.trim())) {
    errs.telefone = 'Formato inválido. Use (99) 99999-9999.';
  }

  if (email.trim()) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      errs.email = 'E-mail inválido.';
    }
  }

  return errs;
};

interface ModalNovoClienteProps {
  isOpen: boolean;
  modoEdicao: boolean;
  ncNome: string;
  setNcNome: (v: string) => void;
  ncTelefone: string;
  setNcTelefone: (v: string) => void;
  ncEmail: string;
  setNcEmail: (v: string) => void;
  errors: FormErrors;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const ModalNovoCliente: React.FC<ModalNovoClienteProps> = ({
  isOpen,
  modoEdicao,
  ncNome,
  setNcNome,
  ncTelefone,
  setNcTelefone,
  ncEmail,
  setNcEmail,
  errors,
  onClose,
  onSubmit
}) => {
  return (
    <div className={`modal-overlay ${isOpen ? 'open' : ''}`}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{modoEdicao ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="nc-nome">Nome completo *</label>
              <input 
                type="text" 
                id="nc-nome" 
                placeholder="Nome do cliente" 
                value={ncNome}
                onChange={(e) => setNcNome(e.target.value)}
                required 
              />
              {errors.nome && (
                <span className="error-msg" style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  {errors.nome}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="nc-telefone">Telefone *</label>
              <input 
                type="text" 
                id="nc-telefone" 
                placeholder="(99) 99999-9999" 
                value={ncTelefone}
                onChange={(e) => setNcTelefone(formatPhone(e.target.value))}
                maxLength={15}
                required 
              />
              {errors.telefone && (
                <span className="error-msg" style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  {errors.telefone}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="nc-email">E-mail</label>
              <input 
                type="email" 
                id="nc-email" 
                placeholder="Ex: cliente@email.com (opcional)" 
                value={ncEmail}
                onChange={(e) => setNcEmail(e.target.value)}
              />
              {errors.email && (
                <span className="error-msg" style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  {errors.email}
                </span>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-ghost" type="button" onClick={onClose}>Cancelar</button>
            <button className="btn-primary" type="submit">Salvar Cliente</button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ModalDetalheClienteProps {
  isOpen: boolean;
  loadingDetalhe: boolean;
  clienteDetalhe: ClienteDetalhe | null;
  onClose: () => void;
  onArquivar: () => void;
  onDesarquivar: () => void;
  onExcluir: () => void;
  onEditar: () => void;
}

const ModalDetalheCliente: React.FC<ModalDetalheClienteProps> = ({
  isOpen,
  loadingDetalhe,
  clienteDetalhe,
  onClose,
  onArquivar,
  onDesarquivar,
  onExcluir,
  onEditar
}) => {
  return (
    <div className={`modal-overlay ${isOpen ? 'open' : ''}`}>
      <div className="modal" style={{ maxWidth: '540px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{loadingDetalhe ? 'Carregando...' : clienteDetalhe?.nome}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {loadingDetalhe ? (
          <div className="modal-body text-center p-6 text-muted">Carregando detalhes do cliente...</div>
        ) : clienteDetalhe ? (
          <>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 'var(--s-6)', marginBottom: 'var(--s-5)' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>Telefone</div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{clienteDetalhe.telefone || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>E-mail</div>
                  <div style={{ fontSize: '13px' }}>{clienteDetalhe.email || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>Reservas</div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{clienteDetalhe.reservasCount || 0}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '2px' }}>Saldo Devedor</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: (clienteDetalhe.saldoDevedor || 0) > 0 ? 'var(--danger)' : 'var(--text-color)' }}>
                    {formatCurrency(clienteDetalhe.saldoDevedor || 0)}
                  </div>
                </div>
              </div>

              <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: 'var(--s-3)' }}>Últimas Reservas</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Quadra</th>
                      <th>Status</th>
                      <th>Pagamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!clienteDetalhe.ultimasReservas || clienteDetalhe.ultimasReservas.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center' }}>Nenhuma reserva encontrada.</td>
                      </tr>
                    ) : (
                      clienteDetalhe.ultimasReservas.map(r => {
                        const dateParts = r.data_reserva.split('-');
                        const dateStr = dateParts.length === 3 
                          ? new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2])).toLocaleDateString('pt-BR')
                          : r.data_reserva;

                        return (
                          <tr key={r.id}>
                            <td>{dateStr} · {r.hora_inicio}</td>
                            <td>{r.quadra_nome}</td>
                            <td>
                              <span className={`badge ${
                                r.status === 'Confirmada' ? 'badge--paid' : r.status === 'Cancelada' ? 'badge--danger' : 'badge--pending'
                              }`}>
                                {r.status}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${
                                r.status_pagamento === 'Pago' ? 'badge--paid' : r.status_pagamento === 'Pendente' ? 'badge--danger' : 'badge--pending'
                              }`}>
                                {r.status_pagamento}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 'var(--s-2)' }}>
                {clienteDetalhe.ativo === 1 ? (
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={onArquivar}
                    title="Ocultar da lista principal preservando o histórico"
                  >
                    Arquivar
                  </button>
                ) : (
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={onDesarquivar}
                  >
                    Reativar
                  </button>
                )}
                {(!clienteDetalhe.reservasCount || clienteDetalhe.reservasCount === 0) && (
                  <button
                    className="btn-ghost"
                    type="button"
                    style={{ color: 'var(--danger)' }}
                    onClick={onExcluir}
                  >
                    Excluir
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost" type="button" onClick={onClose}>Fechar</button>
                {clienteDetalhe.ativo === 1 && (
                  <button className="btn-primary" type="button" onClick={onEditar}>Editar</button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="modal-body text-center p-6 text-muted">Erro ao recuperar detalhes do cliente.</div>
        )}
      </div>
    </div>
  );
};

export function AdminClientes() {
  const token = localStorage.getItem('courtmanager_token');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState<'ativos' | 'arquivados'>('ativos');

  // Modais
  const [activeModal, setActiveModal] = useState<'novo-cliente' | 'detalhe-cliente' | null>(null);

  // Estado Novo/Editar Cliente
  const [modoEdicao, setModoEdicao] = useState(false);
  const [idEdicao, setIdEdicao] = useState<number | null>(null);
  const [ncNome, setNcNome] = useState('');
  const [ncTelefone, setNcTelefone] = useState('');
  const [ncEmail, setNcEmail] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  // Estado Detalhes Cliente
  const [selectedClienteId, setSelectedClienteId] = useState<number | null>(null);
  const [clienteDetalhe, setClienteDetalhe] = useState<ClienteDetalhe | null>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);

  // Toast / Status messages
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Carregar Clientes da API (filtra por aba ativa)
  const carregarClientes = async (aba?: 'ativos' | 'arquivados') => {
    if (!token) return;
    setLoading(true);
    const abaParaCarregar = aba ?? abaAtiva;
    const ativo = abaParaCarregar === 'ativos' ? 1 : 0;
    try {
      const res = await fetch(`/api/clientes?ativo=${ativo}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClientes(data);
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar lista de clientes', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarClientes(abaAtiva);
  }, [token, abaAtiva]);

  // Carregar Detalhes do Cliente
  useEffect(() => {
    if (!selectedClienteId || !token) {
      setClienteDetalhe(null);
      return;
    }

    const fetchDetalhe = async () => {
      setLoadingDetalhe(true);
      try {
        const res = await fetch(`/api/clientes/${selectedClienteId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setClienteDetalhe(data);
        } else {
          showToast('Erro ao carregar detalhes do cliente', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Erro ao carregar detalhes', 'error');
      } finally {
        setLoadingDetalhe(false);
      }
    };

    fetchDetalhe();
  }, [selectedClienteId, token]);

  // Submit Criar/Editar Cliente
  const handleSalvarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validarCamposCliente(ncNome, ncTelefone, ncEmail);
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !token) return;

    try {
      const method = modoEdicao ? 'PUT' : 'POST';
      const url = modoEdicao 
        ? `/api/clientes/${idEdicao}`
        : '/api/clientes';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nome: ncNome.trim(),
          telefone: ncTelefone.trim(),
          email: ncEmail.trim() || null
        })
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.field) {
          setErrors(prev => ({ ...prev, [data.field]: data.error }));
        } else {
          showToast(data.error || 'Erro ao salvar cliente', 'error');
        }
        return;
      }

      showToast(modoEdicao ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!', 'success');
      setActiveModal(null);
      resetForm();
      carregarClientes();
    } catch (err) {
      console.error(err);
      showToast('Erro ao se conectar ao servidor.', 'error');
    }
  };

  // Arquivar Cliente (soft delete)
  const handleArquivarCliente = async () => {
    if (!clienteDetalhe || !token) return;
    if (!window.confirm(`Arquivar "${clienteDetalhe.nome}"? O cliente ficará oculto da lista principal, mas o histórico de reservas será preservado.`)) return;
    try {
      const res = await fetch(`/api/clientes/${clienteDetalhe.id}/arquivar`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao arquivar');
      showToast('Cliente arquivado. Histórico preservado.', 'success');
      setActiveModal(null);
      setSelectedClienteId(null);
      carregarClientes();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Desarquivar Cliente
  const handleDesarquivarCliente = async () => {
    if (!clienteDetalhe || !token) return;
    try {
      const res = await fetch(`/api/clientes/${clienteDetalhe.id}/desarquivar`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao reativar');
      showToast('Cliente reativado com sucesso!', 'success');
      setActiveModal(null);
      setSelectedClienteId(null);
      carregarClientes();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Excluir Cliente (apenas sem histórico)
  const handleExcluirCliente = async () => {
    if (!clienteDetalhe || !token) return;
    
    if (clienteDetalhe.reservasCount && clienteDetalhe.reservasCount > 0) {
      showToast('Cliente com histórico não pode ser excluído. Use "Arquivar".', 'warning');
      return;
    }

    if (window.confirm(`Tem certeza que deseja excluir permanentemente o cliente ${clienteDetalhe.nome}?`)) {
      try {
        const res = await fetch(`/api/clientes/${clienteDetalhe.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao excluir');

        showToast('Cliente excluído com sucesso!', 'success');
        setActiveModal(null);
        setSelectedClienteId(null);
        carregarClientes();
      } catch (err: any) {
        console.error(err);
        showToast(err.message, 'error');
      }
    }
  };

  const resetForm = () => {
    setNcNome('');
    setNcTelefone('');
    setNcEmail('');
    setErrors({});
    setIdEdicao(null);
    setModoEdicao(false);
  };

  const abrirEdicao = () => {
    if (!clienteDetalhe) return;
    setModoEdicao(true);
    setIdEdicao(clienteDetalhe.id);
    setNcNome(clienteDetalhe.nome || '');
    setNcTelefone(clienteDetalhe.telefone || '');
    setNcEmail(clienteDetalhe.email || '');
    setErrors({});
    setActiveModal('novo-cliente');
  };

  // Filtrar lista de clientes localmente
  const clientesFiltrados = clientes.filter(c => 
    c.nome.toLowerCase().includes(busca.toLowerCase()) || 
    (c.telefone && c.telefone.includes(busca)) ||
    (c.email && c.email.toLowerCase().includes(busca.toLowerCase()))
  );

  return (
    <div className="admin-clientes-page">
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

      {/* Tabs de Aba */}
      <div className="tab-bar" role="tablist">
        <button
          className={`tab-btn ${abaAtiva === 'ativos' ? 'active' : ''}`}
          onClick={() => setAbaAtiva('ativos')}
        >
          Ativos
        </button>
        <button
          className={`tab-btn ${abaAtiva === 'arquivados' ? 'active' : ''}`}
          onClick={() => setAbaAtiva('arquivados')}
        >
          Arquivados
        </button>
      </div>

      {/* Toolbar / Busca */}
      <div className="page-toolbar mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="filter-bar">
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por nome, e-mail ou telefone..."
            style={{ width: '300px' }}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        {abaAtiva === 'ativos' && (
          <button
            className="btn-primary"
            onClick={() => {
              resetForm();
              setActiveModal('novo-cliente');
            }}
          >
            + Novo Cliente
          </button>
        )}
      </div>

      {/* Tabela de Clientes */}
      <div className="table-card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Cadastro</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Carregando clientes...</td>
                </tr>
              ) : clientesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Nenhum cliente encontrado.</td>
                </tr>
              ) : (
                clientesFiltrados.map(c => {
                  const dataCadastro = c.criado_em 
                    ? new Date(c.criado_em).toLocaleDateString('pt-BR') 
                    : '—';
                  return (
                    <tr key={c.id}>
                      <td><strong>{c.nome}</strong></td>
                      <td>{c.telefone || '—'}</td>
                      <td>{c.email || '—'}</td>
                      <td>{dataCadastro}</td>
                      <td>
                        <button 
                          className="btn-ghost btn-sm" 
                          onClick={() => {
                            setSelectedClienteId(c.id);
                            setActiveModal('detalhe-cliente');
                          }}
                        >
                          Ver
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

      {/* MODAL: NOVO / EDITAR CLIENTE */}
      <ModalNovoCliente
        isOpen={activeModal === 'novo-cliente'}
        modoEdicao={modoEdicao}
        ncNome={ncNome}
        setNcNome={setNcNome}
        ncTelefone={ncTelefone}
        setNcTelefone={setNcTelefone}
        ncEmail={ncEmail}
        setNcEmail={setNcEmail}
        errors={errors}
        onClose={() => setActiveModal(null)}
        onSubmit={handleSalvarCliente}
      />

      {/* MODAL: DETALHE DO CLIENTE */}
      <ModalDetalheCliente
        isOpen={activeModal === 'detalhe-cliente'}
        loadingDetalhe={loadingDetalhe}
        clienteDetalhe={clienteDetalhe}
        onClose={() => { setActiveModal(null); setSelectedClienteId(null); }}
        onArquivar={handleArquivarCliente}
        onDesarquivar={handleDesarquivarCliente}
        onExcluir={handleExcluirCliente}
        onEditar={abrirEdicao}
      />
    </div>
  );
}
