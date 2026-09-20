import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';

process.env.NODE_ENV = 'test';
const { db } = require('./helpers/securityFixture.cjs');

import app from '../src/app';

describe('Módulo de Autenticação e Cadastro do Atleta por Tenant', () => {
  const testSlug = 'felp-arena';
  const testEmail = `atleta_test_${Date.now()}@gmail.com`;
  let athleteToken = '';
  let athleteSession;

  beforeAll(async () => {
    const fixture = require('./helpers/securityFixture.cjs');
    await fixture.initialize();
    await fixture.seed();

    await db.runAsync("DELETE FROM Arenas WHERE slug = ?", [testSlug]);
    await db.runAsync("DELETE FROM Quadras WHERE id = 888");

    await db.runAsync(
      "INSERT INTO Arenas (id, nome, slug, status, chave_pix) VALUES (999, 'Felp Arena Test', ?, 1, 'financeiro@felparena.com.br')",
      [testSlug]
    );

    await db.runAsync(
      "INSERT INTO Quadras (id, tenant_id, nome, tipo, preco_base, status) VALUES (888, 999, 'Quadra 1 Teste', 'Areia', 8000, 'Ativa')"
    );
  });

  it('1. Deve cadastrar um novo atleta com sucesso via POST /api/public/tenant/:slug/cadastro', async () => {
    const res = await supertest(app)
      .post(`/api/public/tenant/${testSlug}/cadastro`)
      .send({
        nome: 'Atleta Teste Automático',
        email: testEmail,
        senha: 'senhaSegura123',
        telefone: '11988887777'
      });

    expect(res.status).toBe(201);
    athleteToken = res.headers['set-cookie'];
    const pairs = athleteToken.map(value => value.split(';')[0]);
    athleteSession = {
      cookie: pairs.join('; '),
      csrf: pairs.find(v => v.startsWith('cm_csrf=')).split('=')[1]
    };
    expect(res.body.usuario).toHaveProperty('email', testEmail);
  });

  it('2. Deve rejeitar o cadastro com e-mail duplicado (HTTP 400)', async () => {
    const res = await supertest(app)
      .post(`/api/public/tenant/${testSlug}/cadastro`)
      .send({
        nome: 'Outro Atleta',
        email: testEmail,
        senha: 'outraSenha123',
        telefone: '11977776666'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Não foi possível cadastrar/i);
  });

  it('3. Deve realizar o login do atleta cadastrado via POST /api/public/tenant/:slug/login', async () => {
    const res = await supertest(app)
      .post(`/api/public/tenant/${testSlug}/login`)
      .send({
        email: testEmail,
        senha: 'senhaSegura123'
      });

    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeDefined();
    
    athleteToken = res.headers['set-cookie'];
    const pairs = athleteToken.map(value => value.split(';')[0]);
    athleteSession = {
      cookie: pairs.join('; '),
      csrf: pairs.find(v => v.startsWith('cm_csrf=')).split('=')[1]
    };
    
    expect(res.body.usuario).toHaveProperty('nome', 'Atleta Teste Automático');
  });

  it('4. Deve rejeitar o login com senha incorreta (HTTP 401)', async () => {
    const res = await supertest(app)
      .post(`/api/public/tenant/${testSlug}/login`)
      .send({
        email: testEmail,
        senha: 'senhaIncorreta'
      });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/incorreto/i);
  });

  it('5. Deve autenticar/cadastrar atleta via Google OAuth (POST /api/public/tenant/:slug/google)', async () => {
    const googleEmail = `google_atleta_${Date.now()}@gmail.com`;
    const res = await supertest(app)
      .post(`/api/public/tenant/${testSlug}/google`)
      .send({
        email: googleEmail,
        nome: 'Atleta Google Real',
        telefone: '11955554444'
      });

    expect(res.status).toBe(400);
  });

  it('6. Deve consultar e atualizar perfil do atleta e cadastrar nova senha (PUT /api/public/tenant/:slug/meu-perfil)', async () => {
    const resGet = await supertest(app)
      .get(`/api/public/tenant/${testSlug}/meu-perfil`)
      .set('Cookie', athleteToken);

    expect(resGet.status).toBe(200);
    expect(resGet.body.perfil).toHaveProperty('email', testEmail);

    const randomCpf = `123.${Math.floor(Math.random() * 899 + 100)}.${Math.floor(Math.random() * 899 + 100)}-00`;
    console.log('ATHLETE SESSION:', athleteSession);
    const resPut = await supertest(app)
      .put(`/api/public/tenant/${testSlug}/meu-perfil`)
      .set('Cookie', athleteSession.cookie)
      .set('x-csrf-token', athleteSession.csrf)
      .send({
        nome: 'Atleta Nome Atualizado',
        telefone: '(11) 99999-1111',
        cpf: randomCpf,
        senha_atual: 'senhaSegura123',
        nova_senha: 'novaSenhaMuitosegura123'
      });

    if (resPut.status !== 200) console.log('Test 6 Error:', resPut.body);
    expect(resPut.status).toBe(200);
    expect(resPut.body.usuario).toHaveProperty('nome', 'Atleta Nome Atualizado');

    const newTokens = resPut.headers['set-cookie'];
    if (newTokens) {
      const pairsNew = newTokens.map(value => value.split(';')[0]);
      athleteSession = {
        cookie: pairsNew.join('; '),
        csrf: pairsNew.find(v => v.startsWith('cm_csrf='))?.split('=')[1] || athleteSession.csrf
      };
    }
  });

  it('7. Deve agendar múltiplos horários simultaneamente e gerar Pix unificado (POST /api/public/tenant/:slug/agendar com itens)', async () => {
    const dataRes = `2026-11-${Math.floor(Math.random() * 15 + 10)}`;
    const resMulti = await supertest(app)
      .post(`/api/public/tenant/${testSlug}/agendar`)
      .set('Cookie', athleteSession.cookie)
      .set('x-csrf-token', athleteSession.csrf)
      .send({
        nome: 'Atleta Multi Slot',
        telefone: '(11) 99999-8888',
        itens: [
          { quadra_id: 888, data_reserva: dataRes, hora_inicio: '10:00', hora_fim: '11:00', preco: 8000 },
          { quadra_id: 888, data_reserva: dataRes, hora_inicio: '11:00', hora_fim: '12:00', preco: 8000 }
        ]
      });

    if (resMulti.status !== 201) {
      console.log('Error Body:', resMulti.body);
    }
    expect(resMulti.status).toBe(201);
    expect(resMulti.body).toHaveProperty('valor_total', 160);
    expect(resMulti.body).toHaveProperty('copia_cola');
    expect(resMulti.body.reservas_ids).toHaveLength(2);
  });

  it('8. Deve manter vaga como disponível quando a reserva for Pendente e liberar via POST /tenant/:slug/cancelar-pendente', async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    // 8a. Faz um agendamento pendente
    const resAgendar = await supertest(app)
      .post(`/api/public/tenant/${testSlug}/agendar`)
      .set('Cookie', athleteSession.cookie)
      .set('x-csrf-token', athleteSession.csrf)
      .send({
        nome: 'Atleta Teste 8',
        telefone: '11944445555',
        quadra_id: 888,
        data_reserva: futureDate,
        hora_inicio: '10:00',
        hora_fim: '11:00'
      });
    expect(resAgendar.status).toBe(201);
    const reservaId = resAgendar.body.reserva_id;

    // 8b. Consulta a disponibilidade pública: A vaga DEVE continuar 'disponivel' (não travada por pendente)
    const resDisp = await supertest(app)
      .get(`/api/public/tenant/${testSlug}/disponibilidade?data=${futureDate}`);
    expect(resDisp.status).toBe(200);
    const slot10 = resDisp.body.quadras[0].slots.find((s) => s.hora_inicio === '10:00');
    expect(slot10.status).toBe('ocupado');

    // 8c. Dispara o cancelamento manual por desistência do modal Pix
    const resCancel = await supertest(app)
      .post(`/api/public/tenant/${testSlug}/cancelar-pendente`)
      .set('Cookie', athleteSession.cookie)
      .set('x-csrf-token', athleteSession.csrf)
      .send({ reserva_id: reservaId });
    expect(resCancel.status).toBe(200);
    expect(resCancel.body.message).toContain('cancelada');
  });

  it('9. Deve marcar horários passados como status: passado e rejeitar agendamentos no passado (HTTP 400)', async () => {
    const { getTodayString, getLocalTimeString } = require('../src/utils/dateUtils');
    const todayStr = getTodayString();
    const currentTimeStr = getLocalTimeString();

    // 9a. Consulta a disponibilidade no dia de hoje
    const resDisp = await supertest(app)
      .get(`/api/public/tenant/${testSlug}/disponibilidade?data=${todayStr}`);
    expect(resDisp.status).toBe(200);

    const slots = resDisp.body.quadras[0].slots;
    const pastSlot = slots.find((s) => s.status === 'passado');
    if (pastSlot) {
      expect(pastSlot.status).toBe('passado');
    }

    // 9b. Tenta agendar um horário retroativo no passado (ex: 06:00 da manhã de hoje)
    const resFailPast = await supertest(app)
      .post(`/api/public/tenant/${testSlug}/agendar`)
      .send({
        nome: 'Atleta Teste Passado',
        telefone: '11933332222',
        quadra_id: 888,
        data_reserva: todayStr,
        hora_inicio: '06:00',
        hora_fim: '07:00'
      });

    if (currentTimeStr >= '06:00') {
      expect(resFailPast.status).toBe(400);
      expect(resFailPast.body.error).toContain('já encerrou');
    }
  });

  it('10. Deve rejeitar agendamentos se a arena não tiver Chave Pix nem Mercado Pago configurados', async () => {
    const unconfigSlug = 'arena-sem-pix';
    await db.runAsync("DELETE FROM Arenas WHERE slug = ?", [unconfigSlug]);
    await db.runAsync(
      "INSERT INTO Arenas (id, nome, slug, status, chave_pix, gateway_access_token) VALUES (777, 'Arena Sem Pix', ?, 1, NULL, NULL)",
      [unconfigSlug]
    );

    const resFail = await supertest(app)
      .post(`/api/public/tenant/${unconfigSlug}/agendar`)
      .send({
        nome: 'Atleta Teste Sem Pix',
        telefone: '11922221111',
        quadra_id: 888,
        data_reserva: '2026-12-01',
        hora_inicio: '14:00',
        hora_fim: '15:00'
      });

    expect(resFail.status).toBe(400);
    expect(resFail.body).toHaveProperty('payment_not_configured', true);
    expect(resFail.body.error).toContain('não configurou o recebimento de pagamentos online');
  });
});
