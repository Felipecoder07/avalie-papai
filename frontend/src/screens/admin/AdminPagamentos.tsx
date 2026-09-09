import React, { useState, useEffect } from 'react';
import '../../assets/css/pagamentos.css';

interface Pagamento {
  id: number;
  reserva_id: number;
  valor: number;
  metodo: string;
  registrado_em: string;
  motivo_estorno?: string;
  status?: string;
}

interface ReservaPagamento {
  id: number;
  cliente_nome: string;
  quadra_nome: string;
  data_reserva: string;
  hora_inicio: string;
  hora_fim: string;
  valor_total: number;
  total_pago: number;
  saldo_devedor: number;
  metodos: string;
  status_pagamento: string;
}

interface KPIResumo {
  recebidoHoje: number;
  qtdPagamentosHoje: number;
  pendenteHoje: number;
  qtdPendenteHoje: number;
  recebidoMes: number;
  totalInadimplencia: number;
  qtdInadimplentes: number;
  dataFiltro?: string | null;
  resumoFiltrado?: {
    data: string;
    recebido: number;
    qtdPagamentos: number;
    pendente: number;
    qtdPendente: number;
    faturamentoTotal: number;
    totalReservas: number;
    qtdInadimplentes: number;
  } | null;
  counts?: {
    pendentes: number;
    pagos: number;
    inadimplentes: number;
    todos: number;
  };
  countsGlobais: {
    pendentes: number;
    pagos: number;
    inadimplentes: number;
    todos: number;
  };
}

const formatCurrencyInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatFloatToCurrencyInput = (num: number) => {
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyToFloat = (value: string) => {
  if (!value) return 0;
  const clean = value.replace(/\./g, '').replace(',', '.');
  return parseFloat(clean) || 0;
};

const formatCurrency = (val: number) => {
  return 'R$ ' + val.toFixed(2).replace('.', ',');
};

const formatData = (dateStr: string) => {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

interface AdminPagamentosKPIsProps {
  dataFiltro: string;
  kpis: KPIResumo | null;
}

const AdminPagamentosKPIs: React.FC<AdminPagamentosKPIsProps> = ({ dataFiltro, kpis }) => {
  if (dataFiltro && kpis?.resumoFiltrado) {
    return (
      <section className="kpi-row mb-6" aria-label="Resumo financeiro">
        <div className="kpi-card" style={{ borderLeft: '4px solid #16a34a' }}>
          <div className="kpi-label">Recebido em {formatData(dataFiltro)}</div>
          <div className="kpi-value">{formatCurrency(kpis.resumoFiltrado.recebido)}</div>
          <div className="kpi-sub positive">{kpis.resumoFiltrado.qtdPagamentos} pagamento(s)</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div className="kpi-label">Pendente em {formatData(dataFiltro)}</div>
          <div className="kpi-value">{formatCurrency(kpis.resumoFiltrado.pendente)}</div>
          <div className="kpi-sub warning">{kpis.resumoFiltrado.qtdPendente} reserva(s)</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #2563eb' }}>
          <div className="kpi-label">Faturado no Dia</div>
          <div className="kpi-value">{formatCurrency(kpis.resumoFiltrado.faturamentoTotal)}</div>
          <div className="kpi-sub" style={{ color: '#2563eb' }}>{kpis.resumoFiltrado.totalReservas} reserva(s) agendadas</div>
        </div>
        <div className="kpi-card" style={{ borderLeft: '4px solid #dc2626' }}>
          <div className="kpi-label">Inadimplência Geral</div>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>{formatCurrency(kpis?.totalInadimplencia || 0)}</div>
          <div className="kpi-sub warning">{kpis?.qtdInadimplentes || 0} reserva(s) vencidas</div>
        </div>
      </section>
    );
  }

  return (
    <section className="kpi-row mb-6" aria-label="Resumo financeiro">
      <div className="kpi-card" style={{ borderLeft: '4px solid #16a34a' }}>
        <div className="kpi-label">Recebido Hoje</div>
        <div className="kpi-value">{formatCurrency(kpis?.recebidoHoje || 0)}</div>
        <div className="kpi-sub positive">{kpis?.qtdPagamentosHoje || 0} pagamento(s)</div>
      </div>
      <div className="kpi-card" style={{ borderLeft: '4px solid #f59e0b' }}>
        <div className="kpi-label">Pendente Hoje</div>
        <div className="kpi-value">{formatCurrency(kpis?.pendenteHoje || 0)}</div>
        <div className="kpi-sub warning">{kpis?.qtdPendenteHoje || 0} reserva(s)</div>
      </div>
      <div className="kpi-card" style={{ borderLeft: '4px solid #2563eb' }}>
        <div className="kpi-label">Recebido no Mês</div>
        <div className="kpi-value">{formatCurrency(kpis?.recebidoMes || 0)}</div>
        <div className="kpi-sub positive">mês atual</div>
      </div>
      <div className="kpi-card" style={{ borderLeft: '4px solid #dc2626' }}>
        <div className="kpi-label">Inadimplência</div>
        <div className="kpi-value" style={{ color: 'var(--danger)' }}>{formatCurrency(kpis?.totalInadimplencia || 0)}</div>
        <div className="kpi-sub warning">{kpis?.qtdInadimplentes || 0} reserva(s) vencidas</div>
      </div>
    </section>
  );
};

export function AdminPagamentos() {
  const token = localStorage.getItem('courtmanager_token');

  // KPIs
  const [kpis, setKpis] = useState<KPIResumo | null>(null);

  // Filtros e listagem
  const [reservas, setReservas] = useState<ReservaPagamento[]>([]);
  const [tabAtiva, setTabAtiva] = useState<'Pendente' | 'Pago' | 'inadimplentes' | 'todos'>('Pendente');
  const [busca, setBusca] = useState('');
  const [dataFiltro, setDataFiltro] = useState('');
  const [loading, setLoading] = useState(true);

  // Modais
  const [activeModal, setActiveModal] = useState<'registrar-pagamento' | 'estornar-pagamento' | null>(null);

  // Registro de pagamento
  const [reservaAtual, setReservaAtual] = useState<ReservaPagamento | null>(null);
  const [pagamentosReserva, setPagamentosReserva] = useState<Pagamento[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [rpValor, setRpValor] = useState('');
  const [rpMetodo, setRpMetodo] = useState('');

  // Estorno
  const [pagamentoEstornoId, setPagamentoEstornoId] = useState<number | null>(null);
  const [estpValor, setEstpValor] = useState('');
  const [estpMotivo, setEstpMotivo] = useState('');

  // Toast / Status messages
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Gateway de Pagamentos em Lote Admin
  const [gatewayRef, setGatewayRef] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [copiaCola, setCopiaCola] = useState('');
  const [loadingGateway, setLoadingGateway] = useState(false);
  const [showPixCobranca, setShowPixCobranca] = useState(false);
  const [posDeviceId, setPosDeviceId] = useState('');

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Carregar KPIs
  const carregarKPIs = async (overrideData?: string) => {
    if (!token) return;
    const dt = overrideData !== undefined ? overrideData : dataFiltro;
    try {
      const url = dt ? `/api/pagamentos/resumo?data=${encodeURIComponent(dt)}` : '/api/pagamentos/resumo';
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setKpis(data);
      }
    } catch (err) {
      console.warn('Erro ao carregar KPIs de pagamento:', err);
    }
  };

  // Carregar reservas de faturamento
  const carregarReservas = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tabAtiva !== 'todos') {
        params.append('status', tabAtiva);
      }
      if (busca) {
        params.append('busca', busca);
      }
      if (dataFiltro) {
        params.append('data', dataFiltro);
      }

      const res = await fetch(`/api/pagamentos/reservas?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReservas(data);
      } else {
        setReservas([]);
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao carregar faturamentos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarKPIs(dataFiltro);
  }, [token, tabAtiva, dataFiltro]);

  useEffect(() => {
    carregarReservas();
  }, [token, tabAtiva, dataFiltro]);

  // Debounce para busca textual
  useEffect(() => {
    const timer = setTimeout(() => {
      carregarReservas();
    }, 350);
    return () => clearTimeout(timer);
  }, [busca]);

  // Buscar histórico de pagamentos individuais ao abrir modal de pagamento ou estorno
  const carregarHistoricoPagamentos = async (reservaId: number) => {
    if (!token) return;
    setLoadingHistorico(true);
    try {
      const res = await fetch(`/api/pagamentos/reserva/${reservaId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPagamentosReserva(data);
        
        // Se for estorno, seleciona automaticamente o último pagamento positivo válido
        const positivos = data.filter((p: Pagamento) => p.valor > 0);
        if (positivos.length > 0) {
          setPagamentoEstornoId(positivos[positivos.length - 1].id);
          setEstpValor(formatFloatToCurrencyInput(positivos[positivos.length - 1].valor));
        } else {
          setPagamentoEstornoId(null);
          setEstpValor('');
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistorico(false);
    }
  };

  // Polling para o Pix Online no painel Admin
  useEffect(() => {
    if (!showPixCobranca || !reservaAtual) return;

    let intervalId: any;
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/pagamentos/gateway/status/${reservaAtual.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status_pagamento === 'Pago' || data.status_pagamento === 'Parcial') {
            showToast(data.status_pagamento === 'Pago' ? 'Pagamento confirmado (Quitado) no caixa!' : 'Pagamento parcial registrado no caixa!', 'success');
            
            // Limpa estados e fecha modal
            setShowPixCobranca(false);
            setGatewayRef('');
            setQrCode('');
            setCopiaCola('');
            setActiveModal(null);
            setReservaAtual(null);
            
            // Recarrega dados
            carregarKPIs();
            carregarReservas();
          }
        }
      } catch (err) {
        console.warn(err);
      }
    };

    intervalId = setInterval(checkStatus, 3000);
    return () => clearInterval(intervalId);
  }, [showPixCobranca, reservaAtual, token]);

  const handleSimularPagamentoPix = async () => {
    if (!gatewayRef) return;
    try {
      const payload: any = { gateway_ref: gatewayRef };
      if (rpMetodo === 'Cartão (Maquineta Online)') {
        payload.device_id = posDeviceId;
        payload.valor_pago = parseCurrencyToFloat(rpValor);
      }

      const res = await fetch('/api/pagamentos/gateway/simular-pagamento', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao simular.');
      
      showToast('Pagamento simulação concluída!', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const fecharModalPagamento = () => {
    setActiveModal(null);
    setReservaAtual(null);
    setShowPixCobranca(false);
    setGatewayRef('');
    setQrCode('');
    setCopiaCola('');
    setPosDeviceId('');
  };

  // Abrir Modal de Pagamento
  const abrirPagamento = (reserva: ReservaPagamento) => {
    setReservaAtual(reserva);
    setRpValor(formatFloatToCurrencyInput(reserva.saldo_devedor));
    setRpMetodo('');
    setPagamentosReserva([]);
    setActiveModal('registrar-pagamento');
    carregarHistoricoPagamentos(reserva.id);
  };

  // Abrir Modal de Estorno
  const abrirEstorno = (reserva: ReservaPagamento) => {
    setReservaAtual(reserva);
    setEstpMotivo('');
    setPagamentosReserva([]);
    setPagamentoEstornoId(null);
    setActiveModal('estornar-pagamento');
    carregarHistoricoPagamentos(reserva.id);
  };

  // Salvar Pagamento
  const handleSalvarPagamento = async () => {
    if (!reservaAtual || !rpValor || !rpMetodo || !token) {
      showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
      return;
    }

    const valorNumerico = parseCurrencyToFloat(rpValor);

    if (rpMetodo === 'Pix Online (Gateway)' || rpMetodo === 'Cartão (Maquineta Online)') {
      setLoadingGateway(true);
      setShowPixCobranca(true);
      try {
        const metodo = rpMetodo === 'Pix Online (Gateway)' ? 'Pix' : 'Maquineta';
        const res = await fetch('/api/pagamentos/gateway/cobranca', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            reserva_id: reservaAtual.id,
            metodo,
            valor: valorNumerico
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Erro ao gerar cobrança ${metodo}.`);

        setGatewayRef(data.gateway_ref);
        if (metodo === 'Pix') {
          setQrCode(data.qr_code);
          setCopiaCola(data.copia_cola);
        } else {
          setPosDeviceId(data.device_id);
        }
      } catch (err: any) {
        showToast(err.message, 'error');
        setShowPixCobranca(false);
      } finally {
        setLoadingGateway(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/pagamentos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          reserva_id: reservaAtual.id,
          valor: valorNumerico,
          metodo: rpMetodo
        })
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erro ao registrar pagamento');

      showToast('Pagamento registrado com sucesso!', 'success');
      setActiveModal(null);
      setReservaAtual(null);
      carregarKPIs();
      carregarReservas();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Confirmar Estorno
  const handleConfirmarEstorno = async () => {
    if (!pagamentoEstornoId || !estpValor || !estpMotivo || !token) {
      showToast('A justificativa e o valor são obrigatórios.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/pagamentos/estorno', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          pagamento_id: pagamentoEstornoId,
          valor: parseCurrencyToFloat(estpValor),
          motivo: estpMotivo.trim()
        })
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Erro ao estornar pagamento');

      showToast('Estorno realizado com sucesso!', 'success');
      setActiveModal(null);
      setReservaAtual(null);
      setPagamentoEstornoId(null);
      setEstpValor('');
      carregarKPIs();
      carregarReservas();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const definirData = (tipo: 'hoje' | 'ontem' | 'amanha' | 'limpar') => {
    if (tipo === 'limpar') {
      setDataFiltro('');
      return;
    }
    const tzOffset = new Date().getTimezoneOffset() * 60000;
    const base = new Date(Date.now() - tzOffset);
    if (tipo === 'ontem') {
      base.setDate(base.getDate() - 1);
    } else if (tipo === 'amanha') {
      base.setDate(base.getDate() + 1);
    }
    const str = base.toISOString().split('T')[0];
    setDataFiltro(str);
  };

  // Limpar Filtros
  const limparFiltros = () => {
    setBusca('');
    setDataFiltro('');
  };

  // Exportar para CSV
  const exportarCSV = () => {
    if (!reservas.length) {
      showToast('Nenhum dado para exportar.', 'error');
      return;
    }
    const headers = ['ID', 'Cliente', 'Quadra', 'Data', 'Horário', 'Valor Total', 'Pago', 'Saldo', 'Método', 'Status'];
    const rows = [headers];
    
    reservas.forEach(r => {
      rows.push([
        r.id.toString(),
        r.cliente_nome,
        r.quadra_nome,
        r.data_reserva,
        `${r.hora_inicio}-${r.hora_fim}`,
        r.valor_total.toFixed(2),
        r.total_pago.toFixed(2),
        r.saldo_devedor.toFixed(2),
        r.metodos || '',
        r.status_pagamento
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(e => e.join(';')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `pagamentos_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Totais da listagem atual
  const totalValor = reservas.reduce((acc, r) => acc + (r.valor_total || 0), 0);
  const totalPago = reservas.reduce((acc, r) => acc + (r.total_pago || 0), 0);
  const totalSaldo = reservas.reduce((acc, r) => acc + (r.saldo_devedor || 0), 0);

  // Contagens sincronizadas com o filtro ativo
  const countPendentes = kpis?.counts?.pendentes ?? kpis?.countsGlobais?.pendentes ?? 0;
  const countPagos = kpis?.counts?.pagos ?? kpis?.countsGlobais?.pagos ?? 0;
  const countInadimplentes = kpis?.counts?.inadimplentes ?? kpis?.countsGlobais?.inadimplentes ?? 0;
  const countTodos = kpis?.counts?.todos ?? kpis?.countsGlobais?.todos ?? 0;

  return (
    <div className="admin-pagamentos-page">
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

      {/* Badge de Filtro Ativo quando há data selecionada */}
      {dataFiltro && (
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '10px',
            padding: '10px 16px',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', color: '#1e40af', fontWeight: 600 }}>
            <span>📅</span>
            <span>Visualizando dados filtrados para: <strong>{formatData(dataFiltro)}</strong></span>
          </div>
          <button
            onClick={() => definirData('limpar')}
            style={{
              padding: '4px 10px',
              backgroundColor: '#ffffff',
              border: '1px solid #93c5fd',
              borderRadius: '6px',
              color: '#1d4ed8',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            ✕ Limpar filtro de data
          </button>
        </div>
      )}

      {/* KPI strip Adaptativo */}
      <AdminPagamentosKPIs dataFiltro={dataFiltro} kpis={kpis} />

      {/* Toolbar / Filtros com Atalhos Rápidos */}
      <div className="page-toolbar mb-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="filter-bar flex items-center flex-wrap gap-2">
          <input 
            type="text" 
            className="search-input" 
            placeholder="Buscar por cliente ou ID..." 
            style={{ width: '220px' }}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <input 
            type="date" 
            style={{ width: 'auto' }}
            value={dataFiltro}
            onChange={(e) => setDataFiltro(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '4px' }}>
            <button 
              type="button" 
              className={`btn-ghost ${dataFiltro === new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0] ? 'active' : ''}`}
              onClick={() => definirData('hoje')} 
              style={{ fontSize: '11.5px', padding: '6px 10px' }}
            >
              Hoje
            </button>
            <button 
              type="button" 
              className="btn-ghost" 
              onClick={() => definirData('ontem')} 
              style={{ fontSize: '11.5px', padding: '6px 10px' }}
            >
              Ontem
            </button>
            <button 
              type="button" 
              className="btn-ghost" 
              onClick={() => definirData('amanha')} 
              style={{ fontSize: '11.5px', padding: '6px 10px' }}
            >
              Amanhã
            </button>
            <button 
              type="button" 
              className="btn-ghost" 
              onClick={limparFiltros} 
              style={{ fontSize: '11.5px', padding: '6px 10px' }}
            >
              Limpar
            </button>
          </div>
        </div>
        <button className="btn-ghost" onClick={exportarCSV}>↓ Exportar CSV</button>
      </div>

      {/* Tabs com Contadores Sincronizados */}
      <div className="tab-bar mb-4" role="tablist">
        <button 
          className={`tab-btn ${tabAtiva === 'Pendente' ? 'active' : ''}`}
          onClick={() => setTabAtiva('Pendente')}
        >
          Pendentes ({countPendentes})
        </button>
        <button 
          className={`tab-btn ${tabAtiva === 'Pago' ? 'active' : ''}`}
          onClick={() => setTabAtiva('Pago')}
        >
          Pagos ({countPagos})
        </button>
        <button 
          className={`tab-btn ${tabAtiva === 'inadimplentes' ? 'active' : ''}`}
          onClick={() => setTabAtiva('inadimplentes')}
        >
          Inadimplência ({countInadimplentes})
        </button>
        <button 
          className={`tab-btn ${tabAtiva === 'todos' ? 'active' : ''}`}
          onClick={() => setTabAtiva('todos')}
        >
          Todos ({countTodos})
        </button>
      </div>

      {/* Tabela de Pagamentos */}
      <div className="table-card" style={{ overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reserva</th>
                <th>Cliente</th>
                <th>Quadra</th>
                <th>Data/Hora</th>
                <th>Valor Total</th>
                <th>Pago</th>
                <th>Saldo</th>
                <th>Método</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px' }}>Carregando faturamentos...</td>
                </tr>
              ) : reservas.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '40px' }}>Nenhuma reserva encontrada para os filtros aplicados.</td>
                </tr>
              ) : (
                reservas.map(r => {
                  const statusClass = r.status_pagamento === 'Pago' 
                    ? 'badge-green' 
                    : r.status_pagamento === 'Parcial' 
                      ? 'badge-amber' 
                      : 'badge-red';

                  return (
                    <tr key={r.id}>
                      <td><span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--charcoal-82)' }}>#{r.id}</span></td>
                      <td>{r.cliente_nome}</td>
                      <td>{r.quadra_nome}</td>
                      <td>{formatData(r.data_reserva)} · {r.hora_inicio}–{r.hora_fim}</td>
                      <td>{formatCurrency(r.valor_total)}</td>
                      <td className={r.total_pago > 0 ? 'valor-positivo' : ''}>{formatCurrency(r.total_pago)}</td>
                      <td className={r.saldo_devedor > 0 ? 'valor-negativo' : ''}>
                        {r.saldo_devedor > 0 ? formatCurrency(r.saldo_devedor) : '—'}
                      </td>
                      <td style={{ fontSize: '12px' }}>{r.metodos || '—'}</td>
                      <td><span className={`badge ${statusClass}`}>{r.status_pagamento}</span></td>
                      <td>
                        {r.status_pagamento !== 'Pago' ? (
                          <button className="btn-action btn-action-pay" onClick={() => abrirPagamento(r)}>Registrar</button>
                        ) : (
                          <button className="btn-action btn-action-refund" onClick={() => abrirEstorno(r)}>Estornar</button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé Totalizador da Tabela */}
        {!loading && reservas.length > 0 && (
          <div 
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
              padding: '14px 20px',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              fontSize: '13px'
            }}
          >
            <div style={{ color: '#64748b', fontWeight: 500 }}>
              Listando <strong>{reservas.length}</strong> reserva(s)
            </div>
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valor Total</span>
                <strong style={{ color: '#0f172a', fontSize: '14px' }}>{formatCurrency(totalValor)}</strong>
              </div>
              <div>
                <span style={{ color: '#16a34a', fontSize: '11px', fontWeight: 600, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Pago</span>
                <strong style={{ color: '#16a34a', fontSize: '14px' }}>{formatCurrency(totalPago)}</strong>
              </div>
              <div>
                <span style={{ color: totalSaldo > 0 ? '#dc2626' : '#64748b', fontSize: '11px', fontWeight: 600, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Saldo a Receber</span>
                <strong style={{ color: totalSaldo > 0 ? '#dc2626' : '#64748b', fontSize: '14px' }}>{formatCurrency(totalSaldo)}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: REGISTRAR PAGAMENTO */}
      <div className={`modal-overlay ${activeModal === 'registrar-pagamento' ? 'open' : ''}`}>
        {reservaAtual && (
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Registrar Pagamento</h2>
              <button className="modal-close" onClick={fecharModalPagamento}>✕</button>
            </div>
            <div className="modal-body">
              {showPixCobranca ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
                  {loadingGateway ? (
                    <div style={{ fontSize: '13px', color: 'var(--muted)', margin: '40px 0' }}>
                      {rpMetodo === 'Cartão (Maquineta Online)' ? 'Enviando cobrança para a maquineta...' : 'Gerando cobrança Pix...'}
                    </div>
                  ) : rpMetodo === 'Cartão (Maquineta Online)' ? (
                    <>
                      <div style={{ width: '120px', height: '120px', background: 'var(--cream-surface)', border: '1px solid var(--border-passive)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px', marginBottom: '16px' }}>
                        💳
                      </div>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--success)', marginBottom: '8px' }}>
                        Aguardando Cartão...
                      </h3>
                      <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px', maxWidth: '280px' }}>
                        Cobrança enviada ao terminal <strong>{posDeviceId}</strong> no valor de <strong>{formatCurrency(parseCurrencyToFloat(rpValor))}</strong>. Insira ou aproxime o cartão.
                      </p>

                      <div style={{ width: '100%', borderTop: '1px solid var(--border-passive)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <button 
                          type="button"
                          onClick={handleSimularPagamentoPix}
                          style={{ background: 'var(--amber)', color: 'white', border: 'none', padding: '10px', borderRadius: 'var(--r-md)', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
                        >
                          ⚡ Simular Aproximação do Cartão
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ width: '150px', height: '150px', background: 'white', border: '1px solid var(--border-passive)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', marginBottom: '16px' }}>
                        <img src={qrCode} alt="Pix QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px', maxWidth: '280px' }}>
                        Peça para o cliente escanear o QR Code acima. A tela atualizará automaticamente após o pagamento.
                      </p>
                      
                      <div style={{ width: '100%', textAlign: 'left', marginBottom: '20px' }}>
                        <label style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Pix Copia e Cola</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input 
                            type="text" 
                            readOnly 
                            value={copiaCola} 
                            style={{ flex: 1, fontSize: '11px', fontFamily: 'monospace', border: '1px solid var(--border-passive)', padding: '6px 10px', borderRadius: '4px', background: 'var(--cream-surface)', outline: 'none' }}
                          />
                          <button 
                            type="button" 
                            style={{ background: 'rgba(47, 133, 90, 0.1)', color: '#2F855A', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                            onClick={() => {
                              navigator.clipboard.writeText(copiaCola);
                              showToast('Chave Pix copiada!', 'success');
                            }}
                          >
                            Copiar
                          </button>
                        </div>
                      </div>

                    </>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ background: 'var(--cream-surface)', border: '1px solid var(--border-passive)', borderRadius: 'var(--r-md)', padding: 'var(--s-3) var(--s-4)', marginBottom: 'var(--s-4)', fontSize: '13px' }}>
                    <strong>{reservaAtual.cliente_nome}</strong> · {reservaAtual.quadra_nome} · {formatData(reservaAtual.data_reserva)} {reservaAtual.hora_inicio}–{reservaAtual.hora_fim}<br />
                    Valor total: <strong>{formatCurrency(reservaAtual.valor_total)}</strong> · Pago: <strong className="valor-positivo">{formatCurrency(reservaAtual.total_pago)}</strong> · Saldo: <strong className="valor-negativo">{formatCurrency(reservaAtual.saldo_devedor)}</strong>
                  </div>

                  {/* Histórico */}
                  {pagamentosReserva.filter(p => p.valor > 0).length > 0 && (
                    <div style={{ marginBottom: 'var(--s-4)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: 'var(--s-2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Histórico de Pagamentos
                      </div>
                      <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                        {pagamentosReserva.filter(p => p.valor > 0).map(p => (
                          <div className="hist-item" key={p.id}>
                            <span>{p.metodo} — {new Date(p.registrado_em).toLocaleDateString('pt-BR')}</span>
                            <span className="valor-positivo">{formatCurrency(p.valor)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-4)' }}>
                    <div className="form-group">
                      <label htmlFor="rp-valor">Valor a pagar *</label>
                      <input 
                        type="text" 
                        id="rp-valor" 
                        placeholder="0,00" 
                        value={rpValor}
                        onChange={(e) => setRpValor(formatCurrencyInput(e.target.value))}
                        required 
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="rp-metodo">Método *</label>
                      <select 
                        id="rp-metodo" 
                        value={rpMetodo}
                        onChange={(e) => setRpMetodo(e.target.value)}
                        required
                      >
                        <option value="">Selecione</option>
                        <option value="Pix">Pix (Manual)</option>
                        <option value="Pix Online (Gateway)">Pix Online (Gateway)</option>
                        <option value="Cartão (Maquineta Online)">Cartão (Maquineta Online)</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Cartão de Crédito">Cartão de Crédito</option>
                        <option value="Cartão de Débito">Cartão de Débito</option>
                        <option value="Voucher Interno">Voucher Interno</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" type="button" onClick={fecharModalPagamento}>
                {showPixCobranca ? 'Voltar' : 'Cancelar'}
              </button>
              {!showPixCobranca && (
                <button className="btn-primary" type="button" onClick={handleSalvarPagamento}>Salvar Pagamento</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL: ESTORNAR PAGAMENTO */}
      <div className={`modal-overlay ${activeModal === 'estornar-pagamento' ? 'open' : ''}`}>
        {reservaAtual && (
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Estornar Pagamento</h2>
              <button className="modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: 'var(--s-4)' }}>
                Confirma o estorno? Esta ação irá abater do caixa e gerar um log de auditoria.
              </p>

              <div style={{ background: 'var(--cream-surface)', border: '1px solid var(--border-passive)', borderRadius: 'var(--r-md)', padding: 'var(--s-3) var(--s-4)', marginBottom: 'var(--s-4)', fontSize: '13px' }}>
                Reserva #{reservaAtual.id} de <strong>{reservaAtual.cliente_nome}</strong> <br />
                Valor Total: <strong>{formatCurrency(reservaAtual.valor_total)}</strong> · Pago: <strong className="valor-positivo">{formatCurrency(reservaAtual.total_pago)}</strong>
              </div>

              {/* Pagamentos disponíveis para estorno */}
              {loadingHistorico ? (
                <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Carregando pagamentos...</p>
              ) : pagamentosReserva.filter(p => p.valor > 0).length === 0 ? (
                <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Nenhum pagamento encontrado para estorno.</p>
              ) : (
                <div style={{ marginBottom: 'var(--s-4)' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: 'var(--s-2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Selecione o pagamento a ser estornado
                  </div>
                  {pagamentosReserva.filter(p => p.valor > 0).map(p => (
                    <div 
                      key={p.id} 
                      className={`hist-item p-2 rounded-md mb-1 cursor-pointer flex justify-between items-center ${
                        pagamentoEstornoId === p.id ? 'bg-cream-surface border border-primary' : 'hover:bg-cream-surface/50 border border-transparent'
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setPagamentoEstornoId(p.id);
                        setEstpValor(formatFloatToCurrencyInput(p.valor));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setPagamentoEstornoId(p.id);
                          setEstpValor(formatFloatToCurrencyInput(p.valor));
                        }
                      }}
                    >
                      <span className="text-xs text-charcoal">{p.metodo} — {new Date(p.registrado_em).toLocaleDateString('pt-BR')}</span>
                      <span className="font-semibold text-xs valor-positivo">{formatCurrency(p.valor)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="estp-valor">Valor a estornar *</label>
                <input 
                  type="text" 
                  id="estp-valor" 
                  placeholder="Ex: 15,00" 
                  value={estpValor}
                  onChange={(e) => setEstpValor(formatCurrencyInput(e.target.value))}
                  required 
                />
              </div>

              <div className="form-group">
                <label htmlFor="estp-motivo">Justificativa do Estorno *</label>
                <textarea 
                  id="estp-motivo" 
                  rows={2} 
                  placeholder="Obrigatório para auditoria" 
                  maxLength={100} 
                  value={estpMotivo}
                  onChange={(e) => setEstpMotivo(e.target.value)}
                  required 
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" type="button" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button 
                className="btn-primary" 
                type="button" 
                style={{ background: 'var(--danger)' }}
                onClick={handleConfirmarEstorno}
              >
                Confirmar Estorno
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
