import React, { useState, useEffect } from 'react';
import '../../assets/css/configuracoes.css';
import '../../assets/css/pagamentos.css';

interface PlanoDados {
  arena_id: number;
  arena_nome: string;
  arena_status: number; // 1 = Ativa, 0 = Inadimplente/Bloqueada
  dia_vencimento: number;
  trial_expira_em: string | null;
  em_trial?: boolean;
  dias_restantes_trial?: number;
  ciclo_cobranca?: string;
  cobertura_ate?: string | null;
  proximo_vencimento?: string | null;
  meses_adiantados?: number;
  proxima_competencia?: string | null;
  plano: {
    id: number;
    nome: string;
    valor_mensal: number;
    valor_anual?: number;
    max_quadras: number;
    max_usuarios: number;
  };
  uso: {
    quadras_usadas: number;
    usuarios_usados: number;
  };
  fatura_atual: {
    id: number;
    valor: number;
    data_vencimento: string;
    status: string;
  } | null;
}

interface Fatura {
  id: number;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: 'Paga' | 'Pendente' | 'Atrasada';
  gateway_ref: string | null;
  copia_cola: string | null;
  qr_expira_em: string | null;
  metodo_pagamento: string | null;
  plano_nome: string;
  ciclo?: string;
  descricao?: string;
  competencia?: string;
  antecipada?: boolean;
}

interface PixResponse {
  qr_code: string | null;
  copia_cola: string;
  gateway_ref: string;
  expira_em: string;
  reutilizado?: boolean;
}

interface PlanoItem {
  id: number;
  nome: string;
  max_quadras: number;
  max_usuarios: number;
  valor_mensal: number;
  valor_anual: number;
}

interface ReciboData {
  recibo_numero: string;
  data_emissao: string;
  fatura: {
    id: number;
    valor: number;
    ciclo: string;
    descricao: string;
    data_vencimento: string;
    data_pagamento: string;
    metodo_pagamento: string;
    gateway_ref: string;
    status: string;
  };
  plano: {
    nome: string;
    max_quadras: number;
    max_usuarios: number;
  };
  arena: {
    nome: string;
    email: string;
    telefone: string;
    endereco: string;
    slug: string;
  };
  emissor: {
    empresa: string;
    sistema: string;
    cnpj: string;
    suporte: string;
  };
}

interface PlanoCardModalProps {
  plano: PlanoItem;
  dados: PlanoDados | null;
  cicloSelecionado: 'mensal' | 'anual';
  solicitandoUpgradeId: number | null;
  onSolicitarUpgrade: (planoId: number, ciclo: 'mensal' | 'anual') => void;
}

function PlanoCardModal({ plano: p, dados, cicloSelecionado, solicitandoUpgradeId, onSolicitarUpgrade }: PlanoCardModalProps) {
  const isPlanoAtual = dados?.plano.id === p.id;
  const isPro = p.nome === 'Pro';
  const isEnterprise = p.nome === 'Enterprise';

  const precoMensalExibicao = cicloSelecionado === 'anual' && p.valor_anual > 0
    ? p.valor_anual
    : p.valor_mensal;

  const totalAnual = cicloSelecionado === 'anual' && p.valor_anual > 0
    ? p.valor_anual * 12
    : p.valor_mensal * 12;

  return (
    <div
      style={{
        backgroundColor: isPlanoAtual ? '#f8fafc' : isPro ? '#f0f7ff' : '#fff',
        border: isPlanoAtual
          ? '2px solid #94a3b8'
          : isPro
          ? '2px solid #2563eb'
          : '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        boxShadow: isPro ? '0 8px 20px -4px rgba(37,99,235,0.15)' : '0 1px 3px rgba(0,0,0,0.05)'
      }}
    >
      {isPro && (
        <div
          style={{
            position: 'absolute',
            top: '-12px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#2563eb',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 12px',
            borderRadius: '12px',
            letterSpacing: '0.5px',
            textTransform: 'uppercase'
          }}
        >
          Mais Popular
        </div>
      )}

      {isPlanoAtual && (
        <div
          style={{
            position: 'absolute',
            top: '-12px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#64748b',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 12px',
            borderRadius: '12px',
            letterSpacing: '0.5px',
            textTransform: 'uppercase'
          }}
        >
          Plano Atual
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
          Plano {p.nome}
        </h3>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          {isEnterprise ? (
            <span style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>
              Sob Consulta
            </span>
          ) : (
            <>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>R$</span>
              <span style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>
                {precoMensalExibicao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '13px', color: '#64748b' }}>/mês</span>
            </>
          )}
        </div>
        {cicloSelecionado === 'anual' && !isEnterprise && (
          <span style={{ fontSize: '11.5px', color: '#16a34a', fontWeight: 600, display: 'block', marginTop: '2px' }}>
            Faturado anualmente (R$ {totalAnual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/ano)
          </span>
        )}
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', flex: 1, marginBottom: '20px' }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#334155' }}>
          <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✓</span>
            <span><strong>{p.max_quadras === 999 ? 'Quadras Ilimitadas' : `Até ${p.max_quadras} Quadras`}</strong></span>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✓</span>
            <span><strong>{p.max_usuarios === 999 ? 'Usuários Ilimitados' : `Até ${p.max_usuarios} Funcionários`}</strong></span>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✓</span>
            <span>Portal do Atleta & Agendamento</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✓</span>
            <span>Gestão de Caixa & Pagamentos</span>
          </li>
          {p.nome !== 'Basic' && (
            <>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✓</span>
                <span>Relatórios de BI & Exportação</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✓</span>
                <span>Auditoria Completa de Ações</span>
              </li>
            </>
          )}
          {isEnterprise && (
            <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✓</span>
              <span>Suporte Prioritário VIP</span>
            </li>
          )}
        </ul>
      </div>

      {isPlanoAtual ? (
        <button
          type="button"
          disabled
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            backgroundColor: '#e2e8f0',
            color: '#64748b',
            fontWeight: 600,
            fontSize: '13px',
            cursor: 'default'
          }}
        >
          ✓ Plano Ativo
        </button>
      ) : isEnterprise ? (
        <a
          href="https://wa.me/5500000000000?text=Olá! Gostaria de saber mais sobre o Plano Enterprise do CourtManager."
          target="_blank"
          rel="noopener noreferrer"
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#0f172a',
            color: '#fff',
            fontWeight: 600,
            fontSize: '13px',
            textAlign: 'center',
            textDecoration: 'none',
            display: 'block',
            boxSizing: 'border-box'
          }}
        >
          Falar com Consultor
        </a>
      ) : (
        <button
          type="button"
          disabled={solicitandoUpgradeId === p.id}
          onClick={() => onSolicitarUpgrade(p.id, cicloSelecionado)}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: '#2563eb',
            color: '#fff',
            fontWeight: 600,
            fontSize: '13px',
            cursor: solicitandoUpgradeId === p.id ? 'wait' : 'pointer',
            boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
          }}
        >
          {solicitandoUpgradeId === p.id
            ? 'Gerando Pix...'
            : `Fazer Upgrade (${cicloSelecionado === 'anual' ? 'Anual' : 'Mensal'})`}
        </button>
      )}
    </div>
  );
}

const DEFAULT_PLANOS: PlanoItem[] = [
  { id: 1, nome: 'Basic', max_quadras: 3, max_usuarios: 3, valor_mensal: 49.99, valor_anual: 39.99 },
  { id: 2, nome: 'Pro', max_quadras: 10, max_usuarios: 10, valor_mensal: 79.99, valor_anual: 63.99 },
  { id: 3, nome: 'Enterprise', max_quadras: 999, max_usuarios: 999, valor_mensal: 0, valor_anual: 0 }
];

export function AdminAssinatura() {
  const token = localStorage.getItem('courtmanager_token');
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [dados, setDados] = useState<PlanoDados | null>(null);
  const [faturas, setFaturas] = useState<Fatura[]>([]);

  // Modal Planos / Upgrade
  const [modalPlanosOpen, setModalPlanosOpen] = useState(false);
  const [planosDisponiveis, setPlanosDisponiveis] = useState<PlanoItem[]>([]);
  const [loadingPlanos, setLoadingPlanos] = useState(false);
  const [solicitandoUpgradeId, setSolicitandoUpgradeId] = useState<number | null>(null);
  const [cicloSelecionado, setCicloSelecionado] = useState<'mensal' | 'anual'>('mensal');

  // Modal Recibo
  const [modalReciboOpen, setModalReciboOpen] = useState(false);
  const [reciboSelecionado, setReciboSelecionado] = useState<ReciboData | null>(null);
  const [carregandoRecibo, setCarregandoRecibo] = useState(false);

  // Modal Pix
  const [modalPixOpen, setModalPixOpen] = useState(false);
  const [faturaSelecionada, setFaturaSelecionada] = useState<Fatura | null>(null);
  const [pixData, setPixData] = useState<PixResponse | null>(null);
  const [gerandoPix, setGerandoPix] = useState(false);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [pixPagoComSucesso, setPixPagoComSucesso] = useState(false);
  const [pixExpirado, setPixExpirado] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Carregar dados de Assinatura e Faturas
  const carregarDados = async () => {
    setLoading(true);
    setErro(null);
    try {
      const [resPlano, resFaturas] = await Promise.all([
        fetch('/api/tenant/assinatura/plano', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/tenant/assinatura/faturas', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!resPlano.ok) {
        const errJson = await resPlano.json();
        throw new Error(errJson.error || 'Erro ao carregar dados do plano.');
      }
      if (!resFaturas.ok) {
        const errJson = await resFaturas.json();
        throw new Error(errJson.error || 'Erro ao carregar faturas.');
      }

      const dataPlano = await resPlano.json();
      const dataFaturas = await resFaturas.json();

      setDados(dataPlano);
      setFaturas(dataFaturas);
    } catch (e: any) {
      setErro(e.message || 'Falha ao conectar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // Polling automático do Pix (a cada 4s quando o modal Pix estiver aberto)
  useEffect(() => {
    if (!modalPixOpen || !pixData || !pixData.gateway_ref || pixPagoComSucesso || pixExpirado) return;

    // Se a data de expiração já tiver passado no momento da abertura, encerra imediatamente
    if (pixData.expira_em && new Date() >= new Date(pixData.expira_em)) {
      setPixExpirado(true);
      return;
    }

    const interval = setInterval(async () => {
      // Checar se expirou durante a sessão
      if (pixData.expira_em && new Date() >= new Date(pixData.expira_em)) {
        clearInterval(interval);
        setPixExpirado(true);
        showToast('O prazo de validade deste QR Code Pix expirou. Gere uma nova cobrança.', 'info');
        return;
      }

      try {
        const res = await fetch(`/api/tenant/assinatura/status-pagamento/${pixData.gateway_ref}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const statusJson = await res.json();
          if (statusJson.pago) {
            setPixPagoComSucesso(true);
            showToast('🎉 Pagamento Pix confirmado com sucesso! Seu plano foi atualizado.', 'success');
            carregarDados(); // Atualiza a tela
          }
        }
      } catch (err) {
        console.error('Erro no polling do Pix:', err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [modalPixOpen, pixData, pixPagoComSucesso, pixExpirado]);

  // Ação: Abrir modal de seleção de planos
  const abrirModalPlanos = async () => {
    setModalPlanosOpen(true);
    if (planosDisponiveis.length === 0) {
      setLoadingPlanos(true);
      try {
        const res = await fetch('/api/tenant/assinatura/planos-disponiveis', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setPlanosDisponiveis(data);
        }
      } catch (err) {
        console.error('Erro ao buscar planos:', err);
      } finally {
        setLoadingPlanos(false);
      }
    }
  };

  // Ação: Solicitar upgrade de plano
  const handleSolicitarUpgrade = async (planoId: number, cicloEscolhido: 'mensal' | 'anual' = cicloSelecionado) => {
    setSolicitandoUpgradeId(planoId);
    try {
      const res = await fetch('/api/tenant/assinatura/solicitar-upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ plano_id: planoId, ciclo: cicloEscolhido })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Erro ao solicitar upgrade.');
      }

      setModalPlanosOpen(false);
      setFaturaSelecionada({
        id: resData.fatura_id,
        valor: resData.valor,
        data_vencimento: new Date().toISOString().split('T')[0],
        data_pagamento: null,
        status: 'Pendente',
        gateway_ref: resData.pix?.gateway_ref || null,
        copia_cola: resData.pix?.copia_cola || null,
        qr_expira_em: resData.pix?.expira_em || null,
        metodo_pagamento: 'Pix Online',
        plano_nome: resData.plano_nome
      });
      setPixData(resData.pix);
      setModalPixOpen(true);
      setPixPagoComSucesso(false);
      setPixCopiado(false);
      setPixExpirado(false);
      showToast(`Cobrança Pix gerada para o Plano ${resData.plano_nome} (${resData.ciclo === 'anual' ? 'Anual' : 'Mensal'}). Realize o pagamento para ativar!`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Erro ao processar upgrade de plano.', 'error');
    } finally {
      setSolicitandoUpgradeId(null);
    }
  };

  // Ação: Visualizar e imprimir recibo da fatura liquidada
  const handleVisualizarRecibo = async (faturaId: number) => {
    setCarregandoRecibo(true);
    setModalReciboOpen(true);
    setReciboSelecionado(null);
    try {
      const res = await fetch(`/api/tenant/assinatura/faturas/${faturaId}/recibo`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar recibo.');
      }
      setReciboSelecionado(data);
    } catch (err: any) {
      showToast(err.message || 'Erro ao buscar recibo.', 'error');
      setModalReciboOpen(false);
    } finally {
      setCarregandoRecibo(false);
    }
  };

  // Ação: Imprimir/Salvar PDF do recibo através de iframe isolado de impressão
  const handleImprimirRecibo = () => {
    if (!reciboSelecionado) return;

    const dataPagamentoFormatada = formatarDataBR(reciboSelecionado.fatura.data_pagamento);
    const dataVencimentoFormatada = formatarDataBR(reciboSelecionado.fatura.data_vencimento);
    const valorFormatado = Number(reciboSelecionado.fatura.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const printHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Comprovante - ${reciboSelecionado.recibo_numero}</title>
          <style>
            @page {
              margin: 15mm;
              size: portrait;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              background: #ffffff;
              padding: 24px;
              display: flex;
              justify-content: center;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .recibo-card {
              width: 100%;
              max-width: 520px;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 28px;
              background: #ffffff;
            }
            .header {
              border-bottom: 2px dashed #cbd5e1;
              padding-bottom: 16px;
              margin-bottom: 18px;
              text-align: center;
            }
            .icon {
              font-size: 32px;
              line-height: 1;
              margin-bottom: 6px;
            }
            .title {
              font-size: 16px;
              font-weight: 800;
              color: #0f172a;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-bottom: 2px;
            }
            .subtitle {
              font-size: 12px;
              color: #64748b;
              margin-bottom: 8px;
            }
            .badge {
              display: inline-block;
              padding: 3px 12px;
              border-radius: 12px;
              background-color: #dcfce7;
              color: #166534;
              font-weight: 700;
              font-size: 11.5px;
            }
            .details {
              display: flex;
              flex-direction: column;
              gap: 8px;
              font-size: 12.5px;
              margin-bottom: 18px;
            }
            .row {
              display: flex;
              justify-content: space-between;
              border-bottom: 1px solid #f1f5f9;
              padding-bottom: 6px;
            }
            .row-label {
              color: #64748b;
            }
            .row-val {
              color: #0f172a;
              font-weight: 600;
              text-align: right;
            }
            .row-mono {
              font-family: monospace;
              font-size: 11px;
              color: #475569;
            }
            .total-box {
              background-color: #f8fafc;
              border-radius: 8px;
              padding: 14px 18px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              border: 1px solid #e2e8f0;
              margin-bottom: 16px;
            }
            .total-label {
              font-size: 14px;
              font-weight: 700;
              color: #334155;
            }
            .total-val {
              font-size: 20px;
              font-weight: 800;
              color: #16a34a;
            }
            .footer {
              text-align: center;
              font-size: 11px;
              color: #94a3b8;
              border-top: 1px solid #f1f5f9;
              padding-top: 12px;
            }
          </style>
        </head>
        <body>
          <div class="recibo-card">
            <div class="header">
              <div class="icon">🧾</div>
              <h2 class="title">Comprovante de Pagamento</h2>
              <p class="subtitle">${reciboSelecionado.emissor.empresa}</p>
              <span class="badge">${reciboSelecionado.recibo_numero} — LIQUIDADO</span>
            </div>

            <div class="details">
              <div class="row">
                <span class="row-label">Arena / Cliente:</span>
                <span class="row-val">${reciboSelecionado.arena.nome}</span>
              </div>
              <div class="row">
                <span class="row-label">Descrição:</span>
                <span class="row-val">${reciboSelecionado.fatura.descricao}</span>
              </div>
              <div class="row">
                <span class="row-label">Ciclo / Período:</span>
                <span class="row-val" style="text-transform: capitalize;">${reciboSelecionado.fatura.ciclo}</span>
              </div>
              <div class="row">
                <span class="row-label">Vencimento:</span>
                <span class="row-val">${dataVencimentoFormatada}</span>
              </div>
              <div class="row">
                <span class="row-label">Data do Pagamento:</span>
                <span class="row-val">${dataPagamentoFormatada}</span>
              </div>
              <div class="row">
                <span class="row-label">Método:</span>
                <span class="row-val">${reciboSelecionado.fatura.metodo_pagamento}</span>
              </div>
              <div class="row">
                <span class="row-label">Autenticação Gateway:</span>
                <span class="row-val row-mono">${reciboSelecionado.fatura.gateway_ref}</span>
              </div>
            </div>

            <div class="total-box">
              <span class="total-label">Valor Total Pago:</span>
              <span class="total-val">R$ ${valorFormatado}</span>
            </div>

            <div class="footer">
              <p>Autenticação emitida eletronicamente por ${reciboSelecionado.emissor.sistema}</p>
              <p>Dúvidas e suporte: ${reciboSelecionado.emissor.suporte}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(printHtml);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        iframe.remove();
      }, 1500);
    }, 300);
  };

  // Ação: Abrir modal e gerar Pix para fatura existente
  const handlePagarPix = async (fatura: Fatura) => {
    setFaturaSelecionada(fatura);
    setPixData(null);
    setPixPagoComSucesso(false);
    setPixCopiado(false);
    setPixExpirado(false);
    setModalPixOpen(true);
    setGerandoPix(true);

    try {
      const res = await fetch(`/api/tenant/assinatura/faturas/${fatura.id}/gerar-pix`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erro ao gerar Pix.');

      setPixData(json);
    } catch (err: any) {
      showToast(err.message || 'Não foi possível gerar a cobrança Pix.', 'error');
      setModalPixOpen(false);
    } finally {
      setGerandoPix(false);
    }
  };

  // Copiar chave Pix Copia e Cola
  const handleCopiarPix = () => {
    if (!pixData || !pixData.copia_cola) return;
    navigator.clipboard.writeText(pixData.copia_cola);
    setPixCopiado(true);
    showToast('Chave Pix copia e cola copiada!', 'success');
    setTimeout(() => setPixCopiado(false), 3000);
  };

  // Adiantamento de Mensalidade
  const [adiantandoMensalidade, setAdiantandoMensalidade] = useState(false);

  const handleAdiantarMensalidade = async () => {
    setAdiantandoMensalidade(true);
    try {
      const res = await fetch('/api/tenant/assinatura/adiantar-fatura', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Erro ao gerar fatura antecipada.');
      }

      setFaturaSelecionada({
        id: resData.fatura_id,
        valor: resData.valor,
        data_vencimento: resData.data_vencimento,
        data_pagamento: null,
        status: 'Pendente',
        gateway_ref: resData.pix?.gateway_ref || null,
        copia_cola: resData.pix?.copia_cola || null,
        qr_expira_em: resData.pix?.expira_em || null,
        metodo_pagamento: 'Pix Online',
        plano_nome: resData.plano_nome
      });
      setPixData(resData.pix);
      setModalPixOpen(true);
      setPixPagoComSucesso(false);
      setPixCopiado(false);
      setPixExpirado(false);
      showToast(`Cobrança Pix da próxima mensalidade gerada com sucesso!`, 'info');
      // Recarregar dados para refletir a nova fatura na tabela
      carregarDados();
    } catch (err: any) {
      showToast(err.message || 'Erro ao adiantar mensalidade.', 'error');
    } finally {
      setAdiantandoMensalidade(false);
    }
  };

  // Formatar data no padrão brasileiro DD/MM/AAAA de forma ultra-segura
  const formatarDataBR = (dataStr?: string | null) => {
    if (!dataStr) return '-';
    try {
      const str = String(dataStr).trim();
      const datePart = str.split('T')[0].split(' ')[0];
      const parts = datePart.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('pt-BR');
      }
    } catch {
      // fallback
    }
    return String(dataStr);
  };

  // Obter texto amigável do próximo vencimento ou data de renovação
  const getProximaDataVencimento = () => {
    if (dados?.proximo_vencimento) {
      return formatarDataBR(dados.proximo_vencimento);
    }
    if (dados?.fatura_atual?.data_vencimento) {
      return formatarDataBR(dados.fatura_atual.data_vencimento);
    }
    return '-';
  };

  if (loading) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
        <p>Carregando informações da sua assinatura...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', color: '#d32f2f' }}>
        <h3>⚠️ Ops! Ocorreu um erro</h3>
        <p>{erro}</p>
        <button
          onClick={carregarDados}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            backgroundColor: '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  const isBloqueada = dados?.arena_status === 0;
  const temFaturaPendente = faturas.some(f => f.status === 'Pendente' || f.status === 'Atrasada');

  // Label do botão de pagamento / adiantamento
  const labelBotaoAdiantar = adiantandoMensalidade
    ? 'Gerando Pix...'
    : temFaturaPendente
    ? '⚡ Pagar Fatura Pendente'
    : dados?.proxima_competencia
    ? `⚡ Pagar Mensalidade de ${dados.proxima_competencia}`
    : '⚡ Pagar Próxima Mensalidade';

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            backgroundColor:
              toast.type === 'success'
                ? '#16a34a'
                : toast.type === 'info'
                ? '#2563eb'
                : '#dc2626',
            color: '#fff',
            padding: '12px 24px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 9999,
            fontWeight: 500,
            fontSize: '14px'
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            💳 Minha Assinatura & Mensalidades
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
            Gerencie seu plano, acompanhe o limite de uso e pague suas mensalidades com liberação automática.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={adiantandoMensalidade}
            onClick={handleAdiantarMensalidade}
            style={{
              backgroundColor: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: adiantandoMensalidade ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 6px rgba(22,163,74,0.25)',
              transition: 'all 0.15s ease'
            }}
          >
            {labelBotaoAdiantar}
          </button>

          <button
            type="button"
            onClick={abrirModalPlanos}
            style={{
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
              transition: 'all 0.15s ease'
            }}
          >
            🚀 Fazer Upgrade / Trocar de Plano
          </button>
        </div>
      </div>

      {/* Banner de Status Especial (Bloqueio ou Trial) */}
      {isBloqueada && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <span style={{ fontSize: '24px' }}>🛑</span>
          <div>
            <h4 style={{ margin: 0, color: '#991b1b', fontSize: '15px', fontWeight: 700 }}>
              Sua conta está com o acesso suspenso por pendência financeira
            </h4>
            <p style={{ margin: '2px 0 0 0', color: '#7f1d1d', fontSize: '13px' }}>
              Realize o pagamento de uma das faturas em aberto abaixo clicando em <strong>"Pagar com PIX"</strong>. Assim que confirmado, seu acesso será reativado instantaneamente!
            </p>
          </div>
        </div>
      )}

      {dados?.trial_expira_em && dados?.em_trial && !isBloqueada && (
        <div
          style={{
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '28px' }}>🎉</span>
            <div>
              <h4 style={{ margin: 0, color: '#1e40af', fontSize: '15px', fontWeight: 700 }}>
                Período de Teste Gratuito (Trial) Ativo
              </h4>
              <p style={{ margin: '2px 0 0 0', color: '#1e3a8a', fontSize: '13px' }}>
                Aproveite todos os recursos da plataforma gratuitamente até{' '}
                <strong>{formatarDataBR(dados.trial_expira_em)}</strong>
                {dados.dias_restantes_trial !== undefined && (
                  <span style={{ marginLeft: '6px', fontWeight: 600, color: '#2563eb' }}>
                    ({dados.dias_restantes_trial} {dados.dias_restantes_trial === 1 ? 'dia restante' : 'dias restantes'})
                  </span>
                )}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={abrirModalPlanos}
            style={{
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
            }}
          >
            ⭐ Efetivar Assinatura
          </button>
        </div>
      )}

      {/* Grid de KPIs do Plano */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px',
          marginBottom: '32px'
        }}
      >
        {/* KPI 1: Plano Atual */}
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: 700, color: '#64748b' }}>
              Plano Contratado
            </span>
            <span
              style={{
                backgroundColor: isBloqueada ? '#fee2e2' : '#dcfce7',
                color: isBloqueada ? '#991b1b' : '#166534',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              {isBloqueada ? 'Suspenso' : 'Ativo'}
            </span>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
            {dados?.plano.nome || 'Carregando...'}
          </h2>
          <p style={{ fontSize: '13.5px', color: '#475569', margin: '0 0 8px 0', lineHeight: '1.5' }}>
            R$ {(dados?.plano.valor_mensal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / {dados?.ciclo_cobranca === 'anual' ? 'ano' : 'mês'} · <strong>{temFaturaPendente ? 'Vencimento:' : 'Próxima Renovação:'} {getProximaDataVencimento()}</strong>
          </p>

          {dados?.meses_adiantados && dados.meses_adiantados > 0 ? (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#f0fdf4',
                color: '#15803d',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              <span>🛡️</span>
              <span>{dados.meses_adiantados} {dados.meses_adiantados === 1 ? 'mês adiantado' : 'meses adiantados'} (Cobertura até {formatarDataBR(dados.cobertura_ate)})</span>
            </div>
          ) : null}
        </div>

        {/* KPI 2: Limite de Quadras */}
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: 700, color: '#64748b' }}>
              Quadras Cadastradas
            </span>
            <span
              style={{
                backgroundColor: '#eff6ff',
                color: '#1d4ed8',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              {dados?.plano.max_quadras === 999 ? 'Ilimitado' : `${Math.round(((dados?.uso.quadras_usadas || 0) / (dados?.plano.max_quadras || 1)) * 100)}% em uso`}
            </span>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
            {dados?.uso.quadras_usadas}{' '}
            <span style={{ fontSize: '16px', fontWeight: 500, color: '#64748b' }}>
              / {dados?.plano.max_quadras === 999 ? 'Ilimitadas' : `${dados?.plano.max_quadras} quadras`}
            </span>
          </h2>
          <div
            style={{
              width: '100%',
              backgroundColor: '#f1f5f9',
              height: '6px',
              borderRadius: '3px',
              overflow: 'hidden',
              marginTop: '10px'
            }}
          >
            <div
              style={{
                width: `${Math.min(100, ((dados?.uso.quadras_usadas || 0) / (dados?.plano.max_quadras || 1)) * 100)}%`,
                backgroundColor: '#2563eb',
                height: '100%',
                borderRadius: '3px'
              }}
            />
          </div>
        </div>

        {/* KPI 3: Limite de Usuários */}
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: 700, color: '#64748b' }}>
              Usuários da Equipe
            </span>
            <span
              style={{
                backgroundColor: '#f0fdf4',
                color: '#15803d',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 600
              }}
            >
              {dados?.plano.max_usuarios === 999 ? 'Ilimitado' : `${Math.round(((dados?.uso.usuarios_usados || 0) / (dados?.plano.max_usuarios || 1)) * 100)}% em uso`}
            </span>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
            {dados?.uso.usuarios_usados}{' '}
            <span style={{ fontSize: '16px', fontWeight: 500, color: '#64748b' }}>
              / {dados?.plano.max_usuarios === 999 ? 'Ilimitados' : `${dados?.plano.max_usuarios} contas`}
            </span>
          </h2>
          <div
            style={{
              width: '100%',
              backgroundColor: '#f1f5f9',
              height: '6px',
              borderRadius: '3px',
              overflow: 'hidden',
              marginTop: '10px'
            }}
          >
            <div
              style={{
                width: `${Math.min(100, ((dados?.uso.usuarios_usados || 0) / (dados?.plano.max_usuarios || 1)) * 100)}%`,
                backgroundColor: '#16a34a',
                height: '100%',
                borderRadius: '3px'
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabela de Histórico de Faturas */}
      <div
        style={{
          backgroundColor: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
            📋 Histórico de Faturas
          </h3>
          {!temFaturaPendente && (
            <button
              type="button"
              disabled={adiantandoMensalidade}
              onClick={handleAdiantarMensalidade}
              style={{
                backgroundColor: '#f0fdf4',
                color: '#15803d',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <span>⚡</span> {dados?.proxima_competencia ? `Pagar ${dados.proxima_competencia} Antecipado` : 'Pagar Próximo Mês Antecipado'}
            </button>
          )}
        </div>

        {faturas.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
            Nenhuma fatura gerada até o momento.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textIndent: 0 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Fatura #</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Plano</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Competência</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Vencimento</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Valor</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Método</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {faturas.map((fat) => {
                  const isPaga = fat.status === 'Paga';
                  const isAtrasada = fat.status === 'Atrasada';

                  return (
                    <tr
                      key={fat.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: isAtrasada ? '#fef2f2' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '14px 16px', fontWeight: 600, color: '#334155' }}>
                        #{fat.id}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#475569' }}>
                        {fat.plano_nome}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#334155', fontWeight: 500 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{fat.competencia || 'Mensalidade'}</span>
                          {fat.antecipada && (
                            <span
                              style={{
                                fontSize: '10.5px',
                                backgroundColor: '#f0fdf4',
                                color: '#16a34a',
                                border: '1px solid #bbf7d0',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontWeight: 700
                              }}
                            >
                              Antecipada
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', color: '#475569' }}>
                        {formatarDataBR(fat.data_vencimento)}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0f172a' }}>
                        R$ {Number(fat.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '14px 16px', color: '#64748b' }}>
                        {fat.metodo_pagamento || '-'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '20px',
                            fontSize: '12px',
                            fontWeight: 600,
                            backgroundColor: isPaga ? '#dcfce7' : isAtrasada ? '#fee2e2' : '#fef3c7',
                            color: isPaga ? '#166534' : isAtrasada ? '#991b1b' : '#92400e'
                          }}
                        >
                          {isPaga ? '✓ Paga' : isAtrasada ? '⚠️ Atrasada' : '⏳ Pendente'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        {!isPaga ? (
                          <button
                            onClick={() => handlePagarPix(fat)}
                            style={{
                              backgroundColor: '#2563eb',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '8px 16px',
                              fontSize: '13px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              boxShadow: '0 2px 4px rgba(37,99,235,0.2)'
                            }}
                          >
                            ⚡ Pagar com PIX
                          </button>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 500 }}>
                              Pago em {formatarDataBR(fat.data_pagamento)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleVisualizarRecibo(fat.id)}
                              style={{
                                backgroundColor: '#f8fafc',
                                color: '#334155',
                                border: '1px solid #cbd5e1',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              📄 Recibo
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Pagamento via PIX */}
      {modalPixOpen && faturaSelecionada && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '16px'
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              padding: '28px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
              position: 'relative',
              textAlign: 'center'
            }}
          >
            {/* Fechar */}
            <button
              onClick={() => setModalPixOpen(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                fontSize: '20px',
                color: '#64748b',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
              Pagamento via Pix Online
            </h3>
            <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 20px 0' }}>
              Fatura #{faturaSelecionada.id} — Valor: <strong>R$ {faturaSelecionada.valor.toFixed(2)}</strong>
            </p>

            {gerandoPix ? (
              <div style={{ padding: '40px 0', color: '#2563eb', fontWeight: 600 }}>
                <p>🔄 Gerando cobrança Pix no Mercado Pago...</p>
              </div>
            ) : pixPagoComSucesso ? (
              <div style={{ padding: '32px 0' }}>
                <span style={{ fontSize: '56px' }}>🎉</span>
                <h4 style={{ fontSize: '18px', color: '#166534', margin: '12px 0 4px 0' }}>
                  Pagamento Confirmado!
                </h4>
                <p style={{ fontSize: '14px', color: '#475569' }}>
                  Sua mensalidade foi liquidada e o acesso da arena foi atualizado.
                </p>
                <button
                  onClick={() => setModalPixOpen(false)}
                  style={{
                    marginTop: '16px',
                    backgroundColor: '#166534',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 24px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Concluir
                </button>
              </div>
            ) : pixExpirado ? (
              <div style={{ padding: '24px 8px', textAlign: 'center' }}>
                <span style={{ fontSize: '48px', display: 'block', marginBottom: '12px' }}>⏰</span>
                <h4 style={{ fontSize: '18px', fontWeight: 700, color: '#991b1b', margin: '0 0 8px 0' }}>
                  Cobrança Pix Expirada
                </h4>
                <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.5, margin: '0 0 24px 0' }}>
                  O prazo limite deste código Pix encerrou. Clique no botão abaixo para gerar uma nova cobrança atualizada.
                </p>
                <button
                  type="button"
                  disabled={gerandoPix}
                  onClick={() => faturaSelecionada && handlePagarPix(faturaSelecionada)}
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 24px',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: gerandoPix ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
                  }}
                >
                  <span>🔄</span> {gerandoPix ? 'Gerando Novo Pix...' : 'Gerar Novo Pix'}
                </button>
              </div>
            ) : pixData ? (
              <div>
                {/* Exibição do QR Code (Base64 ou gerado via copia_cola) */}
                {(pixData.qr_code || pixData.copia_cola) && (
                  <div
                    style={{
                      backgroundColor: '#f8fafc',
                      padding: '16px',
                      borderRadius: '12px',
                      display: 'inline-block',
                      marginBottom: '16px',
                      border: '1px solid #e2e8f0'
                    }}
                  >
                    <img
                      src={pixData.qr_code || `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixData.copia_cola)}`}
                      alt="QR Code Pix"
                      style={{ width: '180px', height: '180px', display: 'block' }}
                    />
                  </div>
                )}

                <p style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
                  Abra o aplicativo do seu banco, escolha a opção <strong>Pix Copia e Cola</strong> ou escaneie a imagem acima.
                </p>

                {/* Copia e Cola */}
                <div style={{ textAlign: 'left', marginBottom: '20px' }}>
                  <label
                    style={{
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      color: '#64748b',
                      display: 'block',
                      marginBottom: '6px'
                    }}
                  >
                    Código Pix Copia e Cola:
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      readOnly
                      value={pixData.copia_cola}
                      style={{
                        flex: 1,
                        fontSize: '12px',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#f1f5f9',
                        fontFamily: 'monospace',
                        color: '#334155'
                      }}
                    />
                    <button
                      onClick={handleCopiarPix}
                      style={{
                        backgroundColor: pixCopiado ? '#16a34a' : '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0 16px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {pixCopiado ? '✓ Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>

                {/* Status Polling Live Indicator */}
                <div
                  style={{
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    fontSize: '12px',
                    color: '#1d4ed8',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ animation: 'pulse 1.5s infinite' }}>🔄</span>
                    Aguardando confirmação do pagamento em tempo real...
                  </div>

                  <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const refToUse = pixData.gateway_ref || faturaSelecionada?.id;
                          const res = await fetch(`/api/tenant/assinatura/status-pagamento/${refToUse}`, {
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          const json = await res.json();
                          if (json.pago) {
                            setPixPagoComSucesso(true);
                            showToast('🎉 Pagamento confirmado com sucesso!', 'success');
                            carregarDados();
                          } else {
                            showToast('Pagamento ainda não foi detectado. Caso já tenha pago, aguarde alguns segundos.', 'info');
                          }
                        } catch {
                          showToast('Erro ao consultar status.', 'error');
                        }
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: '#1e40af',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      🔍 Verificar Agora
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!faturaSelecionada) return;
                        try {
                          const res = await fetch(`/api/tenant/assinatura/faturas/${faturaSelecionada.id}/simular-pagamento`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          const json = await res.json();
                          if (res.ok) {
                            setPixPagoComSucesso(true);
                            showToast('🎉 Pagamento de teste simulado e aprovado com sucesso! Arena desbloqueada.', 'success');
                            carregarDados();
                          } else {
                            showToast(json.error || 'Erro ao simular.', 'error');
                          }
                        } catch {
                          showToast('Erro de conexão.', 'error');
                        }
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      🧪 Simular Aprovação
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* MODAL: COMPARATIVO E UPGRADE DE PLANOS */}
      {modalPlanosOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '16px'
          }}
          role="presentation"
          onClick={() => setModalPlanosOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setModalPlanosOpen(false); }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              maxWidth: '920px',
              width: '100%',
              padding: '32px 28px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {/* Fechar */}
            <button
              onClick={() => setModalPlanosOpen(false)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: 'none',
                border: 'none',
                fontSize: '20px',
                color: '#64748b',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
                Escolha o Plano Ideal para sua Arena
              </h2>
              <p style={{ fontSize: '14px', color: '#64748b', margin: '0 0 16px 0' }}>
                Evolua sua capacidade de quadras, funcionários e relatórios com ativação imediata via Pix.
              </p>

              {/* Seletor de Ciclo Mensal / Anual */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
                <div style={{ display: 'inline-flex', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    onClick={() => setCicloSelecionado('mensal')}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: cicloSelecionado === 'mensal' ? '#fff' : 'transparent',
                      color: cicloSelecionado === 'mensal' ? '#0f172a' : '#64748b',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      boxShadow: cicloSelecionado === 'mensal' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    Mensal
                  </button>
                  <button
                    type="button"
                    onClick={() => setCicloSelecionado('anual')}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: cicloSelecionado === 'anual' ? '#2563eb' : 'transparent',
                      color: cicloSelecionado === 'anual' ? '#fff' : '#64748b',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: cicloSelecionado === 'anual' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none'
                    }}
                  >
                    <span>Anual</span>
                    <span style={{ fontSize: '10px', backgroundColor: cicloSelecionado === 'anual' ? '#1d4ed8' : '#dcfce7', color: cicloSelecionado === 'anual' ? '#fff' : '#166534', padding: '2px 6px', borderRadius: '6px', fontWeight: 700 }}>
                      -20%
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {loadingPlanos ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: '#2563eb' }}>
                <p>Carregando opções de planos...</p>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '20px'
                }}
              >
                {(planosDisponiveis.length > 0 ? planosDisponiveis : DEFAULT_PLANOS).map((p) => (
                  <PlanoCardModal
                    key={p.id}
                    plano={p}
                    dados={dados}
                    cicloSelecionado={cicloSelecionado}
                    solicitandoUpgradeId={solicitandoUpgradeId}
                    onSolicitarUpgrade={handleSolicitarUpgrade}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: VISUALIZAÇÃO E IMPRESSÃO DE RECIBO */}
      {modalReciboOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
          role="presentation"
          onClick={() => setModalReciboOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setModalReciboOpen(false); }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              maxWidth: '560px',
              width: '100%',
              padding: '32px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              position: 'relative',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              className="no-print"
              onClick={() => setModalReciboOpen(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                fontSize: '20px',
                color: '#64748b',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            {carregandoRecibo ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: '#2563eb' }}>
                <p>Gerando recibo...</p>
              </div>
            ) : reciboSelecionado ? (
              <div>
                <div id="recibo-print-area">
                  {/* Cabeçalho do Recibo */}
                  <div style={{ borderBottom: '2px dashed #cbd5e1', paddingBottom: '20px', marginBottom: '20px', textAlign: 'center' }}>
                    <span style={{ fontSize: '36px' }}>🧾</span>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: '8px 0 2px 0', textTransform: 'uppercase' }}>
                      Comprovante de Pagamento
                    </h2>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
                      {reciboSelecionado.emissor.empresa}
                    </p>
                    <span style={{ display: 'inline-block', marginTop: '8px', padding: '3px 12px', borderRadius: '12px', backgroundColor: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: '12px' }}>
                      {reciboSelecionado.recibo_numero} — LIQUIDADO
                    </span>
                  </div>

                  {/* Detalhes da Cobrança */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Arena / Cliente:</span>
                      <strong style={{ color: '#0f172a' }}>{reciboSelecionado.arena.nome}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Descrição:</span>
                      <strong style={{ color: '#0f172a' }}>{reciboSelecionado.fatura.descricao}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Ciclo / Período:</span>
                      <strong style={{ color: '#0f172a', textTransform: 'capitalize' }}>{reciboSelecionado.fatura.ciclo}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Vencimento Original:</span>
                      <strong style={{ color: '#0f172a' }}>
                        {formatarDataBR(reciboSelecionado.fatura.data_vencimento)}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Data do Pagamento:</span>
                      <strong style={{ color: '#16a34a' }}>
                        {formatarDataBR(reciboSelecionado.fatura.data_pagamento)}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Método:</span>
                      <strong style={{ color: '#0f172a' }}>{reciboSelecionado.fatura.metodo_pagamento}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                      <span style={{ color: '#64748b' }}>Autenticação / Gateway Ref:</span>
                      <span style={{ color: '#475569', fontFamily: 'monospace', fontSize: '11px' }}>
                        {reciboSelecionado.fatura.gateway_ref}
                      </span>
                    </div>
                  </div>

                  {/* Total */}
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>Valor Total Pago:</span>
                    <span style={{ fontSize: '22px', fontWeight: 800, color: '#16a34a' }}>
                      R$ {Number(reciboSelecionado.fatura.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={handleImprimirRecibo}
                    style={{
                      flex: 1,
                      backgroundColor: '#0f172a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    🖨️ Imprimir / Salvar PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalReciboOpen(false)}
                    style={{
                      padding: '12px 20px',
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      fontSize: '13.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminAssinatura;
