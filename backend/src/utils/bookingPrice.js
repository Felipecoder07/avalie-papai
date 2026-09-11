function getReservationPrice(quadra, esporteItem) {
  let precoItem = (quadra && typeof quadra.preco_base === 'number' && quadra.preco_base > 0) ? quadra.preco_base : 80.0;
  

  if (quadra && quadra.modalidades) {
    try {
      const parsed = typeof quadra.modalidades === 'string' ? JSON.parse(quadra.modalidades) : quadra.modalidades;
      if (Array.isArray(parsed)) {
        const match = parsed.find(m => (typeof m === 'object' ? m.nome : m) === esporteItem);
        if (match && typeof match === 'object' && match.preco != null && Number(match.preco) > 0) {
          precoItem = Number(match.preco);
        }
      }
    } catch {
      // Ignorar parsing
    }
  }

  return precoItem;
}

module.exports = { getReservationPrice };
