import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, CheckCircle, Pencil, Trash2, ShieldAlert, FileText, Wallet, Users, History, ArrowLeft } from 'lucide-react';
import { Card, Badge, Button, PageHeader, ConfirmModal, Field, Input, Select, EmptyState } from '../components/ui';
import { formatDate, formatBRL, formatDateTime, relativeTime } from '../data/mock';

interface Props { onNavigate: (id: string) => void; }

type Tab = 'dados' | 'financeiro' | 'usuarios' | 'logs';
const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: 'dados', label: 'Dados cadastrais', icon: FileText },
  { id: 'financeiro', label: 'Financeiro', icon: Wallet },
  { id: 'usuarios', label: 'Usuários da arena', icon: Users },
  { id: 'logs', label: 'Logs de auditoria', icon: History },
];

interface ArenaTabDadosProps {
  arena: any;
  nome: string;
  setNome: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  telefone: string;
  setTelefone: (v: string) => void;
  endereco: string;
  setEndereco: (v: string) => void;
  planoId: number;
  setPlanoId: (v: number) => void;
  diaVencimento: number;
  setDiaVencimento: (v: number) => void;
  planosSaaS: any[];
  editing: boolean;
  setEditing: (v: boolean) => void;
  adminResponsavel: string;
  onSave: () => void;
  onCancelEdit: () => void;
}

const ArenaTabDados: React.FC<ArenaTabDadosProps> = ({
  arena,
  nome,
  setNome,
  email,
  setEmail,
  telefone,
  setTelefone,
  endereco,
  setEndereco,
  planoId,
  setPlanoId,
  diaVencimento,
  setDiaVencimento,
  planosSaaS,
  editing,
  adminResponsavel,
  onSave,
  onCancelEdit
}) => {
  return (
    <Card className="p-6 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Nome da arena"><Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!editing} /></Field>
        <Field label="E-mail"><Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!editing} /></Field>
        <Field label="Telefone"><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} disabled={!editing} /></Field>
        <Field label="Endereço"><Input value={endereco} onChange={(e) => setEndereco(e.target.value)} disabled={!editing} /></Field>
        <Field label="Plano">
          <Select disabled={!editing} value={String(planoId)} onChange={(e) => setPlanoId(Number(e.target.value))}>
            {planosSaaS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} — {p.valor_mensal > 0 ? `${formatBRL(p.valor_mensal)}/mês` : 'Sob consulta'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dia de vencimento da fatura">
          <Input type="number" value={String(diaVencimento)} onChange={(e) => setDiaVencimento(Number(e.target.value))} disabled={!editing} min={1} max={28} />
        </Field>
        <Field label="Admin responsável (Criador)"><Input value={adminResponsavel} disabled /></Field>
        <Field label="Quadras cadastradas"><Input value={String(arena.quadras)} disabled /></Field>
      </div>
      {editing && (
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border-passive">
          <Button variant="ghost" onClick={onCancelEdit}>Cancelar</Button>
          <Button variant="primary" onClick={onSave}>Salvar alterações</Button>
        </div>
      )}
    </Card>
  );
};

interface ArenaTabFinanceiroProps {
  arena: any;
  faturas: any[];
}

const ArenaTabFinanceiro: React.FC<ArenaTabFinanceiroProps> = ({ arena, faturas }) => {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-border-passive flex items-center justify-between">
        <h3 className="text-sm font-semibold">Histórico de faturamento</h3>
        <Badge status={arena.status === 1 ? 'success' : 'neutral'}>{arena.status === 1 ? 'Contrato ativo' : 'Contrato inativo'}</Badge>
      </div>
      {faturas.length === 0 ? <EmptyState message="Sem faturas registradas." /> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-cream/60 text-left text-xs text-muted uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Fatura ID</th>
              <th className="px-5 py-3 font-medium">Plano</th>
              <th className="px-5 py-3 font-medium">Valor</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Vencimento</th>
              <th className="px-5 py-3 font-medium">Pago em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-passive">
            {faturas.map((inv) => {
              const finSt = inv.status === 'Paga' ? 'pago' : inv.status === 'Atrasada' ? 'atrasado' : 'pendente';
              return (
                <tr key={inv.id} className="hover:bg-cream/50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-muted">#{inv.id}</td>
                  <td className="px-5 py-3 tabular">{inv.plano_nome}</td>
                  <td className="px-5 py-3 font-medium tabular">{formatBRL(inv.valor)}</td>
                  <td className="px-5 py-3"><Badge status={finSt as any}>{inv.status}</Badge></td>
                  <td className="px-5 py-3 text-muted tabular">{formatDate(inv.data_vencimento)}</td>
                  <td className="px-5 py-3 text-muted tabular">{inv.data_pagamento ? formatDate(inv.data_pagamento) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
};

interface ArenaTabUsuariosProps {
  usuarios?: any[];
}

const ArenaTabUsuarios: React.FC<ArenaTabUsuariosProps> = ({ usuarios }) => {
  return (
    <Card className="overflow-hidden">
      {(!usuarios || usuarios.length === 0) ? <EmptyState message="Nenhum usuário vinculado a esta arena." /> : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-cream/60 text-left text-xs text-muted uppercase tracking-wide">
              <th className="px-5 py-3 font-medium">Nome</th>
              <th className="px-5 py-3 font-medium">E-mail</th>
              <th className="px-5 py-3 font-medium">Perfil</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Último acesso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-passive">
            {usuarios.map((u: any) => (
              <tr key={u.id} className="hover:bg-cream/50 transition-colors">
                <td className="px-5 py-3 font-medium text-charcoal">{u.name}</td>
                <td className="px-5 py-3 text-muted">{u.email}</td>
                <td className="px-5 py-3"><span className="capitalize">{u.role}</span></td>
                <td className="px-5 py-3"><Badge status={u.status}>{u.status === 'ativa' ? 'Ativo' : 'Bloqueado'}</Badge></td>
                <td className="px-5 py-3 text-muted">{relativeTime(u.lastAccess)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};

interface ArenaTabLogsProps {
  logs?: any[];
}

const ArenaTabLogs: React.FC<ArenaTabLogsProps> = ({ logs }) => {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold mb-4">Últimos acessos e ações nesta arena</h3>
      {(!logs || logs.length === 0) ? <EmptyState message="Nenhum log registrado para esta arena." /> : (
        <ol className="relative border-l border-border-passive ml-2 space-y-4">
          {logs.map((l: any) => (
            <li key={l.id} className="pl-4">
              <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-charcoal/40 border-2 border-cream" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-charcoal">{l.action}</span>
                <span className="text-xs text-muted tabular">{formatDateTime(l.at)}</span>
              </div>
              <div className="text-xs text-muted mt-0.5">por {l.actor} · IP: {l.ip}</div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
};

export function MasterArenaDetalhe({ onNavigate }: Readonly<Props>) {
  const [searchParams] = useSearchParams();
  const arenaId = searchParams.get('id');

  const [arena, setArena] = useState<any | null>(null);
  const [faturas, setFaturas] = useState<any[]>([]);
  const [planosSaaS, setPlanosSaaS] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('dados');
  const [blockOpen, setBlockOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  // Form states for editing
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState('');
  const [planoId, setPlanoId] = useState<number>(1);
  const [diaVencimento, setDiaVencimento] = useState<number>(10);

  const fetchArenaDetails = async () => {
    if (!arenaId) return;
    try {
      setLoading(true);
      const token = localStorage.getItem('courtmanager_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      // 1. Fetch Arena Details & SaaS Plans
      const [resArena, resPlanos] = await Promise.all([
        fetch(`/api/saas/arenas/${arenaId}`, { headers }),
        fetch(`/api/saas/planos`, { headers })
      ]);

      if (!resArena.ok) throw new Error('Falha ao buscar arena');
      const data = await resArena.json();
      setArena(data);

      if (resPlanos.ok) {
        const dataPlanos = await resPlanos.json();
        setPlanosSaaS(dataPlanos);
      }

      // Initialize form fields
      setNome(data.nome || '');
      setEmail(data.email || '');
      setTelefone(data.telefone || '');
      setEndereco(data.endereco || '');
      setPlanoId(data.plano_id || 1);
      setDiaVencimento(data.dia_vencimento || 10);

      // 2. Fetch Arena Invoices
      const resFat = await fetch(`/api/saas/arenas/${arenaId}/faturas`, { headers });
      if (resFat.ok) {
        const dataFat = await resFat.json();
        setFaturas(dataFat);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArenaDetails();
  }, [arenaId]);

  if (loading) {
    return <div className="p-8 text-center text-charcoal animate-pulse">Carregando detalhes da arena...</div>;
  }

  if (!arena) {
    return (
      <div className="p-8 text-center">
        <ShieldAlert size={48} className="mx-auto text-danger mb-4" />
        <h2 className="text-lg font-semibold mb-2">Arena não encontrada</h2>
        <Button onClick={() => onNavigate('arenas')}><ArrowLeft size={14} /> Voltar para arenas</Button>
      </div>
    );
  }

  const cancelEdit = () => {
    setEditing(false);
    setNome(arena.nome || '');
    setEmail(arena.email || '');
    setTelefone(arena.telefone || '');
    setEndereco(arena.endereco || '');
    setPlanoId(arena.plano_id || 1);
    setDiaVencimento(arena.dia_vencimento || 10);
  };

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('courtmanager_token');
      
      // Update details
      const resUpdate = await fetch(`/api/saas/arenas/${arenaId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nome,
          email,
          telefone,
          endereco,
          dia_vencimento: Number(diaVencimento)
        })
      });

      if (!resUpdate.ok) {
        const errData = await resUpdate.json();
        alert(errData.error || 'Erro ao salvar dados cadastrais');
        return;
      }

      // Update plan if changed
      if (planoId !== arena.plano_id) {
        const resPlan = await fetch(`/api/saas/arenas/${arenaId}/plano`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ plano_id: Number(planoId) })
        });
        if (!resPlan.ok) {
          const errData = await resPlan.json();
          alert(errData.error || 'Erro ao alterar o plano');
          return;
        }
      }

      setEditing(false);
      fetchArenaDetails();
    } catch (e) {
      console.error(e);
      alert('Erro de conexão ao salvar alterações.');
    }
  };

  const handleToggleStatus = async (password: string) => {
    try {
      const token = localStorage.getItem('courtmanager_token');
      const nextStatus = arena.status === 0 ? 1 : 0;
      const res = await fetch(`/api/saas/arenas/${arenaId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: nextStatus, senha: password })
      });

      if (res.ok) {
        setBlockOpen(false);
        fetchArenaDetails();
      } else {
        alert('Falha ao alterar status da arena (senha incorreta?).');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão ao salvar alterações.');
    }
  };

  const handleDelete = async (password: string) => {
    try {
      const token = localStorage.getItem('courtmanager_token');
      const res = await fetch(`/api/saas/arenas/${arenaId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ senha_master: password })
      });

      if (res.ok) {
        setDeleteOpen(false);
        onNavigate('arenas');
      } else {
        alert('Falha ao excluir arena (senha incorreta?)');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const statusLabel = arena.status === 1 ? 'Ativa' : arena.status === 0 ? 'Bloqueada' : 'Excluída';
  const statusBadgeType = arena.status === 1 ? 'ativa' : 'bloqueada';

  // Get Admin Responsável from the administradores list returned by API
  const adminResponsavel = arena.administradores && arena.administradores.length > 0 
    ? arena.administradores[0].nome 
    : 'Nenhum administrador associado';

  return (
    <div>
      <button onClick={() => onNavigate('arenas')} className="inline-flex items-center gap-1 text-sm text-muted hover:text-charcoal mb-3 transition-colors">
        <ArrowLeft size={14} /> Voltar para arenas
      </button>

      <PageHeader
        title={arena.nome}
        description={`Cadastrada em ${formatDate(arena.criado_em)}`}
        actions={
          <>
            <Badge status={statusBadgeType as any}>{statusLabel}</Badge>
            <Badge status="neutral">Plano {arena.plano_nome || 'Basic'}</Badge>
            {arena.gateway_conectado ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#dcfce7', color: '#15803d', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                ✅ MP Conectado
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#fef3c7', color: '#b45309', padding: '3px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600 }}>
                ⚠️ MP Pendente
              </span>
            )}
            <Button variant="secondary" onClick={() => {
              if (editing) {
                cancelEdit();
              } else {
                setEditing(true);
              }
            }}><Pencil size={14} /> {editing ? 'Cancelar' : 'Editar'}</Button>
            
            {arena.status === 0 ? (
              <Button variant="primary" onClick={() => setBlockOpen(true)}><CheckCircle size={14} /> Desbloquear</Button>
            ) : (
              <Button variant="warning" onClick={() => setBlockOpen(true)}><Ban size={14} /> Bloquear</Button>
            )}
            <Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 size={14} /> Excluir</Button>
          </>
        }
      />

      {/* Inspection warning */}
      <div className="flex items-start gap-2.5 px-4 py-3 mb-5 rounded-xl bg-warning-soft border border-warning/20 text-sm">
        <ShieldAlert size={16} className="text-warning shrink-0 mt-0.5" />
        <div>
          <span className="font-medium text-warning">Modo inspeção ativo.</span>{' '}
          <span className="text-charcoal/80">Toda visualização desta arena pelo master fica registrada nos logs de auditoria da plataforma.</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border-passive overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.id ? 'border-charcoal text-charcoal' : 'border-transparent text-muted hover:text-charcoal'
              }`}>
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'dados' && (
        <ArenaTabDados
          arena={arena}
          nome={nome}
          setNome={setNome}
          email={email}
          setEmail={setEmail}
          telefone={telefone}
          setTelefone={setTelefone}
          endereco={endereco}
          setEndereco={setEndereco}
          planoId={planoId}
          setPlanoId={setPlanoId}
          diaVencimento={diaVencimento}
          setDiaVencimento={setDiaVencimento}
          planosSaaS={planosSaaS}
          editing={editing}
          setEditing={setEditing}
          adminResponsavel={adminResponsavel}
          onSave={handleSave}
          onCancelEdit={cancelEdit}
        />
      )}

      {tab === 'financeiro' && (
        <ArenaTabFinanceiro arena={arena} faturas={faturas} />
      )}

      {tab === 'usuarios' && (
        <ArenaTabUsuarios usuarios={arena.usuarios} />
      )}

      {tab === 'logs' && (
        <ArenaTabLogs logs={arena.logs} />
      )}

      <ConfirmModal open={blockOpen} onClose={() => setBlockOpen(false)} onConfirm={handleToggleStatus}
        title={arena.status === 0 ? 'Desbloquear arena?' : 'Bloquear arena?'}
        destructive={arena.status !== 0}
        confirmLabel={arena.status === 0 ? 'Desbloquear' : 'Bloquear'}
        requirePassword
        message={arena.status === 0
          ? `Os usuários de "${arena.nome}" voltam a ter acesso ao painel.`
          : `Bloquear "${arena.nome}" impede o acesso de todos os seus usuários até o desbloqueio.`}
      />
      <ConfirmModal open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete}
        title="Excluir arena" destructive requirePassword confirmLabel="Excluir"
        message={<>Exclusão lógica de <strong>{arena.nome}</strong>. Os dados são preservados; a arena deixa de aparecer na plataforma.</>}
      />
    </div>
  );
}
