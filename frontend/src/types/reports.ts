export interface ReportReservation {
  id: number;
  cliente_nome: string;
  cliente_contato?: string;
  quadra_nome: string;
  data_reserva: string;
  hora_inicio: string;
  hora_fim: string;
  valor_total: number;
  total_pago: number;
  saldo_devedor: number;
  status: string;
  status_pagamento: string;
  metodos?: string;
  operador_nome?: string;
  motivo_cancelamento?: string;
  observacoes_cancelamento?: string;
}

export interface ReportData {
  paginacao?: { pagina: number; total: number; totalPaginas: number };
  reservas?: ReportReservation[];
  inadimplentes?: ReportReservation[];
  cancelamentos?: ReportReservation[];
  totais?: Partial<Record<'bruto' | 'pago' | 'pendente' | 'total' | 'confirmadas' | 'canceladas' | 'pendentes' | 'valorPerdido' | 'estornados', number>>;
  quadras?: { quadra_nome: string; totalReservas: number; minutosReservados: number; minutosBloqueados: number; totalMinutosDisp: number; taxa: number }[];
  taxaGeral?: number;
  periodo?: { dias: number };
  totalDevido?: number;
  totalGeral?: number;
  totalReservas?: number;
  totalFaturado?: number;
  maxPico?: number;
  porMetodo?: { metodo: string; percentual: number; total_transacoes: number; total_valor: number }[];
  transacoes?: { cliente_nome: string; data_pagamento: string; hora_pagamento: string; metodo: string; operador_nome?: string; quadra_nome: string; valor: number }[];
  porHora?: { hora: number; total: number }[];
  porDiaSemana?: { dia: string; total: number }[];
  clientes?: { nome: string; posicao: number; saldo_devedor: number; telefone?: string; ticket_medio: number; total_reservas: number; ultima_reserva: string; valor_total_gerado: number }[];
}
