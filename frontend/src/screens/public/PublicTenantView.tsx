import { useCallback } from 'react';
import { apiFetch as fetch } from '../../utils/apiFetch';
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar, Clock, MapPin, Phone, Copy, Check, AlertCircle, X } from 'lucide-react';
import '../../assets/css/design-system.css';

interface ArenaInfo {
  id: number;
  nome: string;
  endereco: string;
  telefone: string;
  email: string;
  fuso_horario: string;
  horario_abertura?: string;
  horario_fechamento?: string;
  slug: string;
}

interface QuadraInfo {
  quadra_id: number;
  quadra_nome: string;
  preco_base: number;
  slots: {
    hora_inicio: string;
    hora_fim: string;
    status: 'disponivel' | 'ocupado';
    preco: number;
  }[];
}

export function PublicTenantView() {
  const { slug } = useParams<{ slug: string }>();

  // General States
  const [arena, setArena] = useState<ArenaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);

  // Filter States
  const [selDate, setSelDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [quadras, setQuadras] = useState<QuadraInfo[]>([]);
  const [loadingDisponibilidade, setLoadingDisponibilidade] = useState(false);
  const [selQuadraId, setSelQuadraId] = useState<number | 'todas'>('todas');

  // Checkout Drawer States
  const [selectedSlot, setSelectedSlot] = useState<{
    quadra_id: number;
    quadra_nome: string;
    hora_inicio: string;
    hora_fim: string;
    preco: number;
  } | null>(null);

  const [atletaNome, setAtletaNome] = useState('');
  const [atletaTelefone, setAtletaTelefone] = useState('');
  const [atletaCpf, setAtletaCpf] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  // Pix Modal States
  const [pixModal, setPixModal] = useState<{
    reserva_id: number;
    copia_cola: string;
    qr_code?: string | null;
    valor_total: number;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutos em segundos

  // Toast State
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // 1. Carregar Arena pelo Slug
  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/public/tenant/${slug}`)
      .then(async res => {
        const data = await res.json();
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (res.status === 403 && data.blocked) {
          setBlockedMsg(data.error || 'Arena com agendamentos suspensos.');
          return;
        }
        if (res.ok) {
          setArena(data.arena);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // 2. Carregar Disponibilidade por Data
  const fetchDisponibilidade = useCallback(async () => {
    if (!slug || notFound || blockedMsg) return;
    setLoadingDisponibilidade(true);
    try {
      const quadraParam = selQuadraId !== 'todas' ? `&quadra_id=${selQuadraId}` : '';
      const res = await fetch(`/api/public/tenant/${slug}/disponibilidade?data=${selDate}${quadraParam}`);
      if (res.ok) {
        const data = await res.json();
        setQuadras(data.quadras || []);
      }
    } catch {
      showToast('Erro ao atualizar horários.');
    } finally {
      setLoadingDisponibilidade(false);
    }
  }, [slug, selDate, selQuadraId, notFound, blockedMsg] );

  useEffect(() => {
    fetchDisponibilidade();
  }, [slug, selDate, selQuadraId, notFound, blockedMsg, fetchDisponibilidade]);

  // Timer regressivo do Pix (15 min)
  useEffect(() => {
    if (!pixModal) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [pixModal]);

  // Formatadores de Máscara
  const handlePhoneChange = (val: string) => {
    const raw = val.replace(/\D/g, '');
    let formatted = raw;
    if (raw.length > 0) {
      formatted = '(' + raw.substring(0, 2);
      if (raw.length > 2) formatted += ') ' + raw.substring(2, 7);
      if (raw.length > 7) formatted += '-' + raw.substring(7, 11);
    }
    setAtletaTelefone(formatted);
  };

  const handleCpfChange = (val: string) => {
    const raw = val.replace(/\D/g, '');
    let formatted = raw;
    if (raw.length > 0) {
      formatted = raw.substring(0, 3);
      if (raw.length > 3) formatted += '.' + raw.substring(3, 6);
      if (raw.length > 6) formatted += '.' + raw.substring(6, 9);
      if (raw.length > 9) formatted += '-' + raw.substring(9, 11);
    }
    setAtletaCpf(formatted);
  };

  // Submeter Agendamento Rápido
  const handleAgendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot || !slug) return;
    setCheckoutError('');

    if (!atletaNome.trim() || atletaNome.trim().split(/\s+/).length < 2) {
      setCheckoutError('Informe seu nome completo (nome e sobrenome).');
      return;
    }

    if (atletaTelefone.replace(/\D/g, '').length < 10) {
      setCheckoutError('Informe um número de WhatsApp válido com DDD.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/public/tenant/${slug}/agendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: atletaNome,
          telefone: atletaTelefone,
          cpf: atletaCpf,
          quadra_id: selectedSlot.quadra_id,
          data_reserva: selDate,
          hora_inicio: selectedSlot.hora_inicio,
          hora_fim: selectedSlot.hora_fim
        })
      });

      const data = await res.json();

      if (res.ok) {
        setPixModal({
          reserva_id: data.reserva_id,
          copia_cola: data.copia_cola,
          qr_code: data.qr_code,
          valor_total: data.valor_total
        });
        setSelectedSlot(null);
        fetchDisponibilidade();
      } else {
        setCheckoutError(data.error || 'Erro ao realizar agendamento.');
      }
    } catch {
      setCheckoutError('Erro de conexão ao agendar. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copiar Chave Pix
  const handleCopyPix = () => {
    if (!pixModal) return;
    navigator.clipboard.writeText(pixModal.copia_cola);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Gera dias para o carrossel (próximos 7 dias)
  const getProximosDias = () => {
    const lista = [];
    const hoje = new Date();
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(hoje);
      d.setDate(hoje.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      const diaNum = d.getDate();
      const diaSem = i === 0 ? 'Hoje' : diasSemana[d.getDay()];
      lista.push({ iso, diaNum, diaSem });
    }
    return lista;
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)' }}>
        <div style={{ color: 'var(--charcoal)', fontWeight: 600 }} className="animate-pulse">Carregando arena...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--cream)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', textAlign: 'center', fontFamily: 'var(--font)' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏟️</div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--charcoal)', marginBottom: '8px' }}>Arena Não Encontrada</h1>
        <p style={{ fontSize: '14px', color: 'var(--muted)', maxWidth: '320px', textAlign: 'center', marginBottom: '24px' }}>
          O link acessado não corresponde a nenhuma arena ativa em nossa plataforma. Verifique a URL e tente novamente.
        </p>
      </div>
    );
  }

  if (blockedMsg) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#18181b', color: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'var(--font)' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', marginBottom: '16px' }}>🔒</div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', color: '#f87171' }}>Agendamentos Suspensos</h2>
        <p style={{ fontSize: '14px', color: '#a1a1aa', textAlign: 'center', maxWidth: '340px' }}>{blockedMsg}</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--cream)', color: 'var(--charcoal)', fontFamily: 'var(--font)', paddingBottom: '40px' }}>

      {/* Toast Notification */}
      {toast && (
        <div style={{ position: 'fixed', top: '16px', right: '16px', zIndex: 9999, backgroundColor: 'var(--charcoal)', color: '#fff', padding: '12px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toast}
        </div>
      )}

      {/* ─── 1. BANNER E HEADER DA ARENA ─── */}
      <div style={{ backgroundColor: 'var(--charcoal)', color: '#ffffff', padding: '24px 16px 32px 16px', borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px', position: 'relative' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#6ee7b7' }}>
              ✦ Arena Oficial
            </span>
          </div>

          <h1 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
            {arena?.nome}
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#cbd5e1' }}>
            {arena?.endereco && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={14} style={{ color: '#38bdf8', flexShrink: 0 }} />
                <span>{arena.endereco}</span>
              </div>
            )}
            {arena?.horario_abertura && arena?.horario_fechamento && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={14} style={{ color: '#facc15', flexShrink: 0 }} />
                <span>Atendimento: {arena.horario_abertura} às {arena.horario_fechamento}</span>
              </div>
            )}
            {arena?.telefone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Phone size={14} style={{ color: '#4ade80', flexShrink: 0 }} />
                <span>{arena.telefone}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── CONTAINER PRINCIPAL MOBILE-FIRST ─── */}
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '16px' }}>

        {/* ─── 2. CARROSSEL DE DATAS (Próximos 7 Dias) ─── */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: 'var(--muted)', marginBottom: '10px' }}>
            <Calendar size={14} />
            <span>Selecione a Data:</span>
          </div>

          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }}>
            {getProximosDias().map((item) => {
              const isSelected = selDate === item.iso;
              return (
                <button
                  key={item.iso}
                  onClick={() => setSelDate(item.iso)}
                  style={{
                    flex: '0 0 auto',
                    width: '68px',
                    padding: '10px 0',
                    borderRadius: '14px',
                    border: isSelected ? '2px solid var(--charcoal)' : '1px solid var(--border-passive)',
                    backgroundColor: isSelected ? 'var(--charcoal)' : '#ffffff',
                    color: isSelected ? '#ffffff' : 'var(--charcoal)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ fontSize: '11px', opacity: isSelected ? 0.9 : 0.6, fontWeight: 500 }}>{item.diaSem}</span>
                  <span style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px' }}>{item.diaNum}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── 3. FILTRO DE QUADRAS ─── */}
        {quadras.length > 1 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              <button
                onClick={() => setSelQuadraId('todas')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: selQuadraId === 'todas' ? 'none' : '1px solid var(--border-passive)',
                  backgroundColor: selQuadraId === 'todas' ? 'var(--charcoal)' : '#ffffff',
                  color: selQuadraId === 'todas' ? '#ffffff' : 'var(--muted)',
                  cursor: 'pointer'
                }}
              >
                Todas as Quadras
              </button>

              {quadras.map(q => (
                <button
                  key={q.quadra_id}
                  onClick={() => setSelQuadraId(q.quadra_id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: selQuadraId === q.quadra_id ? 'none' : '1px solid var(--border-passive)',
                    backgroundColor: selQuadraId === q.quadra_id ? 'var(--charcoal)' : '#ffffff',
                    color: selQuadraId === q.quadra_id ? '#ffffff' : 'var(--muted)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {q.quadra_nome}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── 4. GRADE DE HORÁRIOS POR QUADRA ─── */}
        {loadingDisponibilidade ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: '14px' }} className="animate-pulse">
            Buscando vagas disponíveis...
          </div>
        ) : quadras.length === 0 ? (
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '32px 20px', textAlign: 'center', border: '1px solid var(--border-passive)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏖️</div>
            <p style={{ fontSize: '14px', color: 'var(--muted)', margin: 0 }}>Nenhuma quadra ativa disponível para agendamento nesta arena.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {quadras.map((q) => (
              <div key={q.quadra_id} style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '16px', border: '1px solid var(--border-passive)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>

                {/* Nome da Quadra e Preço */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--charcoal)' }}>
                    {q.quadra_nome}
                  </h3>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--paid)', backgroundColor: 'var(--paid-bg)', padding: '4px 8px', borderRadius: '6px' }}>
                    R$ {q.preco_base.toFixed(2)}/h
                  </span>
                </div>

                {/* Grade de Slots de Horário */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '10px' }}>
                  {q.slots.map((slot) => {
                    const isLivre = slot.status === 'disponivel';
                    return (
                      <button
                        key={slot.hora_inicio}
                        disabled={!isLivre}
                        onClick={() => setSelectedSlot({
                          quadra_id: q.quadra_id,
                          quadra_nome: q.quadra_nome,
                          hora_inicio: slot.hora_inicio,
                          hora_fim: slot.hora_fim,
                          preco: slot.preco
                        })}
                        style={{
                          padding: '10px 8px',
                          borderRadius: '12px',
                          border: isLivre ? '1.5px solid var(--paid-border)' : '1px solid var(--blocked-border)',
                          backgroundColor: isLivre ? 'var(--paid-bg)' : 'var(--blocked-bg)',
                          color: isLivre ? 'var(--paid)' : 'var(--blocked)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: isLivre ? 'pointer' : 'not-allowed',
                          opacity: isLivre ? 1 : 0.7,
                          transition: 'transform 0.1s ease'
                        }}
                      >
                        <span style={{ fontSize: '13px', fontWeight: 800 }}>{slot.hora_inicio}</span>
                        <span style={{ fontSize: '10px', marginTop: '2px', fontWeight: 600 }}>
                          {isLivre ? 'Disponível' : 'Ocupado'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 5. DRAWER DE CHECKOUT RÁPIDO (Bottom Sheet) ─── */}
      {selectedSlot && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#ffffff', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', width: '100%', maxWidth: '600px', padding: '24px 20px 32px 20px', boxShadow: '0 -10px 30px rgba(0,0,0,0.2)', animation: 'slideUp 0.2s ease' }}>

            {/* Fechar Drawer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Confirmar Agendamento</h3>
                <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '2px 0 0 0' }}>{selectedSlot.quadra_nome} • {selDate.split('-').reverse().join('/')}</p>
              </div>
              <button onClick={() => setSelectedSlot(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={20} />
              </button>
            </div>

            {/* Resumo da Vaga */}
            <div style={{ backgroundColor: 'var(--cream-surface)', borderRadius: '12px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} style={{ color: 'var(--charcoal)' }} />
                <span style={{ fontSize: '14px', fontWeight: 700 }}>{selectedSlot.hora_inicio} às {selectedSlot.hora_fim}</span>
              </div>
              <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--paid)' }}>R$ {selectedSlot.preco.toFixed(2)}</span>
            </div>

            {checkoutError && (
              <div style={{ backgroundColor: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={14} />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* Formulário do Atleta sem Senha */}
            <form onSubmit={handleAgendar} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--charcoal)', display: 'block', marginBottom: '4px' }}>
                  Seu Nome Completo *
                </label>
                <input
                  type="text"
                  placeholder="Ex: João da Silva"
                  value={atletaNome}
                  onChange={(e) => setAtletaNome(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-passive)', fontSize: '14px', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--charcoal)', display: 'block', marginBottom: '4px' }}>
                  Seu WhatsApp com DDD *
                </label>
                <input
                  type="text"
                  placeholder="(11) 99999-9999"
                  value={atletaTelefone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-passive)', fontSize: '14px', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--charcoal)', display: 'block', marginBottom: '4px' }}>
                  CPF (Opcional para recibo Pix)
                </label>
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={atletaCpf}
                  onChange={(e) => handleCpfChange(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-passive)', fontSize: '14px', boxSizing: 'border-box' }}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  marginTop: '8px',
                  width: '100%',
                  padding: '14px',
                  borderRadius: '12px',
                  backgroundColor: 'var(--charcoal)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '15px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                {isSubmitting ? 'Gerando Pix...' : 'Pagar via Pix ➔'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── 6. MODAL DO PIX COM COUNTDOWN TIMER ─── */}
      {pixModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '20px', width: '100%', maxWidth: '440px', padding: '24px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--pending-bg)', color: 'var(--pending)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, marginBottom: '16px' }}>
              <Clock size={14} />
              <span>Expira em {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</span>
            </div>

            <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 6px 0', color: 'var(--charcoal)' }}>
              Pagamento via Pix
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: '0 0 16px 0' }}>
              Pague <strong style={{ color: 'var(--paid)' }}>R$ {pixModal.valor_total.toFixed(2)}</strong> para confirmar sua reserva instantaneamente.
            </p>

            {/* Chave Pix Copia e Cola */}
            <div style={{ backgroundColor: 'var(--cream)', padding: '12px', borderRadius: '12px', marginBottom: '16px', border: '1px solid var(--border-passive)' }}>
              <textarea
                readOnly
                value={pixModal.copia_cola}
                rows={3}
                style={{ width: '100%', border: 'none', background: 'none', fontSize: '11px', fontFamily: 'monospace', resize: 'none', color: 'var(--charcoal)' }}
              />
              <button
                onClick={handleCopyPix}
                style={{
                  width: '100%',
                  marginTop: '8px',
                  padding: '10px',
                  borderRadius: '8px',
                  backgroundColor: copied ? 'var(--paid)' : 'var(--charcoal)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  transition: 'background-color 0.2s ease'
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                <span>{copied ? 'Código Pix Copiado!' : 'Copiar Código Pix'}</span>
              </button>
            </div>

            <button
              onClick={() => setPixModal(null)}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', backgroundColor: 'transparent', color: 'var(--muted)', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
