// Public response shapes used by the management screens. Monetary values here
// are in reais, as returned by the controllers (the database stores cents).
export interface SaaSPlan {
  id: number;
  nome: string;
  valor_mensal: number;
  valor_anual: number;
  max_quadras: number;
  max_usuarios: number;
}

export interface SaaSInvoice {
  id: number;
  arena_nome: string;
  plano_nome: string;
  valor: number;
  status: string;
  data_vencimento: string;
  data_pagamento?: string;
  metodo_pagamento?: string;
}

export interface ArenaStaff {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'gerente' | 'recepcionista';
  status: 'ativa' | 'bloqueada';
  lastAccess: string;
}

export interface ArenaLog {
  id: string;
  action: string;
  actor: string;
  at: string;
  ip: string;
}

export interface SaaSArena {
  id: number;
  nome: string;
  email: string;
  telefone: string;
  endereco: string;
  slug: string;
  status: number;
  criado_em: string;
  plano_id: number;
  plano_nome: string;
  dia_vencimento: number;
  gateway_conectado: number;
  faturas_atrasadas: number;
}

export interface ArenaDetails extends SaaSArena {
  quadras: number;
  clientes: number;
  administradores: ArenaStaff[];
  usuarios: ArenaStaff[];
  logs: ArenaLog[];
}

export interface Announcement {
  id: number;
  message: string;
  audience: string;
  audienceLabel: string;
  channel: 'email' | 'alerta';
  createdAt: string;
  expiresAt?: string;
}

export interface AuditLog {
  id: number;
  criado_em: string;
  evento: string;
  detalhes: string;
  ip: string;
  arena_nome?: string;
  usuario_nome?: string;
}

export interface ActiveSession {
  arenaId: number;
  arenaName: string;
  users: number;
  since: string;
}

export interface ManagedUser {
  id: number;
  name: string;
  email: string;
  role: string;
  roleOriginal: string;
  status: string;
  arenaId: string;
  arenaName: string;
}
