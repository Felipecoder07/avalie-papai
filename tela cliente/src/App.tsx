import { apiFetch as fetch, logout } from './utils/apiFetch';
import { useEffect, useMemo, useState } from 'react';
import type { Court, Slot, ReservationInput, ArenaInfo } from './types';
import ArenaHeader from './components/ArenaHeader';
import CourtSelector from './components/CourtSelector';
import DateCarousel from './components/DateCarousel';
import SlotGrid from './components/SlotGrid';
import CheckoutDrawer from './components/CheckoutDrawer';
import PixModal from './components/PixModal';
import MyReservations from './components/MyReservations';
import StepIndicator from './components/StepIndicator';
import LoginScreen from './components/LoginScreen';
import MyProfileModal from './components/MyProfileModal';
import { ArrowRight, ShoppingBag, ShieldCheck, X, MessageCircle, MapPin, ExternalLink, AlertCircle } from 'lucide-react';
import { brl, getLocalDateISO, formatLongDate, formatShortDate } from './lib/format';
import { safeStorage } from './utils/safeStorage';

import { BACKEND_URL } from './lib/backendUrl';

function formatSingleSlotMessage(
  s: Slot,
  courtsList: Court[],
  activeSport?: string,
  total = 0
): string[] {
  const courtObj = courtsList.find(c => c.id === s.courtId);
  const courtName = courtObj?.name || 'Quadra';
  const sportName = s.sport || activeSport || courtObj?.modalities?.[0] || 'Esporte';

  const lines: string[] = [
    `ðŸ“… *Data:* ${formatLongDate(s.dateISO)}`,
    `â° *HorÃ¡rio:* ${s.start} Ã s ${s.end}`,
    `ðŸŸï¸ *Quadra:* ${courtName}`,
    `ðŸŽ¾ *Modalidade:* ${sportName}`
  ];
  if (total > 0) {
    lines.push(`ðŸ’° *Valor:* ${brl(total)}`);
  }
  return lines;
}

function formatSameDateSlotsMessage(
  sortedSlots: Slot[],
  courtsList: Court[],
  activeSport?: string,
  total = 0,
  firstCourt?: Court,
  allSameCourt = false
): string[] {
  const dateStr = formatLongDate(sortedSlots[0].dateISO);
  const sportName = sortedSlots[0].sport || activeSport || firstCourt?.modalities?.[0] || 'Esporte';

  const lines: string[] = [`ðŸ“… *Data:* ${dateStr}`];
  if (allSameCourt && firstCourt) {
    lines.push(`ðŸŸï¸ *Quadra:* ${firstCourt.name}`);
  }
  lines.push(`ðŸŽ¾ *Modalidade:* ${sportName}`);
  lines.push(`â° *HorÃ¡rios Selecionados (${sortedSlots.length}):*`);
  sortedSlots.forEach(s => {
    const courtObj = courtsList.find(c => c.id === s.courtId);
    const courtSuffix = !allSameCourt && courtObj ? ` â€” ${courtObj.name}` : '';
    lines.push(`  â€¢ ${s.start} Ã s ${s.end}${courtSuffix}`);
  });
  if (total > 0) {
    lines.push(`ðŸ’° *Valor Total:* ${brl(total)}`);
  }
  return lines;
}

function formatMultiDateSlotsMessage(
  sortedSlots: Slot[],
  courtsList: Court[],
  activeSport?: string,
  total = 0,
  firstCourt?: Court
): string[] {
  const sportName = sortedSlots[0].sport || activeSport || firstCourt?.modalities?.[0] || 'Esporte';
  const lines: string[] = [
    `ðŸŽ¾ *Modalidade:* ${sportName}`,
    `â° *HorÃ¡rios Selecionados (${sortedSlots.length}):*`
  ];
  sortedSlots.forEach(s => {
    const courtObj = courtsList.find(c => c.id === s.courtId);
    const courtName = courtObj?.name || 'Quadra';
    lines.push(`  â€¢ ${formatShortDate(s.dateISO)} das ${s.start} Ã s ${s.end} â€” ${courtName}`);
  });
  if (total > 0) {
    lines.push(`ðŸ’° *Valor Total:* ${brl(total)}`);
  }
  return lines;
}

function buildWhatsAppReservationMessage(
  arenaName: string,
  slots: Slot[],
  courtsList: Court[],
  activeSport?: string,
  athleteName?: string
): string {
  if (!slots.length) {
    return `OlÃ¡! Gostaria de consultar informaÃ§Ãµes sobre horÃ¡rios e reservas na ${arenaName || 'arena'}.`;
  }

  const sortedSlots = [...slots].sort((a, b) => {
    if (a.dateISO !== b.dateISO) return a.dateISO.localeCompare(b.dateISO);
    return a.start.localeCompare(b.start);
  });

  const total = sortedSlots.reduce((acc, s) => acc + (s.price || 0), 0);
  const allSameDate = sortedSlots.every(s => s.dateISO === sortedSlots[0].dateISO);
  const firstCourt = courtsList.find(c => c.id === sortedSlots[0].courtId);
  const allSameCourt = sortedSlots.every(s => s.courtId === sortedSlots[0].courtId);

  const lines: string[] = [
    `OlÃ¡! Gostaria de agendar ${sortedSlots.length === 1 ? 'um horÃ¡rio' : 'os seguintes horÃ¡rios'} na *${arenaName || 'Arena'}*:\n`
  ];

  if (sortedSlots.length === 1) {
    lines.push(...formatSingleSlotMessage(sortedSlots[0], courtsList, activeSport, total));
  } else if (allSameDate) {
    lines.push(...formatSameDateSlotsMessage(sortedSlots, courtsList, activeSport, total, firstCourt, allSameCourt));
  } else {
    lines.push(...formatMultiDateSlotsMessage(sortedSlots, courtsList, activeSport, total, firstCourt));
  }

  if (athleteName && athleteName.trim()) {
    lines.push(`\nðŸ‘¤ *Atleta:* ${athleteName.trim()}`);
  }

  lines.push(`\nGostaria de confirmar a disponibilidade para reservar!`);
  return lines.join('\n');
}

function getSlugFromPath(): string {
  const path = window.location.pathname.replace(/^\/+/g, '');
  const parts = path.split('/');
  if (parts[0] === 'arena' && parts[1]) return parts[1];
  if (parts[0] && parts[0] !== 'index.html' && parts[0] !== 'favicon.ico' && parts[0].trim() !== '') {
    return parts[0].trim();
  }
  return 'felp-arena';
}

function getInitialAthlete(): { name: string; email: string; phone: string } | null {
  try {
    const saved = localStorage.getItem('athlete_profile');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore storage parse error
  }
  return null;
}

function resolveCoverUrl(rawCover?: string): string {
  const fallback = 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?auto=format&fit=crop&q=80&w=1200';
  if (!rawCover) return fallback;
  if (rawCover.startsWith('http://') || rawCover.startsWith('https://') || rawCover.startsWith('data:')) {
    return rawCover;
  }
  return `${BACKEND_URL}${rawCover}`;
}

export default function App() {
  const [slug] = useState<string>(getSlugFromPath);
  const [arena, setArena] = useState<ArenaInfo | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtId, setCourtId] = useState<string>('');
  const [selectedSport, setSelectedSport] = useState<string>('Todos');
  const [dateISO, setDateISO] = useState<string>(() => getLocalDateISO());
  const [slots, setSlots] = useState<Slot[]>([]);

  // Status da API
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);

  // Atleta Logado (SessÃ£o do Atleta)
  const [athlete, setAthlete] = useState<{ name: string; email: string; phone: string } | null>(getInitialAthlete);

  // Carrinho de MÃºltiplos HorÃ¡rios
  const [selectedSlots, setSelectedSlots] = useState<Slot[]>([]);

  // Modais e Drawers
  const [loginOpen, setLoginOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pixOpen, setPixOpen] = useState(false);
  const [reservation, setReservation] = useState<ReservationInput | null>(null);
  const [pixPayload, setPixPayload] = useState<{ copia_cola: string; qr_code?: string | null; reserva_id?: number; reservas_ids?: number[]; valor_total?: number; expira_em_minutos?: number; expira_em_segundos?: number } | null>(null);
  const [myResOpen, setMyResOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [paymentNotConfigured, setPaymentNotConfigured] = useState<{ telefone: string | null } | null>(null);

  // 1.1 Validar Token e Sincronizar Perfil do Atleta em Background
  useEffect(() => {


    const expired = () => { setAthlete(null); setProfileOpen(false); setMyResOpen(false); };
    window.addEventListener('cm:session-expired', expired);
    fetch(`${BACKEND_URL}/api/public/tenant/${slug}/meu-perfil`, {
      headers: {}
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.perfil) {
            const sanitizeField = (val: unknown) => typeof val === 'string' ? val.replace(/[<>"'&]/g, '').trim() : '';
            const userObj = {
              name: sanitizeField(data.perfil.nome),
              email: sanitizeField(data.perfil.email),
              phone: sanitizeField(data.perfil.telefone)
            };
            setAthlete(userObj);
            safeStorage.setItem('athlete_profile', JSON.stringify(userObj));
          }
        } else if (res.status === 401 || res.status === 403) {
          setAthlete(null);
          localStorage.removeItem('athlete_profile');
        }
      })
      .catch(() => {
        // Falha de rede
      });
    return () => window.removeEventListener('cm:session-expired', expired);
  }, [slug]);

  // 2. Carregar Dados PÃºblicos do Tenant por Slug
  useEffect(() => {
    let attempts = 0;

    const fetchArena = () => {
      setLoading(true);
      setNotFound(false);
      setBlockedMsg(null);

      fetch(`${BACKEND_URL}/api/public/tenant/${slug}`)
        .then(async (res) => {
          const data = await res.json();
          if (res.status === 404) {
            setNotFound(true);
            return;
          }
          if (res.status === 403 && data.blocked) {
            setBlockedMsg(data.error || 'Agendamentos suspensos nesta arena.');
            return;
          }
          if (res.ok && data.arena) {
            const a = data.arena;
            setArena({
              name: a.nome,
              cover: resolveCoverUrl(a.foto_capa),
              address: a.endereco || 'EndereÃ§o nÃ£o informado',
              whatsapp: a.telefone || '',
              hoursToday: a.horario_abertura && a.horario_fechamento ? `${a.horario_abertura} Ã s ${a.horario_fechamento}` : '06:00 Ã s 23:00',
              rating: 4.9,
              reviews: 128
            });
          } else {
            setNotFound(true);
          }
        })
        .catch(() => {
          if (attempts < 2) {
            attempts++;
            setTimeout(fetchArena, 1000);
          } else {
            setNotFound(true);
          }
        })
        .finally(() => setLoading(false));
    };

    fetchArena();
  }, [slug]);

  // AtualizaÃ§Ã£o dinÃ¢mica do tÃ­tulo da pÃ¡gina com o nome oficial da arena
  useEffect(() => {
    if (arena?.name) {
      document.title = `${arena.name} Â· Agendamento Online | Arenix`;
    }
  }, [arena?.name]);


  // 3. Carregar Quadras Ativas da Arena
  useEffect(() => {
    if (notFound || blockedMsg) return;
    fetch(`${BACKEND_URL}/api/public/tenant/${slug}/quadras`)
      .then(res => res.json())
      .then(data => {
        if (data.quadras && Array.isArray(data.quadras) && data.quadras.length > 0) {
          const mapped: Court[] = data.quadras.map((q: { id: number | string; nome: string; tipo?: string; preco_base?: number; modalidades?: Array<{ nome: string; preco?: number } | string> }) => {
            const rawModalidades = Array.isArray(q.modalidades) ? q.modalidades : [q.tipo || 'Beach Tennis'];
            const sportPricing = rawModalidades.map((m: { nome: string; preco?: number } | string) => {
              if (typeof m === 'string') return { nome: m, preco: q.preco_base || 80 };
              return { nome: m.nome, preco: Number(m.preco != null ? m.preco : q.preco_base || 80) };
            });
            const modalities = sportPricing.map((sp: { nome: string; preco: number }) => sp.nome);

            return {
              id: String(q.id),
              name: q.nome,
              type: q.tipo === 'Areia' ? 'areia' : q.tipo === 'Coletiva' ? 'coberta' : 'society',
              pricePerHour: sportPricing[0]?.preco || q.preco_base || 80,
              surface: q.tipo || 'Areia',
              modalities,
              sportPricing
            };
          });
          setCourts(mapped);
          setCourtId(mapped[0].id);
        }
      })
      .catch(err => console.error('Erro ao buscar quadras:', err));
  }, [slug, notFound, blockedMsg]);

  // Lista de Esportes DisponÃ­veis
  const availableSports = useMemo(() => {
    const set = new Set<string>();
    courts.forEach(c => {
      (c.modalities || []).forEach(m => set.add(m));
    });
    if (set.size <= 1) return [];
    return ['Todos', ...Array.from(set)];
  }, [courts]);

  // Quadras filtradas com preÃ§o dinÃ¢mico baseado no esporte selecionado
  const filteredCourts = useMemo(() => {
    return courts
      .filter(c => selectedSport === 'Todos' || (c.modalities || []).includes(selectedSport))
      .map(c => {
        let price = c.pricePerHour;
        if (selectedSport !== 'Todos' && c.sportPricing) {
          const match = c.sportPricing.find(sp => sp.nome === selectedSport);
          if (match && match.preco > 0) {
            price = match.preco;
          }
        }
        return { ...c, pricePerHour: price };
      });
  }, [courts, selectedSport]);

  // Sincroniza quadra selecionada se ela sair do filtro
  useEffect(() => {
    if (filteredCourts.length > 0 && !filteredCourts.some(c => c.id === courtId)) {
      setCourtId(filteredCourts[0].id);
    }
  }, [filteredCourts, courtId]);

  const [refreshCount, setRefreshCount] = useState(0);

  // Auto-refresh silencioso da disponibilidade ao retornar para a aba ou desbloquear o celular
  useEffect(() => {
    let lastRefresh = Date.now();
    const handleRevalidate = () => {
      // NÃ£o recarrega se o atleta estiver no meio do pagamento Pix ou preenchendo o checkout
      if (pixOpen || drawerOpen) return;

      if (document.visibilityState === 'visible' && Date.now() - lastRefresh > 3000) {
        lastRefresh = Date.now();
        setRefreshCount(c => c + 1);
      }
    };

    document.addEventListener('visibilitychange', handleRevalidate);
    window.addEventListener('focus', handleRevalidate);
    return () => {
      document.removeEventListener('visibilitychange', handleRevalidate);
      window.removeEventListener('focus', handleRevalidate);
    };
  }, [pixOpen, drawerOpen]);

  // 4. Carregar Matriz de Disponibilidade de HorÃ¡rios com PreÃ§o EspecÃ­fico por Esporte
  useEffect(() => {
    if (!courtId || notFound || blockedMsg) return;
    const url = `${BACKEND_URL}/api/public/tenant/${slug}/disponibilidade?data=${dateISO}&quadra_id=${courtId}&esporte=${encodeURIComponent(selectedSport)}`;
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.quadras && data.quadras.length > 0) {
          const qData = data.quadras[0];
          const activeCourt = courts.find(c => c.id === courtId);
          const activeSport = selectedSport !== 'Todos' ? selectedSport : (activeCourt?.modalities?.[0] || 'Beach Tennis');

          const mappedSlots: Slot[] = qData.slots.map((s: { hora_inicio: string; hora_fim: string; preco: number; status: string }) => {
            const hInt = Number.parseInt(s.hora_inicio.split(':')[0], 10);
            const block = hInt < 12 ? 'manha' : hInt < 18 ? 'tarde' : 'noite';
            return {
              id: `${courtId}-${dateISO}-${s.hora_inicio}`,
              courtId: String(courtId),
              dateISO,
              start: s.hora_inicio,
              end: s.hora_fim,
              price: s.preco,
              status: s.status === 'disponivel' ? 'free' : s.status === 'passado' ? 'past' : 'busy',
              block,
              sport: activeSport
            };
          });
          setSlots(mappedSlots);
        }
      })
      .catch(err => console.error('Erro ao buscar disponibilidade:', err));
  }, [slug, courtId, dateISO, selectedSport, notFound, blockedMsg, refreshCount, courts]);

  const [sessionSport, setSessionSport] = useState<string | null>(null);
  const [pendingSlotForSport, setPendingSlotForSport] = useState<Slot | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<{
    type: 'court' | 'date' | 'sport';
    targetId?: string;
    targetIso?: string;
    targetSport?: string;
  } | null>(null);

  // â”€â”€â”€ BLOQUEIO DE SCROLL DE FUNDO QUANDO QUALQUER MODAL ESTIVER ABERTO â”€â”€â”€
  useEffect(() => {
    const isAnyModalOpen = loginOpen || profileOpen || myResOpen || drawerOpen || pixOpen || !!pendingSlotForSport || !!pendingNavigation;
    if (isAnyModalOpen) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [loginOpen, profileOpen, myResOpen, drawerOpen, pixOpen, pendingSlotForSport, pendingNavigation]);

  const court = useMemo(() => courts.find((c) => c.id === courtId) || courts[0], [courts, courtId]);

  // PreÃ§o efetivo da sessÃ£o/esporte para a quadra ativa
  const activeSessionSport = sessionSport || (selectedSport !== 'Todos' ? selectedSport : null);

  // Slots exibidos na grade com preÃ§o e modalidade 100% sincronizados em tempo real com o esporte da sessÃ£o
  const displaySlots = useMemo(() => {
    return slots.map(s => {
      let price = s.price;
      let sport = s.sport;
      if (activeSessionSport && court?.sportPricing) {
        const match = court.sportPricing.find(sp => sp.nome === activeSessionSport);
        if (match && match.preco > 0) {
          price = match.preco;
          sport = match.nome;
        }
      }
      return {
        ...s,
        price,
        sport: sport || activeSessionSport || 'Esporte'
      };
    });
  }, [slots, activeSessionSport, court]);

  // Executa troca efetiva de quadra
  const executeCourtChange = (newCourtId: string) => {
    const targetCourt = courts.find(c => c.id === newCourtId);
    const activeSport = sessionSport || (selectedSport !== 'Todos' ? selectedSport : null);

    if (targetCourt && activeSport) {
      const isSportSupported = (targetCourt.modalities || []).includes(activeSport);
      if (isSportSupported) {
        setSelectedSport(activeSport);
        setSessionSport(activeSport);
      } else {
        setSelectedSport('Todos');
        setSessionSport(null);
      }
    }

    setSelectedSlots([]);
    setCourtId(newCourtId);
  };

  // SeleÃ§Ã£o Inteligente de Quadra (com proteÃ§Ã£o para carrinho preenchido)
  const handleSelectCourt = (newCourtId: string) => {
    if (newCourtId === courtId) return;

    if (selectedSlots.length > 0) {
      setPendingNavigation({ type: 'court', targetId: newCourtId });
      return;
    }

    executeCourtChange(newCourtId);
  };

  // Executa troca efetiva de modalidade
  const executeSportChange = (sport: string) => {
    setSelectedSport(sport);
    setSessionSport(sport === 'Todos' ? null : sport);
    setSelectedSlots([]);
  };

  // SeleÃ§Ã£o de Modalidade na Barra Superior (com proteÃ§Ã£o)
  const handleSelectSport = (sport: string) => {
    if (sport === selectedSport) return;

    if (selectedSlots.length > 0) {
      setPendingNavigation({ type: 'sport', targetSport: sport });
      return;
    }

    executeSportChange(sport);
  };

  // SeleÃ§Ã£o de Data no Carrossel (com proteÃ§Ã£o)
  const handleSelectDate = (newIso: string) => {
    if (newIso === dateISO) return;

    if (selectedSlots.length > 0) {
      setPendingNavigation({ type: 'date', targetIso: newIso });
      return;
    }

    setSelectedSlots([]);
    setDateISO(newIso);
  };

  // Confirmar navegaÃ§Ã£o e limpar horÃ¡rios anteriores
  const handleConfirmNavigation = () => {
    if (!pendingNavigation) return;

    setSelectedSlots([]);

    if (pendingNavigation.type === 'court' && pendingNavigation.targetId) {
      executeCourtChange(pendingNavigation.targetId);
    } else if (pendingNavigation.type === 'date' && pendingNavigation.targetIso) {
      setDateISO(pendingNavigation.targetIso);
    } else if (pendingNavigation.type === 'sport' && pendingNavigation.targetSport) {
      executeSportChange(pendingNavigation.targetSport);
    }

    setPendingNavigation(null);
  };

  const step = drawerOpen ? 2 : pixOpen ? 3 : selectedSlots.length > 0 ? 1 : 0;
  const totalPrice = useMemo(() => selectedSlots.reduce((acc, s) => acc + s.price, 0), [selectedSlots]);

  // Escolha / Troca de Modalidade Esportiva
  const handleChooseSport = (sportName: string) => {
    setSessionSport(sportName);
    setSelectedSport(sportName);
    const sportPrice = court?.sportPricing?.find(sp => sp.nome === sportName)?.preco || court?.pricePerHour || 100;

    if (pendingSlotForSport) {
      const slotWithPrice: Slot = {
        ...pendingSlotForSport,
        price: sportPrice,
        sport: sportName
      };
      setSelectedSlots(prev => {
        const exists = prev.some(item => item.id === pendingSlotForSport.id);
        const next = exists 
          ? prev.map(item => item.id === pendingSlotForSport.id ? slotWithPrice : item)
          : [...prev, slotWithPrice];
        return next.map(item => ({ ...item, price: sportPrice, sport: sportName }));
      });
      setPendingSlotForSport(null);
    } else {
      // Atualiza preÃ§os dos horÃ¡rios jÃ¡ selecionados para o novo esporte
      setSelectedSlots(prev => prev.map(s => ({
        ...s,
        price: sportPrice,
        sport: sportName
      })));
    }
  };

  // SeleÃ§Ã£o MÃºltipla de HorÃ¡rios (Alternar entrada/saÃ­da do carrinho)
  const handleToggleSlot = (s: Slot) => {
    const exists = selectedSlots.some(item => item.id === s.id);
    if (exists) {
      setSelectedSlots(prev => {
        const next = prev.filter(item => item.id !== s.id);
        if (next.length === 0 && selectedSport === 'Todos') {
          setSessionSport(null);
        }
        return next;
      });
      return;
    }

    // Se um esporte jÃ¡ foi filtrado no topo
    if (selectedSport !== 'Todos') {
      const sportPrice = court?.sportPricing?.find(sp => sp.nome === selectedSport)?.preco || s.price;
      setSelectedSlots(prev => [...prev, { ...s, price: sportPrice, sport: selectedSport }]);
      return;
    }

    // Se estÃ¡ em "Todos"
    const isMultiSport = (court?.sportPricing && court.sportPricing.length > 1);
    if (!isMultiSport) {
      const singleSport = court?.sportPricing?.[0]?.nome || court?.modalities?.[0] || 'Beach Tennis';
      const singlePrice = court?.sportPricing?.[0]?.preco || s.price;
      setSelectedSlots(prev => [...prev, { ...s, price: singlePrice, sport: singleSport }]);
      return;
    }

    // Quadra multi-esporte em "Todos"
    if (sessionSport) {
      const sportPrice = court?.sportPricing?.find(sp => sp.nome === sessionSport)?.preco || s.price;
      setSelectedSlots(prev => [...prev, { ...s, price: sportPrice, sport: sessionSport }]);
    } else {
      // Abre o mini-modal de escolha rÃ¡pida de esporte
      setPendingSlotForSport(s);
    }
  };

  // AvanÃ§ar para o Checkout
  const handleProceedCheckout = () => {
    if (selectedSlots.length === 0) return;
    if (!athlete) {
      setLoginOpen(true);
    } else {
      setDrawerOpen(true);
    }
  };

  const handleAuthed = (user: { name: string; email: string; phone: string;  }) => {
    const userSession = { name: user.name, email: user.email, phone: user.phone };
    setAthlete(userSession);
    localStorage.setItem('athlete_profile', JSON.stringify(userSession));

    setLoginOpen(false);
  };

  const handleLogout = async () => {
    try { await logout(); } catch { window.alert('NÃ£o foi possÃ­vel encerrar a sessÃ£o. Tente novamente.'); return; }
    setAthlete(null);
    localStorage.removeItem('athlete_profile');
    setProfileOpen(false);
  };

  // Confirmar Agendamento de MÃºltiplos HorÃ¡rios via Backend Pix
  const handleConfirm = async (dataInput: { slots: Slot[]; name: string; phone: string; cpf: string; sport?: string }) => {
    try {
      const activeSport = dataInput.sport || sessionSport || (selectedSport !== 'Todos' ? selectedSport : (court?.modalities?.[0] || 'Beach Tennis'));
      const payloadItens = dataInput.slots.map(s => ({
        quadra_id: Number.parseInt(s.courtId, 10),
        data_reserva: s.dateISO,
        hora_inicio: s.start,
        hora_fim: s.end,
        preco: s.price,
        esporte: s.sport || activeSport
      }));

      const res = await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/agendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: dataInput.name,
          telefone: dataInput.phone,
          cpf: dataInput.cpf,
          email: athlete?.email || '',
          itens: payloadItens
        })
      });

      const resJson = await res.json();

      if (res.ok) {
        setPixPayload({
          copia_cola: resJson.copia_cola,
          qr_code: resJson.qr_code,
          reserva_id: resJson.reserva_id,
          reservas_ids: resJson.reservas_ids || (resJson.reserva_id ? [resJson.reserva_id] : []),
          valor_total: resJson.valor_total,
          expira_em_minutos: resJson.expira_em_minutos
        });

        const first = dataInput.slots[0];
        setReservation({
          courtId: first.courtId,
          courtName: court ? `${court.name} (${dataInput.slots.length} horÃ¡rios)` : 'MÃºltiplas Quadras',
          dateISO: first.dateISO,
          start: first.start,
          end: dataInput.slots[dataInput.slots.length - 1].end,
          price: resJson.valor_total,
          name: dataInput.name,
          phone: dataInput.phone,
          cpf: dataInput.cpf
        });

        setDrawerOpen(false);
        setPixOpen(true);
      } else {
        if (resJson.payment_not_configured) {
          setDrawerOpen(false);
          setPaymentNotConfigured({ telefone: resJson.telefone_arena || null });
        } else {
          alert(resJson.error || 'Erro ao realizar agendamento.');
        }
      }
    } catch {
      alert('Erro de conexÃ£o ao agendar. Tente novamente.');
    }
  };

  const handleCancelPending = async () => {
    if (pixPayload?.reserva_id || (pixPayload?.reservas_ids && pixPayload.reservas_ids.length > 0)) {
      try {
        await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/cancelar-pendente`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            reserva_id: pixPayload.reserva_id,
            reservas_ids: pixPayload.reservas_ids 
          })
        });
      } catch (err) {
        console.warn('Falha ao cancelar reserva pendente:', err);
      }
    }
  };

  const handlePixClose = () => {
    setPixOpen(false);
    setReservation(null);
    setSelectedSlots([]);
    setRefreshCount(c => c + 1);
  };

  const handlePayPending = async (reservaId: number) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/public/tenant/${slug}/reserva-pix/${reservaId}`);
      const data = await res.json();
      if (res.ok && data.reserva_id) {
        if (data.status_pagamento === 'Pago') {
          alert('Esta reserva jÃ¡ consta como Paga!');
          setRefreshCount(c => c + 1);
          return;
        }

        const formattedReservation: ReservationInput = {
          courtId: '0',
          courtName: data.quadra_nome || 'Quadra',
          dateISO: data.data_reserva,
          start: data.hora_inicio || '00:00',
          end: data.hora_fim || '00:00',
          price: data.valor_total || 0,
          name: athlete?.name || 'Atleta',
          phone: athlete?.phone || '',
          cpf: ''
        };

        setReservation(formattedReservation);
        setPixPayload({
          reserva_id: data.reserva_id,
          reservas_ids: [data.reserva_id],
          copia_cola: data.copia_cola,
          qr_code: data.qr_code,
          valor_total: data.valor_total,
          expira_em_minutos: data.expira_em_minutos || 15,
          expira_em_segundos: data.expira_em_segundos !== undefined ? data.expira_em_segundos : (data.expira_em_minutos || 15) * 60
        });
        setPixOpen(true);
      } else {
        alert(data.error || 'NÃ£o foi possÃ­vel reabrir a cobranÃ§a Pix desta reserva.');
      }
    } catch {
      alert('Falha ao conectar com o servidor para consultar o Pix.');
    }
  };

  // â”€â”€â”€ TELA 404 (SLUG INVÃLIDO OU ARENA NÃƒO ENCONTRADA) â”€â”€â”€
  if (notFound) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl mb-4">ðŸŸï¸</div>
        <h1 className="text-xl font-bold text-charcoal mb-2">Arena NÃ£o Encontrada (404)</h1>
        <p className="text-sm text-muted max-w-xs mb-6">
          O link acessado nÃ£o corresponde a nenhuma arena ativa em nossa plataforma. Verifique a URL e tente novamente.
        </p>
      </div>
    );
  }

  // â”€â”€â”€ TELA DE BLOQUEIO (ARENA SUSPENSA) â”€â”€â”€
  if (blockedMsg) {
    return (
      <div className="min-h-screen bg-[#18181b] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-3xl mb-4 text-red-500">ðŸ”’</div>
        <h2 className="text-xl font-bold mb-2 text-red-400">Agendamentos Suspensos</h2>
        <p className="text-sm text-gray-400 max-w-xs">{blockedMsg}</p>
      </div>
    );
  }

  if (loading || !arena) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-edge border-t-charcoal rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream max-w-md mx-auto relative">
      <ArenaHeader
        arena={arena}
        athlete={athlete}
        onMyReservations={() => setMyResOpen(true)}
        onMyProfile={() => setProfileOpen(true)}
        onLogin={() => setLoginOpen(true)}
      />

      <StepIndicator total={4} current={step} />

      <main className={selectedSlots.length > 0 ? 'pb-28' : 'pb-4'}>
        {courts.length > 0 && (
          <CourtSelector 
            courts={filteredCourts} 
            selectedId={courtId} 
            onSelect={handleSelectCourt} 
            selectedSport={selectedSport}
            availableSports={availableSports}
            onSelectSport={handleSelectSport}
          />
        )}
        <DateCarousel selectedISO={dateISO} onSelect={handleSelectDate} />

        <SlotGrid
          slots={displaySlots}
          selectedSlotIds={selectedSlots.map(s => s.id)}
          onSelect={handleToggleSlot}
          showPrice={selectedSport !== 'Todos' || !!sessionSport}
        />

        {/* RodapÃ© Elegante com Selo da Plataforma */}
        <footer className="mt-6 pt-4 pb-2 border-t border-edge/60 text-center px-4">
          <p className="text-[11px] text-muted/80 font-medium flex items-center justify-center gap-1.5">
            <ShieldCheck size={14} className="text-available-text shrink-0" />
            Agendamento garantido por <span className="font-bold text-charcoal">Arenix</span> Â· Sistema para Arenas
          </p>
        </footer>
      </main>

      {/* Modal de ConfirmaÃ§Ã£o de Troca com SeleÃ§Ã£o Ativa */}
      {pendingNavigation && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-charcoal/60 backdrop-blur-sm animate-fadeIn"
          role="presentation"
          onClick={() => setPendingNavigation(null)}
          onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setPendingNavigation(null); }}
        >
          <div 
            className="w-full max-w-sm bg-card rounded-3xl p-6 shadow-2xl border border-edge text-center animate-slideUp"
            role="dialog"
            aria-modal="true"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={26} />
            </div>

            <h3 className="text-base font-bold text-charcoal mb-1.5">
              {pendingNavigation.type === 'court' 
                ? 'Trocar de quadra?' 
                : pendingNavigation.type === 'date' 
                ? 'Trocar de data?' 
                : 'Trocar de modalidade?'}
            </h3>

            <p className="text-xs text-muted leading-relaxed mb-6">
              VocÃª jÃ¡ selecionou <strong className="text-charcoal font-semibold">{selectedSlots.length} {selectedSlots.length === 1 ? 'horÃ¡rio' : 'horÃ¡rios'}</strong>. 
              Mudar agora irÃ¡ limpar a sua seleÃ§Ã£o atual. Deseja continuar?
            </p>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConfirmNavigation}
                className="w-full py-3 rounded-2xl bg-charcoal text-white font-bold text-sm shadow-soft transition-all active:scale-[0.98]"
              >
                Trocar e limpar seleÃ§Ã£o
              </button>

              <button
                type="button"
                onClick={() => setPendingNavigation(null)}
                className="w-full py-2.5 rounded-2xl text-xs font-semibold text-muted hover:text-charcoal transition-colors"
              >
                Manter meus horÃ¡rios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mini-Modal de Escolha RÃ¡pida de Esporte (OpÃ§Ã£o 1) */}
      {pendingSlotForSport && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-charcoal/50 backdrop-blur-sm animate-fadeIn"
          role="presentation"
          onClick={() => setPendingSlotForSport(null)}
          onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') setPendingSlotForSport(null); }}
        >
          <div 
            className="w-full max-w-md bg-card rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-edge animate-slideUp"
            role="dialog"
            aria-modal="true"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-charcoal">Qual esporte vocÃª vai jogar?</h3>
                <p className="text-xs text-muted mt-0.5">
                  {court?.name} Â· {pendingSlotForSport.start} Ã s {pendingSlotForSport.end}
                </p>
              </div>
              <button
                onClick={() => setPendingSlotForSport(null)}
                className="tap -mr-2 text-muted hover:text-charcoal p-2"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-2 mb-2">
              {(court?.sportPricing || []).map((sp) => (
                <button
                  key={sp.nome}
                  type="button"
                  onClick={() => handleChooseSport(sp.nome)}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-edge bg-surface hover:bg-edge/30 transition-all active:scale-[0.98]"
                >
                  <span className="font-semibold text-sm text-charcoal">{sp.nome}</span>
                  <span className="font-bold text-sm text-available-text">{brl(sp.preco)}/h</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Barra Inferior Flutuante (Sticky Bottom Bar do Carrinho) */}
      {selectedSlots.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-edge p-4 max-w-md mx-auto shadow-sheet animate-slideUp">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-available-bg text-available-text flex items-center justify-center font-bold">
                <ShoppingBag size={20} />
              </div>
              <div>
                <span className="text-xs font-bold text-muted block">
                  {selectedSlots.length} {selectedSlots.length === 1 ? 'horÃ¡rio selecionado' : 'horÃ¡rios selecionados'}
                </span>
                <span className="text-base font-bold text-available-text">
                  {brl(totalPrice)}
                </span>
              </div>
            </div>

            <button
              onClick={handleProceedCheckout}
              className="tap flex items-center gap-2 bg-available-text text-white font-bold px-5 h-12 rounded-2xl shadow-soft active:scale-[0.98] transition text-sm"
            >
              AvanÃ§ar
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Modal de Login / Cadastro do Atleta */}
      {loginOpen && (
        <LoginScreen
          arena={arena!}
          slug={slug}
          onAuthed={handleAuthed}
          onClose={() => setLoginOpen(false)}
          onGuestCheckout={() => {
            setLoginOpen(false);
            setDrawerOpen(true);
          }}
        />
      )}

      {/* Modal: Arena sem pagamento online configurado - Direcionamento WhatsApp */}
      {paymentNotConfigured && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
          style={{ background: 'rgba(15, 13, 11, 0.65)', backdropFilter: 'blur(8px)' }}
        >
          <div 
            className="bg-white w-full sm:max-w-md rounded-t-[32px] sm:rounded-[32px] shadow-2xl p-6 sm:p-7 border border-black/5 animate-slideUp sm:animate-scaleIn flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
          >
            {/* Top Bar / Fechar */}
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[11px] font-semibold tracking-wide uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Atendimento Direto
              </div>
              <button 
                onClick={() => setPaymentNotConfigured(null)}
                className="w-8 h-8 rounded-full bg-surface text-charcoal/70 hover:text-charcoal flex items-center justify-center transition tap"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            {/* Header com Ãcone e TÃ­tulo */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[#25D366] flex items-center justify-center shrink-0 shadow-xs">
                <MessageCircle size={24} className="fill-[#25D366]/20 stroke-[#1eb854] stroke-[2.2]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-charcoal tracking-tight leading-snug">
                  Reserva via WhatsApp
                </h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Esta arena confirma os agendamentos diretamente pela recepÃ§Ã£o no WhatsApp.
                </p>
              </div>
            </div>

            {/* Card com Detalhes da Arena e dos HorÃ¡rios Selecionados */}
            <div className="p-4 rounded-2xl bg-[#faf8f5] border border-edge flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-charcoal text-sm block">{arena?.nome || 'Arena'}</span>
                  {arena?.endereco && (
                    <span className="text-[11px] text-muted flex items-center gap-1 mt-0.5">
                      <MapPin size={11} className="shrink-0 text-muted/70" />
                      <span className="truncate max-w-[220px]">{arena.endereco}</span>
                    </span>
                  )}
                </div>
                {selectedSlots.length > 0 && (
                  <span className="px-2.5 py-1 rounded-lg bg-white border border-edge text-[11px] font-bold text-charcoal shadow-xs">
                    {selectedSlots.length} {selectedSlots.length === 1 ? 'horÃ¡rio' : 'horÃ¡rios'}
                  </span>
                )}
              </div>

              {selectedSlots.length > 0 && (
                <div className="pt-2 border-t border-edge/80 flex flex-col gap-1.5 text-xs">
                  {selectedSlots.map((s, idx) => {
                    const c = courts.find(courtItem => courtItem.id === s.courtId);
                    return (
                      <div key={idx} className="flex items-center justify-between text-[11.5px] text-charcoal/80">
                        <span>
                          <strong>{formatShortDate(s.dateISO)}</strong> Â· {s.start} Ã s {s.end}
                          {c && <span className="text-muted ml-1">({c.name})</span>}
                        </span>
                        <span className="font-semibold text-charcoal">{brl(s.price)}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between pt-1.5 font-bold text-xs text-charcoal border-t border-dashed border-edge">
                    <span>Total Previsto</span>
                    <span>{brl(selectedSlots.reduce((acc, s) => acc + s.price, 0))}</span>
                  </div>
                </div>
              )}
            </div>

            {/* BotÃµes de AÃ§Ã£o */}
            <div className="flex flex-col gap-2.5 pt-1">
              {(() => {
                const rawPhone = paymentNotConfigured.telefone || arena?.telefone || '';
                const cleanDigits = rawPhone.replace(/\D/g, '');
                const fullPhone = cleanDigits.length === 10 || cleanDigits.length === 11 ? `55${cleanDigits}` : cleanDigits;
                const activeSport = sessionSport || (selectedSport !== 'Todos' ? selectedSport : undefined);
                const rawMsg = buildWhatsAppReservationMessage(
                  arena?.nome || 'Arena',
                  selectedSlots,
                  courts,
                  activeSport,
                  athlete?.name
                );
                const textMsg = encodeURIComponent(rawMsg);
                const waUrl = fullPhone ? `https://api.whatsapp.com/send?phone=${fullPhone}&text=${textMsg}` : '#';

                return (
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tap w-full h-12 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 active:scale-[0.98] transition cursor-pointer"
                  >
                    <MessageCircle size={18} className="fill-white stroke-white" />
                    <span>Chamar no WhatsApp</span>
                    <ExternalLink size={14} className="opacity-75 ml-0.5" />
                  </a>
                );
              })()}

              <button
                onClick={() => setPaymentNotConfigured(null)}
                className="w-full py-2 text-xs font-semibold text-muted hover:text-charcoal transition text-center"
              >
                Voltar para os horÃ¡rios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Perfil do Atleta */}
      {athlete && (
        <MyProfileModal
          slug={slug}
          athlete={athlete}
          open={profileOpen}
          onClose={() => setProfileOpen(false)}
          onLogout={handleLogout}
          onUpdate={(updated) => {
            setAthlete(prev => {
              if (!prev) return prev;
              const next = { ...prev, name: updated.name, phone: updated.phone };
              localStorage.setItem('athlete_profile', JSON.stringify(next));
              return next;
            });
          }}
        />
      )}

      <CheckoutDrawer
        open={drawerOpen}
        slots={selectedSlots}
        court={court}
        selectedSport={sessionSport || (selectedSport !== 'Todos' ? selectedSport : undefined)}
        onSportChange={handleChooseSport}
        initialName={athlete?.name || ''}
        initialPhone={athlete?.phone || ''}
        onClose={() => setDrawerOpen(false)}
        onConfirm={handleConfirm}
      />

      <PixModal
        open={pixOpen}
        slug={slug}
        data={reservation}
        pixPayload={pixPayload}
        onClose={handlePixClose}
        onCancelPending={handleCancelPending}
      />

      <MyReservations
        slug={slug}
        athlete={athlete}
        open={myResOpen}
        onClose={() => setMyResOpen(false)}
        onPayPending={handlePayPending}
      />
    </div>
  );
}
