import { apiFetch as fetch } from '../../utils/apiFetch';
import { Link } from 'react-router-dom';
import '../../assets/css/landing.css';

import { useState, useEffect } from 'react';

const DEFAULT_PLANOS_LANDING = [
  { id: 1, nome: 'Basic', max_quadras: 3, max_usuarios: 3, valor_mensal: 49.99, valor_anual: 39.99 },
  { id: 2, nome: 'Pro', max_quadras: 10, max_usuarios: 10, valor_mensal: 79.99, valor_anual: 63.99 },
  { id: 3, nome: 'Enterprise', max_quadras: 999, max_usuarios: 999, valor_mensal: 0, valor_anual: 0 }
];

export function LandingPage() {
  const [period, setPeriod] = useState('monthly');
  const [animating, setAnimating] = useState(false);
  const [planos, setPlanos] = useState<any[]>(DEFAULT_PLANOS_LANDING);

  useEffect(() => {
    fetch('/api/auth/planos')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setPlanos(data);
      })
      .catch((err) => console.error('Erro ao buscar planos públicos:', err));
  }, []);

  const formatPrice = (val?: number) => {
    if (val === undefined) return '';
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handlePeriodChange = (p: string) => {
    if (p === period) return;
    setAnimating(true);
    setTimeout(() => {
      setPeriod(p);
      setAnimating(false);
    }, 200);
  };

  return (
    <div className="scope-landing-page">



      <nav className="nav">
        <div className="nav-inner">
          <Link to="/" className="nav-brand">
            <div className="nav-brand-icon">CM</div>
            <span className="nav-brand-name">CourtManager</span>
          </Link>
          <ul className="nav-links">
            <li><a href="#funcionalidades">Funcionalidades</a></li>
            <li><a href="#precos">Preços</a></li>
          </ul>
          <div className="nav-ctas">
            <Link to="/login" className="btn btn-ghost">Entrar como Arena</Link>
            <Link to="/cadastro" className="btn btn-dark">Começar grátis</Link>
          </div>
        </div>
      </nav>


      <section className="hero">
        <div className="container">
          <div className="hero-badge">
            🏐 Gestão completa de arenas esportivas
          </div>
          <h1 className="hero-title">
            Sua arena organizada.<br />
            <span>Do agendamento ao recebimento.</span>
          </h1>
          <p className="hero-sub">
            Chega de planilha, WhatsApp e caixa manual. O CourtManager centraliza reservas, controle de pagamentos e
            visibilidade financeira em um único lugar.
          </p>
          <div className="hero-ctas">
            <Link to="/cadastro" className="btn btn-dark btn-lg">Criar conta grátis — 14 dias</Link>
            <a href="#funcionalidades" className="btn btn-ghost btn-lg">Ver funcionalidades</a>
          </div>
          <p className="hero-note">Sem cartão de crédito. Cancele quando quiser.</p>


          <div className="hero-mockup">
            <div className="mockup-bar">
              <div className="mockup-dot"></div>
              <div className="mockup-dot"></div>
              <div className="mockup-dot"></div>
            </div>
            <div className="mockup-inner">
              <div className="mockup-sidebar">
                <div className="mockup-nav-item active">⊡ Dashboard</div>
                <div className="mockup-nav-item">⊞ Reservas</div>
                <div className="mockup-nav-item">◈ Pagamentos</div>
                <div className="mockup-nav-item">◉ Clientes</div>
                <div className="mockup-nav-item">▤ Relatórios</div>
              </div>
              <div className="mockup-content">
                <div className="mockup-kpis">
                  <div className="mockup-kpi">
                    <div className="mockup-kpi-label">Faturamento Hoje</div>
                    <div className="mockup-kpi-value">R$ 1.840</div>
                  </div>
                  <div className="mockup-kpi">
                    <div className="mockup-kpi-label">Reservas Ativas</div>
                    <div className="mockup-kpi-value">11</div>
                  </div>
                  <div className="mockup-kpi">
                    <div className="mockup-kpi-label">Ocupação</div>
                    <div className="mockup-kpi-value">74%</div>
                  </div>
                </div>
                <div className="mockup-slots">
                  <div></div>
                  <div className="mockup-slot-h">Q1</div>
                  <div className="mockup-slot-h">Q2</div>
                  <div className="mockup-slot-h">Q3</div>
                  <div className="mockup-slot-h">Q4</div>

                  <div className="mockup-time">08:00</div>
                  <div className="mockup-slot ms-paid">Carlos M.</div>
                  <div className="mockup-slot ms-free">Livre</div>
                  <div className="mockup-slot ms-paid">Ana S.</div>
                  <div className="mockup-slot ms-blocked">Manutenção</div>

                  <div className="mockup-time">09:00</div>
                  <div className="mockup-slot ms-paid">Carlos M.</div>
                  <div className="mockup-slot ms-pending">Pedro L.</div>
                  <div className="mockup-slot ms-free">Livre</div>
                  <div className="mockup-slot ms-free">Livre</div>

                  <div className="mockup-time">10:00</div>
                  <div className="mockup-slot ms-free">Livre</div>
                  <div className="mockup-slot ms-pending">Pedro L.</div>
                  <div className="mockup-slot ms-free">Livre</div>
                  <div className="mockup-slot ms-free">Livre</div>

                  <div className="mockup-time">11:00</div>
                  <div className="mockup-slot ms-paid">João V.</div>
                  <div className="mockup-slot ms-free">Livre</div>
                  <div className="mockup-slot ms-paid">Maria C.</div>
                  <div className="mockup-slot ms-free">Livre</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>


      <div className="logos">
        <div className="container">
          <p className="logos-label">Já usado em arenas em todo o Brasil</p>
          <div className="logos-list">
            <span>Arena Carioca BT</span>
            <span>Vôlei Prime SP</span>
            <span>Padel North</span>
            <span>BT Litoral</span>
            <span>Arena Movimento</span>
          </div>
        </div>
      </div>


      <section className="features" id="funcionalidades">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">Funcionalidades</span>
            <h2 className="section-title">Tudo que sua arena precisa</h2>
            <p className="section-sub">Do primeiro agendamento à prestação de contas, sem nada de fora.</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">⊞</div>
              <div className="feature-title">Grade de Disponibilidade</div>
              <p className="feature-desc">Visualize todas as quadras e horários em tempo real. Crie reservas clicando no slot
                livre. Status coloridos para pago, pendente e parcial.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">◈</div>
              <div className="feature-title">Controle Financeiro</div>
              <p className="feature-desc">Registre pagamentos via Pix, dinheiro ou cartão. Acompanhe inadimplência e emita
                comprovantes em PDF automaticamente.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⊡</div>
              <div className="feature-title">Dashboard em Tempo Real</div>
              <p className="feature-desc">Faturamento do dia, taxa de ocupação por quadra, alertas de saldo devedor e próximas
                reservas. Tudo na tela inicial.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">◉</div>
              <div className="feature-title">Gestão de Clientes</div>
              <p className="feature-desc">Mantenha o histórico de todos os praticantes da sua arena. Saiba quem são os clientes
                frequentes e controle mensalistas com facilidade.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">▤</div>
              <div className="feature-title">Relatórios Completos</div>
              <p className="feature-desc">Faturamento, ocupação, inadimplência e cancelamentos. Exporte em CSV ou PDF. Filtre
                por quadra, período ou método de pagamento.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">◎</div>
              <div className="feature-title">Auditoria e Segurança</div>
              <p className="feature-desc">Todos os eventos são registrados em log imutável: quem fez, quando e o quê. Controle
                de acesso por perfil (Admin, Gerente, Recepcionista).</p>
            </div>
          </div>
        </div>
      </section>


      <section className="stats" style={{ borderTop: '1px solid var(--border-warm)' }}>
        <div className="container">
          <div className="stats-grid">
            <div>
              <div className="stat-value">+300</div>
              <div className="stat-label">arenas ativas na plataforma</div>
            </div>
            <div>
              <div className="stat-value">98%</div>
              <div className="stat-label">de satisfação nas avaliações</div>
            </div>
            <div>
              <div className="stat-value">40h</div>
              <div className="stat-label">economizadas por mês em média</div>
            </div>
            <div>
              <div className="stat-value">R$ 0</div>
              <div className="stat-label">para começar — 14 dias grátis</div>
            </div>
          </div>
        </div>
      </section>


      <section className="pricing" id="precos">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">Planos</span>
            <h2 className="section-title">Simples e transparente</h2>
            <p className="section-sub">Sem taxas por reserva. Sem surpresas. Cancele quando quiser.</p>

            <div className="billing-toggle" id="billing-toggle">
              <button className={`billing-btn ${period === 'monthly' ? 'active' : ''}`} onClick={() => handlePeriodChange('monthly')}>Mensal</button>
              <button className={`billing-btn ${period === 'yearly' ? 'active' : ''}`} onClick={() => handlePeriodChange('yearly')}>
                Anual
                <span className="billing-save-badge">–20%</span>
              </button>
            </div>
          </div>

          <div className="pricing-grid">
            {/* Starter / Basic Plan */}
            {(() => {
              const p = planos.find(x => x.nome?.toLowerCase() === 'basic' || x.nome?.toLowerCase() === 'starter');
              const valorExibir = period === 'monthly'
                ? (p?.valor_mensal ?? 49.99)
                : (p?.valor_anual && p.valor_anual > 0 ? p.valor_anual : (p?.valor_mensal ? p.valor_mensal * 0.8 : 39.99));
              const planName = p?.nome || 'Basic';
              return (
                <div className="price-card" id="card-starter">
                  <div className="price-plan">{planName}</div>
                  <div className="price-value">
                    <span className={`price-amount ${animating ? 'fade-out' : 'fade-in'}`}>
                      R$ {formatPrice(valorExibir)}
                    </span>
                  </div>
                  <div className="price-period">
                    <span className="period-label">
                      {period === 'monthly' 
                        ? `/mês — até ${p?.max_quadras || 2} quadras` 
                        : '/mês — cobrado anualmente'}
                    </span>
                  </div>
                  <ul className="price-features">
                    <li>Reservas e pagamentos</li>
                    <li>Dashboard básico</li>
                    <li>{p?.max_usuarios || 3} usuários internos</li>
                    <li>Suporte via e-mail</li>
                  </ul>
                  <Link to={`/cadastro?plano=${p?.id || 2}`} className="btn btn-dark btn-full">Começar grátis</Link>
                </div>
              );
            })()}

            {/* Pro Plan */}
            {(() => {
              const p = planos.find(x => x.nome?.toLowerCase() === 'pro');
              const valorExibir = period === 'monthly'
                ? (p?.valor_mensal ?? 79.99)
                : (p?.valor_anual && p.valor_anual > 0 ? p.valor_anual : (p?.valor_mensal ? p.valor_mensal * 0.8 : 63.99));
              const planName = p?.nome || 'Pro';
              return (
                <div className="price-card" id="card-pro">
                  <div className="price-badge">Mais popular</div>
                  <div className="price-plan">{planName}</div>
                  <div className="price-value">
                    <span className={`price-amount ${animating ? 'fade-out' : 'fade-in'}`}>
                      R$ {formatPrice(valorExibir)}
                    </span>
                  </div>
                  <div className="price-period">
                    <span className="period-label">
                      {period === 'monthly' 
                        ? `/mês — até ${p?.max_quadras || 5} quadras` 
                        : '/mês — cobrado anualmente'}
                    </span>
                  </div>
                  <ul className="price-features">
                    <li>Tudo do Starter</li>
                    <li>Relatórios completos</li>
                    <li>{p?.max_usuarios || 10} usuários internos</li>
                    <li>Auditoria e logs</li>
                    <li>Gestão de mensalistas</li>
                    <li>Suporte prioritário</li>
                  </ul>
                  <Link to={`/cadastro?plano=${p?.id || 3}`} className="btn btn-dark btn-full">Começar grátis</Link>
                </div>
              );
            })()}

            {/* Enterprise Plan */}
            {(() => {
              const p = planos.find(x => x.nome?.toLowerCase() === 'enterprise');
              const valorExibir = period === 'monthly'
                ? p?.valor_mensal
                : (p?.valor_anual && p.valor_anual > 0 ? p.valor_anual : p?.valor_mensal);
              const planName = p?.nome || 'Enterprise';
              return (
                <div className="price-card" id="card-enterprise">
                  <div className="price-plan">{planName}</div>
                  <div className="price-value">
                    <span className={`price-amount ${animating ? 'fade-out' : 'fade-in'}`}>
                      {valorExibir !== undefined && valorExibir > 0 ? `R$ ${formatPrice(valorExibir)}` : 'Sob consulta'}
                    </span>
                  </div>
                  <div className="price-period">
                    <span className="period-label">
                      {valorExibir !== undefined && valorExibir > 0 
                        ? (period === 'monthly' ? '/mês — quadras ilimitadas' : '/mês — cobrado anualmente') 
                        : 'múltiplas unidades'}
                    </span>
                  </div>
                  <ul className="price-features">
                    <li>Tudo do Pro</li>
                    <li>Múltiplas arenas</li>
                    <li>Precificação dinâmica</li>
                    <li>Integrações via API</li>
                    <li>SLA dedicado</li>
                  </ul>
                  <a href="mailto:sales@courtmanager.app" className="btn btn-dark btn-full">Falar com vendas</a>
                </div>
              );
            })()}
          </div>

          <p className="pricing-note">
            Todos os planos incluem 14 dias gratuitos. Sem cartão de crédito para começar.
          </p>
        </div>
      </section>






      <section className="cta-strip">
        <div className="container">
          <h2 className="section-title">Pronto para organizar sua arena?</h2>
          <p className="section-sub">Cadastre-se em 2 minutos e experimente gratuitamente por 14 dias. Sem cartão de crédito.
          </p>
          <div className="hero-ctas">
            <Link to="/cadastro" className="btn btn-dark btn-lg">Criar conta grátis</Link>
            <Link to="/login" className="btn btn-ghost btn-lg">Já tenho conta</Link>
          </div>
        </div>
      </section>


      <footer>
        <div className="container">
          <div className="footer-inner">
            <div className="footer-brand">
              <Link to="/" className="nav-brand" style={{ marginBottom: '12px', display: 'inline-flex' }}>
                <div className="nav-brand-icon">CM</div>
                <span className="nav-brand-name">CourtManager</span>
              </Link>
              <p>Gestão completa de arenas esportivas. Do agendamento ao recebimento.</p>
            </div>
            <div className="footer-col">
              <div className="footer-col-title">Produto</div>
              <a href="#funcionalidades">Funcionalidades</a>
              <a href="#precos">Preços</a>
              <Link to="/login">Entrar como Arena</Link>
              <Link to="/cadastro">Criar conta</Link>
            </div>
            <div className="footer-col">
              <div className="footer-col-title">Contato</div>
              <a href="mailto:suporte@courtmanager.app">Suporte técnico</a>
              <a href="mailto:vendas@courtmanager.app">Vendas</a>
              <a href="#">Central de Ajuda</a>
            </div>
            <div className="footer-col">
              <div className="footer-col-title">Legal</div>
              <a href="#">Termos de Uso</a>
              <a href="#">Política de Privacidade</a>
              <a href="#">LGPD</a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>CourtManager &copy; 2026 — Todos os direitos reservados</span>
            <span>Feito para arenas brasileiras 🏐</span>
          </div>
        </div>
      </footer>


    </div>
  );
}
