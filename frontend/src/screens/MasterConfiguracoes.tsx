import { useState, useEffect } from 'react';
import { Plus, Trash2, Wrench, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Badge, Button, ConfirmModal } from '../components/ui';
import { SYSTEM_VERSION } from '../data/mock';
import '../assets/css/configuracoes.css';

const TABS = [
  { id: 'geral',    label: 'Geral' },
  { id: 'gateway',  label: 'Gateway de Pagamento' },
  { id: 'cancelamentos', label: 'Motivos de Cancelamento' },
  { id: 'manutencao',  label: 'Manutenção' },
];

interface ConfigTabGeralProps {
  isActive: boolean;
  trialAtivo: boolean;
  setTrialAtivo: (v: boolean) => void;
  trialDays: string;
  setTrialDays: (v: string) => void;
  diasAbandono: string;
  setDiasAbandono: (v: string) => void;
}

const ConfigTabGeral: React.FC<ConfigTabGeralProps> = ({
  isActive,
  trialAtivo,
  setTrialAtivo,
  trialDays,
  setTrialDays,
  diasAbandono,
  setDiasAbandono
}) => {
  return (
    <div className={`config-section card ${isActive ? 'active' : ''}`}>
      <div className="card-header">
        <h2 className="card-title">Geral</h2>
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">Ativar período de trial em novos cadastros</div>
          <div className="setting-desc">Habilite ou desabilite o período de degustação gratuita para novas arenas que se registrarem na plataforma.</div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={trialAtivo}
            onChange={() => setTrialAtivo(!trialAtivo)}
          />
          <span className="toggle-slider" />
        </label>
      </div>

      {trialAtivo ? (
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-name">Duração do trial (em dias)</div>
            <div className="setting-desc">Quantidade de dias que novas arenas poderão usar o sistema gratuitamente antes da primeira cobrança.</div>
          </div>
          <input
            type="number"
            min={1}
            max={365}
            value={trialDays}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                setTrialDays('1');
                return;
              }
              const val = Math.max(1, Number.parseInt(raw, 10) || 1);
              setTrialDays(String(val));
            }}
            style={{ width: '80px', textAlign: 'center' }}
            aria-label="Dias de trial"
          />
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--pending-bg)',
          border: '1px solid var(--pending-border)',
          borderRadius: 'var(--r-lg)',
          padding: 'var(--s-3) var(--s-4)',
          marginTop: 'var(--s-3)',
          marginBottom: 'var(--s-4)',
          fontSize: '13px',
          color: 'var(--pending)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-3)'
        }}>
          <span style={{ fontSize: '16px' }}>⚠️</span>
          <div>
            <strong>Trial desativado.</strong> Novas arenas entrarão como <em>Pendente de Pagamento</em> e precisarão pagar a 1ª mensalidade para acessar o painel.
          </div>
        </div>
      )}

      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">Limpeza de cadastros abandonados (em dias)</div>
          <div className="setting-desc">Arenas que se cadastraram e nunca realizaram nenhum pagamento serão removidas automaticamente após este prazo. Clientes com histórico de pagamento são protegidos e jamais afetados.</div>
        </div>
        <input
          type="number"
          min={1}
          max={90}
          value={diasAbandono}
          onWheel={(e) => e.currentTarget.blur()}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') { setDiasAbandono('7'); return; }
            const val = Math.max(1, Number.parseInt(raw, 10) || 7);
            setDiasAbandono(String(val));
          }}
          style={{ width: '80px', textAlign: 'center' }}
          aria-label="Dias para limpeza de cadastros abandonados"
        />
      </div>

      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name">Versão do sistema</div>
          <div className="setting-desc">Somente leitura — controlada automaticamente pelo deploy da plataforma.</div>
        </div>
        <span style={{
          fontFamily: 'monospace',
          fontSize: '13px',
          background: 'var(--charcoal-04)',
          padding: '4px 10px',
          borderRadius: '6px',
          color: 'var(--charcoal)',
          border: '1px solid var(--border-passive)'
        }}>
          {SYSTEM_VERSION}
        </span>
      </div>
    </div>
  );
};

interface ConfigTabGatewayProps {
  isActive: boolean;
  mpClientId: string;
  setMpClientId: (v: string) => void;
  mpClientSecret: string;
  setMpClientSecret: (v: string) => void;
  hasClientSecret: boolean;
  clientSecretPreview: string;
  showSecret: boolean;
  setShowSecret: (v: boolean) => void;
  mpMasterToken: string;
  setMpMasterToken: (v: string) => void;
  hasMasterToken: boolean;
  masterTokenPreview: string;
  showMasterToken: boolean;
  setShowMasterToken: (v: boolean) => void;
  saving: boolean;
  onSave: () => void;
}

const ConfigTabGateway: React.FC<ConfigTabGatewayProps> = ({
  isActive,
  mpClientId,
  setMpClientId,
  mpClientSecret,
  setMpClientSecret,
  hasClientSecret,
  clientSecretPreview,
  showSecret,
  setShowSecret,
  mpMasterToken,
  setMpMasterToken,
  hasMasterToken,
  masterTokenPreview,
  showMasterToken,
  setShowMasterToken,
  saving,
  onSave
}) => {
  return (
    <div className={`config-section card ${isActive ? 'active' : ''}`}>
      <div className="card-header">
        <h2 className="card-title">Gateway de Pagamento</h2>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: 'var(--s-4)' }}>
        Credenciais globais do aplicativo SaaS (Mercado Pago).
      </p>

      {/* SEÇÃO 1: Credenciais OAuth */}
      <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #e2e8f0' }}>
        <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#1e293b', fontWeight: 700 }}>
          1. Integração OAuth (Para as Arenas conectarem suas contas)
        </h4>
        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#64748b' }}>
          Credenciais do aplicativo Mercado Pago que permitem que os donos de arena conectem suas próprias contas MP em 1 clique.
        </p>

        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', borderBottom: 'none' }}>
          <div className="setting-info">
            <div className="setting-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={14} style={{ color: '#009ee3' }} />
              Client ID (16 dígitos numéricos)
            </div>
          </div>
          <input
            type="text"
            placeholder="Ex: 2589270084205181"
            value={mpClientId}
            onChange={(e) => setMpClientId(e.target.value)}
            style={{ width: '100%', maxWidth: '360px' }}
            aria-label="Mercado Pago Client ID"
          />
        </div>

        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', borderBottom: 'none' }}>
          <div className="setting-info" style={{ width: '100%' }}>
            <div className="setting-name" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} style={{ color: '#009ee3' }} />
                Client Secret
              </span>
              {hasClientSecret && (
                <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600, backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '12px' }}>
                  ✓ Salvo no Banco ({clientSecretPreview})
                </span>
              )}
            </div>
          </div>
          <div style={{ position: 'relative', width: '100%', maxWidth: '360px' }}>
            <input
              type={showSecret ? 'text' : 'password'}
              placeholder="Cole o Client Secret aqui"
              value={mpClientSecret}
              onChange={(e) => setMpClientSecret(e.target.value)}
              style={{ width: '100%', paddingRight: '40px' }}
              aria-label="Mercado Pago Client Secret"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              style={{
                position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)',
                display: 'flex', alignItems: 'center'
              }}
              title={showSecret ? 'Ocultar' : 'Mostrar'}
            >
              {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: Access Token Pessoal do Master */}
      <div style={{ backgroundColor: '#f0fdf4', padding: '16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#166534', fontWeight: 700 }}>
              2. Conta de Recebimento do Master (Para receber o pagamento das mensalidades)
            </h4>
            <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#15803d' }}>
              Cole o <strong>Access Token</strong> pessoal da SUA conta Mercado Pago. É para este token que o dinheiro das assinaturas pagas pelas arenas será enviado via Pix Online.
            </p>
          </div>
          {hasMasterToken ? (
            <span style={{ fontSize: '12px', color: '#15803d', fontWeight: 700, backgroundColor: '#dcfce7', padding: '4px 12px', borderRadius: '16px', border: '1px solid #86efac', whiteSpace: 'nowrap' }}>
              ✓ Token Ativo no Banco ({masterTokenPreview})
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: '#991b1b', fontWeight: 700, backgroundColor: '#fee2e2', padding: '4px 12px', borderRadius: '16px', border: '1px solid #fca5a5', whiteSpace: 'nowrap' }}>
              ⚠️ Nenhum Token Configurado
            </span>
          )}
        </div>

        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px', borderBottom: 'none' }}>
          <div className="setting-info">
            <div className="setting-name" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534' }}>
              <ShieldCheck size={14} style={{ color: '#16a34a' }} />
              Access Token Pessoal do Master (APP_USR-...)
            </div>
          </div>
          <div style={{ position: 'relative', width: '100%', maxWidth: '420px' }}>
            <input
              type={showMasterToken ? 'text' : 'password'}
              placeholder="Cole seu APP_USR-... Access Token aqui"
              value={mpMasterToken}
              onChange={(e) => setMpMasterToken(e.target.value)}
              style={{ width: '100%', paddingRight: '40px', borderColor: '#86efac' }}
              aria-label="Mercado Pago Master Access Token"
            />
            <button
              type="button"
              onClick={() => setShowMasterToken(!showMasterToken)}
              style={{
                position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: '#15803d',
                display: 'flex', alignItems: 'center'
              }}
              title={showMasterToken ? 'Ocultar' : 'Mostrar'}
            >
              {showMasterToken ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #bbf7d0', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn-primary"
            onClick={onSave}
            disabled={saving}
            style={{ backgroundColor: '#166534', borderColor: '#15803d' }}
          >
            {saving ? 'Salvando...' : '💾 Salvar Configurações de Gateway'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ConfigTabCancelamentosProps {
  isActive: boolean;
  reasons: string[];
  setReasons: (v: string[]) => void;
  newReason: string;
  setNewReason: (v: string) => void;
}

const ConfigTabCancelamentos: React.FC<ConfigTabCancelamentosProps> = ({
  isActive,
  reasons,
  setReasons,
  newReason,
  setNewReason
}) => {
  return (
    <div className={`config-section card ${isActive ? 'active' : ''}`}>
      <div className="card-header">
        <h2 className="card-title">Motivos de Cancelamento</h2>
        <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 400 }}>
          {reasons.length} motivo{reasons.length !== 1 ? 's' : ''} cadastrado{reasons.length !== 1 ? 's' : ''}
        </span>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: 'var(--s-4)' }}>
        Lista global herdada por todas as arenas ao registrar um cancelamento de reserva.
      </p>

      <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', marginBottom: 'var(--s-4)' }}>
        {reasons.length === 0 ? (
          <li style={{ padding: '8px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
            Nenhum motivo cadastrado ainda.
          </li>
        ) : (
          reasons.map((r, i) => (
            <li
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 0',
                borderBottom: i !== reasons.length - 1 ? '1px solid var(--charcoal-03)' : 'none'
              }}
            >
              <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--muted)', width: '20px', flexShrink: 0 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <input
                value={r}
                onChange={(e) => {
                  const updated = [...reasons];
                  updated[i] = e.target.value;
                  setReasons(updated);
                }}
                style={{ flex: 1, border: '1px solid transparent', background: 'transparent', fontSize: '13px' }}
                onFocus={(e) => { e.target.style.border = '1px solid var(--border-passive)'; e.target.style.background = 'var(--off-white)'; }}
                onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
              />
              <button
                className="btn-ghost btn-sm"
                onClick={() => setReasons(reasons.filter((_, idx) => idx !== i))}
                style={{ color: 'var(--danger)', flexShrink: 0 }}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))
        )}
      </ul>

      <div style={{ display: 'flex', gap: '8px', paddingTop: 'var(--s-3)', borderTop: '1px solid var(--border-passive)' }}>
        <input
          placeholder="Novo motivo de cancelamento..."
          value={newReason}
          onChange={(e) => setNewReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newReason.trim()) {
              setReasons([...reasons, newReason.trim()]);
              setNewReason('');
            }
          }}
          style={{ flex: 1 }}
        />
        <button
          className="btn-ghost"
          disabled={!newReason.trim()}
          onClick={() => {
            if (!newReason.trim()) return;
            setReasons([...reasons, newReason.trim()]);
            setNewReason('');
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={14} /> Adicionar
        </button>
      </div>
    </div>
  );
};

interface ConfigTabManutencaoProps {
  isActive: boolean;
  maintenance: boolean;
  setMaintenance: (v: boolean) => void;
  maintenanceMsg: string;
  setMaintenanceMsg: (v: string) => void;
  setConfirmMaint: (v: boolean) => void;
  onSave: (val: boolean) => void;
}

const ConfigTabManutencao: React.FC<ConfigTabManutencaoProps> = ({
  isActive,
  maintenance,
  setMaintenance,
  maintenanceMsg,
  setMaintenanceMsg,
  setConfirmMaint,
  onSave
}) => {
  return (
    <div className={`config-section card ${isActive ? 'active' : ''}`}>
      <div className="card-header">
        <h2 className="card-title">Manutenção Global</h2>
        {maintenance && <Badge status="warning">Ativo</Badge>}
      </div>
      <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: 'var(--s-4)' }}>
        Quando ativo, todos os tenants veem a mensagem de manutenção no lugar do painel. O acesso do Master Admin não é afetado.
      </p>

      <div className="setting-row">
        <div className="setting-info">
          <div className="setting-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Wrench size={14} className={maintenance ? 'text-warning' : ''} />
            Modo manutenção global
          </div>
          <div className="setting-desc">
            {maintenance
              ? 'Ativo — tenants não conseguem acessar o sistema.'
              : 'Inativo — plataforma operando normalmente.'}
          </div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={maintenance}
            onChange={() => {
              if (!maintenance) setConfirmMaint(true);
              else { setMaintenance(false); onSave(false); }
            }}
          />
          <span className="toggle-slider" />
        </label>
      </div>

      <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
        <div className="setting-info">
          <div className="setting-name">Mensagem exibida durante a manutenção</div>
          <div className="setting-desc">Texto que aparece no lugar do painel para todos os tenants.</div>
        </div>
        <textarea
          rows={3}
          value={maintenanceMsg}
          onChange={(e) => setMaintenanceMsg(e.target.value)}
          disabled={!maintenance}
          placeholder="Ex: Estamos em manutenção programada. Voltamos em instantes."
          style={{ width: '100%', resize: 'vertical', opacity: maintenance ? 1 : 0.5 }}
        />
      </div>
    </div>
  );
};

export function MasterConfiguracoes() {
  const [tab, setTab] = useState<string>(() => sessionStorage.getItem('master_config_tab') || 'geral');

  const [trialDays, setTrialDays]         = useState('14');
  const [trialAtivo, setTrialAtivo]             = useState(true);
  const [diasAbandono, setDiasAbandono]         = useState('7');
  const [reasons, setReasons]             = useState<string[]>([]);
  const [newReason, setNewReason]         = useState('');
  const [maintenance, setMaintenance]     = useState(false);
  const [maintenanceMsg, setMaintenanceMsg] = useState('');
  const [confirmMaint, setConfirmMaint]   = useState(false);
  const [mpClientId, setMpClientId]             = useState('');
  const [mpClientSecret, setMpClientSecret]     = useState('');
  const [mpMasterToken, setMpMasterToken]       = useState('');
  const [hasClientSecret, setHasClientSecret]   = useState(false);
  const [clientSecretPreview, setClientSecretPreview] = useState('');
  const [hasMasterToken, setHasMasterToken]     = useState(false);
  const [masterTokenPreview, setMasterTokenPreview] = useState('');
  const [showSecret, setShowSecret]             = useState(false);
  const [showMasterToken, setShowMasterToken]   = useState(false);

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleTabChange = (id: string) => {
    setTab(id);
    sessionStorage.setItem('master_config_tab', id);
  };

  const fetchConfigs = async () => {
    try {
      const token = localStorage.getItem('courtmanager_token');
      const res = await fetch('/api/saas/configuracoes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTrialDays(data.dias_trial);
        setTrialAtivo(data.trial_ativo === '1' || data.trial_ativo === true);
        setDiasAbandono(data.dias_abandono_cadastro || '7');
        setMaintenance(data.manutencao_ativa === '1');
        setMaintenanceMsg(data.manutencao_mensagem);
        setReasons(data.reasons || []);
        setMpClientId(data.mp_client_id || '');
        setMpClientSecret(data.mp_client_secret || '');
        setMpMasterToken(data.mp_master_access_token || '');
        setHasClientSecret(Boolean(data.mp_client_secret));
        setHasMasterToken(Boolean(data.mp_master_access_token));
        setClientSecretPreview(data.mp_client_secret ? `***${data.mp_client_secret.slice(-4)}` : '');
        setMasterTokenPreview(data.mp_master_access_token ? `***${data.mp_master_access_token.slice(-4)}` : '');
      } else {
        const data = await res.json();
        showToast(data.error || 'Erro ao carregar configurações.', 'error');
      }
    } catch {
      showToast('Erro de conexão ao carregar configurações.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfigs(); }, []);

  const handleSave = async (updatedMaintenance?: boolean) => {
    setSaving(true);
    try {
      const token = localStorage.getItem('courtmanager_token');
      const isMaintActive = updatedMaintenance !== undefined ? updatedMaintenance : maintenance;
      const res = await fetch('/api/saas/configuracoes', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dias_trial: trialDays,
          trial_ativo: trialAtivo ? '1' : '0',
          dias_abandono_cadastro: diasAbandono,
          manutencao_ativa: isMaintActive ? '1' : '0',
          manutencao_mensagem: maintenanceMsg,
          reasons,
          mp_client_id: mpClientId,
          mp_client_secret: mpClientSecret,
          mp_master_access_token: mpMasterToken
        })
      });
      if (res.ok) {
        showToast('Configurações atualizadas com sucesso!', 'success');
        await fetchConfigs(); // recarrega para atualizar previews e badges
      } else {
        const data = await res.json();
        showToast(data.error || 'Erro ao salvar.', 'error');
      }
    } catch {
      showToast('Erro de conexão ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-charcoal animate-pulse">Carregando configurações...</div>;

  return (
    <div className="admin-configuracoes-page">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg text-white font-medium shadow-lg transition-transform duration-200 ${
          toast.type === 'success' ? 'bg-success' : 'bg-danger'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Título da página */}
      <div className="card-header" style={{ marginBottom: 'var(--s-5)' }}>
        <div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--charcoal)', margin: 0 }}>
            Configurações da plataforma
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
            Parâmetros globais aplicados a toda a plataforma e suas arenas.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => handleSave()}
          disabled={saving}
        >
          {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>

      <div className="config-layout">
        {/* Sidebar de navegação */}
        <nav className="config-nav" aria-label="Seções de configuração">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`config-nav-item w-full text-left ${tab === t.id ? 'active' : ''}`}
              onClick={() => handleTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Conteúdo dinâmico */}
        <div className="config-content">
          <ConfigTabGeral
            isActive={tab === 'geral'}
            trialAtivo={trialAtivo}
            setTrialAtivo={setTrialAtivo}
            trialDays={trialDays}
            setTrialDays={setTrialDays}
            diasAbandono={diasAbandono}
            setDiasAbandono={setDiasAbandono}
          />

          <ConfigTabGateway
            isActive={tab === 'gateway'}
            mpClientId={mpClientId}
            setMpClientId={setMpClientId}
            mpClientSecret={mpClientSecret}
            setMpClientSecret={setMpClientSecret}
            hasClientSecret={hasClientSecret}
            clientSecretPreview={clientSecretPreview}
            showSecret={showSecret}
            setShowSecret={setShowSecret}
            mpMasterToken={mpMasterToken}
            setMpMasterToken={setMpMasterToken}
            hasMasterToken={hasMasterToken}
            masterTokenPreview={masterTokenPreview}
            showMasterToken={showMasterToken}
            setShowMasterToken={setShowMasterToken}
            saving={saving}
            onSave={handleSave}
          />

          <ConfigTabCancelamentos
            isActive={tab === 'cancelamentos'}
            reasons={reasons}
            setReasons={setReasons}
            newReason={newReason}
            setNewReason={setNewReason}
          />

          <ConfigTabManutencao
            isActive={tab === 'manutencao'}
            maintenance={maintenance}
            setMaintenance={setMaintenance}
            maintenanceMsg={maintenanceMsg}
            setMaintenanceMsg={setMaintenanceMsg}
            setConfirmMaint={setConfirmMaint}
            onSave={handleSave}
          />
        </div>{/* /config-content */}
      </div>{/* /config-layout */}

      <ConfirmModal
        open={confirmMaint}
        onClose={() => setConfirmMaint(false)}
        onConfirm={async () => {
          setMaintenance(true);
          setConfirmMaint(false);
          await handleSave(true);
        }}
        title="Ativar modo manutenção global"
        destructive
        requirePassword
        confirmLabel="Ativar agora"
        message={<>Todos os tenants verão a mensagem de manutenção no lugar do painel até que o modo seja desativado. Esta ação fica registrada em auditoria.</>}
      />
    </div>
  );
}
