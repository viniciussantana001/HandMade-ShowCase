// Fase 2 do STRIDE-R: callable de aceite de proposta executado em processo.
// Alvo: Firestore Emulator 127.0.0.1:18080, projectId demo-handmade. Sem Functions Emulator, sem triggers.
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

const { respondToProposal } = await import(
  pathToFileURL(path.join(SRC, 'proposals', 'respond-to-proposal.ts')).href
);

const env = await initializeTestEnvironment({
  projectId: PROJETO,
  firestore: { host: '127.0.0.1', port: 18080, rules: readFileSync(REGRAS, 'utf8') },
});

const ts = () => firebase.firestore.FieldValue.serverTimestamp();
const emMs = (ms) => firebase.firestore.Timestamp.fromMillis(Date.now() + ms);
const SETE_DIAS = 7 * 24 * 60 * 60 * 1000;

const PROPOSTA = 'proposal_7b3e1f9a2c4d6e8f0a1b2c3d4e5f6071';
const CONVERSA = 'conversation_0123456789abcdef0123456789abcdef';
const ANUNCIO = 'stride-test-r-anuncio-1';
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

async function semearProposta({
  precoAnuncio = 12000,
  expiraEm = emMs(SETE_DIAS),
  revisao = 1,
} = {}) {
  await env.clearFirestore();
  await semear(async (db) => {
    await db.doc('users/' + COMPRADOR).set(perfil());
    await db.doc('users/' + VENDEDOR).set(perfil());
    await db.doc('users/' + TERCEIRO).set(perfil());
    await db.doc('conversations/' + CONVERSA).set({
      conversationId: CONVERSA,
      buyerId: COMPRADOR,
      sellerId: VENDEDOR,
      listingId: ANUNCIO,
      participantIds: [COMPRADOR, VENDEDOR],
      status: 'active',
      unreadCounts: {},
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
    await db.doc('listings/' + ANUNCIO).set({
      listingId: ANUNCIO,
      sellerId: VENDEDOR,
      status: 'active',
      title: 'Vaso de ceramica',
      listingType: 'sale',
      pricingMode: 'fixed',
      priceCents: precoAnuncio,
      quantity: 1,
      unit: 'un',
      deliveryOptions: ['pickup'],
      revision: 1,
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
    await db.doc('proposals/' + PROPOSTA).set({
      proposalId: PROPOSTA,
      buyerId: COMPRADOR,
      sellerId: VENDEDOR,
      listingId: ANUNCIO,
      conversationId: CONVERSA,
      amountCents: 10000,
      status: 'pending',
      revision: revisao,
      listingRevision: 1,
      listingSnapshot: { priceCents: 12000, pricingMode: 'fixed' },
      expiresAt: expiraEm,
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
  proposalId: PROPOSTA,
  expectedRevision: 1,
  action: 'accept',
  idempotencyKey: 'stride-test-r-p-0001',
  ...overrides,
});

const pedidosDaProposta = async () =>
  (await listar('orders')).filter((d) => d.proposalId === PROPOSTA);

describe('callable respondToProposal (aceite e recusa) em processo', () => {
  it('P1 vendedor aceita: pedido criado, evento created atribuido ao vendedor, anuncio reservado', async () => {
    await semearProposta();
    const r = await chamar(respondToProposal, auth(VENDEDOR), entrada({ idempotencyKey: 'stride-test-r-p1-0001' }));
    expect(r.ok).toBe(true);
    expect(r.resultado.status).toBe('accepted');
    expect(r.resultado.revision).toBe(2);
    expect((await ler('proposals/' + PROPOSTA)).status).toBe('accepted');
    const pedidos = await pedidosDaProposta();
    expect(pedidos).toHaveLength(1);
    const pedido = pedidos[0];
    expect(pedido.status).toBe('awaiting_payment');
    expect(pedido.paymentStatus).toBe('not_started');
    expect(pedido.amountCents).toBe(10000);
    expect(pedido.participantIds).toEqual([COMPRADOR, VENDEDOR]);
    const evento = await ler('orders/' + pedido.orderId + '/events/created');
    expect(evento.actorUid).toBe(VENDEDOR);
    expect(evento.fromStatus).toBe(null);
    expect(evento.toStatus).toBe('awaiting_payment');
    expect(evento.reason).toBe('proposal_accepted');
    expect(evento.proposalId).toBe(PROPOSTA);
    const anuncio = await ler('listings/' + ANUNCIO);
    expect(anuncio.status).toBe('reserved');
    expect(anuncio.reservedOrderId).toBe(pedido.orderId);
    const trilha = (await listar('auditLogs')).filter(
      (d) => d.actorUid === VENDEDOR && JSON.stringify(d).includes(PROPOSTA),
    );
    expect(trilha.length).toBeGreaterThanOrEqual(1);
  });

  it('P2 vendedor recusa: proposta rejeitada, nenhum pedido criado, anuncio intacto', async () => {
    await semearProposta();
    const r = await chamar(respondToProposal, auth(VENDEDOR), entrada({ action: 'reject', idempotencyKey: 'stride-test-r-p2-0001' }));
    expect(r.ok).toBe(true);
    expect(r.resultado.status).toBe('rejected');
    expect((await ler('proposals/' + PROPOSTA)).status).toBe('rejected');
    expect(await pedidosDaProposta()).toHaveLength(0);
    expect((await ler('listings/' + ANUNCIO)).status).toBe('active');
  });

  it('N1 comprador nao aceita a propria proposta: permission-denied, sem pedido', async () => {
    await semearProposta();
    const r = await chamar(respondToProposal, auth(COMPRADOR), entrada({ idempotencyKey: 'stride-test-r-n1-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('permission-denied');
    const proposta = await ler('proposals/' + PROPOSTA);
    expect(proposta.status).toBe('pending');
    expect(proposta.revision).toBe(1);
    expect(await pedidosDaProposta()).toHaveLength(0);
  });

  it('N2 preco alterado depois da proposta: failed-precondition, sem pedido, anuncio intacto', async () => {
    await semearProposta({ precoAnuncio: 13000 });
    const r = await chamar(respondToProposal, auth(VENDEDOR), entrada({ idempotencyKey: 'stride-test-r-n2-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('failed-precondition');
    expect(r.mensagem).toContain('The listing changed after this proposal was created.');
    expect((await ler('proposals/' + PROPOSTA)).status).toBe('pending');
    expect(await pedidosDaProposta()).toHaveLength(0);
    expect((await ler('listings/' + ANUNCIO)).status).toBe('active');
  });

  it('N3 revisao desatualizada: aborted, proposta intacta', async () => {
    await semearProposta({ revisao: 2 });
    const r = await chamar(respondToProposal, auth(VENDEDOR), entrada({ expectedRevision: 1, idempotencyKey: 'stride-test-r-n3-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('aborted');
    expect((await ler('proposals/' + PROPOSTA)).status).toBe('pending');
    expect(await pedidosDaProposta()).toHaveLength(0);
  });

  it('N4 proposta expirada: failed-precondition, sem pedido', async () => {
    await semearProposta({ expiraEm: emMs(-60 * 1000) });
    const r = await chamar(respondToProposal, auth(VENDEDOR), entrada({ idempotencyKey: 'stride-test-r-n4-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('failed-precondition');
    expect(r.mensagem).toContain('The proposal has expired.');
    expect(await pedidosDaProposta()).toHaveLength(0);
  });

  it('N5 vendedor com e-mail nao verificado: failed-precondition, proposta intacta', async () => {
    await semearProposta();
    const r = await chamar(respondToProposal, auth(VENDEDOR, false), entrada({ idempotencyKey: 'stride-test-r-n5-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('failed-precondition');
    expect(r.mensagem).toContain('Email verification');
    expect((await ler('proposals/' + PROPOSTA)).status).toBe('pending');
  });

  it('N6 sem autenticacao: unauthenticated', async () => {
    await semearProposta();
    const r = await chamar(respondToProposal, undefined, entrada({ idempotencyKey: 'stride-test-r-n6-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('unauthenticated');
    expect((await ler('proposals/' + PROPOSTA)).status).toBe('pending');
  });
});

