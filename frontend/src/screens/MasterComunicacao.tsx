import { useCallback } from 'react';
import type { SaaSArena, Announcement } from '../types/api';
import { apiFetch as fetch } from '../utils/apiFetch';
import { useState, useEffect } from 'react';
import { Send, Megaphone, Trash2, Calendar } from 'lucide-react';
import { Card, Badge, Button, PageHeader, Field, Input, Select, Textarea, ConfirmModal, EmptyState } from '../components/ui';
import { formatDate } from '../data/mock';

export function MasterComunicacao() {
  const [arenas, setArenas] = useState<SaaSArena[]>([]);
  const [banners, setBanners] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // Notificação individual
  const [targetArena, setTargetArena] = useState('');
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<'email' | 'alerta'>('alerta');
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Broadcast
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastChannel, setBroadcastChannel] = useState<'email' | 'alerta'>('email');
  const [broadcastWhen, setBroadcastWhen] = useState<'now' | 'later'>('now');
  const [broadcastAt, setBroadcastAt] = useState('');
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [broadcastErrorMsg, setBroadcastErrorMsg] = useState('');

  // Remoção
  const [removeBanner, setRemoveBanner] = useState<number | null>(null);

  const fetchDados = useCallback(async () => {
    try {
      const headers = {};

      const [arenasRes, BannersRes] = await Promise.all([
        fetch('/api/saas/arenas', { headers }).then(r => r.json()),
        fetch('/api/saas/comunicados', { headers }).then(r => r.json())
      ]);

      setArenas(Array.isArray(arenasRes) ? arenasRes : []);
      setBanners(Array.isArray(BannersRes) ? BannersRes : []);

      if (Array.isArray(arenasRes) && arenasRes.length > 0) {
        setTargetArena(current => current || String(arenasRes[0].id));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [] );

  useEffect(() => {
    fetchDados();
  }, [fetchDados]);

  const handleSendIndividual = async () => {
    if (!message.trim() || !targetArena) return;
    setErrorMsg('');
    setSent(false);
    try {
      const res = await fetch('/api/saas/comunicados', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          audience: targetArena,
          channel
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSent(true);
        setMessage('');
        fetchDados();
        setTimeout(() => setSent(false), 2500);
      } else {
        setErrorMsg(data.error || 'Erro ao enviar notificação.');
      }
    } catch (e) {
      console.error(e);
      setErrorMsg('Falha de rede ao conectar com o servidor.');
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setBroadcastErrorMsg('');
    setBroadcastSent(false);
    try {
      
      // Define a data de expiração (se for agendado para depois, expira 7 dias após o agendamento)
      let expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      if (broadcastWhen === 'later' && broadcastAt) {
        expiresAt = new Date(new Date(broadcastAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }

      const res = await fetch('/api/saas/comunicados', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: broadcastMsg,
          audience: 'all',
          channel: broadcastChannel,
          expiresAt
        })
      });

      const data = await res.json();
      if (res.ok) {
        setBroadcastSent(true);
        setBroadcastMsg('');
        setBroadcastAt('');
        fetchDados();
        setTimeout(() => setBroadcastSent(false), 2500);
      } else {
        setBroadcastErrorMsg(data.error || 'Erro ao enviar broadcast.');
      }
    } catch (e) {
      console.error(e);
      setBroadcastErrorMsg('Falha de rede ao conectar com o servidor.');
    }
  };

  const handleRemoveBanner = async () => {
    if (!removeBanner) return;
    try {
      const res = await fetch(`/api/saas/comunicados/${removeBanner}`, {
        method: 'DELETE',
        headers: {}
      });
      if (res.ok) {
        fetchDados();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRemoveBanner(null);
    }
  };

  if (loading) return <div className="p-8 text-center text-charcoal animate-pulse">Carregando painel de comunicação...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Comunicação" description="Envie notificações e broadcasts para as arenas da plataforma." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Single arena */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Send size={15} className="text-muted" />
            <h3 className="text-sm font-semibold">Notificação para uma arena</h3>
          </div>
          <div className="space-y-4">
            {errorMsg && (
              <div className="login-error-alert" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{errorMsg}</span>
              </div>
            )}

            <Field label="Arena de destino">
              <Select value={targetArena} onChange={(e) => { setTargetArena(e.target.value); setErrorMsg(''); }}>
                {arenas.map((a) => <option key={a.id} value={String(a.id)}>{a.nome}</option>)}
              </Select>
            </Field>
            <Field label="Canal">
              <Select value={channel} onChange={(e) => { setChannel(e.target.value === 'email' ? 'email' : 'alerta'); setErrorMsg(''); }}>
                <option value="alerta">Alerta interno no sistema</option>
                <option value="email">E-mail</option>
              </Select>
            </Field>
            <Field label="Mensagem">
              <Textarea rows={4} value={message} onChange={(e) => { setMessage(e.target.value); setErrorMsg(''); }} placeholder="Digite a mensagem que a arena verá..." />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setMessage(''); setErrorMsg(''); }}>Limpar</Button>
              <Button variant="primary" disabled={!message.trim()} onClick={handleSendIndividual}>
                <Send size={14} /> Enviar
              </Button>
            </div>
            {sent && <p className="text-xs text-success text-right animate-fade-in">Notificação enviada.</p>}
          </div>
        </Card>

        {/* Broadcast */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone size={15} className="text-muted" />
            <h3 className="text-sm font-semibold">Broadcast para todas as arenas</h3>
          </div>
          <div className="space-y-4">
            {broadcastErrorMsg && (
              <div className="login-error-alert" role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{broadcastErrorMsg}</span>
              </div>
            )}

            <Field label="Canal">
              <Select value={broadcastChannel} onChange={(e) => { setBroadcastChannel(e.target.value === 'email' ? 'email' : 'alerta'); setBroadcastErrorMsg(''); }}>
                <option value="email">E-mail</option>
                <option value="alerta">Alerta interno no sistema</option>
              </Select>
            </Field>
            <Field label="Quando enviar">
              <Select value={broadcastWhen} onChange={(e) => { setBroadcastWhen(e.target.value === 'later' ? 'later' : 'now'); setBroadcastErrorMsg(''); }}>
                <option value="now">Disparar imediatamente</option>
                <option value="later">Agendar para depois</option>
              </Select>
            </Field>
            {broadcastWhen === 'later' && (
              <Field label="Data e hora do envio">
                <Input type="datetime-local" value={broadcastAt} onChange={(e) => { setBroadcastAt(e.target.value); setBroadcastErrorMsg(''); }} />
              </Field>
            )}
            <Field label="Mensagem">
              <Textarea rows={4} value={broadcastMsg} onChange={(e) => { setBroadcastMsg(e.target.value); setBroadcastErrorMsg(''); }} placeholder="Mensagem que todas as arenas verão..." />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setBroadcastMsg(''); setBroadcastAt(''); setBroadcastErrorMsg(''); }}>Limpar</Button>
              <Button variant="primary" disabled={!broadcastMsg.trim()} onClick={handleSendBroadcast}>
                <Calendar size={14} /> {broadcastWhen === 'now' ? 'Disparar agora' : 'Agendar envio'}
              </Button>
            </div>
            {broadcastSent && <p className="text-xs text-success text-right animate-fade-in">Broadcast disparado.</p>}
          </div>
        </Card>
      </div>

      {/* Active banners */}
      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b border-border-passive flex items-center justify-between">
          <h3 className="text-sm font-semibold">Banners e avisos ativos</h3>
          <Badge status="neutral">{banners.length} ativos</Badge>
        </div>
        {banners.length === 0 ? (
          <EmptyState message="Nenhum banner ativo no momento." />
        ) : (
          <ul className="divide-y divide-border-passive">
            {banners.map((b) => (
              <li key={b.id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-charcoal">{b.message}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted">
                    <span>Para: <strong className="text-charcoal/80">{b.audienceLabel}</strong></span>
                    <span>·</span>
                    <span>Canal: <span className="capitalize">{b.channel}</span></span>
                    <span>·</span>
                    <span>Criado: {formatDate(b.createdAt)}</span>
                    <span>·</span>
                    <span>Expira: {formatDate(b.expiresAt)}</span>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setRemoveBanner(b.id)} className="text-danger hover:bg-danger-soft shrink-0">
                  <Trash2 size={13} /> Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmModal open={!!removeBanner} onClose={() => setRemoveBanner(null)} onConfirm={handleRemoveBanner}
        title="Remover banner" destructive confirmLabel="Remover agora"
        message="O banner será removido imediatamente, antes da expiração programada."
      />
    </div>
  );
}
