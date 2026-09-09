import { useState, useEffect, useMemo } from 'react';
import { UserPlus, CreditCard } from 'lucide-react';
import '../../assets/css/reservas.css';

export interface ModalidadeItem {
  nome: string;
  preco: number;
}

interface Quadra {
  id: number;
  nome: string;
  tipo: string;
  hora_abertura: string;
  hora_fechamento: string;
  preco_base?: number;
  modalidades?: (string | ModalidadeItem)[];
  status?: string;
}

interface Reserva {
  id: number;
  quadra_id: number;
  quadra_nome?: string;
  hora_inicio: string;
  hora_fim: string;
  cliente_nome: string;
  cliente_telefone?: string;
  cliente_email?: string;
  cliente_id?: number;
  status?: string;
  status_pagamento: string;
  valor_total: number;
  valor_pago: number;
  total_pago?: number;
  observacoes?: string;
  data_reserva: string;
  esporte?: string;
}

interface Bloqueio {
  id: number;
  quadra_id: number;
  hora_inicio: string;
  hora_fim: string;
  motivo?: string;
  data_bloqueio: string;
}

interface Cliente {
  id: number;
  nome: string;
  telefone?: string;
  email?: string;
}

export interface GradeData {
  quadras: Quadra[];
  reservas: Reserva[];
  bloqueios: Bloqueio[];
}

export interface Coluna {
  id: string;
  label: string;
  subLabel: string;
  quadra_id: number;
  data: string;
  hora_abertura: string;
  hora_fechamento: string;
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

const getWeekRange = (dateStr: string) => {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0 = Domingo, 1 = Segunda, etc.
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setDate(diff));
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];
  return { startStr, endStr, start, end };
};

interface AdminGradeSlotProps {
  col: Coluna;
  idx: number;
  row: number;
  hourStr: string;
  isPast: boolean;
  res?: Reserva;
  blq?: Bloqueio;
  onCellClick: (quadraId: number, dateStr: string, hourStr: string, reserva?: Reserva, bloqueio?: Bloqueio) => void;
}

export const AdminGradeSlot: React.FC<AdminGradeSlotProps> = ({
  col,
  idx,
  row,
  hourStr,
  isPast,
  res,
  blq,
  onCellClick
}) => {
  const isOpen = hourStr >= col.hora_abertura && hourStr < col.hora_fechamento;

  if (!isOpen) {
    return (
      <div
        key={col.id}
        className="gt-slot s-blocked"
        style={{ gridColumn: idx + 2, gridRow: row, background: 'var(--charcoal-03)', border: '1px solid var(--border-passive)', opacity: 0.5, pointerEvents: 'none' }}
      >
        <span className="slot-name" style={{ color: 'var(--muted)' }}>Fechada</span>
      </div>
    );
  }

  if (blq) {
    return (
      <div
        key={col.id}
        className="gt-slot s-blocked"
        title={blq.motivo || 'Bloqueado'}
        style={{ gridColumn: idx + 2, gridRow: row, cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onClick={() => onCellClick(col.quadra_id, col.data, hourStr, undefined, blq)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onCellClick(col.quadra_id, col.data, hourStr, undefined, blq); }}
      >
        <span className="slot-name">{blq.motivo || 'Bloqueado'}</span>
      </div>
    );
  }

  if (res) {
    if (res.hora_inicio === hourStr) {
      const hI = parseInt(res.hora_inicio.split(':')[0], 10);
      const hF = parseInt(res.hora_fim.split(':')[0], 10);
      const span = hF - hI;

      let cssClass = 's-pending';
      let labelStatus = 'Pendente';
      if (res.status_pagamento === 'Pago') {
        cssClass = 's-paid';
        labelStatus = 'Pago';
      } else if (res.status_pagamento === 'Parcial') {
        cssClass = 's-partial';
        labelStatus = 'Parcial';
      }

      const formatVal = 'R$ ' + res.valor_total.toFixed(2).replace('.', ',');

      return (
        <div
          key={col.id}
          className={`gt-slot ${cssClass}`}
          style={{ gridColumn: idx + 2, gridRow: `${row} / span ${span}` }}
          role="button"
          tabIndex={0}
          onClick={() => onCellClick(col.quadra_id, col.data, hourStr, res)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onCellClick(col.quadra_id, col.data, hourStr, res); }}
        >
          <span className="slot-name">
            {res.cliente_nome}
            {res.esporte && res.esporte !== 'Geral' && (
              <span style={{ fontSize: '10px', marginLeft: '4px', opacity: 0.85, fontWeight: 'normal' }}>
                · {res.esporte}
              </span>
            )}
          </span>
          <span className="slot-label">{formatVal} · {labelStatus}</span>
        </div>
      );
    }
    return null;
  }

  if (isPast) {
    return (
      <div
        key={col.id}
        className="gt-slot s-past-empty"
        style={{ gridColumn: idx + 2, gridRow: row }}
      />
    );
  }

  return (
    <div
      key={col.id}
      className="gt-slot s-available"
      style={{ gridColumn: idx + 2, gridRow: row }}
      role="button"
      tabIndex={0}
      onClick={() => onCellClick(col.quadra_id, col.data, hourStr)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onCellClick(col.quadra_id, col.data, hourStr); }}
    >
      <span className="slot-label">Livre</span>
    </div>
  );
};

export function AdminReservas() {
  const token = localStorage.getItem('courtmanager_token');

  // Controle de Visualização e Filtros
  const [scope, setScope] = useState<'diaria' | 'semanal'>('diaria');
  const [filterQuadraId, setFilterQuadraId] = useState<number | ''>('');

  // Data de referência
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  const todayStr = new Date(Date.now() - tzOffset).toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState<string>(() => todayStr);

  // Dados da Grade e Auxiliares
  const [grade, setGrade] = useState<GradeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [quadras, setQuadras] = useState<Quadra[]>([]);

  // Modais de Controle
  const [activeModal, setActiveModal] = useState<
    'new-reserva' | 'detalhe-reserva' | 'cancelar-reserva' | 'registrar-pagamento' | 'estornar-pagamento' | 'bloquear-quadra' | 'gerenciar-bloqueio' | 'pix-gateway' | null
  >(null);

  // Estados de Gateway Pix
  const [gatewayRef, setGatewayRef] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [copiaCola, setCopiaCola] = useState('');

  // Estados dos Formulários
  // 1. Nova Reserva
  const [nrClienteBusca, setNrClienteBusca] = useState('');
  const [nrClienteId, setNrClienteId] = useState<number | null>(null);
  const [nrQuadraId, setNrQuadraId] = useState<number | null>(null);
  const [nrEsporte, setNrEsporte] = useState('');
  const [nrData, setNrData] = useState(selectedDate);
  const [nrInicio, setNrInicio] = useState('');
  const [nrFim, setNrFim] = useState('');
  const [nrObs, setNrObs] = useState('');
  const [nrValorPrevisto, setNrValorPrevisto] = useState(0);
  const [showNrAutocomplete, setShowNrAutocomplete] = useState(false);
  const [nrHorariosInicio, setNrHorariosInicio] = useState<string[]>([]);
  const [nrHorariosFim, setNrHorariosFim] = useState<string[]>([]);

  // 1.1 Cadastro Rápido de Cliente no Modal
  const [showQuickClientForm, setShowQuickClientForm] = useState(false);
  const [qcNome, setQcNome] = useState('');
  const [qcTelefone, setQcTelefone] = useState('');
  const [qcEmail, setQcEmail] = useState('');
  const [qcLoading, setQcLoading] = useState(false);

  // 1.2 Pagamento Imediato no Balcão
  const [nrRegistrarPagamento, setNrRegistrarPagamento] = useState(false);
  const [nrPagMetodo, setNrPagMetodo] = useState('Pix (QR Code na Tela)');
  const [nrPagValor, setNrPagValor] = useState('');

  // Sincroniza valor de pagamento com o valor previsto quando o checkbox estiver ativo
  useEffect(() => {
    if (nrRegistrarPagamento) {
      setNrPagValor(nrValorPrevisto.toFixed(2));
    }
  }, [nrValorPrevisto, nrRegistrarPagamento]);

  // Modalidades da Quadra Selecionada
  const quadraSelecionada = quadras.find(q => q.id === nrQuadraId);
  const modalidadesQuadra = useMemo<ModalidadeItem[]>(() => {
    if (!quadraSelecionada) return [];
    const raw = quadraSelecionada.modalidades;
    if (!raw || !Array.isArray(raw) || raw.length === 0) {
      return [{ nome: quadraSelecionada.tipo || 'Beach Tennis', preco: quadraSelecionada.preco_base || 80 }];
    }
    return raw.map(m => typeof m === 'string' ? { nome: m, preco: quadraSelecionada.preco_base || 80 } : { nome: m.nome, preco: Number(m.preco != null ? m.preco : quadraSelecionada.preco_base || 80) });
  }, [quadraSelecionada]);

  // Sincroniza esporte padrão ao trocar de quadra
  useEffect(() => {
    if (modalidadesQuadra.length > 0) {
      if (!nrEsporte || !modalidadesQuadra.some(m => m.nome === nrEsporte)) {
        setNrEsporte(modalidadesQuadra[0].nome);
      }
    } else {
      setNrEsporte('');
    }
  }, [modalidadesQuadra, nrEsporte]);

  // 2. Detalhes Reserva Selecionada
  const [selectedReserva, setSelectedReserva] = useState<Reserva | null>(null);

  // 3. Cancelar Reserva
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [obsCancelamento, setObsCancelamento] = useState('');
  const [motivosDisponiveis] = useState([
    'Desistência do cliente',
    'Chuva/Mau tempo',
    'Conflito de agenda',
    'Erro de agendamento',
    'Outro'
  ]);

  // 4. Registrar Pagamento
  const [pagValor, setPagValor] = useState('');
  const [pagDesconto, setPagDesconto] = useState('');
  const [pagMetodo, setPagMetodo] = useState('');
  const [pagData, setPagData] = useState('');

  // 5. Estornar Pagamento
  const [estValor, setEstValor] = useState('');
  const [estMotivo, setEstMotivo] = useState('');

  // 6. Bloquear Quadra
  const [bqQuadraId, setBqQuadraId] = useState<number | null>(null);
  const [bqData, setBqData] = useState(selectedDate);
  const [bqInicio, setBqInicio] = useState('');
  const [bqFim, setBqFim] = useState('');
  const [bqMotivo, setBqMotivo] = useState('');
  const [bqHorariosInicio, setBqHorariosInicio] = useState<string[]>([]);
  const [bqHorariosFim, setBqHorariosFim] = useState<string[]>([]);

  // 7. Gerenciar Bloqueio Selecionado
  const [selectedBloqueio, setSelectedBloqueio] = useState<Bloqueio | null>(null);
  const [selectedBloqueioTime, setSelectedBloqueioTime] = useState('');

  // Toast / Status messages
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [qcErrors, setQcErrors] = useState<{ nome?: string; telefone?: string; email?: string }>({});

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Polling em tempo real do Pix Gateway no modal de reservas
  useEffect(() => {
    if (activeModal !== 'pix-gateway' || !selectedReserva || !gatewayRef) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/pagamentos/gateway/status/${selectedReserva.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status_pagamento === 'Pago' || data.status_pagamento === 'Parcial') {
            showToast(`Pagamento Pix de R$ ${data.total_pago?.toFixed(2)} verificado e confirmado!`, 'success');
            setActiveModal(null);
            setSelectedReserva(null);
            fetchGrade();
          }
        }
      } catch (e) {
        console.error('Erro no polling do Pix:', e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeModal, selectedReserva, gatewayRef, token]);

  // Carregar Grade principal
  const fetchGrade = async () => {
    if (!token) return;
    setLoading(true);

    let start = selectedDate;
    let end = selectedDate;

    if (scope === 'semanal') {
      const range = getWeekRange(selectedDate);
      start = range.startStr;
      end = range.endStr;
    }

    try {
      const res = await fetch(`/api/reservas/grade?data_inicio=${start}&data_fim=${end}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setGrade(json);
      }
    } catch (err) {
      console.error('Erro ao buscar grade:', err);
    } finally {
      setLoading(false);
    }
  };

  // Carregar dados gerais na inicialização
  useEffect(() => {
    if (!token) return;

    const fetchGerais = async () => {
      try {
        // Clientes
        const resCl = await fetch('/api/clientes', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resCl.ok) {
          const cl = await resCl.json();
          setClientes(cl);
        }

        // Quadras
        const resQd = await fetch('/api/quadras', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (resQd.ok) {
          const qd = await resQd.json();
          setQuadras(qd);
          // Set initial filter to first active court if weekly view is entered
          const ativas = Array.isArray(qd) ? qd.filter((q: Quadra) => q.status === 'Ativa') : [];
          if (scope === 'semanal' && !filterQuadraId && ativas.length > 0) {
            setFilterQuadraId(ativas[0].id);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar dados auxiliares:', err);
      }
    };

    fetchGerais();
  }, [token]);

  // Recarregar grade quando muda data, escopo ou filtros
  useEffect(() => {
    fetchGrade();
    setNrData(selectedDate);
    setBqData(selectedDate);
  }, [selectedDate, scope, filterQuadraId]);

  // Polling automático de confirmação do Pix Online no Modal de Reservas Admin
  useEffect(() => {
    if (activeModal !== 'pix-gateway' || !selectedReserva) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/public/status-reserva/${selectedReserva.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status_pagamento === 'Pago') {
            showToast('Pagamento Pix confirmado com sucesso!', 'success');
            setActiveModal(null);
            setSelectedReserva(null);
            fetchGrade();
          }
        }
      } catch (err) {
        console.error('Erro no polling Pix Admin:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeModal, selectedReserva]);

  // Se mudar para semanal e não tiver quadra selecionada, força a primeira quadra ativa
  useEffect(() => {
    const ativas = quadras.filter(q => q.status === 'Ativa');
    if (scope === 'semanal' && filterQuadraId === '' && ativas.length > 0) {
      setFilterQuadraId(ativas[0].id);
    }
  }, [scope, quadras, filterQuadraId]);

  // Carregar valor pago real da reserva selecionada ao abrir detalhes
  useEffect(() => {
    if (!selectedReserva || !token) return;

    const fetchPagos = async () => {
      try {
        const res = await fetch(`/api/pagamentos/reserva/${selectedReserva.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const pags = await res.json();
          const totalPago = pags.reduce((acc: number, curr: any) => acc + (curr.valor || 0), 0);

          if (selectedReserva.valor_pago !== totalPago) {
            setSelectedReserva(prev => prev ? { ...prev, valor_pago: totalPago } : null);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar pagamentos da reserva:', err);
      }
    };

    fetchPagos();
  }, [selectedReserva?.id, token]);

  // Recalcular horários disponíveis da reserva (Nova Reserva)
  useEffect(() => {
    if (!nrQuadraId || !nrData || !grade) {
      setNrHorariosInicio([]);
      setNrHorariosFim([]);
      return;
    }

    const q = grade.quadras.find(x => x.id === nrQuadraId);
    if (!q) return;

    const abertura = q.hora_abertura || '08:00';
    const fechamento = q.hora_fechamento || '22:00';

    const minHour = parseInt(abertura.split(':')[0], 10);
    const maxHour = parseInt(fechamento.split(':')[0], 10);

    const resQuadra = (grade.reservas || []).filter(r => r.quadra_id === nrQuadraId && r.data_reserva === nrData);
    const bqQuadra = (grade.bloqueios || []).filter(b => b.quadra_id === nrQuadraId && b.data_bloqueio === nrData);

    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const todayStr = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
    const currentHourStr = new Date(Date.now() - tzOffset).toISOString().split('T')[1].substring(0, 5);

    const livres: string[] = [];
    for (let h = minHour; h < maxHour; h++) {
      const startSlot = h.toString().padStart(2, '0') + ':00';
      const endSlot = (h + 1).toString().padStart(2, '0') + ':00';

      if (nrData === todayStr && endSlot <= currentHourStr) {
        continue;
      }

      const ocupado = resQuadra.some(r => r.hora_inicio <= startSlot && r.hora_fim > startSlot) ||
        bqQuadra.some(b => b.hora_inicio <= startSlot && b.hora_fim > startSlot);

      if (!ocupado) {
        livres.push(startSlot);
      }
    }

    setNrHorariosInicio(livres);

    if (nrInicio && !livres.includes(nrInicio)) {
      setNrInicio('');
    }
  }, [nrQuadraId, nrData, grade]);

  // Recalcular horários Fim (Nova Reserva)
  useEffect(() => {
    if (!nrInicio || !nrQuadraId || !grade) {
      setNrHorariosFim([]);
      return;
    }

    const q = grade.quadras.find(x => x.id === nrQuadraId);
    const fechamento = q?.hora_fechamento || '22:00';
    const maxH = parseInt(fechamento.split(':')[0], 10);

    const hI = parseInt(nrInicio.split(':')[0], 10);
    const options: string[] = [];

    for (let h = hI + 1; h <= maxH; h++) {
      const prevHourStr = (h - 1).toString().padStart(2, '0') + ':00';
      const blockLivre = nrHorariosInicio.includes(prevHourStr);
      if (!blockLivre) break;

      options.push(h.toString().padStart(2, '0') + ':00');
    }

    setNrHorariosFim(options);

    if (options.length > 0) {
      if (!nrFim || !options.includes(nrFim)) {
        setNrFim(options[0]);
      }
    } else {
      setNrFim('');
    }
  }, [nrInicio, nrHorariosInicio]);

  // Calcular valor previsto (Nova Reserva)
  useEffect(() => {
    if (!nrQuadraId || !nrInicio || !nrFim) {
      setNrValorPrevisto(0);
      return;
    }

    const q = quadras.find(x => x.id === nrQuadraId);
    const sportMatch = modalidadesQuadra.find(m => m.nome === nrEsporte);
    const preco = sportMatch?.preco ?? q?.preco_base ?? 80;

    const [hIni] = nrInicio.split(':').map(Number);
    const [hFim] = nrFim.split(':').map(Number);
    const duracao = hFim - hIni;

    if (duracao > 0) {
      setNrValorPrevisto(preco * duracao);
    } else {
      setNrValorPrevisto(0);
    }
  }, [nrQuadraId, nrInicio, nrFim, nrEsporte, modalidadesQuadra, quadras]);

  // Recalcular horários disponíveis (Bloqueio)
  useEffect(() => {
    if (!bqQuadraId || !bqData || !grade) {
      setBqHorariosInicio([]);
      setBqHorariosFim([]);
      return;
    }

    const q = grade.quadras.find(x => x.id === bqQuadraId);
    if (!q) return;

    const abertura = q.hora_abertura || '08:00';
    const fechamento = q.hora_fechamento || '22:00';

    const minHour = parseInt(abertura.split(':')[0], 10);
    const maxHour = parseInt(fechamento.split(':')[0], 10);

    const resQuadra = (grade.reservas || []).filter(r => r.quadra_id === bqQuadraId && r.data_reserva === bqData);
    const bqQuadraList = (grade.bloqueios || []).filter(b => b.quadra_id === bqQuadraId && b.data_bloqueio === bqData);

    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const todayStr = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
    const currentHourStr = new Date(Date.now() - tzOffset).toISOString().split('T')[1].substring(0, 5);

    const livres: string[] = [];
    for (let h = minHour; h < maxHour; h++) {
      const startSlot = h.toString().padStart(2, '0') + ':00';
      const endSlot = (h + 1).toString().padStart(2, '0') + ':00';

      if (bqData === todayStr && endSlot <= currentHourStr) {
        continue;
      }

      const ocupado = resQuadra.some(r => r.hora_inicio <= startSlot && r.hora_fim > startSlot) ||
        bqQuadraList.some(b => b.hora_inicio <= startSlot && b.hora_fim > startSlot);

      if (!ocupado) {
        livres.push(startSlot);
      }
    }

    setBqHorariosInicio(livres);

    if (bqInicio && !livres.includes(bqInicio)) {
      setBqInicio('');
    }
  }, [bqQuadraId, bqData, grade]);

  // Recalcular horários Fim (Bloqueio)
  useEffect(() => {
    if (!bqInicio || !bqQuadraId || !grade) {
      setBqHorariosFim([]);
      return;
    }

    const q = grade.quadras.find(x => x.id === bqQuadraId);
    const fechamento = q?.hora_fechamento || '22:00';
    const maxH = parseInt(fechamento.split(':')[0], 10);

    const hI = parseInt(bqInicio.split(':')[0], 10);
    const options: string[] = [];

    for (let h = hI + 1; h <= maxH; h++) {
      const prevHourStr = (h - 1).toString().padStart(2, '0') + ':00';
      const blockLivre = bqHorariosInicio.includes(prevHourStr);
      if (!blockLivre) break;

      options.push(h.toString().padStart(2, '0') + ':00');
    }

    setBqHorariosFim(options);

    if (options.length > 0) {
      if (!bqFim || !options.includes(bqFim)) {
        setBqFim(options[0]);
      }
    } else {
      setBqFim('');
    }
  }, [bqInicio, bqHorariosInicio]);

  // Máscara de telefone/WhatsApp
  const maskPhone = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  // Cadastro Rápido de Cliente direto no modal
  const handleQuickClientCreate = async (): Promise<number | null> => {
    const errors: { nome?: string; telefone?: string; email?: string } = {};

    if (!qcNome.trim()) {
      errors.nome = 'O nome do cliente é obrigatório.';
    } else if (qcNome.trim().split(/\s+/).length < 2) {
      errors.nome = 'Informe pelo menos nome e sobrenome (ex: João Silva).';
    }

    if (!qcTelefone.trim()) {
      errors.telefone = 'O WhatsApp é obrigatório.';
    } else if (!/^\(\d{2}\)\s\d{5}-\d{4}$/.test(qcTelefone.trim())) {
      errors.telefone = 'Número incompleto. Use (99) 99999-9999.';
    }

    if (qcEmail.trim()) {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(qcEmail.trim())) {
        errors.email = 'Formato de e-mail inválido.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setQcErrors(errors);
      return null;
    }

    setQcErrors({});
    setQcLoading(true);
    try {
      const res = await fetch('/api/clientes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nome: qcNome.trim(),
          telefone: qcTelefone.trim(),
          email: qcEmail.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.field && data.error) {
          setQcErrors({ [data.field]: data.error });
        } else {
          showToast(data.error || 'Erro ao cadastrar cliente', 'error');
        }
        return null;
      }

      const novoCliente: Cliente = {
        id: data.id,
        nome: data.nome,
        telefone: data.telefone,
        email: data.email
      };

      setClientes(prev => [...prev, novoCliente].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNrClienteId(novoCliente.id);
      setNrClienteBusca(novoCliente.nome);
      setShowQuickClientForm(false);
      setShowNrAutocomplete(false);
      setQcNome('');
      setQcTelefone('');
      setQcEmail('');
      setQcErrors({});
      showToast(`Cliente ${novoCliente.nome} cadastrado e selecionado!`, 'success');
      return novoCliente.id;
    } catch (err: any) {
      showToast(err.message || 'Erro ao cadastrar cliente', 'error');
      return null;
    } finally {
      setQcLoading(false);
    }
  };

  // Submit Nova Reserva
  const handleConfirmarReserva = async () => {
    let finalClienteId = nrClienteId;

    // Se o formulário rápido de cliente estiver aberto e preenchido, salva o cliente automaticamente antes de criar a reserva!
    if (!finalClienteId && showQuickClientForm && (qcNome.trim() || qcTelefone.trim())) {
      const createdId = await handleQuickClientCreate();
      if (!createdId) return; // Parar se houver erro de validação inline
      finalClienteId = createdId;
    }

    if (!finalClienteId || !nrQuadraId || !nrData || !nrInicio || !nrFim) {
      if (!finalClienteId) {
        showToast('Por favor, selecione ou cadastre um cliente.', 'error');
      } else {
        showToast('Por favor, preencha todos os campos obrigatórios.', 'error');
      }
      return;
    }

    try {
      const isPixQrCode = nrRegistrarPagamento && nrPagMetodo === 'Pix (QR Code na Tela)';
      const valPago = parseFloat(nrPagValor.replace(',', '.')) || nrValorPrevisto;

      const payload: any = {
        cliente_id: finalClienteId,
        quadra_id: nrQuadraId,
        data_reserva: nrData,
        hora_inicio: nrInicio,
        hora_fim: nrFim,
        esporte: nrEsporte || modalidadesQuadra[0]?.nome || 'Beach Tennis',
        observacoes: nrObs,
        valor_total: nrValorPrevisto
      };

      if (nrRegistrarPagamento && nrValorPrevisto > 0 && !isPixQrCode) {
        payload.pagamento = {
          registrar: true,
          metodo: nrPagMetodo,
          valor: valPago
        };
      }

      const res = await fetch('/api/reservas', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const dataJson = await res.json();
      if (!res.ok) throw new Error(dataJson.error || 'Erro ao criar reserva');

      const reservaCriadaId = dataJson.id || dataJson.reserva_id;

      // Se escolheu gerar QR Code Pix na tela
      if (isPixQrCode && reservaCriadaId && valPago > 0) {
        try {
          const cobrancaRes = await fetch('/api/pagamentos/gateway/cobranca', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              reserva_id: reservaCriadaId,
              metodo: 'Pix',
              valor: valPago
            })
          });

          const cobrancaJson = await cobrancaRes.json();
          if (!cobrancaRes.ok) {
            throw new Error(cobrancaJson.error || 'Erro ao gerar QR Code do Pix.');
          }

          const novaReservaObj: Reserva = {
            id: reservaCriadaId,
            cliente_id: finalClienteId,
            cliente_nome: nrClienteBusca || 'Cliente',
            cliente_telefone: clientes.find(c => c.id === finalClienteId)?.telefone || '',
            quadra_id: nrQuadraId,
            quadra_nome: quadras.find(q => q.id === nrQuadraId)?.nome || '',
            data_reserva: nrData,
            hora_inicio: nrInicio,
            hora_fim: nrFim,
            valor_total: nrValorPrevisto,
            status: 'Confirmada',
            status_pagamento: 'Pendente',
            esporte: nrEsporte || 'Beach Tennis',
            valor_pago: 0,
            total_pago: 0
          };

          setSelectedReserva(novaReservaObj);
          setPagValor(valPago.toFixed(2));
          setGatewayRef(cobrancaJson.gateway_ref);
          setQrCode(cobrancaJson.qr_code || (cobrancaJson.qr_code_base64 ? `data:image/png;base64,${cobrancaJson.qr_code_base64}` : ''));
          setCopiaCola(cobrancaJson.copia_cola || '');
          setActiveModal('pix-gateway');
          resetNrForm();
          fetchGrade();
          showToast('Reserva criada! Apresente o QR Code Pix na tela para o cliente.', 'success');
          return;
        } catch (gatewayErr: any) {
          showToast(`Reserva criada, mas falhou ao gerar QR Code: ${gatewayErr.message}`, 'error');
          setActiveModal(null);
          resetNrForm();
          fetchGrade();
          return;
        }
      }

      showToast(
        nrRegistrarPagamento
          ? 'Reserva criada e pagamento registrado no caixa com sucesso.'
          : 'Reserva criada com sucesso.',
        'success'
      );
      setActiveModal(null);
      resetNrForm();
      fetchGrade();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Submit Bloqueio
  const handleConfirmarBloqueio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bqQuadraId || !bqData || !bqInicio || !bqFim) {
      showToast('Preencha os campos obrigatórios do bloqueio.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/reservas/bloqueios', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quadra_id: bqQuadraId,
          data_bloqueio: bqData,
          hora_inicio: bqInicio,
          hora_fim: bqFim,
          motivo: bqMotivo
        })
      });

      const dataJson = await res.json();
      if (!res.ok) throw new Error(dataJson.error || 'Erro ao criar bloqueio');

      showToast('Quadra bloqueada com sucesso!', 'success');
      setActiveModal(null);
      resetBqForm();
      fetchGrade();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Submit Cancelamento
  const handleConfirmarCancelamento = async () => {
    if (!selectedReserva || !motivoCancelamento) {
      showToast('O motivo do cancelamento é obrigatório.', 'error');
      return;
    }

    try {
      const res = await fetch(`/api/reservas/${selectedReserva.id}/cancelar`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          motivo: motivoCancelamento,
          observacoes: obsCancelamento
        })
      });

      const dataJson = await res.json();
      if (!res.ok) throw new Error(dataJson.error || 'Erro ao cancelar reserva');

      showToast('Reserva cancelada com sucesso!', 'success');
      setActiveModal(null);
      setSelectedReserva(null);
      fetchGrade();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Submit Pagamento
  const handleConfirmarPagamento = async () => {
    if (!selectedReserva || !pagValor || !pagMetodo) {
      showToast('Preencha os campos obrigatórios de pagamento.', 'error');
      return;
    }

    const valorNumerico = parseCurrencyToFloat(pagValor);

    if (pagMetodo === 'Pix Online (Gateway)') {
      try {
        const res = await fetch('/api/pagamentos/gateway/cobranca', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reserva_id: selectedReserva.id,
            metodo: 'Pix',
            valor: valorNumerico
          })
        });

        const dataJson = await res.json();
        if (!res.ok) throw new Error(dataJson.error || 'Erro ao gerar cobrança Pix.');

        setGatewayRef(dataJson.gateway_ref);
        setQrCode(dataJson.qr_code || (dataJson.qr_code_base64 ? `data:image/png;base64,${dataJson.qr_code_base64}` : ''));
        setCopiaCola(dataJson.copia_cola || '');
        setActiveModal('pix-gateway');
        showToast('Cobrança Pix Online gerada com sucesso!', 'success');
      } catch (e: any) {
        showToast(e.message, 'error');
      }
      return;
    }

    if (pagMetodo === 'Cartão (Maquineta Online)') {
      try {
        const res = await fetch('/api/pagamentos/gateway/cobranca', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reserva_id: selectedReserva.id,
            metodo: 'Maquineta',
            valor: valorNumerico
          })
        });

        const dataJson = await res.json();
        if (!res.ok) throw new Error(dataJson.error || 'Erro ao comunicar com a Maquineta.');

        showToast(`Cobrança enviada para a maquineta ${dataJson.device_id}!`, 'success');
        setActiveModal(null);
        setSelectedReserva(null);
        fetchGrade();
      } catch (e: any) {
        showToast(e.message, 'error');
      }
      return;
    }

    try {
      const res = await fetch('/api/pagamentos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reserva_id: selectedReserva.id,
          valor: valorNumerico,
          desconto: pagDesconto ? parseCurrencyToFloat(pagDesconto) : 0,
          metodo: pagMetodo
        })
      });

      const dataJson = await res.json();
      if (!res.ok) throw new Error(dataJson.error || 'Erro ao registrar pagamento');

      showToast('Pagamento registrado com sucesso!', 'success');
      setActiveModal(null);
      setSelectedReserva(null);
      fetchGrade();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Submit Estorno
  const handleConfirmarEstorno = async () => {
    if (!selectedReserva || !estValor || !estMotivo) {
      showToast('Todos os campos do estorno são obrigatórios.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/pagamentos/estorno', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reserva_id: selectedReserva.id,
          valor: parseCurrencyToFloat(estValor),
          motivo: estMotivo
        })
      });

      const dataJson = await res.json();
      if (!res.ok) throw new Error(dataJson.error || 'Erro ao realizar estorno');

      showToast('Estorno realizado com sucesso!', 'success');
      setActiveModal(null);
      setSelectedReserva(null);
      fetchGrade();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Desbloquear Quadra (Gerenciar Bloqueio)
  const handleDesbloquear = async (tudo: boolean) => {
    if (!selectedBloqueio) return;

    try {
      const url = tudo
        ? `/api/reservas/bloqueios/${selectedBloqueio.id}`
        : `/api/reservas/bloqueios/${selectedBloqueio.id}/horario?hora=${selectedBloqueioTime}`;

      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        const dataJson = await res.json();
        throw new Error(dataJson.error || 'Erro ao remover bloqueio');
      }

      showToast('Bloqueio removido com sucesso!', 'success');
      setActiveModal(null);
      setSelectedBloqueio(null);
      fetchGrade();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Auxiliares reset de formulários
  const resetNrForm = () => {
    setNrClienteBusca('');
    setNrClienteId(null);
    setNrQuadraId(null);
    setNrEsporte('');
    setNrInicio('');
    setNrFim('');
    setNrObs('');
    setNrValorPrevisto(0);
    setNrRegistrarPagamento(false);
    setNrPagMetodo('Pix (QR Code na Tela)');
    setNrPagValor('');
    setShowQuickClientForm(false);
    setShowNrAutocomplete(false);
    setQcNome('');
    setQcTelefone('');
    setQcEmail('');
  };

  const resetBqForm = () => {
    setBqQuadraId(null);
    setBqInicio('');
    setBqFim('');
    setBqMotivo('');
  };

  // Mudar data com flechas
  const adjustDate = (stepDays: number) => {
    const step = scope === 'diaria' ? stepDays : stepDays * 7;
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + step);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const setToday = () => {
    const tzOffset = new Date().getTimezoneOffset() * 60000;
    setSelectedDate(new Date(Date.now() - tzOffset).toISOString().split('T')[0]);
  };

  // Clique na grade
  const handleGridCellClick = (quadraId: number, dateStr: string, hourStr: string, reserva?: Reserva, bloqueio?: Bloqueio) => {
    if (bloqueio) {
      setSelectedBloqueio(bloqueio);
      setSelectedBloqueioTime(hourStr);
      setActiveModal('gerenciar-bloqueio');
    } else if (reserva) {
      // Inicializa valor_pago padrão seguro para evitar crash enquanto carrega
      const valPago = reserva.valor_pago !== undefined
        ? reserva.valor_pago
        : (reserva.status_pagamento === 'Pago' ? reserva.valor_total : 0);
      setSelectedReserva({ ...reserva, valor_pago: valPago });
      setActiveModal('detalhe-reserva');
    } else {
      // Slot livre, abre nova reserva
      resetNrForm();
      setNrQuadraId(quadraId);
      setNrData(dateStr);
      // Passa como pendingValue nas options
      setNrInicio(hourStr);
      setActiveModal('new-reserva');
    }
  };

  // Render da data formatada no header
  const getHeaderDateLabel = () => {
    const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (scope === 'diaria') {
      const d = new Date(selectedDate + 'T12:00:00');
      return dateFormatter.format(d);
    } else {
      const { start, end } = getWeekRange(selectedDate);
      return `${dateFormatter.format(start)} - ${dateFormatter.format(end)}`;
    }
  };

  // Render Grade Grid
  const renderGrade = () => {
    if (loading) {
      return <div className="p-8 text-center text-muted">Carregando grade de quadras...</div>;
    }
    if (!grade || !grade.quadras || grade.quadras.length === 0) {
      return <div className="p-8 text-center text-muted">Nenhuma quadra cadastrada ou ativa.</div>;
    }

    const { quadras, reservas, bloqueios } = grade;

    // Filtra quadras conforme seleção
    let quadrasParaExibir = quadras;
    if (scope === 'semanal') {
      // Semanal obrigatoriamente foca em uma única quadra
      const activeQid = filterQuadraId || quadras[0].id;
      quadrasParaExibir = quadras.filter(q => q.id === activeQid);
    } else {
      if (filterQuadraId) {
        quadrasParaExibir = quadras.filter(q => q.id === filterQuadraId);
      }
    }

    if (quadrasParaExibir.length === 0) {
      return <div className="p-8 text-center text-muted">Nenhuma quadra selecionada para exibição.</div>;
    }

    // Calcula os limites de horários para funcionamento
    let earliest = '23:59';
    let latest = '00:00';
    quadrasParaExibir.forEach(q => {
      if (q.hora_abertura && q.hora_abertura < earliest) earliest = q.hora_abertura;
      if (q.hora_fechamento && q.hora_fechamento > latest) latest = q.hora_fechamento;
    });
    const minHour = earliest !== '23:59' ? parseInt(earliest.split(':')[0], 10) : 8;
    let maxHour = latest !== '00:00' ? parseInt(latest.split(':')[0], 10) : 22;


    // Time Slots de 1 em 1 hora
    const timeSlots: string[] = [];
    for (let h = minHour; h <= maxHour; h++) {
      timeSlots.push(h.toString().padStart(2, '0') + ':00');
    }

    // Mapeamento de Colunas
    interface Coluna {
      id: string;
      label: string;
      subLabel: string;
      quadra_id: number;
      data: string;
      hora_abertura: string;
      hora_fechamento: string;
    }

    const colunas: Coluna[] = [];
    if (scope === 'diaria') {
      quadrasParaExibir.forEach(q => {
        colunas.push({
          id: `q-${q.id}`,
          label: q.nome,
          subLabel: q.tipo,
          quadra_id: q.id,
          data: selectedDate,
          hora_abertura: q.hora_abertura || '08:00',
          hora_fechamento: q.hora_fechamento || '22:00'
        });
      });
    } else {
      // Semanal: colunas são os 7 dias da semana para a quadra selecionada
      const q = quadrasParaExibir[0];
      const { start } = getWeekRange(selectedDate);
      const curr = new Date(start.getTime());
      const format = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
      for (let i = 0; i < 7; i++) {
        const diaStr = curr.toISOString().split('T')[0];
        colunas.push({
          id: `d-${diaStr}`,
          label: format.format(curr),
          subLabel: `${q.nome} — ${q.tipo}`,
          quadra_id: q.id,
          data: diaStr,
          hora_abertura: q.hora_abertura || '08:00',
          hora_fechamento: q.hora_fechamento || '22:00'
        });
        curr.setDate(curr.getDate() + 1);
      }
    }

    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const todayStr = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
    const currentHourStr = new Date(Date.now() - tzOffset).toISOString().split('T')[1].substring(0, 5);

    const rows = [];
    for (let hIndex = 0; hIndex < timeSlots.length; hIndex++) {
      const hourStr = timeSlots[hIndex];
      const row = hIndex + 2; // Row index no CSS Grid (+2 porque o header é 1)

      const cells = colunas.map((col, idx) => {
        const isPast = col.data < todayStr || (col.data === todayStr && hourStr < currentHourStr);
        const res = (reservas || []).find(r =>
          r.quadra_id === col.quadra_id &&
          r.data_reserva === col.data &&
          r.hora_inicio <= hourStr &&
          r.hora_fim > hourStr
        );
        const blq = (bloqueios || []).find(b =>
          b.quadra_id === col.quadra_id &&
          b.data_bloqueio === col.data &&
          b.hora_inicio <= hourStr &&
          b.hora_fim > hourStr
        );

        return (
          <AdminGradeSlot
            key={col.id}
            col={col}
            idx={idx}
            row={row}
            hourStr={hourStr}
            isPast={isPast}
            res={res}
            blq={blq}
            onCellClick={handleGridCellClick}
          />
        );
      });

      rows.push(
        <div key={hourStr} style={{ display: 'contents' }}>
          <div className="gt-time" style={{ gridColumn: 1, gridRow: row }}>
            {hourStr}
          </div>
          {cells}
        </div>
      );
    }

    const activeCourtForHeader = scope === 'diaria'
      ? (filterQuadraId !== '' ? quadras.find(x => x.id === filterQuadraId) : null)
      : quadrasParaExibir[0];

    return (
      <div className="card" style={{ padding: 'var(--s-4)' }}>
        <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-passive)' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--charcoal)' }}>
            {scope === 'diaria'
              ? (activeCourtForHeader ? `${activeCourtForHeader.nome}` : 'Todas as Quadras')
              : `${activeCourtForHeader ? activeCourtForHeader.nome : ''}`}
          </h2>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
            {scope === 'diaria'
              ? (activeCourtForHeader ? `${activeCourtForHeader.tipo}` : 'Visão Geral Diária')
              : `${activeCourtForHeader ? activeCourtForHeader.tipo : ''}`}
          </p>
        </div>
        <div className="grade-container">
          <div
            className="grade-table"
            style={{ gridTemplateColumns: `80px repeat(${colunas.length}, 1fr)` }}
          >
            {/* Célula vazia no canto superior esquerdo */}
            <div className="gh-cell" style={{ gridColumn: 1, gridRow: 1 }}></div>
            {colunas.map((col, idx) => (
              <div
                key={col.id}
                className="gh-cell"
                style={{
                  gridColumn: idx + 2,
                  gridRow: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px'
                }}
              >
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{col.label}</span>
                <span className="today-pill" style={{ margin: 0 }}>{col.subLabel}</span>
              </div>
            ))}
            {rows}
          </div>
        </div>
      </div>
    );
  };

  const filteredClientes = nrClienteBusca.trim() === ''
    ? []
    : clientes.filter(c => c.nome.toLowerCase().includes(nrClienteBusca.toLowerCase()) || (c.telefone && c.telefone.includes(nrClienteBusca)));

  const formatCurrency = (val: any) => {
    const num = Number(val || 0);
    return 'R$ ' + num.toFixed(2).replace('.', ',');
  };

  const formatarDataBR = (dateStr?: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  return (
    <div className="admin-reservas-page">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-white font-medium shadow-lg transition-transform duration-200 ${toast.type === 'success' ? 'bg-success' : 'bg-danger'
            }`}
        >
          {toast.message}
        </div>
      )}

      {/* Toolbar / Filtros */}
      <div className="page-toolbar mb-6 flex flex-col md:flex-row items-center justify-between gap-4 py-3">
        {/* Date navigation */}
        <div className="date-nav" style={{ width: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <button className="date-nav-btn" onClick={() => adjustDate(-1)}>‹</button>
          <span id="grade-date-label" style={{ textAlign: 'center', minWidth: '140px' }}>{getHeaderDateLabel()}</span>
          <button className="date-nav-btn" onClick={() => adjustDate(1)}>›</button>
          <button type="button" className="chip" style={{ fontSize: '11px', padding: '4px 8px' }} onClick={setToday}>Hoje</button>
        </div>

        {/* Filters */}
        <div className="filter-bar flex items-center gap-3">
          <div className="chip-group" style={{ display: 'flex', gap: 'var(--s-2)' }}>
            <button
              className={`chip ${scope === 'diaria' ? 'active' : ''}`}
              onClick={() => {
                setScope('diaria');
                setFilterQuadraId('');
              }}
            >
              Diária
            </button>
            <button
              className={`chip ${scope === 'semanal' ? 'active' : ''}`}
              onClick={() => {
                setScope('semanal');
                const ativas = quadras.filter(q => q.status === 'Ativa');
                if (filterQuadraId === '' && ativas.length > 0) {
                  setFilterQuadraId(ativas[0].id);
                }
              }}
            >
              Semanal
            </button>
          </div>

          <select
            id="filter-quadra"
            style={{ width: 'auto', minWidth: '140px' }}
            value={filterQuadraId}
            onChange={(e) => setFilterQuadraId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            {scope === 'diaria' && <option value="">Todas as quadras</option>}
            {quadras.filter(q => q.status === 'Ativa').map(q => (
              <option key={q.id} value={q.id}>{q.nome} — {q.tipo}</option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 'var(--s-3)' }}>
          <button
            className="btn-ghost"
            onClick={() => setActiveModal('bloquear-quadra')}
          >
            Bloquear Quadra
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              resetNrForm();
              setNrData(selectedDate);
              setActiveModal('new-reserva');
            }}
          >
            + Nova Reserva
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="grade-legend" style={{ marginTop: 0, borderBottom: 'none', paddingBottom: 0 }}>
        <span className="legend-item"><i className="dot dot--paid"></i>Pago</span>
        <span className="legend-item"><i className="dot dot--pending"></i>Pendente</span>
        <span className="legend-item"><i className="dot dot--partial"></i>Parcial</span>
        <span className="legend-item"><i className="dot dot--available"></i>Livre — clique para reservar</span>
        <span className="legend-item"><i className="dot dot--blocked"></i>Bloqueado</span>
      </div>

      {renderGrade()}

      {/* MODAL 1: NOVA RESERVA */}
      <div className={`modal-overlay ${activeModal === 'new-reserva' ? 'open' : ''}`}>
        <div className="modal" style={{ maxWidth: '520px' }}>
          <div className="modal-header" style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border-passive)' }}>
            <div>
              <h2 className="modal-title" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--charcoal)', margin: 0 }}>
                Nova Reserva
              </h2>
              <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', marginBottom: 0 }}>
                Agendamento manual de quadra e registro de balcão
              </p>
            </div>
            <button className="modal-close" onClick={() => setActiveModal(null)} title="Fechar">✕</button>
          </div>
          <div className="modal-body" style={{ padding: '18px 22px' }}>
            <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Busca e Seleção de Cliente */}
              <div className="form-group" style={{ position: 'relative', margin: 0 }}>
                <div className="flex justify-between items-center mb-1.5">
                  <label htmlFor="nr-cliente" style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--charcoal)' }}>
                    Atleta / Cliente *
                  </label>
                  {!showQuickClientForm && !nrClienteId && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowQuickClientForm(true);
                        setQcNome(nrClienteBusca);
                      }}
                      className="text-xs text-brand hover:underline font-semibold flex items-center gap-1 bg-transparent border-0 cursor-pointer p-0"
                    >
                      <UserPlus size={13} />
                      + Cadastrar Novo
                    </button>
                  )}
                </div>

                {/* Se o cliente já estiver selecionado */}
                {nrClienteId && !showQuickClientForm ? (
                  <div className="flex items-center justify-between p-2.5 bg-neutral-50 border border-border-passive rounded-xl">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-brand/10 text-brand font-bold text-xs flex items-center justify-center">
                        {nrClienteBusca ? nrClienteBusca.charAt(0).toUpperCase() : 'A'}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-charcoal">{nrClienteBusca}</div>
                        <div className="text-[11px] text-muted">
                          {clientes.find(c => c.id === nrClienteId)?.telefone || 'Cliente Selecionado'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNrClienteId(null);
                        setNrClienteBusca('');
                      }}
                      className="text-xs text-muted hover:text-charcoal font-semibold px-2 py-1 rounded hover:bg-neutral-200/60 transition-colors bg-transparent border-0 cursor-pointer"
                    >
                      Trocar
                    </button>
                  </div>
                ) : showQuickClientForm ? (
                  /* Bloco de Cadastro Rápido de Cliente */
                  <div className="p-3 bg-neutral-50/90 border border-border-passive rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-charcoal flex items-center gap-1.5">
                        <UserPlus size={13} className="text-brand" />
                        Cadastro Rápido de Atleta
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowQuickClientForm(false)}
                        className="text-xs text-muted hover:text-charcoal font-medium bg-transparent border-0 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">Nome Completo *</label>
                        <input
                          type="text"
                          placeholder="Nome e Sobrenome"
                          value={qcNome}
                          onChange={(e) => {
                            setQcNome(e.target.value);
                            if (qcErrors.nome) setQcErrors(prev => ({ ...prev, nome: undefined }));
                          }}
                          className={`text-xs p-2 rounded-lg border bg-white outline-none w-full transition-colors ${
                            qcErrors.nome ? 'border-red-500 bg-red-50/40 text-red-900' : 'border-border-passive focus:border-brand'
                          }`}
                          autoFocus
                        />
                        {qcErrors.nome && (
                          <span className="text-[10px] text-red-600 font-medium block mt-1">
                            {qcErrors.nome}
                          </span>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">WhatsApp *</label>
                        <input
                          type="tel"
                          placeholder="(99) 99999-9999"
                          value={qcTelefone}
                          onChange={(e) => {
                            setQcTelefone(maskPhone(e.target.value));
                            if (qcErrors.telefone) setQcErrors(prev => ({ ...prev, telefone: undefined }));
                          }}
                          className={`text-xs p-2 rounded-lg border bg-white outline-none w-full transition-colors ${
                            qcErrors.telefone ? 'border-red-500 bg-red-50/40 text-red-900' : 'border-border-passive focus:border-brand'
                          }`}
                        />
                        {qcErrors.telefone && (
                          <span className="text-[10px] text-red-600 font-medium block mt-1">
                            {qcErrors.telefone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">E-mail (opcional)</label>
                        <input
                          type="email"
                          placeholder="atleta@email.com"
                          value={qcEmail}
                          onChange={(e) => {
                            setQcEmail(e.target.value);
                            if (qcErrors.email) setQcErrors(prev => ({ ...prev, email: undefined }));
                          }}
                          className={`text-xs p-2 rounded-lg border bg-white outline-none w-full transition-colors ${
                            qcErrors.email ? 'border-red-500 bg-red-50/40 text-red-900' : 'border-border-passive focus:border-brand'
                          }`}
                        />
                        {qcErrors.email && (
                          <span className="text-[10px] text-red-600 font-medium block mt-1">
                            {qcErrors.email}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleQuickClientCreate}
                        disabled={qcLoading}
                        className="btn-primary text-xs py-2 px-3.5 shrink-0 disabled:opacity-50 h-[34px] mt-[18px]"
                      >
                        {qcLoading ? 'Salvando...' : 'Salvar e Selecionar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Campo de Busca com Autocomplete */
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      id="nr-cliente"
                      placeholder="Buscar por nome ou telefone..."
                      value={nrClienteBusca}
                      onChange={(e) => {
                        setNrClienteBusca(e.target.value);
                        setShowNrAutocomplete(true);
                        setNrClienteId(null);
                      }}
                      onBlur={() => setTimeout(() => setShowNrAutocomplete(false), 200)}
                      required
                      autoComplete="off"
                    />
                    {showNrAutocomplete && filteredClientes.length > 0 && (
                      <ul className="absolute top-full left-0 w-full bg-white border border-border-passive rounded-md max-h-48 overflow-y-auto z-50 list-none p-0 m-0 shadow-lg mt-1">
                        {filteredClientes.map(c => (
                          <li
                            key={c.id}
                            className="px-3 py-2 cursor-pointer hover:bg-cream-surface text-sm border-b border-border-passive/30 text-charcoal flex justify-between items-center"
                            onMouseDown={() => {
                              setNrClienteBusca(c.nome);
                              setNrClienteId(c.id);
                              setShowNrAutocomplete(false);
                            }}
                          >
                            <div>
                              <strong>{c.nome}</strong>
                              <span style={{ color: 'var(--muted)', fontSize: '11px', marginLeft: '8px' }}>{c.telefone || ''}</span>
                            </div>
                            <span className="text-[10px] text-muted font-medium bg-neutral-100 px-1.5 py-0.5 rounded">Selecionar</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {showNrAutocomplete && nrClienteBusca.trim() !== '' && filteredClientes.length === 0 && (
                      <div className="absolute top-full left-0 w-full bg-white border border-border-passive rounded-md p-3 z-50 shadow-lg mt-1 text-xs text-muted flex justify-between items-center">
                        <span>Nenhum cliente encontrado.</span>
                        <button
                          type="button"
                          onMouseDown={() => {
                            setShowQuickClientForm(true);
                            setQcNome(nrClienteBusca);
                            setShowNrAutocomplete(false);
                          }}
                          className="text-xs font-bold text-brand hover:underline cursor-pointer bg-transparent border-0 p-0"
                        >
                          + Cadastrar agora
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quadra e Modalidade */}
              <div className="grid grid-cols-2 gap-3" style={{ margin: 0 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="nr-quadra" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--charcoal)', marginBottom: '4px' }}>
                    Quadra *
                  </label>
                  <select
                    id="nr-quadra"
                    value={nrQuadraId || ''}
                    onChange={(e) => setNrQuadraId(Number(e.target.value) || null)}
                    required
                  >
                    <option value="">Selecione a quadra</option>
                    {quadras.filter(q => q.status === 'Ativa').map(q => (
                      <option key={q.id} value={q.id}>{q.nome} ({q.tipo})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="nr-esporte" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--charcoal)', marginBottom: '4px' }}>
                    Modalidade *
                  </label>
                  <select
                    id="nr-esporte"
                    value={nrEsporte}
                    onChange={(e) => setNrEsporte(e.target.value)}
                    disabled={!nrQuadraId}
                    required
                  >
                    <option value="">{nrQuadraId ? '— Selecione o esporte —' : 'Selecione a quadra primeiro'}</option>
                    {modalidadesQuadra.map(m => (
                      <option key={m.nome} value={m.nome}>
                        {m.nome} — {formatCurrency(m.preco)}/h
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Data e Horários */}
              <div className="grid grid-cols-3 gap-2.5" style={{ margin: 0 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="nr-data" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--charcoal)', marginBottom: '4px' }}>
                    Data *
                  </label>
                  <input
                    type="date"
                    id="nr-data"
                    value={nrData}
                    min={todayStr}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val < todayStr) {
                        showToast('Não é possível selecionar datas passadas para agendamento.', 'error');
                        setNrData(todayStr);
                        return;
                      }
                      setNrData(val);
                    }}
                    required
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="nr-inicio" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--charcoal)', marginBottom: '4px' }}>
                    Início *
                  </label>
                  <select
                    id="nr-inicio"
                    value={nrInicio}
                    onChange={(e) => setNrInicio(e.target.value)}
                    disabled={!nrQuadraId}
                    required
                  >
                    <option value="">{nrQuadraId ? '— Início —' : 'Quadra'}</option>
                    {nrHorariosInicio.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label htmlFor="nr-fim" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--charcoal)', marginBottom: '4px' }}>
                    Fim *
                  </label>
                  <select
                    id="nr-fim"
                    value={nrFim}
                    onChange={(e) => setNrFim(e.target.value)}
                    disabled={!nrInicio}
                    required
                  >
                    <option value="">{nrInicio ? '— Fim —' : 'Início'}</option>
                    {nrHorariosFim.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Observações */}
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="nr-obs" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--charcoal)', marginBottom: '4px' }}>
                  Observações
                </label>
                <textarea
                  id="nr-obs"
                  rows={2}
                  placeholder="Informações adicionais sobre o agendamento (opcional)..."
                  maxLength={100}
                  value={nrObs}
                  onChange={(e) => setNrObs(e.target.value)}
                  style={{ resize: 'none', height: '48px', margin: 0 }}
                />
              </div>

              {/* Resumo do Valor Previsto */}
              <div className="p-3 bg-neutral-50/80 border border-[#ded8ce] rounded-xl flex justify-between items-center">
                <div>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted block">
                    Valor Previsto
                  </span>
                  <span className="text-xs text-charcoal font-semibold">
                    {nrEsporte ? `${nrEsporte}` : 'Quadra selecionada'}
                  </span>
                </div>
                <span className="text-base font-bold text-charcoal tabular-nums">
                  {formatCurrency(nrValorPrevisto)}
                </span>
              </div>

              {/* Bloco de Pagamento Imediato no Balcão */}
              <div className="p-3 bg-neutral-50/70 border border-[#ded8ce] rounded-xl">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={nrRegistrarPagamento}
                    onChange={(e) => {
                      setNrRegistrarPagamento(e.target.checked);
                      if (e.target.checked && !nrPagValor) {
                        setNrPagValor(nrValorPrevisto.toFixed(2));
                      }
                    }}
                    className="w-4 h-4 rounded text-brand focus:ring-brand cursor-pointer"
                  />
                  <span className="text-xs font-bold text-charcoal flex items-center gap-1.5">
                    <CreditCard size={14} className="text-muted" />
                    Registrar pagamento no ato da reserva (baixa no caixa)
                  </span>
                </label>

                {nrRegistrarPagamento && (
                  <div className="grid grid-cols-2 gap-3 mt-2.5 pt-2.5 border-t border-border-passive/60">
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">
                        Forma de Pagamento *
                      </label>
                      <select
                        value={nrPagMetodo}
                        onChange={(e) => setNrPagMetodo(e.target.value)}
                        className="text-xs p-2 rounded-lg border border-border-passive bg-white w-full"
                      >
                        <option value="Pix (QR Code na Tela)">Pix (Gerar QR Code na Tela)</option>
                        <option value="Pix (Manual)">Pix (Manual / Transferência)</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Cartão de Débito">Cartão de Débito</option>
                        <option value="Cartão de Crédito">Cartão de Crédito</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">
                        Valor Pago (R$) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={nrPagValor}
                        onChange={(e) => setNrPagValor(e.target.value)}
                        placeholder={nrValorPrevisto.toFixed(2)}
                        className="text-xs font-bold p-2 rounded-lg border border-border-passive bg-white w-full"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
          <div className="modal-footer" style={{ padding: '14px 22px 18px', borderTop: '1px solid var(--border-passive)' }}>
            <button className="btn-ghost" onClick={() => setActiveModal(null)}>Cancelar</button>
            <button className="btn-primary" onClick={handleConfirmarReserva}>
              {nrRegistrarPagamento ? 'Confirmar e Baixar Pagamento' : 'Confirmar Reserva'}
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 2: DETALHES DA RESERVA */}
      <div className={`modal-overlay ${activeModal === 'detalhe-reserva' ? 'open' : ''}`}>
        {selectedReserva && (
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Reserva #{selectedReserva.id}</h2>
              <button className="modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Status</span>
                <span className={`badge ${selectedReserva.status_pagamento === 'Pago' ? 'badge--paid' : selectedReserva.status_pagamento === 'Parcial' ? 'badge--partial' : 'badge--pending'
                  }`}>{selectedReserva.status_pagamento}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Cliente</span>
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--charcoal)' }}>{selectedReserva.cliente_nome}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Quadra</span>
                <span style={{ fontSize: '13px', color: 'var(--charcoal)' }}>
                  {grade?.quadras.find(q => q.id === selectedReserva.quadra_id)?.nome || 'Quadra'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Horário</span>
                <span style={{ fontSize: '13px', color: 'var(--charcoal)' }}>
                  {formatarDataBR(selectedReserva.data_reserva)} às {selectedReserva.hora_inicio.substring(0, 5)} - {selectedReserva.hora_fim.substring(0, 5)}
                </span>
              </div>
              {selectedReserva.esporte && selectedReserva.esporte !== 'Geral' && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Esporte / Modalidade</span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent, #2563eb)' }}>{selectedReserva.esporte}</span>
                </div>
              )}
              {selectedReserva.observacoes && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Notas</span>
                  <span style={{ fontSize: '13px', color: 'var(--charcoal)', fontStyle: 'italic' }}>{selectedReserva.observacoes}</span>
                </div>
              )}
              <div style={{ height: '1px', background: 'var(--border-passive)', margin: 'var(--s-1) 0' }}></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Valor Total</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--charcoal)' }}>{formatCurrency(selectedReserva.valor_total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Valor Pago</span>
                <span style={{ fontSize: '13px', color: 'var(--paid)', fontWeight: 500 }}>{formatCurrency(selectedReserva.valor_pago)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Saldo Devedor</span>
                <span style={{ fontSize: '13px', color: 'var(--danger)', fontWeight: 600 }}>
                  {formatCurrency(Math.max(0, selectedReserva.valor_total - selectedReserva.valor_pago))}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              {selectedReserva.valor_pago > 0 && (
                <button
                  className="btn-ghost"
                  style={{ color: 'var(--danger)', borderColor: 'rgba(155, 34, 38, 0.3)' }}
                  onClick={() => {
                    setEstValor(formatFloatToCurrencyInput(selectedReserva.valor_pago));
                    setEstMotivo('');
                    setActiveModal('estornar-pagamento');
                  }}
                >
                  Estornar
                </button>
              )}
              <button
                className="btn-ghost"
                style={{ color: 'var(--danger)', borderColor: 'rgba(155, 34, 38, 0.3)' }}
                onClick={() => {
                  setMotivoCancelamento('');
                  setObsCancelamento('');
                  setActiveModal('cancelar-reserva');
                }}
              >
                Cancelar
              </button>
              {selectedReserva.valor_pago < selectedReserva.valor_total && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    setPagValor(formatFloatToCurrencyInput(Math.max(0, selectedReserva.valor_total - selectedReserva.valor_pago)));
                    setPagDesconto('');
                    setPagMetodo('');
                    setPagData(new Date().toISOString().split('T')[0]);
                    setActiveModal('registrar-pagamento');
                  }}
                >
                  Registrar Pagamento
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL 3: CANCELAR RESERVA */}
      <div className={`modal-overlay ${activeModal === 'cancelar-reserva' ? 'open' : ''}`}>
        {selectedReserva && (
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Cancelar Reserva</h2>
              <button className="modal-close" onClick={() => setActiveModal('detalhe-reserva')}>✕</button>
            </div>
            <div className="modal-body">
              <p className="text-xs text-muted mb-4">
                Você está cancelando a reserva de <strong>{selectedReserva.cliente_nome}</strong> de {selectedReserva.hora_inicio} às {selectedReserva.hora_fim}. Esta ação não pode ser desfeita.
              </p>
              <div className="form-group">
                <label htmlFor="motivo-cancelamento">Motivo do cancelamento *</label>
                <select
                  id="motivo-cancelamento"
                  value={motivoCancelamento}
                  onChange={(e) => setMotivoCancelamento(e.target.value)}
                  required
                >
                  <option value="">Selecione o motivo</option>
                  {motivosDisponiveis.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="obs-cancelamento">Observações</label>
                <textarea
                  id="obs-cancelamento"
                  rows={2}
                  placeholder="Detalhe adicional (opcional)"
                  maxLength={100}
                  value={obsCancelamento}
                  onChange={(e) => setObsCancelamento(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setActiveModal('detalhe-reserva')}>Voltar</button>
              <button
                className="btn-primary"
                style={{ background: 'var(--danger)' }}
                onClick={handleConfirmarCancelamento}
              >
                Confirmar Cancelamento
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 4: REGISTRAR PAGAMENTO */}
      <div className={`modal-overlay ${activeModal === 'registrar-pagamento' ? 'open' : ''}`}>
        {selectedReserva && (
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Registrar Pagamento</h2>
              <button className="modal-close" onClick={() => setActiveModal('detalhe-reserva')}>✕</button>
            </div>
            <div className="modal-body">
              <div id="modal-pag-info" style={{
                background: 'var(--cream-surface)',
                border: '1px solid var(--border-passive)',
                borderRadius: 'var(--r-md)',
                padding: 'var(--s-3) var(--s-4)',
                marginBottom: 'var(--s-5)',
                fontSize: '13px',
                color: 'var(--charcoal-82)'
              }}>
                Reserva #{selectedReserva.id} &middot; {selectedReserva.cliente_nome} &middot; Saldo devedor: <strong style={{ color: 'var(--danger)' }}>{formatCurrency(selectedReserva.valor_total - selectedReserva.valor_pago)}</strong>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-4)' }}>
                <div className="form-group">
                  <label htmlFor="pag-valor">Valor a pagar *</label>
                  <input
                    type="text"
                    id="pag-valor"
                    placeholder="0,00"
                    value={pagValor}
                    onChange={(e) => setPagValor(formatCurrencyInput(e.target.value))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="pag-desconto">Desconto (R$)</label>
                  <input
                    type="text"
                    id="pag-desconto"
                    placeholder="Opcional"
                    value={pagDesconto}
                    onChange={(e) => setPagDesconto(formatCurrencyInput(e.target.value))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="pag-metodo">Método de pagamento *</label>
                <select
                  id="pag-metodo"
                  value={pagMetodo}
                  onChange={(e) => setPagMetodo(e.target.value)}
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

              <div className="form-group">
                <label htmlFor="pag-data">Data do pagamento *</label>
                <input
                  type="date"
                  id="pag-data"
                  value={pagData}
                  onChange={(e) => setPagData(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setActiveModal('detalhe-reserva')}>Cancelar</button>
              <button className="btn-primary" onClick={handleConfirmarPagamento}>Confirmar Pagamento</button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: PIX GATEWAY */}
      <div className={`modal-overlay ${activeModal === 'pix-gateway' ? 'open' : ''}`}>
        {selectedReserva && (
          <div className="modal" style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div className="modal-header">
              <h2 className="modal-title">Pagamento via Pix</h2>
              <button className="modal-close" onClick={() => { setActiveModal(null); setSelectedReserva(null); }}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ background: 'var(--cream-surface)', border: '1px solid var(--border-passive)', borderRadius: 'var(--r-md)', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', width: '100%', textAlign: 'left' }}>
                Reserva #{selectedReserva.id} &middot; <strong>{selectedReserva.cliente_nome}</strong> <br />
                Valor da Cobrança: <strong style={{ color: 'var(--paid)' }}>{pagValor ? `R$ ${pagValor}` : formatCurrency(selectedReserva.valor_total)}</strong>
              </div>

              {qrCode ? (
                <div style={{ width: '180px', height: '180px', background: 'white', border: '1px solid var(--border-passive)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', marginBottom: '14px' }}>
                  <img src={qrCode} alt="QR Code Pix" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              ) : (
                <div style={{ padding: '24px', color: 'var(--muted)', fontSize: '13px' }}>Gerando QR Code...</div>
              )}

              <p style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '14px' }}>
                Apresente o QR Code acima para o cliente escanear no app do banco dele.
              </p>

              {copiaCola && (
                <div style={{ width: '100%', textAlign: 'left', marginBottom: '16px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--charcoal)', display: 'block', marginBottom: '4px' }}>Pix Copia e Cola</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      readOnly
                      value={copiaCola}
                      style={{ flex: 1, fontSize: '11px', fontFamily: 'monospace', border: '1px solid var(--border-passive)', padding: '6px 10px', borderRadius: '4px', background: 'white' }}
                    />
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => {
                        navigator.clipboard.writeText(copiaCola);
                        showToast('Chave Pix copiada para a área de transferência!', 'success');
                      }}
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <button className="btn-ghost" onClick={() => { setActiveModal(null); setSelectedReserva(null); }}>Fechar</button>
              <button
                className="btn-primary"
                onClick={async () => {
                  if (!selectedReserva) return;
                  try {
                    const valNum = parseCurrencyToFloat(pagValor) || selectedReserva.valor_total;
                    const res = await fetch('/api/pagamentos', {
                      method: 'POST',
                      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({ reserva_id: selectedReserva.id, valor: valNum, metodo: 'Pix' })
                    });
                    if (res.ok) {
                      showToast('Pagamento confirmado manualmente com sucesso!', 'success');
                      setActiveModal(null);
                      setSelectedReserva(null);
                      fetchGrade();
                    }
                  } catch (err: any) {
                    showToast(err.message, 'error');
                  }
                }}
              >
                Confirmar no Caixa
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 5: ESTORNAR PAGAMENTO */}
      <div className={`modal-overlay ${activeModal === 'estornar-pagamento' ? 'open' : ''}`}>
        {selectedReserva && (
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Estornar Pagamento</h2>
              <button className="modal-close" onClick={() => setActiveModal('detalhe-reserva')}>✕</button>
            </div>
            <div className="modal-body">
              <p className="text-xs text-muted mb-4">
                Confirma o estorno de um pagamento já registrado? Esta ação gera um log de auditoria.
              </p>
              <div className="form-group">
                <label htmlFor="est-valor">Valor a estornar *</label>
                <input
                  type="text"
                  id="est-valor"
                  placeholder="Ex: 80,00"
                  value={estValor}
                  onChange={(e) => setEstValor(formatCurrencyInput(e.target.value))}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="est-motivo">Justificativa do Estorno *</label>
                <textarea
                  id="est-motivo"
                  rows={2}
                  placeholder="Obrigatório para auditoria"
                  maxLength={100}
                  value={estMotivo}
                  onChange={(e) => setEstMotivo(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setActiveModal('detalhe-reserva')}>Cancelar</button>
              <button
                className="btn-primary"
                style={{ background: 'var(--danger)' }}
                onClick={handleConfirmarEstorno}
              >
                Confirmar Estorno
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 6: BLOQUEAR QUADRA */}
      <div className={`modal-overlay ${activeModal === 'bloquear-quadra' ? 'open' : ''}`}>
        <div className="modal">
          <div className="modal-header">
            <h2 className="modal-title">Bloquear Quadra</h2>
            <button className="modal-close" onClick={() => setActiveModal(null)}>✕</button>
          </div>
          <form onSubmit={handleConfirmarBloqueio}>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="bq-quadra">Quadra *</label>
                <select
                  id="bq-quadra"
                  value={bqQuadraId || ''}
                  onChange={(e) => setBqQuadraId(Number(e.target.value) || null)}
                  required
                >
                  <option value="">Selecione a quadra</option>
                  {quadras.filter(q => q.status === 'Ativa').map(q => (
                    <option key={q.id} value={q.id}>{q.nome} ({q.tipo})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="form-group">
                  <label htmlFor="bq-data">Data *</label>
                  <input
                    type="date"
                    id="bq-data"
                    value={bqData}
                    min={todayStr}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val < todayStr) {
                        showToast('Não é possível selecionar datas passadas para bloqueio.', 'error');
                        setBqData(todayStr);
                        return;
                      }
                      setBqData(val);
                    }}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="bq-inicio">Início *</label>
                  <select
                    id="bq-inicio"
                    value={bqInicio}
                    onChange={(e) => setBqInicio(e.target.value)}
                    disabled={!bqQuadraId}
                    required
                  >
                    <option value="">{bqQuadraId ? '— Início —' : 'Quadra'}</option>
                    {bqHorariosInicio.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="bq-fim">Fim *</label>
                  <select
                    id="bq-fim"
                    value={bqFim}
                    onChange={(e) => setBqFim(e.target.value)}
                    disabled={!bqInicio}
                    required
                  >
                    <option value="">{bqInicio ? '— Fim —' : 'Início'}</option>
                    {bqHorariosFim.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="bq-motivo">Motivo do Bloqueio</label>
                <input
                  type="text"
                  id="bq-motivo"
                  placeholder="Ex: Torneio, Manutenção..."
                  value={bqMotivo}
                  onChange={(e) => setBqMotivo(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" type="button" onClick={() => setActiveModal(null)}>Cancelar</button>
              <button className="btn-primary" type="submit">Confirmar Bloqueio</button>
            </div>
          </form>
        </div>
      </div>

      {/* MODAL 7: GERENCIAR BLOQUEIO */}
      <div className={`modal-overlay ${activeModal === 'gerenciar-bloqueio' ? 'open' : ''}`}>
        {selectedBloqueio && (
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Gerenciar Bloqueio</h2>
              <button className="modal-close" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="text-xs text-charcoal mb-4">
                O que você deseja fazer com este bloqueio?
              </p>
            </div>
            <div className="modal-footer flex-col gap-3">
              <button
                className="btn-ghost w-full"
                style={{ borderColor: 'rgba(155,34,38,0.3)', color: 'var(--danger)' }}
                onClick={() => handleDesbloquear(false)}
              >
                Desbloquear apenas o horário de <strong>{selectedBloqueioTime}</strong>
              </button>
              <button
                className="btn-primary w-full"
                style={{ background: 'var(--danger)' }}
                onClick={() => handleDesbloquear(true)}
              >
                Remover TODO o bloqueio do dia
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Alerta Toast em Primeiro Plano */}
      {toast && (
        <div
          style={{ zIndex: 999999 }}
          className={`fixed bottom-5 right-5 px-4 py-3 rounded-xl text-white text-xs font-semibold shadow-2xl flex items-center gap-2.5 animate-slideUp border ${
            toast.type === 'success'
              ? 'bg-emerald-600 border-emerald-500 text-white'
              : 'bg-rose-600 border-rose-500 text-white'
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
