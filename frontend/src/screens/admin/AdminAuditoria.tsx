import { useEffect, useState, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import '../../assets/css/auditoria.css';

interface AuditLog {
  id: number;
  evento: string;
  usuario_nome: string | null;
  detalhes: string;
  ip: string | null;
  criado_em: string;
}

interface AuditStats {
  total: number;
  acessos: number;
  financeiro: number;
  cadastrais: number;
}

const EVENT_CATEGORIES = [
  {
    category: 'Acessos & Segurança',
    items: [
      { label: 'Login & Tentativas', value: 'Login' },
      { label: 'Logout', value: 'Logout' }
    ]
  },
  {
    category: 'Reservas & Bloqueios',
    items: [
      { label: 'Criação de reserva', value: 'Criação de reserva' },
      { label: 'Alteração de reserva', value: 'Alteração de reserva' },
      { label: 'Cancelamento de reserva', value: 'Cancelamento de reserva' },
      { label: 'Bloqueio de quadra', value: 'Bloqueio de quadra' }
    ]
  },
  {
    category: 'Financeiro',
    items: [
      { label: 'Registro de pagamento', value: 'Registro de pagamento' },
      { label: 'Aplicação de desconto', value: 'Aplicação de desconto' },
      { label: 'Estorno de pagamento', value: 'Estorno de pagamento' }
    ]
  },
  {
    category: 'Cadastros & Configurações',
    items: [
      { label: 'Gestão de Quadras', value: 'Gestão de Quadras' },
      { label: 'Gestão de Usuários', value: 'Gestão de Usuários' },
      { label: 'Gestão de Clientes', value: 'Gestão de Clientes' },
      { label: 'Exclusões & Arquivamentos', value: 'Exclusão de cadastro' }
    ]
  },
  {
    category: 'Relatórios',
    items: [
      { label: 'Exportação de relatório', value: 'Exportação de relatório' }
    ]
  }
];

export function AdminAuditoria() {
  const [token] = useState<string>(() => localStorage.getItem('courtmanager_token') || '');

  // Filter States
  const [busca, setBusca] = useState('');
  const [evento, setEvento] = useState('');
  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);
  const eventDropdownRef = useRef<HTMLDivElement>(null);

  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  });
  const [dataFim, setDataFim] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  // Table, Stats & Pagination States
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [stats, setStats] = useState<AuditStats>({
    total: 0,
    acessos: 0,
    financeiro: 0,
    cadastrais: 0
  });

  // Fecha o dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (eventDropdownRef.current && !eventDropdownRef.current.contains(e.target as Node)) {
        setEventDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSelectedEventLabel = () => {
    if (!evento) return 'Todos os eventos';
    for (const cat of EVENT_CATEGORIES) {
      const found = cat.items.find(i => i.value === evento);
      if (found) return found.label;
    }
    return evento;
  };

  const getBadgeClass = (evtName: string) => {
    const ev = evtName.toLowerCase();
    if (ev.includes('login') || ev.includes('logout')) return 'log-badge log-login';
    if (ev.includes('reserva')) return 'log-badge log-reserva';
    if (ev.includes('pagamento') || ev.includes('desconto') || ev.includes('estorno')) return 'log-badge log-pagamento';
    if (ev.includes('cancelamento') || ev.includes('exclusão') || ev.includes('arquivamento')) return 'log-badge log-cancelamento';
    if (ev.includes('bloqueio') || ev.includes('desbloqueio')) return 'log-badge log-bloqueio';
    return 'log-badge log-permissao';
  };

  const formatDateTime = (isoString: string) => {
    const normalizedString = isoString.includes('T') ? isoString : isoString.replace(' ', 'T') + 'Z';
    const d = new Date(normalizedString);
    if (isNaN(d.getTime())) return isoString;
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()} · ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const carregarLogs = async (resetPage = false) => {
    if (!token) return;
    setLoading(true);
    const targetPage = resetPage ? 1 : currentPage;
    if (resetPage) {
      setCurrentPage(1);
    }

    try {
      const url = new URL('/api/auditoria', window.location.origin);
      url.searchParams.append('data_inicio', dataInicio);
      url.searchParams.append('data_fim', dataFim);
      url.searchParams.append('pagina', String(targetPage));
      if (busca) url.searchParams.append('busca', busca);
      if (evento) url.searchParams.append('evento', evento);

      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('courtmanager_token');
          window.location.href = '/login';
          return;
        }
        if (res.status === 403) {
          throw new Error('Acesso negado para este perfil.');
        }
        throw new Error('Erro ao buscar logs');
      }

      const payload = await res.json();
      const logsList = Array.isArray(payload) ? payload : (payload.logs || []);
      const totalRegs = payload.totalRegistros || logsList.length;
      const totalPags = payload.totalPaginas || 1;

      setLogs(logsList);
      setTotalRegistros(totalRegs);
      setTotalPaginas(totalPags);
      if (payload.estatisticas) {
        setStats(payload.estatisticas);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Load logs triggers
  useEffect(() => {
    carregarLogs(true);
  }, [evento, dataInicio, dataFim]);

  // Debounced search text trigger
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      carregarLogs(true);
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [busca]);

  // Manual page change trigger
  useEffect(() => {
    carregarLogs(false);
  }, [currentPage]);

  const handleExportCSV = async () => {
    if (!token) return;
    setExporting(true);

    try {
      const url = new URL('/api/auditoria', window.location.origin);
      url.searchParams.append('data_inicio', dataInicio);
      url.searchParams.append('data_fim', dataFim);
      url.searchParams.append('exportar', 'true');
      if (busca) url.searchParams.append('busca', busca);
      if (evento) url.searchParams.append('evento', evento);

      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Erro na exportação');

      const logsList: AuditLog[] = await res.json();

      if (logsList.length === 0) {
        alert('Não há dados válidos para exportar neste período.');
        setExporting(false);
        return;
      }

      let csvContent = "Data/Hora,Evento,Usuário,Detalhes,IP\n";

      logsList.forEach(log => {
        const dateStr = formatDateTime(log.criado_em);
        const evName = log.evento;
        const userName = log.usuario_nome || 'Sistema';
        const details = log.detalhes ? log.detalhes.replace(/"/g, '""') : '';
        const ipStr = log.ip || '';
        csvContent += `"${dateStr}","${evName}","${userName}","${details}","${ipStr}"\n`;
      });

      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      const todayStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `auditoria_courtmanager_${todayStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Recarrega os logs para refletir o log da própria exportação
      setTimeout(() => carregarLogs(false), 800);
    } catch (err) {
      console.error(err);
      alert('Ocorreu um erro ao gerar o CSV.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="admin-auditoria-page">
      {/* Aviso de conformidade legal e retenção */}
      <div 
        style={{
          background: 'var(--partial-bg)',
          border: '1px solid rgba(33,85,168,0.2)',
          borderRadius: 'var(--r-md)',
          padding: 'var(--s-3) var(--s-5)',
          fontSize: '13px',
          color: 'var(--partial)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-3)',
          marginBottom: 'var(--s-5)'
        }}
      >
        <span style={{ fontSize: '16px' }}>🔒</span>
        <span>
          Esta seção é restrita ao perfil <strong>Administrador</strong>. Todos os registros são imutáveis e retidos por 5 anos (RF-LOG-021 / RN-009).
        </span>
      </div>

      {/* KPI Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--s-4)', marginBottom: 'var(--s-5)' }}>
        <div className="card" style={{ padding: '16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total no Período</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--charcoal)', marginTop: '4px' }}>{stats.total}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Eventos auditados</div>
        </div>

        <div className="card" style={{ padding: '16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Acessos & Logins</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#2563eb', marginTop: '4px' }}>{stats.acessos}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Logins, logouts e tentativas</div>
        </div>

        <div className="card" style={{ padding: '16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Operações Financeiras</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a', marginTop: '4px' }}>{stats.financeiro}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Pagamentos, descontos e estornos</div>
        </div>

        <div className="card" style={{ padding: '16px', borderRadius: '10px' }}>
          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ações Cadastrais</div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>{stats.cadastrais}</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Usuários, clientes e quadras</div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div className="page-toolbar flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
        <div className="filter-bar flex-wrap" style={{ position: 'relative', zIndex: 30 }}>
          <input 
            type="text" 
            className="search-input" 
            placeholder="Buscar nos logs..." 
            style={{ width: '180px' }} 
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar nos logs" 
          />

          {/* Lovable Custom Dropdown (Sempre abre para baixo com altura controlada) */}
          <div ref={eventDropdownRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setEventDropdownOpen(prev => !prev)}
              style={{
                height: '38px',
                padding: '8px 12px',
                border: '1px solid #e0ded7',
                borderRadius: '6px',
                backgroundColor: '#ffffff',
                color: 'var(--charcoal, #1c1c1c)',
                fontSize: '13.5px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                minWidth: '190px',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(28, 28, 28, 0.02)',
                outline: 'none',
                borderColor: eventDropdownOpen ? '#3b82f6' : '#e0ded7'
              }}
            >
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {getSelectedEventLabel()}
              </span>
              <ChevronDown 
                size={15} 
                style={{ 
                  color: '#78716c', 
                  transition: 'transform 0.15s ease', 
                  transform: eventDropdownOpen ? 'rotate(180deg)' : 'none',
                  flexShrink: 0 
                }} 
              />
            </button>

            {eventDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  width: '260px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e0ded7',
                  borderRadius: '8px',
                  boxShadow: '0 12px 28px -4px rgba(28, 26, 24, 0.14), 0 2px 6px rgba(28, 26, 24, 0.04)',
                  maxHeight: '270px',
                  overflowY: 'auto',
                  zIndex: 100,
                  padding: '4px'
                }}
              >
                {/* Opção Todos os Eventos */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setEvento('');
                    setEventDropdownOpen(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      setEvento('');
                      setEventDropdownOpen(false);
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px',
                    fontWeight: !evento ? 600 : 400,
                    color: !evento ? '#2563eb' : 'var(--charcoal)',
                    backgroundColor: !evento ? '#f1f5f9' : 'transparent',
                    borderRadius: '5px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = !evento ? '#f1f5f9' : '#faf8f5'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = !evento ? '#f1f5f9' : 'transparent'}
                >
                  <span>Todos os eventos</span>
                  {!evento && <Check size={14} style={{ color: '#2563eb' }} />}
                </div>

                {EVENT_CATEGORIES.map((cat, catIdx) => (
                  <div key={cat.category} style={{ marginTop: catIdx === 0 ? '4px' : '8px' }}>
                    <div
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        color: '#78716c',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        padding: '4px 10px 2px 10px'
                      }}
                    >
                      {cat.category}
                    </div>
                    {cat.items.map(item => {
                      const isSelected = evento === item.value;
                      return (
                        <div
                          key={item.value}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setEvento(item.value);
                            setEventDropdownOpen(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setEvento(item.value);
                              setEventDropdownOpen(false);
                            }
                          }}
                          style={{
                            padding: '7px 12px',
                            fontSize: '13px',
                            fontWeight: isSelected ? 600 : 400,
                            color: isSelected ? '#2563eb' : 'var(--charcoal)',
                            backgroundColor: isSelected ? '#f1f5f9' : 'transparent',
                            borderRadius: '5px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            transition: 'background 0.1s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isSelected ? '#f1f5f9' : '#faf8f5'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isSelected ? '#f1f5f9' : 'transparent'}
                        >
                          <span>{item.label}</span>
                          {isSelected && <Check size={14} style={{ color: '#2563eb' }} />}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <input 
              type="date" 
              style={{ width: 'auto' }} 
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              aria-label="Data inicial" 
            />
          </div>
          <div>
            <input 
              type="date" 
              style={{ width: 'auto' }} 
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              aria-label="Data final" 
            />
          </div>
        </div>

        <button 
          className="btn-ghost" 
          onClick={handleExportCSV}
          disabled={exporting}
        >
          {exporting ? 'Gerando CSV...' : '↓ Exportar CSV'}
        </button>
      </div>

      {/* Tabela de logs */}
      <div className="table-card">
        <div style={{ padding: 'var(--s-4) var(--s-5)', borderBottom: '1px solid var(--border-passive)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Logs de Auditoria ({totalRegistros})</span>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Clique em uma linha para ver todos os detalhes</span>
        </div>
        <div className="table-wrap">
          <table aria-label="Logs de auditoria">
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Evento</th>
                <th>Usuário</th>
                <th>Detalhes</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                    Carregando logs de auditoria...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                    Nenhum log encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr 
                    key={log.id} 
                    onClick={() => setSelectedLog(log)}
                    style={{ cursor: 'pointer' }}
                    title="Clique para inspecionar os detalhes"
                  >
                    <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                      {formatDateTime(log.criado_em)}
                    </td>
                    <td>
                      <span className={getBadgeClass(log.evento)}>{log.evento}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{log.usuario_nome || 'Sistema'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--charcoal)', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.detalhes}
                    </td>
                    <td>
                      <span className="ip-tag">{log.ip || '—'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Paginação */}
        <div style={{ padding: 'var(--s-4) var(--s-5)', borderTop: '1px solid var(--border-passive)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            Exibindo {totalRegistros} resultados
          </span>
          <div style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)', marginRight: '8px' }}>
              Página {currentPage} de {totalPaginas}
            </span>
            <button 
              className="btn-ghost btn-sm" 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage <= 1}
            >
              ‹ Anterior
            </button>
            <button 
              className="btn-ghost btn-sm" 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPaginas))}
              disabled={currentPage >= totalPaginas}
            >
              Próxima ›
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Detalhes do Log de Auditoria */}
      {selectedLog && (
        <div
          className="modal-overlay open"
          role="presentation"
          onClick={() => setSelectedLog(null)}
          onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setSelectedLog(null); }}
        >
          <div
            className="modal modal--flush"
            style={{ maxWidth: '580px' }}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>🛡️</span>
                <div>
                  <h2 className="modal-title">Detalhes do Registro de Auditoria</h2>
                  <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0 }}>ID #{selectedLog.id} · Registro Imutável</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setSelectedLog(null)}>✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>EVENTO</div>
                  <div style={{ marginTop: '4px' }}>
                    <span className={getBadgeClass(selectedLog.evento)}>{selectedLog.evento}</span>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>DATA E HORA</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--charcoal)', marginTop: '4px' }}>
                    {formatDateTime(selectedLog.criado_em)}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>USUÁRIO RESPONSÁVEL</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--charcoal)', marginTop: '4px' }}>
                    {selectedLog.usuario_nome || 'Sistema (Automático)'}
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600 }}>ENDEREÇO IP</div>
                  <div style={{ marginTop: '4px' }}>
                    <span className="ip-tag">{selectedLog.ip || '—'}</span>
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: '6px' }}>
                  DETALHES COMPLETOS DA AÇÃO
                </label>
                <div 
                  style={{ 
                    background: '#f8fafc', 
                    padding: '14px', 
                    borderRadius: '8px', 
                    border: '1px solid #e2e8f0', 
                    fontSize: '13px', 
                    color: 'var(--charcoal)', 
                    lineHeight: '1.6', 
                    wordBreak: 'break-word',
                    maxHeight: '220px',
                    overflowY: 'auto'
                  }}
                >
                  {selectedLog.detalhes || 'Sem detalhes adicionais registrados.'}
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--border-passive)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-primary" onClick={() => setSelectedLog(null)}>
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
