import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';

interface Reserva {
  id: number;
  hora_inicio: string;
  hora_fim: string;
  cliente_nome: string;
  quadra_nome: string;
  status_pagamento: string;
  data_reserva: string;
}

interface Alerta {
  cliente_nome: string;
  quadra_nome: string;
  hora_inicio: string;
}

interface Inadimplente {
  nome: string;
  deve: number;
}

interface QuadrasStatus {
  nome: string;
  cliente?: string;
  estado: string;
}

interface DashboardData {
  hoje: string;
  faturamentoDia: number;
  faturamentoPendente: number;
  reservasDia: number;
  taxaOcupacao: number;
  proximasReservas: Reserva[];
  alertas: Alerta[];
  faturamentoMes: number;
  inadimplentes: Inadimplente[];
  quadrasStatus: QuadrasStatus[];
}

interface GradeData {
  quadras: Array<{
    id: number;
    nome: string;
    tipo: string;
    hora_abertura: string;
    hora_fechamento: string;
  }>;
  reservas: Array<{
    quadra_id: number;
    hora_inicio: string;
    hora_fim: string;
    cliente_nome: string;
    status_pagamento: string;
  }>;
  bloqueios: Array<{
    quadra_id: number;
    hora_inicio: string;
    hora_fim: string;
    motivo?: string;
  }>;
}

interface DashboardMiniSlotProps {
  quadra: any;
  horaStr: string;
  isPastHour: boolean;
  reservas: any[];
  bloqueios: any[];
}

function DashboardMiniSlot({ quadra: q, horaStr, isPastHour, reservas, bloqueios }: Readonly<DashboardMiniSlotProps>) {
  if (horaStr < q.hora_abertura || horaStr >= q.hora_fechamento) {
    return <div key={q.id} className="slot" style={{ background: 'transparent', border: 'none' }} />;
  }

  const r = (reservas || []).find((res: any) => res.quadra_id === q.id && res.hora_inicio <= horaStr && res.hora_fim > horaStr);
  const b = (bloqueios || []).find((bl: any) => bl.quadra_id === q.id && bl.hora_inicio <= horaStr && bl.hora_fim > horaStr);

  if (b) {
    return isPastHour ? (
      <div key={q.id} className="slot slot--past-blocked" title={b.motivo || 'Bloqueado'} />
    ) : (
      <div key={q.id} className="slot slot--blocked" title={b.motivo || 'Bloqueado'}>⊘</div>
    );
  }

  if (r) {
    let cls = 'slot--pending';
    if (r.status_pagamento === 'Pago') cls = 'slot--paid';
    if (r.status_pagamento === 'Parcial') cls = 'slot--partial';
    return (
      <div key={q.id} className={`slot ${cls}`} title={r.cliente_nome}>
        {r.cliente_nome || '—'}
      </div>
    );
  }

  return isPastHour ? (
    <div key={q.id} className="slot slot--past-available" title="Livre (Passado)" />
  ) : (
    <div key={q.id} className="slot slot--available" title="Livre" />
  );
}

export function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [grade, setGrade] = useState<GradeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingGrade, setLoadingGrade] = useState(true);

  const token = localStorage.getItem('courtmanager_token');

  const formatCurrency = (val: number) => {
    return 'R$ ' + val.toFixed(2).replace('.', ',');
  };

  useEffect(() => {
    if (!token) return;

    const fetchDashboard = async () => {
      try {
        const res = await fetch('/api/dashboard/resumo', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error('Erro ao carregar resumo do dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchGrade = async () => {
      try {
        const tzOffset = new Date().getTimezoneOffset() * 60000;
        const hoje = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
        const res = await fetch(`/api/reservas/grade?data=${hoje}`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Cache-Control': 'no-store'
          }
        });
        if (res.ok) {
          const json = await res.json();
          setGrade(json);
        }
      } catch (err) {
        console.error('Erro ao carregar grade do dia:', err);
      } finally {
        setLoadingGrade(false);
      }
    };

    fetchDashboard();
    fetchGrade();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-muted">
        Carregando dados do painel...
      </div>
    );
  }

  // KPIs
  const faturamentoDia = data?.faturamentoDia ?? 0;
  const faturamentoPendente = data?.faturamentoPendente ?? 0;
  const reservasDia = data?.reservasDia ?? 0;
  const taxaOcupacao = data?.taxaOcupacao ?? 0;
  const faturamentoMes = data?.faturamentoMes ?? 0;

  const dateParts = data?.hoje.split('-') || [];
  const formattedSubtitle = dateParts.length === 3 ? `Dados de ${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : 'Dados de hoje';

  const isEndOfDay = new Date().getHours() >= 20;

  // Calculo de inadimplência total
  const totalInadimplente = data?.inadimplentes?.reduce((sum, item) => sum + item.deve, 0) ?? 0;

  // Render da mini grade
  const renderMiniGrade = () => {
    if (loadingGrade) {
      return <div className="p-5 text-center text-muted">Carregando grade do dia...</div>;
    }
    if (!grade || !grade.quadras || grade.quadras.length === 0) {
      return <div className="p-5 text-center text-muted">Nenhuma quadra disponível.</div>;
    }

    const { quadras, reservas, bloqueios } = grade;

    // Calcula a hora mínima de abertura e máxima de fechamento
    let earliest = '23:59';
    let latest = '00:00';
    quadras.forEach(q => {
      if (q.hora_abertura && q.hora_abertura < earliest) earliest = q.hora_abertura;
      if (q.hora_fechamento && q.hora_fechamento > latest) latest = q.hora_fechamento;
    });
    const minHour = earliest !== '23:59' ? Number.parseInt(earliest.split(':')[0], 10) : 8;
    let maxHour = latest !== '00:00' ? Number.parseInt(latest.split(':')[0], 10) : 22;

    if (latest.endsWith(':00')) maxHour--;

    // Hora atual local para marcar passados
    const nowLocal = new Date();
    const tzOffsetLocal = nowLocal.getTimezoneOffset() * 60000;
    const nowISOLocal = new Date(Date.now() - tzOffsetLocal).toISOString();
    const currentHour = nowISOLocal.split('T')[1].substring(0, 5);

    const rows = [];
    for (let h = minHour; h <= maxHour; h++) {
      const horaStr = h.toString().padStart(2, '0') + ':00';
      const isPastHour = horaStr < currentHour;
      const rowSlots = quadras.map(q => (
        <DashboardMiniSlot
          key={q.id}
          quadra={q}
          horaStr={horaStr}
          isPastHour={isPastHour}
          reservas={reservas}
          bloqueios={bloqueios}
        />
      ));

      rows.push(
        <div key={horaStr} className="mini-grade-row" style={{ gridTemplateColumns: `52px repeat(${quadras.length}, 1fr)` }}>
          <div className="time-label" style={isPastHour ? { opacity: 0.4 } : undefined}>{horaStr}</div>
          {rowSlots}
        </div>
      );
    }

    return (
      <div className="mini-grade">
        <div className="mini-grade-labels" style={{ gridTemplateColumns: `52px repeat(${quadras.length}, 1fr)` }}>
          <div className="court-label"></div>
          {quadras.map(q => (
            <div key={q.id} className="court-label">{q.nome}</div>
          ))}
        </div>
        {rows}
      </div>
    );
  };

  return (
    <>


      {/* KPI Cards Row */}
      <section className="kpi-row mb-6" aria-label="Indicadores do dia">
        <div className="kpi-card">
          <div className="kpi-label">Faturamento do Dia</div>
          <div className="kpi-value">{formatCurrency(faturamentoDia)}</div>
          <div className="kpi-sub">hoje</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Faturamento Pendente</div>
          <div className="kpi-value">{formatCurrency(faturamentoPendente)}</div>
          <div className="kpi-sub">{reservasDia} reserva(s) ativas hoje</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Reservas do Dia</div>
          <div className="kpi-value">{reservasDia}</div>
          <div className="kpi-sub">no dia de hoje</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Taxa de Ocupação</div>
          <div className="kpi-value">{taxaOcupacao}%</div>
          <div className="kpi-sub">da capacidade hoje</div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ 
                width: `${taxaOcupacao}%`,
                backgroundColor: taxaOcupacao >= 80 ? 'var(--paid)' : taxaOcupacao >= 40 ? 'var(--pending)' : 'var(--partial)'
              }}
            />
          </div>
        </div>
      </section>

      {/* Middle row: Mini grade + próximas reservas */}
      <section className="mid-row">
        {/* Mini grade de quadras */}
        <div className="card grade-card">
          <div className="card-header">
            <h2 className="card-title">Grade do Dia — Hoje</h2>
            <Link to="/admin/reservas" className="btn-ghost btn-sm">Ver grade completa →</Link>
          </div>
          <div className="grade-legend">
            <span className="legend-item"><i className="dot dot--paid"></i>Pago</span>
            <span className="legend-item"><i className="dot dot--pending"></i>Pendente</span>
            <span className="legend-item"><i className="dot dot--partial"></i>Parcial</span>
            <span className="legend-item"><i className="dot dot--available"></i>Livre</span>
            <span className="legend-item"><i className="dot dot--blocked"></i>Bloqueado</span>
          </div>
          {renderMiniGrade()}
        </div>

        {/* Painel lateral direito */}
        <div className="right-panels">
          {/* Próximas reservas */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Próximas Reservas</h2>
            </div>
            <ul className="reservas-list">
              {!data?.proximasReservas || data.proximasReservas.length === 0 ? (
                <li style={{ padding: '24px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>{isEndOfDay ? '🌙' : '☀️'}</div>
                  <div style={{ fontWeight: 600, color: 'var(--charcoal)', fontSize: '14px', marginBottom: '4px' }}>
                    {isEndOfDay ? 'Dia encerrado por aqui!' : 'Nenhuma reserva futura hoje'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    {isEndOfDay ? 'Bom descanso. Amanhã tem mais!' : 'Que tal criar uma nova reserva?'}
                  </div>
                </li>
              ) : (
                data.proximasReservas.map((r) => {
                  let badge = 'badge--pending';
                  if (r.status_pagamento === 'Pago') badge = 'badge--paid';
                  if (r.status_pagamento === 'Parcial') badge = 'badge--partial';

                  return (
                    <li key={r.id} className="reserva-item">
                      <div className="reserva-time">{r.hora_inicio}</div>
                      <div className="reserva-info">
                        <span className="reserva-client">{r.cliente_nome}</span>
                        <span className="reserva-detail">{r.quadra_nome}</span>
                      </div>
                      <span className={`badge ${badge}`}>{r.status_pagamento}</span>
                    </li>
                  );
                })
              )}
            </ul>
            <Link to="/admin/reservas" className="btn-primary btn-full">+ Nova Reserva</Link>
          </div>

          {/* Alertas */}
          <div className="card card--alert">
            <div className="card-header">
              <h2 className="card-title">⚠ Atenção</h2>
            </div>
            <ul className="alert-list">
              {!data?.alertas || data.alertas.length === 0 ? (
                <li style={{ padding: '10px 16px', fontSize: '13px', color: 'var(--muted)' }}>
                  Nenhum alerta pendente.
                </li>
              ) : (
                data.alertas.map((a, i) => (
                  <li key={i} className="alert-item">
                    <span className="alert-text">
                      {a.cliente_nome} · {a.quadra_nome} · {a.hora_inicio} — pagamento pendente
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </section>

      {/* Financial Row */}
      <section className="financial-row mt-6">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Faturamento do Mês</h2>
            <span className="card-tag">Julho 2026</span>
          </div>
          <div className="big-number">{formatCurrency(faturamentoMes)}</div>
          <div className="compare">No mês vigente</div>
          <div className="payment-breakdown">
            <div style={{ fontSize: '12px', color: 'var(--muted)', paddingTop: '10px' }}>
              Quebra por método de pagamento em desenvolvimento.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Inadimplência</h2>
            <Link to="/admin/relatorios" className="btn-ghost btn-sm">Ver relatório →</Link>
          </div>
          <div className="big-number danger">{formatCurrency(totalInadimplente)}</div>
          <div className="compare">{data?.inadimplentes?.length || 0} reservas em aberto</div>
          <ul className="inadimplentes-list">
            {!data?.inadimplentes || data.inadimplentes.length === 0 ? (
              <li style={{ padding: '10px 16px', fontSize: '13px', color: 'var(--muted)' }}>
                Sem inadimplentes.
              </li>
            ) : (
              data.inadimplentes.map((item, idx) => (
                <li key={idx}>
                  {item.nome} <span>{formatCurrency(item.deve)}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Status das Quadras</h2>
          </div>
          <ul className="quadras-status-list">
            {!data?.quadrasStatus || data.quadrasStatus.length === 0 ? (
              <li style={{ padding: '10px 16px', fontSize: '13px', color: 'var(--muted)' }}>
                Nenhuma quadra cadastrada.
              </li>
            ) : (
              data.quadrasStatus.map((q, idx) => (
                <li key={idx} className="quadra-status-item">
                  <span className="quadra-name">
                    {q.nome} 
                    {q.cliente && (
                      <small style={{ display: 'block', color: 'var(--muted)', fontWeight: 'normal' }}>
                        {q.cliente}
                      </small>
                    )}
                  </span>
                  <span className={`quadra-badge ${q.estado === 'Em uso' ? 'online' : 'available'}`}>
                    {q.estado}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </>
  );
}
