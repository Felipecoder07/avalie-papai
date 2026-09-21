import { useEventCallback } from '../../hooks/useEventCallback';
import { errorMessage } from '../../utils/errorMessage';
import { apiFetch as fetch } from '../../utils/apiFetch';
import { useState, useEffect } from 'react';
import { Banknote, CreditCard, Ticket } from 'lucide-react';
import { Pagination } from '../../components/ui';
import '../../assets/css/relatorios.css';

interface Quadra {
  id: number;
  nome: string;
  tipo: string;
}

export function AdminRelatorios() {

  // Dates initialization
  const getTodayStr = () => {
    const today = new Date();
    const tzOffset = today.getTimezoneOffset() * 60000;
    return new Date(Date.now() - tzOffset).toISOString().split('T')[0];
  };

  const getFirstDayStr = () => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  };

  // State Variables
  const [relAtivo, setRelAtivo] = useState<string>(
    localStorage.getItem('courtmanager_rel_ativo') || 'faturamento'
  );
  const [dataInicio, setDataInicio] = useState<string>(getFirstDayStr());
  const [dataFim, setDataFim] = useState<string>(getTodayStr());
  const [filterQuadraId, setFilterQuadraId] = useState<string | number>('');
  const [quadras, setQuadras] = useState<Quadra[]>([]);
  const [dadosAtuais, setDadosAtuais] = useState<import('../../types/reports').ReportData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Show toast helper
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load Quadras
  useEffect(() => {
    const fetchQuadras = async () => {
      try {
        const res = await fetch('/api/quadras', {
          headers: {}
        });
        if (res.ok) {
          const data = await res.json();
          setQuadras(data);
        }
      } catch (e) {
        console.warn('Erro ao carregar quadras:', e);
      }
    };
    fetchQuadras();
  }, []);

  // Handle Generate Report
  const gerarRelatorio = useEventCallback(async (currentTab = relAtivo, targetPage = currentPage) => {
    if (!dataInicio || !dataFim) {
      showToast('Selecione o período.', 'error');
      return;
    }
    if (dataInicio > dataFim) {
      showToast('A data inicial deve ser anterior à data final.', 'error');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setDadosAtuais(null);

    const params = new URLSearchParams({ data_inicio: dataInicio, data_fim: dataFim });
    if (filterQuadraId) params.append('quadra_id', String(filterQuadraId));
    params.append('pagina', String(targetPage));
    params.append('limite', '50');

    try {
      const res = await fetch(`/api/relatorios/${currentTab}?${params}`, {
        headers: {}
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar relatório');

      setDadosAtuais(data);
    } catch (e) {
      setErrorMsg(errorMessage(e) || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  } );

  // Trigger report automatically when tab changes if dates are set
  useEffect(() => {
    localStorage.setItem('courtmanager_rel_ativo', relAtivo);
    setCurrentPage(1);
    gerarRelatorio(relAtivo, 1);
  }, [gerarRelatorio, relAtivo]);

  const changePage = (page: number) => {
    setCurrentPage(page);
    gerarRelatorio(relAtivo, page);
  };

  // Export CSV
  const exportarCSV = () => {
    if (!dadosAtuais) {
      showToast('Gere um relatório primeiro.', 'error');
      return;
    }

    const rows: string[][] = [];
    const sep = ';';

    if (relAtivo === 'faturamento') {
      rows.push(['Data', 'ID', 'Cliente', 'Quadra', 'Horário', 'Valor Total', 'Pago', 'Saldo', 'Métodos', 'Pagamento', 'Operador']);
      dadosAtuais.reservas?.forEach((r) => {
        const saldo = Math.max(0, r.valor_total - r.total_pago);
        rows.push([
          fmtData(r.data_reserva),
          `#${r.id}`,
          r.cliente_nome,
          r.quadra_nome,
          `${r.hora_inicio}-${r.hora_fim}`,
          r.valor_total.toFixed(2),
          r.total_pago.toFixed(2),
          saldo.toFixed(2),
          r.metodos || '',
          r.status_pagamento,
          r.operador_nome || ''
        ]);
      });
    } else if (relAtivo === 'ocupacao') {
      rows.push(['Quadra', 'Reservas', 'Min. Reservados', 'Min. Bloqueados', 'Min. Disponíveis', 'Taxa %']);
      dadosAtuais.quadras?.forEach((q) => {
        rows.push([
          q.quadra_nome,
          q.totalReservas.toString(),
          q.minutosReservados.toString(),
          q.minutosBloqueados.toString(),
          q.totalMinutosDisp.toString(),
          q.taxa.toString()
        ]);
      });
    } else if (relAtivo === 'reservas') {
      rows.push(['Data', 'ID', 'Cliente', 'Quadra', 'Horário', 'Valor', 'Status', 'Pagamento', 'Operador']);
      dadosAtuais.reservas?.forEach((r) => {
        rows.push([
          fmtData(r.data_reserva),
          `#${r.id}`,
          r.cliente_nome,
          r.quadra_nome,
          `${r.hora_inicio}-${r.hora_fim}`,
          r.valor_total.toFixed(2),
          r.status,
          r.status_pagamento,
          r.operador_nome || ''
        ]);
      });
    } else if (relAtivo === 'inadimplencia') {
      rows.push(['Data', 'ID', 'Cliente', 'Contato', 'Quadra', 'Horário', 'Valor Total', 'Pago', 'Saldo Devedor']);
      dadosAtuais.inadimplentes?.forEach((r) => {
        rows.push([
          fmtData(r.data_reserva),
          `#${r.id}`,
          r.cliente_nome,
          r.cliente_contato || '',
          r.quadra_nome,
          `${r.hora_inicio}-${r.hora_fim}`,
          r.valor_total.toFixed(2),
          r.total_pago.toFixed(2),
          r.saldo_devedor.toFixed(2)
        ]);
      });
    } else if (relAtivo === 'cancelamentos') {
      rows.push(['Data', 'ID', 'Cliente', 'Quadra', 'Horário', 'Motivo', 'Observações', 'Valor', 'Pago Antes', 'Status Pag.', 'Operador']);
      dadosAtuais.cancelamentos?.forEach((r) => {
        rows.push([
          fmtData(r.data_reserva),
          `#${r.id}`,
          r.cliente_nome,
          r.quadra_nome,
          `${r.hora_inicio}-${r.hora_fim}`,
          r.motivo_cancelamento || 'Não informado',
          r.observacoes_cancelamento || '',
          r.valor_total.toFixed(2),
          r.total_pago.toFixed(2),
          r.status_pagamento,
          r.operador_nome || ''
        ]);
      });
    } else {
      showToast('Este tipo de relatório não suporta exportação direta para CSV.', 'error');
      return;
    }

    const csvContent = '\uFEFF' + rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(sep)).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_${relAtivo}_${dataInicio}_${dataFim}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper Formats
  const moeda = (val: number | undefined) => {
    return 'R$ ' + Number(val || 0).toFixed(2).replace('.', ',');
  };

  const fmtData = (dateStr?: string) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const getBadgeClass = (status: string) => {
    const map: Record<string, string> = {
      'Confirmada': 'badge-green',
      'Cancelada': 'badge-red',
      'Pendente': 'badge-amber',
      'Pago': 'badge-green',
      'Parcial': 'badge-amber',
      'Estornado': 'badge-gray'
    };
    return map[status] || 'badge-gray';
  };

  // Render Specific Views
  const renderFaturamento = () => {
    if (!dadosAtuais) return null;
    const { reservas = [], totais = { bruto: 0, pago: 0, pendente: 0 }, paginacao } = dadosAtuais;

    return (
      <>
        {/* KPIs */}
        <div className="rel-kpi-row">
          <div className="rel-kpi">
            <div className="rel-kpi-label">Faturamento Bruto</div>
            <div className="rel-kpi-value">{moeda(totais.bruto)}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Recebido</div>
            <div className="rel-kpi-value green">{moeda(totais.pago)}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">A Receber</div>
            <div className="rel-kpi-value red">{moeda(totais.pendente)}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Reservas</div>
            <div className="rel-kpi-value">{paginacao?.total ?? reservas.length}</div>
          </div>
        </div>

        {/* Table */}
        <div className="table-card">
          <div style={{ padding: 'var(--s-4) var(--s-5)', borderBottom: '1px solid var(--border-passive)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span id="table-title">Relatório de Faturamento — {fmtData(dataInicio)} a {fmtData(dataFim)}</span>
            <span id="table-count">{reservas.length} de {paginacao?.total ?? reservas.length} registros</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>ID</th>
                  <th>Cliente</th>
                  <th>Quadra</th>
                  <th>Horário</th>
                  <th>Valor Total</th>
                  <th>Pago</th>
                  <th>Saldo</th>
                  <th>Método</th>
                  <th>Pagamento</th>
                  <th>Operador</th>
                </tr>
              </thead>
              <tbody>
                {reservas.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>
                      Nenhum registro no período.
                    </td>
                  </tr>
                ) : (
                  reservas.map((r) => {
                    const saldo = Math.max(0, r.valor_total - r.total_pago);
                    return (
                      <tr key={r.id}>
                        <td>{fmtData(r.data_reserva)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: '12px' }}>#{r.id}</td>
                        <td>{r.cliente_nome}</td>
                        <td>{r.quadra_nome}</td>
                        <td>{r.hora_inicio}–{r.hora_fim}</td>
                        <td>{moeda(r.valor_total)}</td>
                        <td style={{ color: '#22c55e', fontWeight: 500 }}>{moeda(r.total_pago)}</td>
                        <td style={{ color: saldo > 0 ? 'var(--danger)' : undefined, fontWeight: saldo > 0 ? 500 : undefined }}>
                          {saldo > 0 ? moeda(saldo) : '—'}
                        </td>
                        <td style={{ fontSize: '12px' }}>{r.metodos || '—'}</td>
                        <td>
                          <span className={`badge ${getBadgeClass(r.status_pagamento)}`}>{r.status_pagamento}</span>
                        </td>
                        <td style={{ fontSize: '12px' }}>{r.operador_nome || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div id="table-footer" style={{ padding: 'var(--s-4) var(--s-5)', borderTop: '1px solid var(--border-passive)', display: 'flex', gap: 'var(--s-6)', flexWrap: 'wrap' }}>
            <span>Total: {moeda(totais.bruto)}</span>
            <span style={{ color: '#22c55e' }}>Recebido: {moeda(totais.pago)}</span>
            <span style={{ color: 'var(--danger)' }}>A receber: {moeda(totais.pendente)}</span>
          </div>
        </div>
      </>
    );
  };

  const renderOcupacao = () => {
    if (!dadosAtuais) return null;
    const { quadras: qList = [], taxaGeral = 0, periodo = { dias: 1 } } = dadosAtuais;
    const totalReservas = qList.reduce((acc: number, curr) => acc + curr.totalReservas, 0);

    return (
      <>
        <div className="rel-kpi-row">
          <div className="rel-kpi">
            <div className="rel-kpi-label">Taxa Média</div>
            <div className="rel-kpi-value green">{taxaGeral}%</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Quadras Monitoradas</div>
            <div className="rel-kpi-value">{qList.length}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Total de Reservas</div>
            <div className="rel-kpi-value">{totalReservas}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Período (dias)</div>
            <div className="rel-kpi-value">{periodo.dias}</div>
          </div>
        </div>

        <div className="table-card">
          <div style={{ padding: 'var(--s-4) var(--s-5)', borderBottom: '1px solid var(--border-passive)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span id="table-title">Relatório de Ocupação — {fmtData(dataInicio)} a {fmtData(dataFim)}</span>
            <span id="table-count">{qList.length} quadras · {periodo.dias} dias</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quadra</th>
                  <th>Reservas</th>
                  <th>Min. Reservados</th>
                  <th>Min. Bloqueados</th>
                  <th>Min. Disponíveis</th>
                  <th>Taxa de Ocupação</th>
                </tr>
              </thead>
              <tbody>
                {qList.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>
                      Nenhuma quadra monitorada no período.
                    </td>
                  </tr>
                ) : (
                  qList.map((q) => {
                    const barClass = q.taxa >= 75 ? 'high' : q.taxa >= 40 ? 'medium' : '';
                    return (
                      <tr key={q.quadra_nome}>
                        <td><strong>{q.quadra_nome}</strong></td>
                        <td>{q.totalReservas}</td>
                        <td>{q.minutosReservados} min</td>
                        <td>{q.minutosBloqueados} min</td>
                        <td>{q.totalMinutosDisp} min</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, minWidth: '36px' }}>{q.taxa}%</span>
                            <div className="occ-bar-wrap" style={{ flex: 1 }}>
                              <div className={`occ-bar ${barClass}`} style={{ width: `${q.taxa}%` }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div id="table-footer" style={{ padding: 'var(--s-4) var(--s-5)', borderTop: '1px solid var(--border-passive)' }}>
            <span>Taxa geral de ocupação no período: {taxaGeral}%</span>
          </div>
        </div>
      </>
    );
  };

  const renderReservas = () => {
    if (!dadosAtuais) return null;
    const { reservas = [], totais = { total: 0, confirmadas: 0, canceladas: 0, pendentes: 0 } } = dadosAtuais;

    return (
      <>
        <div className="rel-kpi-row">
          <div className="rel-kpi">
            <div className="rel-kpi-label">Total</div>
            <div className="rel-kpi-value">{totais.total}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Confirmadas</div>
            <div className="rel-kpi-value green">{totais.confirmadas}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Canceladas</div>
            <div className="rel-kpi-value red">{totais.canceladas}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Pendentes</div>
            <div className="rel-kpi-value amber">{totais.pendentes}</div>
          </div>
        </div>

        <div className="table-card">
          <div style={{ padding: 'var(--s-4) var(--s-5)', borderBottom: '1px solid var(--border-passive)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span id="table-title">Relatório de Reservas — {fmtData(dataInicio)} a {fmtData(dataFim)}</span>
            <span id="table-count">{totais.total} registros</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>ID</th>
                  <th>Cliente</th>
                  <th>Quadra</th>
                  <th>Horário</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Pagamento</th>
                  <th>Operador</th>
                </tr>
              </thead>
              <tbody>
                {reservas.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px' }}>
                      Nenhum registro encontrado no período.
                    </td>
                  </tr>
                ) : (
                  reservas.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtData(r.data_reserva)}</td>
                      <td style={{ color: 'var(--muted)', fontSize: '12px' }}>#{r.id}</td>
                      <td>{r.cliente_nome}</td>
                      <td>{r.quadra_nome}</td>
                      <td>{r.hora_inicio}–{r.hora_fim}</td>
                      <td>{moeda(r.valor_total)}</td>
                      <td>
                        <span className={`badge ${getBadgeClass(r.status)}`}>{r.status}</span>
                      </td>
                      <td>
                        <span className={`badge ${getBadgeClass(r.status_pagamento)}`}>{r.status_pagamento}</span>
                      </td>
                      <td style={{ fontSize: '12px' }}>{r.operador_nome || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div id="table-footer" style={{ padding: 'var(--s-4) var(--s-5)', borderTop: '1px solid var(--border-passive)', display: 'flex', gap: 'var(--s-6)', flexWrap: 'wrap' }}>
            <span>Total: {totais.total}</span>
            <span style={{ color: '#22c55e' }}>Confirmadas: {totais.confirmadas}</span>
            <span style={{ color: 'var(--danger)' }}>Canceladas: {totais.canceladas}</span>
          </div>
        </div>
      </>
    );
  };

  const renderInadimplencia = () => {
    if (!dadosAtuais) return null;
    const { inadimplentes = [], totalDevido = 0, paginacao } = dadosAtuais;

    return (
      <>
        <div className="rel-kpi-row">
          <div className="rel-kpi">
            <div className="rel-kpi-label">Devedores</div>
            <div className="rel-kpi-value red">{paginacao?.total ?? inadimplentes.length}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Total a Receber</div>
            <div className="rel-kpi-value red">{moeda(totalDevido)}</div>
          </div>
        </div>

        <div className="table-card">
          <div style={{ padding: 'var(--s-4) var(--s-5)', borderBottom: '1px solid var(--border-passive)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span id="table-title">Relatório de Inadimplência — {fmtData(dataInicio)} a {fmtData(dataFim)}</span>
            <span id="table-count">{inadimplentes.length} de {paginacao?.total ?? inadimplentes.length} registros</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>ID</th>
                  <th>Cliente</th>
                  <th>Contato</th>
                  <th>Quadra</th>
                  <th>Horário</th>
                  <th>Valor Total</th>
                  <th>Pago</th>
                  <th>Saldo Devedor</th>
                  <th>Status Pag.</th>
                </tr>
              </thead>
              <tbody>
                {inadimplentes.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', color: '#22c55e', padding: '40px', fontWeight: 600 }}>
                      ✓ Nenhuma inadimplência no período!
                    </td>
                  </tr>
                ) : (
                  inadimplentes.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtData(r.data_reserva)}</td>
                      <td style={{ color: 'var(--muted)', fontSize: '12px' }}>#{r.id}</td>
                      <td>{r.cliente_nome}</td>
                      <td style={{ fontSize: '12px' }}>{r.cliente_contato || '—'}</td>
                      <td>{r.quadra_nome}</td>
                      <td>{r.hora_inicio}–{r.hora_fim}</td>
                      <td>{moeda(r.valor_total)}</td>
                      <td style={{ color: '#22c55e', fontWeight: 500 }}>{moeda(r.total_pago)}</td>
                      <td style={{ color: 'var(--danger)', fontWeight: 700 }}>{moeda(r.saldo_devedor)}</td>
                      <td>
                        <span className={`badge ${getBadgeClass(r.status_pagamento)}`}>{r.status_pagamento}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div id="table-footer" style={{ padding: 'var(--s-4) var(--s-5)', borderTop: '1px solid var(--border-passive)' }}>
            <span style={{ color: 'var(--danger)' }}>Total inadimplente: {moeda(totalDevido)}</span>
          </div>
        </div>
      </>
    );
  };

  const renderCancelamentos = () => {
    if (!dadosAtuais) return null;
    const { cancelamentos = [], totais = { total: 0, valorPerdido: 0, estornados: 0 } } = dadosAtuais;

    return (
      <>
        <div className="rel-kpi-row">
          <div className="rel-kpi">
            <div className="rel-kpi-label">Cancelamentos</div>
            <div className="rel-kpi-value red">{totais.total}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Valor Perdido</div>
            <div className="rel-kpi-value red">{moeda(totais.valorPerdido)}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Estornados</div>
            <div className="rel-kpi-value amber">{totais.estornados}</div>
          </div>
        </div>

        <div className="table-card">
          <div style={{ padding: 'var(--s-4) var(--s-5)', borderBottom: '1px solid var(--border-passive)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span id="table-title">Relatório de Cancelamentos — {fmtData(dataInicio)} a {fmtData(dataFim)}</span>
            <span id="table-count">{totais.total} registros</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>ID</th>
                  <th>Cliente</th>
                  <th>Quadra</th>
                  <th>Horário</th>
                  <th>Motivo</th>
                  <th>Valor</th>
                  <th>Pago antes</th>
                  <th>Status Pag.</th>
                  <th>Operador</th>
                </tr>
              </thead>
              <tbody>
                {cancelamentos.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', color: '#22c55e', padding: '40px', fontWeight: 600 }}>
                      ✓ Nenhum cancelamento no período!
                    </td>
                  </tr>
                ) : (
                  cancelamentos.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtData(r.data_reserva)}</td>
                      <td style={{ color: 'var(--muted)', fontSize: '12px' }}>#{r.id}</td>
                      <td>{r.cliente_nome}</td>
                      <td>{r.quadra_nome}</td>
                      <td>{r.hora_inicio}–{r.hora_fim}</td>
                      <td>
                        <span 
                          className="badge badge-gray" 
                          style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px', display: 'inline-block' }}
                          title={r.observacoes_cancelamento || ''}
                        >
                          {r.motivo_cancelamento || 'Não informado'}
                        </span>
                      </td>
                      <td>{moeda(r.valor_total)}</td>
                      <td style={{ color: '#22c55e' }}>{moeda(r.total_pago)}</td>
                      <td>
                        <span className={`badge ${getBadgeClass(r.status_pagamento)}`}>{r.status_pagamento}</span>
                      </td>
                      <td style={{ fontSize: '12px' }}>{r.operador_nome || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div id="table-footer" style={{ padding: 'var(--s-4) var(--s-5)', borderTop: '1px solid var(--border-passive)' }}>
            <span>Total cancelamentos: {totais.total}</span>
            <span style={{ color: 'var(--danger)', marginLeft: '20px' }}>Valor perdido: {moeda(totais.valorPerdido)}</span>
          </div>
        </div>
      </>
    );
  };

  const renderMethodIcon = (method: string) => {
    const lower = method.toLowerCase();
    const iconStyle = { marginRight: '8px', width: '16px', height: '16px', display: 'inline-block', verticalAlign: 'middle' };
    
    if (lower === 'pix') {
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" style={{ ...iconStyle, fill: 'none', stroke: '#32bcad', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
          <path d="M12 2L2 12l10 10 10-10L12 2z" />
          <path d="M12 7l-5 5 5 5 5-5-5-5z" />
        </svg>
      );
    }
    if (lower === 'dinheiro') {
      return <span style={{ color: '#22c55e', display: 'inline-flex', alignItems: 'center' }}><Banknote style={iconStyle} /></span>;
    }
    if (lower === 'credito' || lower === 'debito' || lower.includes('cartao') || lower.includes('cartão')) {
      return <span style={{ color: '#3b82f6', display: 'inline-flex', alignItems: 'center' }}><CreditCard style={iconStyle} /></span>;
    }
    if (lower === 'voucher') {
      return <span style={{ color: '#f59e0b', display: 'inline-flex', alignItems: 'center' }}><Ticket style={iconStyle} /></span>;
    }
    return <span style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center' }}><CreditCard style={iconStyle} /></span>;
  };

  const renderFormasPagamento = () => {
    if (!dadosAtuais) return null;
    const { porMetodo = [], transacoes = [], totalGeral = 0, paginacao } = dadosAtuais;

    const methodColors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

    const getFriendlyMethodName = (m: string) => {
      const lower = m.toLowerCase();
      if (lower === 'pix') return 'Pix';
      if (lower === 'dinheiro') return 'Dinheiro';
      if (lower === 'credito') return 'Cartão de Crédito';
      if (lower === 'debito') return 'Cartão de Débito';
      if (lower === 'voucher') return 'Voucher Interno';
      return m.charAt(0).toUpperCase() + m.slice(1);
    };

    return (
      <>
        <div className="rel-kpi-row">
          <div className="rel-kpi">
            <div className="rel-kpi-label">Total Recebido</div>
            <div className="rel-kpi-value green">{moeda(totalGeral)}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Métodos Usados</div>
            <div className="rel-kpi-value">{porMetodo.length}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Transações</div>
            <div className="rel-kpi-value">{paginacao?.total ?? transacoes.length}</div>
          </div>
        </div>

        {porMetodo.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '20px 0' }}>Nenhum pagamento no período.</p>
        ) : (
          <div className="pag-method-grid">
            {porMetodo.map((m, i: number) => (
              <div className="pag-method-card" key={m.metodo}>
                <div className="pag-method-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {renderMethodIcon(m.metodo)}
                  <span>{getFriendlyMethodName(m.metodo)}</span>
                </div>
                <div className="pag-method-valor">{moeda(m.total_valor)}</div>
                <div className="pag-method-sub">
                  {m.total_transacoes} transações · {m.percentual}% do total
                </div>
                <div 
                  className="pag-percent-bar" 
                  style={{ 
                    width: `${m.percentual}%`, 
                    background: methodColors[i % methodColors.length] 
                  }} 
                />
              </div>
            ))}
          </div>
        )}

        <div className="table-card" style={{ marginTop: 'var(--s-4)' }}>
          <div style={{ padding: 'var(--s-4) var(--s-5)', borderBottom: '1px solid var(--border-passive)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span id="table-title">Histórico de Transações</span>
            <span id="table-count">{transacoes.length} de {paginacao?.total ?? transacoes.length} registros</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Hora</th>
                  <th>Método</th>
                  <th>Valor</th>
                  <th>Cliente</th>
                  <th>Quadra</th>
                  <th>Operador</th>
                </tr>
              </thead>
              <tbody>
                {transacoes.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px' }}>
                      Nenhuma transação registrada.
                    </td>
                  </tr>
                ) : (
                  transacoes.map((t, idx: number) => (
                    <tr key={idx}>
                      <td>{fmtData(t.data_pagamento)}</td>
                      <td style={{ color: 'var(--muted)', fontSize: '12px' }}>{t.hora_pagamento || ''}</td>
                      <td>
                        <span className="badge badge-gray" style={{ textTransform: 'capitalize' }}>
                          {t.metodo}
                        </span>
                      </td>
                      <td style={{ color: '#22c55e', fontWeight: 600 }}>{moeda(t.valor)}</td>
                      <td>{t.cliente_nome}</td>
                      <td>{t.quadra_nome}</td>
                      <td style={{ fontSize: '12px' }}>{t.operador_nome || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  const renderHorariosPico = () => {
    if (!dadosAtuais) return null;
    const { porHora = [], maxPico = 1, porDiaSemana = [], totalReservas = 0 } = dadosAtuais;

    const peakHourObj = porHora.length > 0 ? porHora.reduce((a, b) => (a.total > b.total ? a : b)) : null;
    const bestDayObj = porDiaSemana.length > 0 ? porDiaSemana.reduce((a, b) => (a.total > b.total ? a : b)) : null;

    return (
      <>
        <div className="rel-kpi-row">
          <div className="rel-kpi">
            <div className="rel-kpi-label">Total de Reservas</div>
            <div className="rel-kpi-value">{totalReservas}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Horário de Pico</div>
            <div className="rel-kpi-value">
              {peakHourObj ? `${String(peakHourObj.hora).padStart(2, '0')}:00` : '—'}
            </div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Dia Mais Movimentado</div>
            <div className="rel-kpi-value">{bestDayObj ? bestDayObj.dia : '—'}</div>
          </div>
        </div>

        <div className="heatmap-wrap">
          <div className="heatmap-section" style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <h3>Reservas por Horário</h3>
            {porHora.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Sem dados no período.</p>
            ) : (
              porHora.map((h) => {
                const pct = Math.round((h.total / maxPico) * 100);
                const cor = pct >= 80 ? '#ef4444' : pct >= 50 ? '#f59e0b' : '#34d399';
                return (
                  <div className="hora-row" key={h.hora}>
                    <span className="hora-label">{String(h.hora).padStart(2, '0')}:00</span>
                    <div className="hora-bar-wrap">
                      <div className="hora-bar" style={{ width: `${pct}%`, background: cor }} />
                    </div>
                    <span className="hora-count">{h.total}</span>
                  </div>
                );
              })
            )}
          </div>
          <div className="heatmap-section">
            <h3>Reservas por Dia da Semana</h3>
            {porDiaSemana.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Sem dados no período.</p>
            ) : (
              porDiaSemana.map((d) => {
                const maxDia = Math.max(...porDiaSemana.map((x) => x.total), 1);
                const pct = Math.round((d.total / maxDia) * 100);
                return (
                  <div className="dia-row" key={d.dia}>
                    <span className="dia-label">{d.dia}</span>
                    <div className="dia-bar-wrap">
                      <div className="dia-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="dia-count">{d.total}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </>
    );
  };

  const renderTopClientes = () => {
    if (!dadosAtuais) return null;
    const { clientes = [], totalFaturado = 0, paginacao } = dadosAtuais;

    const rankIcon = (pos: number) => {
      if (pos === 1) return <span className="client-rank gold">★</span>;
      if (pos === 2) return <span className="client-rank silver">★</span>;
      if (pos === 3) return <span className="client-rank bronze">★</span>;
      return <span className="client-rank">#{pos}</span>;
    };

    return (
      <>
        <div className="rel-kpi-row">
          <div className="rel-kpi">
            <div className="rel-kpi-label">Clientes Ativos</div>
            <div className="rel-kpi-value">{paginacao?.total ?? clientes.length}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label">Faturamento Total</div>
            <div className="rel-kpi-value green">{moeda(totalFaturado)}</div>
          </div>
          <div className="rel-kpi">
            <div className="rel-kpi-label"># 1 em Reservas</div>
            <div className="rel-kpi-value">
              {currentPage === 1 && clientes.length > 0 ? clientes[0].nome.split(' ')[0] : '—'}
            </div>
          </div>
        </div>

        <div className="table-card">
          <div style={{ padding: 'var(--s-4) var(--s-5)', borderBottom: '1px solid var(--border-passive)' }}>
            <span id="table-title">Ranking de Clientes</span>
          </div>
          <div style={{ padding: 'var(--s-2) var(--s-5)' }}>
            {clientes.length === 0 ? (
              <p style={{ color: 'var(--muted)', padding: '20px', fontSize: '13px' }}>
                Nenhum cliente com reservas no período.
              </p>
            ) : (
              clientes.map((c) => (
                <div className="top-client-row" key={c.posicao}>
                  {rankIcon(c.posicao)}
                  <div className="client-info">
                    <div className="client-name">{c.nome}</div>
                    <div className="client-sub">
                      {c.total_reservas} reserva{c.total_reservas !== 1 ? 's' : ''} · Última: {fmtData(c.ultima_reserva)} · {c.telefone || 'Sem contato'}
                    </div>
                  </div>
                  <div className="client-stats">
                    <div className="client-valor">{moeda(c.valor_total_gerado)}</div>
                    <div className="client-reservas">
                      Ticket médio {moeda(c.ticket_medio)}
                      {c.saldo_devedor > 0 && (
                        <> · <span style={{ color: 'var(--danger)' }}>Deve {moeda(c.saldo_devedor)}</span></>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="p-8 text-center text-muted">
          <div className="spinner" />
          Carregando dados...
        </div>
      );
    }

    if (errorMsg) {
      return (
        <div className="empty-state">
          <div className="icon">⚠️</div>
          <p>{errorMsg}</p>
        </div>
      );
    }

    if (!dadosAtuais) {
      return (
        <div className="empty-state">
          <div className="icon">📋</div>
          <p>Selecione o período e clique em <strong>Gerar Relatório</strong></p>
        </div>
      );
    }

    switch (relAtivo) {
      case 'faturamento':
        return renderFaturamento();
      case 'ocupacao':
        return renderOcupacao();
      case 'reservas':
        return renderReservas();
      case 'inadimplencia':
        return renderInadimplencia();
      case 'cancelamentos':
        return renderCancelamentos();
      case 'formas-pagamento':
        return renderFormasPagamento();
      case 'horarios-pico':
        return renderHorariosPico();
      case 'top-clientes':
        return renderTopClientes();
      default:
        return null;
    }
  };

  const showExportBtn = ['faturamento', 'ocupacao', 'reservas', 'inadimplencia', 'cancelamentos'].includes(relAtivo);

  return (
    <div className="admin-relatorios-page">
      {/* Toast Alert */}
      {toast && (
        <div 
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-white font-medium shadow-lg transition-transform duration-200 ${
            toast.type === 'success' ? 'bg-success' : 'bg-danger'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Tabs */}
      <div className="rel-tab-bar" role="tablist">
        <button 
          className={`tab-btn ${relAtivo === 'faturamento' ? 'active' : ''}`}
          onClick={() => setRelAtivo('faturamento')}
        >
          Faturamento
        </button>
        <button 
          className={`tab-btn ${relAtivo === 'ocupacao' ? 'active' : ''}`}
          onClick={() => setRelAtivo('ocupacao')}
        >
          Ocupação
        </button>
        <button 
          className={`tab-btn ${relAtivo === 'reservas' ? 'active' : ''}`}
          onClick={() => setRelAtivo('reservas')}
        >
          Reservas
        </button>
        <button 
          className={`tab-btn ${relAtivo === 'inadimplencia' ? 'active' : ''}`}
          onClick={() => setRelAtivo('inadimplencia')}
        >
          Inadimplência
        </button>
        <button 
          className={`tab-btn ${relAtivo === 'cancelamentos' ? 'active' : ''}`}
          onClick={() => setRelAtivo('cancelamentos')}
        >
          Cancelamentos
        </button>
        <button 
          className={`tab-btn ${relAtivo === 'formas-pagamento' ? 'active' : ''}`}
          onClick={() => setRelAtivo('formas-pagamento')}
        >
          Formas de Pag.
        </button>
        <button 
          className={`tab-btn ${relAtivo === 'horarios-pico' ? 'active' : ''}`}
          onClick={() => setRelAtivo('horarios-pico')}
        >
          Horários de Pico
        </button>
        <button 
          className={`tab-btn ${relAtivo === 'top-clientes' ? 'active' : ''}`}
          onClick={() => setRelAtivo('top-clientes')}
        >
          Top Clientes
        </button>
      </div>

      {/* Toolbar / Filtros */}
      <div className="page-toolbar">
        <div className="filter-bar">
          <div>
            <label htmlFor="rel-inicio" style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '2px' }}>De</label>
            <input 
              type="date" 
              id="rel-inicio" 
              style={{ width: 'auto' }}
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="rel-fim" style={{ fontSize: '11px', color: 'var(--muted)', display: 'block', marginBottom: '2px' }}>Até</label>
            <input 
              type="date" 
              id="rel-fim" 
              style={{ width: 'auto' }}
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>
          <select 
            id="rel-quadra" 
            style={{ width: 'auto', minWidth: '160px', alignSelf: 'flex-end' }}
            value={filterQuadraId}
            onChange={(e) => setFilterQuadraId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Todas as quadras</option>
            {quadras.map(q => (
              <option key={q.id} value={q.id}>{q.nome} — {q.tipo}</option>
            ))}
          </select>
          <button 
            className="btn-primary" 
            style={{ alignSelf: 'flex-end' }} 
            onClick={() => { setCurrentPage(1); gerarRelatorio(relAtivo, 1); }}
          >
            Gerar Relatório
          </button>
        </div>

        {showExportBtn && (
          <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
            <button className="btn-ghost" onClick={exportarCSV}>↓ CSV da página</button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div style={{ marginTop: 'var(--s-4)' }}>
        {renderContent()}
      </div>
      {!loading && dadosAtuais?.paginacao && (
        <Pagination
          page={dadosAtuais.paginacao.pagina}
          totalPages={dadosAtuais.paginacao.totalPaginas}
          onPage={changePage}
        />
      )}
    </div>
  );
}
