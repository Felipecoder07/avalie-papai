import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../utils/apiFetch';

export function PortalNovaReserva() {
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiFetch('/api/auth/me').then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (data.usuario?.perfil === 'Cliente' && typeof data.usuario.arena_slug === 'string') setSlug(data.usuario.arena_slug);
    }).catch(() => setSlug('')).finally(() => setLoading(false));
  }, []);
  const origin = import.meta.env.DEV ? window.location.protocol + '//' + window.location.hostname + ':5176' : window.location.origin;
  return <main className="max-w-xl mx-auto p-8">
    <h1>Nova reserva</h1>
    <p>Escolha horários e conclua seu pagamento no portal de reservas da arena.</p>
    {loading ? <p>Carregando arena…</p> : slug
      ? <a className="btn-primary" href={origin + '/arena/' + encodeURIComponent(slug)}>Abrir reservas da arena</a>
      : <p>Abra o link público da arena em que deseja jogar para fazer sua reserva.</p>}
    <p><Link to="/portal">Voltar às minhas reservas</Link></p>
  </main>;
}
