import { useState, useEffect } from 'react';
import { Plus, Pencil, Wallet, Clock, CheckCircle } from 'lucide-react';
import { Card, Badge, Button, PageHeader, Modal, Field, Input, Select, ConfirmModal } from '../components/ui';
import { MetricCard } from '../components/MetricCard';
import { LineChart } from '../components/LineChart';
import { PLANS, REVENUE_HISTORY, formatBRL, formatDate, type Plan } from '../data/mock';

const BLOCK_AFTER_DAYS = 7;

export function MasterFinanceiro() {
  const [editPlan, setEditPlan] = useState<any | null>(null);
  const [planos, setPlanos] = useState<any[]>([]);
  const [faturas, setFaturas] = useState<any[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<string>('todas');
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState<any | null>(null);
  const [metrics, setMetrics] = useState({
    mrr: 0,
    mrrVariacao: 0,
    faturamentoHistorico: [] as Array<{ month: string; total: number }>
  });

  const faturasFiltradas = faturas.filter(f => {
    if (filtroStatus === 'todas') return true;
    if (filtroStatus === 'Pix Online') return f.metodo_pagamento === 'Pix Online';
    if (filtroStatus === 'Manual') return f.metodo_pagamento === 'Manual';
    return f.status === filtroStatus;
  });

  const formatCurrencyInput = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    const num = Number.parseInt(digits, 10) / 100;
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatFloatToCurrencyInput = (num: number) => {
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const parseCurrencyToFloat = (value: string) => {
    if (!value) return 0;
    const clean = value.replace(/\./g, '').replace(',', '.');
    return Number.parseFloat(clean) || 0;
  };

  const loadData = async () => {
    try {
      const token = localStorage.getItem('courtmanager_token');
      const headers = { 'Authorization': `Bearer ${token}` };
      
      const [faturasRes, metricsRes, planosRes] = await Promise.all([
        fetch('/api/saas/faturas', { headers }).then(r => r.json()),
        fetch('/api/saas/metrics', { headers }).then(r => r.json()),
        fetch('/api/saas/planos', { headers }).then(r => r.json())
      ]);

      setFaturas(faturasRes);
      setPlanos(planosRes);
      setMetrics({
        mrr: metricsRes.totalReceitaSaaS || 0,
        mrrVariacao: metricsRes.mrrVariacao || 0,
        faturamentoHistorico: metricsRes.faturamentoHistorico || []
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlan = async () => {
    if (!editPlan) return;
    try {
      const token = localStorage.getItem('courtmanager_token');
      const res = await fetch(`/api/saas/planos/${editPlan.id}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nome: editPlan.nome,
          valor_mensal: parseCurrencyToFloat(editPlan.valor_mensal),
          valor_anual: parseCurrencyToFloat(editPlan.valor_anual),
          max_quadras: editPlan.max_quadras,
          max_usuarios: editPlan.max_usuarios
        })
      });

      if (res.ok) {
        setEditPlan(null);
        loadData();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Erro ao atualizar plano.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao salvar plano.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePay = async (faturaId: number) => {
    try {
      const token = localStorage.getItem('courtmanager_token');
      const res = await fetch(`/api/saas/faturas/${faturaId}/pagar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setPayTarget(null);
        loadData();
      } else {
        alert('Erro ao pagar fatura.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'Paga') return 'success';
    if (status === 'Atrasada') return 'danger';
    return 'warning';
  };

  const calcAtraso = (dataVencimento: string, status: string) => {
    if (status === 'Paga') return 0;
    const v = new Date(dataVencimento);
    const hoje = new Date();
    const diff = hoje.getTime() - v.getTime();
    if (diff <= 0) return 0;
    return Math.floor(diff / (1000 * 3600 * 24));
  };

  const formatMonthLabel = (monthStr: string) => {
    if (!monthStr) return '';
    const parts = monthStr.split('-');
    if (parts.length !== 2) return monthStr;
    const year = parts[0].substring(2);
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const monthIndex = Number.parseInt(parts[1], 10) - 1;
    return `${months[monthIndex]}/${year}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financeiro & assinaturas"
        description="Gestão de planos, faturamento e inadimplência da plataforma."
      />

      {/* MRR + history */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <MetricCard 
          label="MRR total da plataforma" 
          value={formatBRL(metrics.mrr)} 
          accent="success" 
          sub="Receita recorrente mensal" 
          trend={metrics.mrrVariacao > 0 ? { 
            value: `+${metrics.mrrVariacao}%`, 
            direction: 'up' 
          } : undefined}
        />
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold">Histórico de faturamento</h3>
              <p className="text-xs text-muted">Últimos 6 meses</p>
            </div>
          </div>
          <LineChart 
            data={metrics.faturamentoHistorico.map((r) => ({ 
              label: formatMonthLabel(r.month), 
              value: r.total 
            }))} 
            formatValue={(v) => formatBRL(v)} 
          />
        </Card>
      </div>

      {/* Auto-block notice */}
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-cream-surface border border-border-passive text-sm">
        <Clock size={15} className="text-muted" />
        <span className="text-charcoal/80">Arenas com faturas vencidas há <strong>{BLOCK_AFTER_DAYS} dias ou mais</strong> são bloqueadas automaticamente pela plataforma.</span>
      </div>

      {/* Plans */}
      <div>
        <h3 className="text-sm font-semibold text-charcoal mb-3">Planos</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {planos.map((p) => {
            const description = p.nome === 'Basic' 
              ? 'Recomendado para pequenas arenas iniciando no digital.' 
              : p.nome === 'Pro' 
                ? 'Ideal para arenas em expansão com múltiplos funcionários.' 
                : 'Solução sob medida para redes e complexos esportivos.';
            
            return (
              <Card key={p.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-base font-semibold text-charcoal">{p.nome}</div>
                    <div className="text-2xl font-semibold text-charcoal tabular mt-1">
                      {p.valor_mensal > 0 ? (
                        <>
                          {formatBRL(p.valor_mensal)}
                          <span className="text-sm font-normal text-muted">/mês</span>
                        </>
                      ) : (
                        'Sob consulta'
                      )}
                    </div>
                    <div className="text-[11px] text-muted font-medium mt-0.5">
                      {p.valor_mensal > 0 ? (
                        `${formatBRL(p.valor_anual || 0)}/mês no anual`
                      ) : (
                        'múltiplas unidades'
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditPlan({
                    id: p.id,
                    nome: p.nome,
                    valor_mensal: formatFloatToCurrencyInput(p.valor_mensal),
                    valor_anual: formatFloatToCurrencyInput(p.valor_anual || 0),
                    max_quadras: p.max_quadras,
                    max_usuarios: p.max_usuarios
                  })}><Pencil size={13} /> Editar</Button>
                </div>
                <p className="text-xs text-muted mt-2">{description}</p>
                <div className="mt-4 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">Limite de quadras</span>
                    <span className="font-medium tabular">{p.max_quadras}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Limite de usuários</span>
                    <span className="font-medium tabular">{p.max_usuarios}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Payment status table */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border-passive flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet size={15} className="text-muted" />
            <h3 className="text-sm font-semibold">Histórico de Faturas Globais</h3>
          </div>
          {/* Filtros de Faturas */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            <button
              onClick={() => setFiltroStatus('todas')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${filtroStatus === 'todas' ? 'bg-charcoal text-white' : 'bg-cream/60 text-muted hover:bg-cream'}`}
            >
              Todas ({faturas.length})
            </button>
            <button
              onClick={() => setFiltroStatus('Pendente')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${filtroStatus === 'Pendente' ? 'bg-warning text-white' : 'bg-warning-soft text-warning-dark hover:bg-warning-soft/80'}`}
            >
              Pendentes ({faturas.filter(f => f.status === 'Pendente').length})
            </button>
            <button
              onClick={() => setFiltroStatus('Atrasada')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${filtroStatus === 'Atrasada' ? 'bg-danger text-white' : 'bg-danger-soft text-danger-dark hover:bg-danger-soft/80'}`}
            >
              Atrasadas ({faturas.filter(f => f.status === 'Atrasada').length})
            </button>
            <button
              onClick={() => setFiltroStatus('Pix Online')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${filtroStatus === 'Pix Online' ? 'bg-success text-white' : 'bg-success-soft text-success-dark hover:bg-success-soft/80'}`}
            >
              ⚡ Pix Online ({faturas.filter(f => f.metodo_pagamento === 'Pix Online').length})
            </button>
            <button
              onClick={() => setFiltroStatus('Manual')}
              className={`px-3 py-1.5 rounded-lg transition-colors font-medium ${filtroStatus === 'Manual' ? 'bg-charcoal-04 text-charcoal' : 'bg-cream/60 text-muted hover:bg-cream'}`}
            >
              👤 Manual ({faturas.filter(f => f.metodo_pagamento === 'Manual').length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-charcoal animate-pulse">Carregando faturas...</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="bg-cream/60 text-left text-xs text-muted uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">Arena</th>
                <th className="px-5 py-3 font-medium">Fatura</th>
                <th className="px-5 py-3 font-medium">Vencimento</th>
                <th className="px-5 py-3 font-medium">Valor</th>
                <th className="px-5 py-3 font-medium">Método</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Ação</th>
              </tr></thead>
              <tbody className="divide-y divide-border-passive">
                {faturasFiltradas.map((f) => {
                  const overdueDays = calcAtraso(f.data_vencimento, f.status);
                  const rowTint = f.status === 'Atrasada' && overdueDays >= BLOCK_AFTER_DAYS
                    ? 'bg-danger-soft/40'
                    : f.status === 'Atrasada' ? 'bg-warning-soft/40' : '';
                  return (
                    <tr key={f.id} className={`hover:bg-cream/50 transition-colors ${rowTint}`}>
                      <td className="px-5 py-3 font-medium text-charcoal">{f.arena_nome}</td>
                      <td className="px-5 py-3 text-muted">#{f.id} - {f.plano_nome}</td>
                      <td className="px-5 py-3 tabular text-muted">
                        {formatDate(f.data_vencimento)}
                        {overdueDays > 0 && <span className="text-danger ml-2 text-xs">({overdueDays} dias)</span>}
                      </td>
                      <td className="px-5 py-3 tabular font-semibold">{formatBRL(f.valor)}</td>
                      <td className="px-5 py-3">
                        {f.metodo_pagamento === 'Pix Online' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-success-soft text-success-dark border border-success/20">
                            ⚡ Pix Online
                          </span>
                        ) : f.metodo_pagamento === 'Manual' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-0.5 rounded-full bg-charcoal-04 text-charcoal border border-border-passive">
                            👤 Manual
                          </span>
                        ) : (
                          <span className="text-xs text-muted">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3"><Badge status={getStatusColor(f.status) as any}>{f.status}</Badge></td>
                      <td className="px-5 py-3 text-right">
                        {f.status !== 'Paga' ? (
                          <Button size="sm" variant="ghost" onClick={() => setPayTarget(f)}>Registrar pagamento</Button>
                        ) : (
                          <span className="text-success text-xs font-medium flex items-center justify-end gap-1"><CheckCircle size={13}/> Pago em {formatDate(f.data_pagamento)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {faturasFiltradas.length === 0 && (
                  <tr><td colSpan={7} className="p-5 text-center text-muted">Nenhuma fatura encontrada com este filtro.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Edit plan modal */}
      <Modal open={!!editPlan} onClose={() => setEditPlan(null)} title={`Editar plano ${editPlan?.nome || ''}`}
        footer={<><Button variant="ghost" onClick={() => setEditPlan(null)}>Cancelar</Button><Button variant="primary" onClick={handleSavePlan}>Salvar</Button></>}
      >
        {editPlan && (
          <div className="space-y-4">
            <Field label="Nome do plano">
              <Input 
                value={editPlan.nome} 
                onChange={(e: any) => setEditPlan({ ...editPlan, nome: e.target.value })} 
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Preço mensal (R$)">
                <Input 
                  type="text" 
                  value={editPlan.valor_mensal} 
                  onChange={(e: any) => setEditPlan({ ...editPlan, valor_mensal: formatCurrencyInput(e.target.value) })} 
                />
              </Field>
              <Field label="Preço anual (R$)">
                <Input 
                  type="text" 
                  value={editPlan.valor_anual} 
                  onChange={(e: any) => setEditPlan({ ...editPlan, valor_anual: formatCurrencyInput(e.target.value) })} 
                />
              </Field>
            </div>
            <p className="text-[11px] text-muted -mt-2">
              💡 Digite <strong>0,00</strong> em ambos os preços para marcar o plano como <strong>Sob consulta</strong> (múltiplas unidades).
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Limite de quadras">
                <Input 
                  type="number" 
                  value={editPlan.max_quadras} 
                  onChange={(e: any) => setEditPlan({ ...editPlan, max_quadras: Number.parseInt(e.target.value, 10) || 0 })} 
                />
              </Field>
              <Field label="Limite de usuários">
                <Input 
                  type="number" 
                  value={editPlan.max_usuarios} 
                  onChange={(e: any) => setEditPlan({ ...editPlan, max_usuarios: Number.parseInt(e.target.value, 10) || 0 })} 
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      {/* Manual payment confirm */}
      <ConfirmModal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        onConfirm={() => handlePay(payTarget?.id)}
        title="Registrar pagamento manual"
        message={<>Você está confirmando que recebeu manualmente o pagamento da fatura <strong>#{payTarget?.id}</strong> da arena <strong>{payTarget?.arena_nome}</strong> no valor de {formatBRL(payTarget?.valor || 0)}?</>}
        confirmLabel="Confirmar pagamento"
      />
    </div>
  );
}
