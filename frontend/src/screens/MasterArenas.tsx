import { useMemo, useState, useEffect } from 'react';
import { Plus, Eye, EyeOff, Pencil, Ban, CheckCircle, Trash2, Filter, ChevronDown, Globe } from 'lucide-react';
import { Card, Badge, Button, PageHeader, Modal, ConfirmModal, Field, Input, Select, EmptyState, Pagination } from '../components/ui';
import { PLANS, formatDate, formatBRL } from '../data/mock';

interface Props { onNavigate: (id: string) => void; }

const PAGE_SIZE = 8;

export function MasterArenas({ onNavigate }: Readonly<Props>) {
  const [arenas, setArenas] = useState<any[]>([]);
  const [planosSaaS, setPlanosSaaS] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [planFilter, setPlanFilter] = useState<'all' | string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [showNewArenaPassword, setShowNewArenaPassword] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newArena, setNewArena] = useState({
    nome: '',
    email: '',
    telefone: '',
    endereco: '',
    plano_id: '',
    dia_vencimento: '10',
    trial_dias: '14',
    senha: ''
  });

  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [blockTarget, setBlockTarget] = useState<any | null>(null);

  const fetchArenas = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('courtmanager_token');
      const [resArenas, resPlanos] = await Promise.all([
        fetch('/api/saas/arenas', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/saas/planos', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      const dataArenas = await resArenas.json();
      const dataPlanos = await resPlanos.json();
      setArenas(dataArenas);
      setPlanosSaaS(dataPlanos);
      if (dataPlanos.length > 0 && !newArena.plano_id) {
        setNewArena(prev => ({ ...prev, plano_id: String(dataPlanos[0].id) }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArenas();
  }, []);

  const handleCreateArena = async () => {
    if (!newArena.nome || !newArena.email) {
      alert('Nome da arena e e-mail do responsável são obrigatórios.');
      return;
    }
    setCreating(true);
    try {
      const token = localStorage.getItem('courtmanager_token');
      const res = await fetch('/api/saas/arenas', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newArena)
      });
      if (res.ok) {
        setCreateOpen(false);
        setNewArena({
          nome: '',
          email: '',
          telefone: '',
          endereco: '',
          plano_id: planosSaaS[0] ? String(planosSaaS[0].id) : '1',
          dia_vencimento: '10',
          trial_dias: '14',
          senha: ''
        });
        fetchArenas();
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error || 'Erro ao cadastrar arena.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao cadastrar arena.');
    } finally {
      setCreating(false);
    }
  };

  const filtered = useMemo(() => {
    return arenas.filter((a) => {
      if (search && !`${a.nome} ${a.email}`.toLowerCase().includes(search.toLowerCase())) return false;
      const st = a.status === 1 ? 'ativa' : a.status === 0 ? 'bloqueada' : 'excluida';
      if (statusFilter !== 'all' && st !== statusFilter) return false;
      if (planFilter !== 'all' && (a.plano_nome || 'Basic') !== planFilter) return false;
      if (dateFrom && new Date(a.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(a.created_at) > new Date(dateTo)) return false;
      return true;
    });
  }, [arenas, search, statusFilter, planFilter, dateFrom, dateTo]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Arenas"
        description="Todas as arenas (tenants) cadastradas na plataforma."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> Cadastrar nova arena</Button>
        }
      />

      {/* Filter bar */}
      <Card className="p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Input placeholder="Buscar por nome, cidade ou e-mail..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }} className="w-auto min-w-[130px]">
            <option value="all">Todos os status</option>
            <option value="ativa">Ativa</option>
            <option value="bloqueada">Bloqueada</option>
            <option value="trial">Trial</option>
          </Select>
          <Select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value as any); setPage(1); }} className="w-auto min-w-[120px]">
            <option value="all">Todos os planos</option>
            {PLANS.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
          </Select>
          <Button variant="ghost" onClick={() => setShowFilters((s) => !s)}>
            <Filter size={14} /> Filtros <ChevronDown size={13} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
        </div>
        {showFilters && (
          <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-border-passive animate-fade-in">
            <Field label="Criada de">
              <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-auto" />
            </Field>
            <Field label="Criada até">
              <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-auto" />
            </Field>
            <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); setStatusFilter('all'); setPlanFilter('all'); setSearch(''); }}>Limpar filtros</Button>
          </div>
        )}
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {pageItems.length === 0 ? (
          <EmptyState message="Nenhuma arena encontrada para os filtros aplicados." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream/60 text-left text-xs text-muted uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Arena</th>
                  <th className="px-4 py-3 font-medium">Cidade</th>
                  <th className="px-4 py-3 font-medium">Plano</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Criada em</th>
                  <th className="px-4 py-3 font-medium">Financeiro</th>
                  <th className="px-4 py-3 font-medium">Gateway MP</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-passive">
                {pageItems.map((a) => {
                  const st = a.status === 1 ? 'ativa' : a.status === 0 ? 'bloqueada' : 'excluida';
                  const fin = a.faturas_atrasadas > 0 ? 'atrasado' : 'pago';
                  const financeLabel: Record<string, string> = { pago: 'Em dia', pendente: 'Pendente', atrasado: 'Atrasado' };
                  const statusLabel: Record<string, string> = { ativa: 'Ativa', bloqueada: 'Bloqueada', excluida: 'Excluída' };
                  return (
                  <tr key={a.id} className="hover:bg-cream/50 transition-colors">
                    <td className="px-4 py-3">
                      <button onClick={() => onNavigate('arena-detalhe?id=' + a.id)} className="text-left">
                        <div className="font-medium text-charcoal hover:underline">{a.nome}</div>
                        <div className="text-xs text-muted">{a.email}</div>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted" style={{maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{a.endereco || 'Não informado'}</td>
                    <td className="px-4 py-3"><span className="text-charcoal font-medium">{a.plano_nome || 'Basic'}</span></td>
                    <td className="px-4 py-3"><Badge status={st as any}>{statusLabel[st]}</Badge></td>
                    <td className="px-4 py-3 text-muted tabular">{formatDate(a.created_at || new Date().toISOString())}</td>
                    <td className="px-4 py-3"><Badge status={fin as any}>{financeLabel[fin]}</Badge></td>
                    <td className="px-4 py-3">
                      {a.gateway_conectado ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
                          ✅ MP Conectado
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
                          ⚠️ Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {a.slug && (
                          <a href={`/arena/${a.slug}`} target="_blank" rel="noreferrer" title="Abrir Vitrine Pública (Link do Atleta)" className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors">
                            <Globe size={15} />
                          </a>
                        )}
                        <button onClick={() => onNavigate('arena-detalhe?id=' + a.id)} title="Ver detalhes" className="p-1.5 rounded-md text-muted hover:text-charcoal hover:bg-cream-surface transition-colors"><Eye size={15} /></button>
                        <button title="Editar" className="p-1.5 rounded-md text-muted hover:text-charcoal hover:bg-cream-surface transition-colors"><Pencil size={15} /></button>
                        {a.status === 0 ? (
                          <button onClick={() => setBlockTarget(a)} title="Desbloquear" className="p-1.5 rounded-md text-success hover:bg-success-soft transition-colors"><CheckCircle size={15} /></button>
                        ) : (
                          <button onClick={() => setBlockTarget(a)} title="Bloquear" className="p-1.5 rounded-md text-warning hover:bg-warning-soft transition-colors"><Ban size={15} /></button>
                        )}
                        <button onClick={() => setDeleteTarget(a)} title="Excluir" className="p-1.5 rounded-md text-danger hover:bg-danger-soft transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-3 border-t border-border-passive">
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </div>
      </Card>

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Cadastrar nova arena" description="Cadastro manual sem passar pelo fluxo público."
        size="lg"
        footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button variant="primary" disabled={creating} onClick={handleCreateArena}>{creating ? 'Cadastrando...' : 'Cadastrar arena'}</Button></>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome da arena *">
            <Input placeholder="Ex.: Arena Vôlei Sul" value={newArena.nome} onChange={(e) => setNewArena(prev => ({ ...prev, nome: e.target.value }))} />
          </Field>
          <Field label="E-mail do responsável *">
            <Input type="email" placeholder="contato@arena.com.br" value={newArena.email} onChange={(e) => setNewArena(prev => ({ ...prev, email: e.target.value }))} />
          </Field>
          <Field label="Telefone">
            <Input placeholder="(11) 90000-0000" value={newArena.telefone} onChange={(e) => setNewArena(prev => ({ ...prev, telefone: e.target.value }))} />
          </Field>
          <Field label="Endereço / Cidade">
            <Input placeholder="Rua, número, bairro, cidade" value={newArena.endereco} onChange={(e) => setNewArena(prev => ({ ...prev, endereco: e.target.value }))} />
          </Field>
          <Field label="Plano inicial *">
            <Select value={newArena.plano_id} onChange={(e) => setNewArena(prev => ({ ...prev, plano_id: e.target.value }))}>
              {planosSaaS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} — {p.valor_mensal > 0 ? `${formatBRL(p.valor_mensal)}/mês` : 'Sob consulta'} (Até {p.max_quadras} quadras)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Senha padrão do Admin">
            <div style={{ position: 'relative', width: '100%' }}>
              <Input 
                type={showNewArenaPassword ? 'text' : 'password'} 
                placeholder="Padrão: Arenix@2026" 
                value={newArena.senha} 
                onChange={(e) => setNewArena(prev => ({ ...prev, senha: e.target.value }))} 
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowNewArenaPassword(!showNewArenaPassword)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
                  display: 'flex', alignItems: 'center', zIndex: 5
                }}
                title={showNewArenaPassword ? 'Ocultar senha' : 'Ver senha'}
              >
                {showNewArenaPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
        </div>
      </Modal>

      {/* Block / unblock */}
      <ConfirmModal
        open={!!blockTarget}
        onClose={() => setBlockTarget(null)}
        onConfirm={async (password) => {
          if (!blockTarget) return;
          const token = localStorage.getItem('courtmanager_token');
          const res = await fetch(`/api/saas/arenas/${blockTarget.id}/status`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: blockTarget.status === 0 ? 1 : 0, senha: password })
          });
          if (res.ok) {
            setBlockTarget(null);
            fetchArenas();
          } else {
            alert('Falha ao alterar status (senha incorreta?)');
          }
        }}
        title={blockTarget?.status === 0 ? 'Desbloquear arena?' : 'Bloquear arena?'}
        destructive={blockTarget?.status !== 0}
        message={blockTarget?.status === 0
          ? `A arena "${blockTarget?.nome}" voltará a funcionar normalmente. Os usuários poderão acessar o painel.`
          : `Ao bloquear "${blockTarget?.nome}", os usuários da arena percem acesso imediato ao painel até o desbloqueio.`}
        confirmLabel={blockTarget?.status === 0 ? 'Desbloquear' : 'Bloquear'}
        requirePassword
      />

      {/* Delete (soft) */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async (password) => {
          if (!deleteTarget) return;
          const token = localStorage.getItem('courtmanager_token');
          const res = await fetch(`/api/saas/arenas/${deleteTarget.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ senha_master: password })
          });
          if (res.ok) {
            setDeleteTarget(null);
            fetchArenas();
          } else {
            alert('Falha ao excluir arena (senha incorreta?)');
          }
        }}
        title="Excluir arena"
        destructive
        requirePassword
        confirmLabel="Excluir"
        message={<>Você está prestes a excluir <strong>{deleteTarget?.nome}</strong>. Esta é uma exclusão lógica (soft-delete): os dados são preservados mas a arena deixa de aparecer na plataforma. Esta ação fica registrada em auditoria.</>}
      />
    </div>
  );
}
