const { cents, httpError } = require('./security');
function modalities(court) {
  if (!court) throw httpError(404, 'Quadra indisponível.');
  let entries;
  try { entries = typeof court.modalidades === 'string' ? JSON.parse(court.modalidades) : court.modalidades; }
  catch { throw httpError(409, 'A arena precisa corrigir as modalidades da quadra.'); }
  if (entries == null) entries = [court.tipo || 'Geral'];
  if (!Array.isArray(entries) || !entries.length) throw httpError(409, 'Quadra sem modalidades configuradas.');
  return entries.map(entry => {
    const name = typeof entry === 'string' ? entry : entry?.nome;
    if (typeof name !== 'string' || !name.trim()) throw httpError(409, 'Modalidade inválida na quadra.');
    return { nome: name, preco: typeof entry === 'object' && entry.preco != null ? entry.preco : court.preco_base };
  });
}
function selectedSport(court, sport) {
  const entries = modalities(court);
  const selected = sport === undefined || sport === '' ? entries[0] : entries.find(entry => entry.nome === sport);
  if (!selected) throw httpError(400, 'Esporte não disponível nesta quadra.');
  return selected;
}
// Existing product prices are hourly; public slots are normally 60 minutes.
function getReservationPrice(court, sport) { return selectedSport(court, sport).preco; }
function quoteSlot(court, item) {
  const selected = selectedSport(court, item.esporte);
  const minutes = timeMinutes(item.hora_fim) - timeMinutes(item.hora_inicio);
  if (minutes <= 0) throw httpError(400, 'Duração inválida.');
  const amount = Math.round(selected.preco * minutes / 60);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw httpError(400, 'Preço inválido.');
  return { sport: selected.nome, amount, minutes };
}
function timeMinutes(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw httpError(400, 'Horário inválido.');
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
module.exports = { getReservationPrice, quoteSlot, modalities, timeMinutes };
