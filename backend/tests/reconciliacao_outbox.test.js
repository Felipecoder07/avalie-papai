const fixture = require('./helpers/securityFixture.cjs');
const { db } = fixture;
const { processarOutbox } = require('../src/jobs/reconciliacaoOutbox');
const { settle } = require('../src/services/paymentLedgerService');

let provider;

beforeAll(fixture.initialize);
beforeEach(async () => {
  await fixture.seed();
  await db.runAsync('DELETE FROM LogsAuditoria');
  await db.runAsync("UPDATE Arenas SET gateway_access_token='FIXTURE-ARENA-TOKEN',gateway_user_id='123' WHERE id=1");
  provider = vi.fn().mockRejectedValue(new Error('Unexpected provider call'));
  vi.stubGlobal('fetch', provider);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(fixture.close);

async function seedPayment(state = 'unknown') {
  await db.runAsync("INSERT INTO TransacoesGateway(reserva_id,gateway_ref,metodo,valor,status) VALUES(1,'991','Pix',10000,'Pendente')");
  await db.runAsync(`
    INSERT INTO PaymentIntents(id,tenant_id,reserva_id,scope,method,amount_cents,state,gateway_ref,created,updated)
    VALUES('intent-991',1,1,'reservation:1','Pix',10000,?,'991',1,1)
  `, [state]);
}

function payment(status, overrides = {}) {
  return {
    id: 991,
    status,
    status_detail: null,
    currency_id: 'BRL',
    collector_id: 123,
    transaction_amount: 100,
    ...overrides
  };
}

function respond(body, status = 200) {
  provider.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body });
}

it('credits an approved payment that remained unknown after the webhook window', async () => {
  await seedPayment();
  respond(payment('approved'));

  const result = await processarOutbox({ olderThanMs: 0 });

  expect(result).toMatchObject({ payments: 1, refunds: 0, completed: 1, errors: 0 });
  expect((await db.getAsync("SELECT state FROM PaymentIntents WHERE id='intent-991'")).state).toBe('paid');
  expect(await db.getAsync('SELECT COUNT(*) AS count,SUM(valor) AS total FROM Pagamentos')).toEqual({ count: 1, total: 10000 });
  expect((await db.getAsync("SELECT status FROM TransacoesGateway WHERE gateway_ref='991'")).status).toBe('Pago');
});

it('recovers a payment whose provider response was lost before saving its reference', async () => {
  await db.runAsync(`
    INSERT INTO PaymentIntents(id,tenant_id,reserva_id,scope,method,amount_cents,state,created,updated)
    VALUES('intent-without-ref',1,1,'reservation:1','Pix',10000,'unknown',1,1)
  `);
  const recovered = payment('approved', { external_reference: 'intent-without-ref' });
  respond({ results: [recovered] });
  respond(recovered);

  const result = await processarOutbox({ olderThanMs: 0 });

  expect(result).toMatchObject({ payments: 1, completed: 1, errors: 0 });
  expect(provider.mock.calls.map(call => call[0])).toEqual([
    'https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&external_reference=intent-without-ref&limit=10',
    'https://api.mercadopago.com/v1/payments/991'
  ]);
  expect(await db.getAsync("SELECT state,gateway_ref FROM PaymentIntents WHERE id='intent-without-ref'")).toEqual({ state: 'paid', gateway_ref: '991' });
  expect(await db.getAsync("SELECT reserva_id,valor,status FROM TransacoesGateway WHERE gateway_ref='991'")).toEqual({ reserva_id: 1, valor: 10000, status: 'Pago' });
  expect(await db.getAsync('SELECT COUNT(*) AS count,SUM(valor) AS total FROM Pagamentos')).toEqual({ count: 1, total: 10000 });
});

it('closes a terminal rejected payment so it no longer blocks a new intent', async () => {
  await seedPayment('pending');
  respond(payment('rejected', { status_detail: 'cc_rejected_other_reason' }));

  const result = await processarOutbox({ olderThanMs: 0 });

  expect(result).toMatchObject({ payments: 1, failed: 1, errors: 0 });
  expect((await db.getAsync("SELECT state FROM PaymentIntents WHERE id='intent-991'")).state).toBe('failed');
  expect((await db.getAsync("SELECT status FROM TransacoesGateway WHERE gateway_ref='991'")).status).toBe('Rejeitado');
  expect(await db.getAsync('SELECT COUNT(*) AS count FROM Pagamentos')).toEqual({ count: 0 });
});

it('retries an ambiguous refund with the same idempotency key and reverses it once', async () => {
  await seedPayment('pending');
  await settle('991', { valor_pago: 10000 });
  await db.runAsync("INSERT INTO RefundIntents(id,gateway_ref,amount_cents,state,created) VALUES('refund-991','991',10000,'unknown',1)");
  respond({ id: 701, payment_id: 991, amount: 100, status: 'approved' });

  const result = await processarOutbox({ olderThanMs: 0 });

  expect(result).toMatchObject({ payments: 0, refunds: 1, completed: 1, errors: 0 });
  expect(provider).toHaveBeenCalledTimes(1);
  const [url, options] = provider.mock.calls[0];
  expect(url).toBe('https://api.mercadopago.com/v1/payments/991/refunds');
  expect(options.headers['X-Idempotency-Key']).toBe('refund-991');
  expect(JSON.parse(options.body)).toEqual({ amount: 100 });
  expect((await db.getAsync("SELECT state FROM RefundIntents WHERE id='refund-991'")).state).toBe('completed');
  expect((await db.getAsync("SELECT status FROM TransacoesGateway WHERE gateway_ref='991'")).status).toBe('Estornado');
  expect(await db.getAsync('SELECT SUM(valor) AS total FROM Pagamentos')).toEqual({ total: 0 });

  provider.mockClear();
  expect(await processarOutbox({ olderThanMs: 0 })).toMatchObject({ payments: 0, refunds: 0 });
  expect(provider).not.toHaveBeenCalled();
  expect(await db.getAsync('SELECT COUNT(*) AS count FROM Pagamentos')).toEqual({ count: 2 });
});

it('keeps an ambiguous operation pending after a transient provider failure', async () => {
  await seedPayment();
  provider.mockRejectedValueOnce(new Error('fixture timeout'));

  const result = await processarOutbox({ olderThanMs: 0 });

  expect(result).toMatchObject({ payments: 1, errors: 1, completed: 0 });
  expect((await db.getAsync("SELECT state FROM PaymentIntents WHERE id='intent-991'")).state).toBe('unknown');
  expect(await db.getAsync('SELECT COUNT(*) AS count FROM Pagamentos')).toEqual({ count: 0 });
});

it('writes a tenant audit before marking an outbox event as sent', async () => {
  await db.runAsync(
    "INSERT INTO SecurityOutbox(id,kind,payload,sent,created) VALUES('review-1','payment_review',?,0,1)",
    [JSON.stringify({ tenant_id: 1, gateway_ref: '991', motivo: 'fixture review' })]
  );

  const result = await processarOutbox({ olderThanMs: 0 });

  expect(result.outbox).toBe(1);
  expect((await db.getAsync("SELECT sent FROM SecurityOutbox WHERE id='review-1'")).sent).toBe(1);
  const audit = await db.getAsync("SELECT tenant_id,evento,detalhes FROM LogsAuditoria WHERE evento='Alerta de Reconciliação'");
  expect(audit.tenant_id).toBe(1);
  expect(audit.detalhes).toContain('fixture review');
});
