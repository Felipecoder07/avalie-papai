const { getReservationPrice } = require('../src/utils/bookingPrice');

describe('Preço de reservas públicas', () => {
  it.each([
    [null, 'Geral', 80],
    [{ preco_base: 0 }, 'Geral', 80],
    [{ preco_base: '120' }, 'Geral', 80],
    [{ preco_base: 120 }, 'Geral', 120],
    [{ preco_base: 100, modalidades: '[invalid' }, 'Vôlei', 100],
    [{ preco_base: 100, modalidades: ['Vôlei'] }, 'Vôlei', 100],
    [{ preco_base: 100, modalidades: [{ nome: 'Vôlei', preco: 140 }] }, 'Vôlei', 140],
    [{ preco_base: 100, modalidades: '[{"nome":"Vôlei","preco":"150"}]' }, 'Vôlei', 150],
    [{ preco_base: 100, modalidades: [{ nome: 'Vôlei', preco: 140 }] }, 'Futebol', 100],
    [{ preco_base: 100, modalidades: [{ nome: 'Vôlei', preco: 0 }] }, 'Vôlei', 100]
  ])('preserva preço base, modalidade e fallback (%j, %s)', (court, sport, expected) => {
    expect(getReservationPrice(court, sport)).toBe(expected);
  });
});
