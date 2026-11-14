// Fase 2 do STRIDE-R: callables de pedido executados em processo.
// Alvo: Firestore Emulator 127.0.0.1:18080, projectId demo-handmade.
// Functions Emulator desligado; os callables sao invocados com .run(), sem triggers.
// Dados: contas example.com sinteticas e identificadores com prefixo stride-test-r-.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import 'firebase/compat/firestore';
import firebase from 'firebase/compat/app';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const PROJETO = 'demo-handmade';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:18080') {
  throw new Error('ABORTADO: FIRESTORE_EMULATOR_HOST diferente de 127.0.0.1:18080');
}
process.env.GCLOUD_PROJECT = PROJETO;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: PROJETO });

const REPO = 'repositorio';
const REGRAS = path.join(REPO, 'firebase', 'firestore.rules');
const SRC = path.join(REPO, 'functions', 'src');

const { updateOrderFulfillment } = await import(
  pathToFileURL(path.join(SRC, 'orders', 'update-order-fulfillment.ts')).href
);

const env = await initializeTestEnvironment({
  projectId: PROJETO,
  firestore: { host: '127.0.0.1', port: 18080, rules: readFileSync(REGRAS, 'utf8') },
});

const ts = () => firebase.firestore.FieldValue.serverTimestamp();
const ORDER = 'order_5a1c0e7f9b2d4c6e8f0a1b2c3d4e5f60';
const COMPRADOR = 'stride-test-r-comprador';
const VENDEDOR = 'stride-test-r-vendedor';
const TERCEIRO = 'stride-test-r-terceiro';

const auth = (uid, verificado = true) => ({
  uid,
  token: { email: uid.replace('stride-test-r-', '') + '@example.com', email_verified: verificado },
});
const perfil = () => ({
  status: 'active',
  profileStatus: 'complete',
  emailVerified: true,
  role: 'user',
  schemaVersion: 1,
  createdAt: ts(),
  updatedAt: ts(),
});

async function semear(fn) {
  await env.withSecurityRulesDisabled(async (contexto) => fn(contexto.firestore()));
}

async function semearPedido({ status = 'paid', revisao = 1, pagamento = 'approved' } = {}) {
  await env.clearFirestore();
  await semear(async (db) => {
    await db.doc('users/' + COMPRADOR).set(perfil());
    await db.doc('users/' + VENDEDOR).set(perfil());
    await db.doc('users/' + TERCEIRO).set(perfil());
    await db.doc('orders/' + ORDER).set({
      orderId: ORDER,
      buyerId: COMPRADOR,
      sellerId: VENDEDOR,
      participantIds: [COMPRADOR, VENDEDOR],
      status,
      paymentStatus: pagamento,
      revision: revisao,
      listingSnapshot: { deliveryOptions: ['pickup'] },
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
  });
}

async function ler(caminho) {
  let dados = null;
  await semear(async (db) => {
    const snap = await db.doc(caminho).get();
    dados = snap.exists ? snap.data() : null;
  });
  return dados;
}

async function listar(caminho) {
  let docs = [];
  await semear(async (db) => {
    const snap = await db.collection(caminho).get();
    docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  return docs;
}

async function chamar(handler, authCtx, data) {
  try {
    const resultado = await handler.run({ data, auth: authCtx });
    return { ok: true, resultado };
  } catch (erro) {
    return { ok: false, codigo: erro.code, mensagem: erro.message, detalhes: erro.details };
  }
}

const entrada = (overrides) => ({
  orderId: ORDER,
  action: 'mark_shipped',
  expectedRevision: 1,
  idempotencyKey: 'stride-test-r-chave-0001',
  fulfillmentMethod: 'pickup',
  ...overrides,
});

describe('callable updateOrderFulfillment (pedido) em processo', () => {
  it('C1 comprador nao marca envio: permission-denied, pedido e trilha intactos', async () => {
    await semearPedido();
    const r = await chamar(updateOrderFulfillment, auth(COMPRADOR), entrada({ idempotencyKey: 'stride-test-r-c1-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('permission-denied');
    const pedido = await ler('orders/' + ORDER);
    expect(pedido.status).toBe('paid');
    expect(pedido.revision).toBe(1);
    expect(await listar('orders/' + ORDER + '/events')).toHaveLength(0);
    expect((await listar('auditLogs')).filter((d) => d.entityId === ORDER)).toHaveLength(0);
  });

  it('C2 vendedor marca envio: evento e auditoria atribuidos ao vendedor', async () => {
    await semearPedido();
    const r = await chamar(updateOrderFulfillment, auth(VENDEDOR), entrada({ idempotencyKey: 'stride-test-r-c2-0001' }));
    expect(r.ok).toBe(true);
    expect(r.resultado.status).toBe('shipped');
    expect(r.resultado.revision).toBe(2);
    const pedido = await ler('orders/' + ORDER);
    expect(pedido.status).toBe('shipped');
    expect(pedido.revision).toBe(2);
    const evento = await ler('orders/' + ORDER + '/events/' + r.resultado.eventId);
    expect(evento.actorUid).toBe(VENDEDOR);
    expect(evento.actorRole).toBe('seller');
    expect(evento.fromStatus).toBe('paid');
    expect(evento.toStatus).toBe('shipped');
    expect(evento.reason).toBe('mark_shipped');
    expect(evento.createdAt).toBeTruthy();
    const trilha = (await listar('auditLogs')).filter((d) => d.eventId === r.resultado.eventId);
    expect(trilha).toHaveLength(1);
    expect(trilha[0].actorUid).toBe(VENDEDOR);
    expect(trilha[0].fromStatus).toBe('paid');
    expect(trilha[0].toStatus).toBe('shipped');
  });

  it('C3 terceiro nao marca envio: permission-denied, pedido intacto', async () => {
    await semearPedido();
    const r = await chamar(updateOrderFulfillment, auth(TERCEIRO), entrada({ idempotencyKey: 'stride-test-r-c3-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('permission-denied');
    expect((await ler('orders/' + ORDER)).status).toBe('paid');
  });

  it('C4 vendedor nao confirma entrega (papel do comprador): permission-denied', async () => {
    await semearPedido({ status: 'shipped', revisao: 2 });
    const r = await chamar(updateOrderFulfillment, auth(VENDEDOR), entrada({ action: 'confirm_delivery', expectedRevision: 2, idempotencyKey: 'stride-test-r-c4-0001', fulfillmentMethod: undefined }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('permission-denied');
    expect((await ler('orders/' + ORDER)).status).toBe('shipped');
  });

  it('C5 comprador confirma entrega: evento atribuido ao comprador', async () => {
    await semearPedido({ status: 'shipped', revisao: 2 });
    const r = await chamar(updateOrderFulfillment, auth(COMPRADOR), entrada({ action: 'confirm_delivery', expectedRevision: 2, idempotencyKey: 'stride-test-r-c5-0001', fulfillmentMethod: undefined }));
    expect(r.ok).toBe(true);
    expect(r.resultado.status).toBe('delivered');
    const evento = await ler('orders/' + ORDER + '/events/' + r.resultado.eventId);
    expect(evento.actorUid).toBe(COMPRADOR);
    expect(evento.actorRole).toBe('buyer');
    expect(evento.fromStatus).toBe('shipped');
    expect(evento.toStatus).toBe('delivered');
  });

  it('C6 revisao desatualizada: aborted, pedido intacto', async () => {
    await semearPedido({ revisao: 3 });
    const r = await chamar(updateOrderFulfillment, auth(VENDEDOR), entrada({ expectedRevision: 1, idempotencyKey: 'stride-test-r-c6-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('aborted');
    const pedido = await ler('orders/' + ORDER);
    expect(pedido.status).toBe('paid');
    expect(pedido.revision).toBe(3);
  });

  it('C7 sem autenticacao: unauthenticated', async () => {
    await semearPedido();
    const r = await chamar(updateOrderFulfillment, undefined, entrada({ idempotencyKey: 'stride-test-r-c7-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('unauthenticated');
    expect((await ler('orders/' + ORDER)).status).toBe('paid');
  });

  it('C8 e-mail nao verificado: failed-precondition, pedido intacto', async () => {
    await semearPedido();
    const r = await chamar(updateOrderFulfillment, auth(VENDEDOR, false), entrada({ idempotencyKey: 'stride-test-r-c8-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('failed-precondition');
    expect(r.mensagem).toContain('Email verification');
    expect((await ler('orders/' + ORDER)).status).toBe('paid');
  });

  it('C9 pagamento nao aprovado: failed-precondition, pedido intacto', async () => {
    await semearPedido({ pagamento: 'pending' });
    const r = await chamar(updateOrderFulfillment, auth(VENDEDOR), entrada({ idempotencyKey: 'stride-test-r-c9-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('failed-precondition');
    expect((await ler('orders/' + ORDER)).status).toBe('paid');
    expect(await listar('orders/' + ORDER + '/events')).toHaveLength(0);
  });
});

