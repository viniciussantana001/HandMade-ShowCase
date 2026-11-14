// Fase 2 do STRIDE-R: callables de disputa e moderacao executados em processo.
// Alvo: Firestore Emulator 127.0.0.1:18080, projectId demo-handmade. Sem Functions Emulator, sem triggers.
// Pagamentos: nenhum callable de pagamento e invocado; a decisao usa start_review (sem efeito financeiro).
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

const { openOrderDispute } = await import(pathToFileURL(path.join(SRC, 'disputes', 'open-order-dispute.ts')).href);
const { resolveOrderDispute } = await import(pathToFileURL(path.join(SRC, 'disputes', 'resolve-order-dispute.ts')).href);
const { createListingReport } = await import(pathToFileURL(path.join(SRC, 'moderation', 'create-listing-report.ts')).href);
const { resolveListingReport } = await import(pathToFileURL(path.join(SRC, 'moderation', 'resolve-listing-report.ts')).href);

const env = await initializeTestEnvironment({
  projectId: PROJETO,
  firestore: { host: '127.0.0.1', port: 18080, rules: readFileSync(REGRAS, 'utf8') },
});

const ts = () => firebase.firestore.FieldValue.serverTimestamp();
const COMPRADOR = 'stride-test-r-comprador';
const VENDEDOR = 'stride-test-r-vendedor';
const TERCEIRO = 'stride-test-r-terceiro';
const MODERADOR = 'stride-test-r-moderador';
const ORDEM = 'order_c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9';
const DISPUTA = 'dispute_1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';
const RELATORIO = 'report_9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a40';
const ANUNCIO = 'stride-test-r-anuncio-1';

const auth = (uid, verificado = true, extras = {}) => ({
  uid,
  token: Object.assign({ email: uid.replace('stride-test-r-', '') + '@example.com', email_verified: verificado }, extras),
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

async function semearBase() {
  await env.clearFirestore();
  await semear(async (db) => {
    for (const uid of [COMPRADOR, VENDEDOR, TERCEIRO, MODERADOR]) {
      await db.doc('users/' + uid).set(perfil());
    }
    await db.doc('listings/' + ANUNCIO).set({
      listingId: ANUNCIO,
      sellerId: VENDEDOR,
      status: 'active',
      title: 'Vaso de ceramica',
      listingType: 'sale',
      pricingMode: 'fixed',
      priceCents: 12000,
      quantity: 1,
      unit: 'un',
      deliveryOptions: ['pickup'],
      revision: 1,
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
    await db.doc('listingLocations/' + ANUNCIO).set({ listingId: ANUNCIO, schemaVersion: 1, updatedAt: ts() });
  });
}

async function semearPedidoEntregue() {
  await semear(async (db) => {
    await db.doc('orders/' + ORDEM).set({
      orderId: ORDEM,
      buyerId: COMPRADOR,
      sellerId: VENDEDOR,
      participantIds: [COMPRADOR, VENDEDOR],
      status: 'delivered',
      paymentStatus: 'approved',
      revision: 3,
      listingSnapshot: { deliveryOptions: ['pickup'] },
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
  });
}

async function semearDisputaParaDecisao() {
  await semear(async (db) => {
    await db.doc('orders/' + ORDEM).set({
      orderId: ORDEM,
      buyerId: COMPRADOR,
      sellerId: VENDEDOR,
      participantIds: [COMPRADOR, VENDEDOR],
      status: 'disputed',
      paymentStatus: 'approved',
      revision: 4,
      activeDisputeId: DISPUTA,
      priorOrderStatus: 'delivered',
      listingSnapshot: { deliveryOptions: ['pickup'] },
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
    await db.doc('disputes/' + DISPUTA).set({
      disputeId: DISPUTA,
      orderId: ORDEM,
      buyerId: COMPRADOR,
      sellerId: VENDEDOR,
      participantIds: [COMPRADOR, VENDEDOR],
      openedByUid: COMPRADOR,
      openedByRole: 'buyer',
      reason: 'item_not_received',
      status: 'open',
      priorOrderStatus: 'delivered',
      revision: 1,
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
  });
}

async function semearDenuncia() {
  await semear(async (db) => {
    await db.doc('reports/' + RELATORIO).set({
      reportId: RELATORIO,
      entityType: 'listing',
      listingId: ANUNCIO,
      reporterUid: COMPRADOR,
      subjectOwnerUid: VENDEDOR,
      reason: 'fake',
      description: 'Fotos nao correspondem ao produto.',
      status: 'pending',
      revision: 1,
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

async function listar(caminho, filtro = () => true) {
  let docs = [];
  await semear(async (db) => {
    const snap = await db.collection(caminho).get();
    docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  return docs.filter(filtro);
}

const trilhaDoAtor = async (uid, chave) =>
  (await listar('auditLogs', (d) => d.actorUid === uid && JSON.stringify(d).includes(chave)));

async function chamar(handler, authCtx, data) {
  try {
    const resultado = await handler.run({ data, auth: authCtx });
    return { ok: true, resultado };
  } catch (erro) {
    console.log('CHAMADA-FALHOU', erro.code, erro.message);
    return { ok: false, codigo: erro.code, mensagem: erro.message, detalhes: erro.details };
  }
}

describe('callable openOrderDispute (abertura de disputa) em processo', () => {
  it('D1 comprador abre disputa em pedido entregue: disputa aberta, pedido em disputa, trilha do comprador', async () => {
    await semearBase();
    await semearPedidoEntregue();
    const r = await chamar(openOrderDispute, auth(COMPRADOR), {
      orderId: ORDEM,
      expectedOrderRevision: 3,
      reason: 'item_not_received',
      description: 'O produto nao chegou ao endereco combinado no prazo.',
      idempotencyKey: 'stride-test-r-d1-0001',
    });
    expect(r.ok).toBe(true);
    const disputas = await listar('disputes', (d) => d.orderId === ORDEM);
    expect(disputas).toHaveLength(1);
    const disputa = disputas[0];
    expect(disputa.status).toBe('open');
    expect(disputa.openedByUid).toBe(COMPRADOR);
    expect(disputa.openedByRole).toBe('buyer');
    const pedido = await ler('orders/' + ORDEM);
    expect(pedido.status).toBe('disputed');
    expect(pedido.activeDisputeId).toBe(disputa.disputeId);
    expect((await trilhaDoAtor(COMPRADOR, ORDEM)).length).toBeGreaterThanOrEqual(1);
  });

  it('D2 terceiro nao abre disputa: permission-denied, nenhuma disputa criada', async () => {
    await semearBase();
    await semearPedidoEntregue();
    const r = await chamar(openOrderDispute, auth(TERCEIRO), {
      orderId: ORDEM,
      expectedOrderRevision: 3,
      reason: 'item_not_received',
      description: 'Tentativa de terceiro sem vinculo com o pedido.',
      idempotencyKey: 'stride-test-r-d2-0001',
    });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('permission-denied');
    expect(await listar('disputes', (d) => d.orderId === ORDEM)).toHaveLength(0);
    expect((await ler('orders/' + ORDEM)).status).toBe('delivered');
  });

  it('D3 chamada sem autenticacao: unauthenticated', async () => {
    await semearBase();
    await semearPedidoEntregue();
    const r = await chamar(openOrderDispute, undefined, {
      orderId: ORDEM,
      expectedOrderRevision: 3,
      reason: 'item_not_received',
      description: 'Chamada anonima tentando abrir disputa.',
      idempotencyKey: 'stride-test-r-d3-0001',
    });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('unauthenticated');
    expect(await listar('disputes', (d) => d.orderId === ORDEM)).toHaveLength(0);
  });
});

describe('callable resolveOrderDispute (decisao de disputa) em processo', () => {
  it('D4 moderador inicia analise: disputa em revisao, trilha atribuida ao moderador', async () => {
    await semearBase();
    await semearDisputaParaDecisao();
    const r = await chamar(resolveOrderDispute, auth(MODERADOR, true, { moderator: true }), {
      disputeId: DISPUTA,
      expectedRevision: 1,
      action: 'start_review',
      note: 'Analise iniciada com as mensagens e o rastreio do pedido.',
      idempotencyKey: 'stride-test-r-d4-0001',
    });
    expect(r.ok).toBe(true);
    const disputa = await ler('disputes/' + DISPUTA);
    expect(disputa.status).toBe('under_review');
    expect(disputa.revision).toBe(2);
    expect((await trilhaDoAtor(MODERADOR, DISPUTA)).length).toBeGreaterThanOrEqual(1);
  });

  it('D5 comprador sem claim de moderador nao decide: permission-denied, disputa intacta', async () => {
    await semearBase();
    await semearDisputaParaDecisao();
    const r = await chamar(resolveOrderDispute, auth(COMPRADOR), {
      disputeId: DISPUTA,
      expectedRevision: 1,
      action: 'start_review',
      note: 'Tentativa de decisao sem claim de moderador.',
      idempotencyKey: 'stride-test-r-d5-0001',
    });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('permission-denied');
    expect((await ler('disputes/' + DISPUTA)).status).toBe('open');
  });
});

describe('callable createListingReport (denuncia de anuncio) em processo', () => {
  it('M1 comprador denuncia anuncio de terceiro: denuncia pendente, trilha do denunciante', async () => {
    await semearBase();
    const r = await chamar(createListingReport, auth(COMPRADOR), {
      listingId: ANUNCIO,
      reason: 'fake',
      description: 'As fotos nao correspondem ao produto recebido.',
      idempotencyKey: 'stride-test-r-m1-0001',
    });
    expect(r.ok).toBe(true);
    const denuncias = await listar('reports', (d) => d.listingId === ANUNCIO && d.reporterUid === COMPRADOR);
    expect(denuncias).toHaveLength(1);
    expect(denuncias[0].status).toBe('pending');
    expect((await trilhaDoAtor(COMPRADOR, ANUNCIO)).length).toBeGreaterThanOrEqual(1);
  });

  it('M2 vendedor nao denuncia o proprio anuncio: permission-denied, sem denuncia', async () => {
    await semearBase();
    const r = await chamar(createListingReport, auth(VENDEDOR), {
      listingId: ANUNCIO,
      reason: 'other',
      description: 'Tentativa de denunciar o proprio anuncio.',
      idempotencyKey: 'stride-test-r-m2-0001',
    });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('permission-denied');
    expect(await listar('reports', (d) => d.listingId === ANUNCIO)).toHaveLength(0);
  });

  it('M3 chamada sem autenticacao: unauthenticated', async () => {
    await semearBase();
    const r = await chamar(createListingReport, undefined, {
      listingId: ANUNCIO,
      reason: 'other',
      description: 'Chamada anonima tentando denunciar anuncio.',
      idempotencyKey: 'stride-test-r-m3-0001',
    });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('unauthenticated');
  });
});

describe('callable resolveListingReport (decisao de denuncia) em processo', () => {
  it('M4 moderador arquiva denuncia: denuncia decidida pelo moderador, trilha atribuida a ele', async () => {
    await semearBase();
    await semearDenuncia();
    const r = await chamar(resolveListingReport, auth(MODERADOR, true, { moderator: true }), {
      reportId: RELATORIO,
      action: 'dismiss',
      expectedRevision: 1,
      note: 'Denuncia analisada e arquivada sem alteracao do anuncio.',
      idempotencyKey: 'stride-test-r-m4-0001',
    });
    expect(r.ok).toBe(true);
    const denuncia = await ler('reports/' + RELATORIO);
    expect(denuncia.status).not.toBe('pending');
    expect(denuncia.resolvedBy).toBe(MODERADOR);
    expect((await trilhaDoAtor(MODERADOR, RELATORIO)).length).toBeGreaterThanOrEqual(1);
  });

  it('M5 comprador sem claim de moderador nao decide denuncia: permission-denied, denuncia pendente', async () => {
    await semearBase();
    await semearDenuncia();
    const r = await chamar(resolveListingReport, auth(COMPRADOR), {
      reportId: RELATORIO,
      action: 'dismiss',
      expectedRevision: 1,
      note: 'Tentativa de decisao sem claim de moderador.',
      idempotencyKey: 'stride-test-r-m5-0001',
    });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('permission-denied');
    expect((await ler('reports/' + RELATORIO)).status).toBe('pending');
  });
});


