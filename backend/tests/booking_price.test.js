const { getReservationPrice, modalities } = require('../src/utils/bookingPrice');

describe('Preço de reservas públicas', () => {
  it.each([
    [{ preco_base: 120, modalidades: [] }, 'Geral', 120],
    [{ preco_base: 100, modalidades: ['Vôlei'] }, 'Vôlei', 100],
    [{ preco_base: 100, modalidades: [{ nome: 'Vôlei', preco: 140 }] }, 'Vôlei', 140],
    [{ preco_base: 100, modalidades: '[{"nome":"Vôlei","preco":150}]' }, 'Vôlei', 150],
    [{ preco_base: 100, modalidades: [{ nome: 'Vôlei', preco: 0 }] }, 'Vôlei', 0]
  ])('preserva preço base, modalidade e fallback (%j, %s)', (court, sport, expected) => {
    // If empty modalities array, it uses [court.tipo || 'Geral']
    if (court.modalidades.length === 0) {
      delete court.modalidades; // simulate missing
    }
    expect(getReservationPrice(court, sport)).toBe(expected);
  });

  it('Lança erro se a quadra não existir', () => {
    expect(() => getReservationPrice(null, 'Geral')).toThrow('Quadra indisponível');
  });

  it('Lança erro se o JSON de modalidades for inválido', () => {
    expect(() => getReservationPrice({ preco_base: 100, modalidades: '[invalid' }, 'Vôlei')).toThrow('A arena precisa corrigir as modalidades da quadra.');
  });

  it('Lança erro se o esporte não estiver disponível na quadra', () => {
    expect(() => getReservationPrice({ preco_base: 100, modalidades: [{ nome: 'Vôlei', preco: 140 }] }, 'Futebol')).toThrow('Esporte não disponível nesta quadra.');
  });
});
