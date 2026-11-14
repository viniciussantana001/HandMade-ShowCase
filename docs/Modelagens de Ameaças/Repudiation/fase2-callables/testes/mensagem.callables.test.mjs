// Fase 2 do STRIDE-R: callable de envio de mensagens executado em processo.
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

const { sendMessage } = await import(pathToFileURL(path.join(SRC, 'chat', 'send-message.ts')).href);

const env = await initializeTestEnvironment({
  projectId: PROJETO,
  firestore: { host: '127.0.0.1', port: 18080, rules: readFileSync(REGRAS, 'utf8') },
});

const ts = () => firebase.firestore.FieldValue.serverTimestamp();
const CONVERSA = 'conversation_0123456789abcdef0123456789abcdef';
const ANUNCIO = 'stride-test-r-anuncio-1';
const COMPRADOR = 'stride-test-r-comprador';
const VENDEDOR = 'stride-test-r-vendedor';
const TERCEIRO = 'stride-test-r-terceiro';
const TEXTO = 'Podemos fechar o valor combinado?';

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

async function semearConversa({ status = 'active' } = {}) {
  await env.clearFirestore();
  await semear(async (db) => {
    await db.doc('users/' + COMPRADOR).set(perfil());
    await db.doc('users/' + VENDEDOR).set(perfil());
    await db.doc('users/' + TERCEIRO).set(perfil());
    await db.doc('conversations/' + CONVERSA).set({
      conversationId: CONVERSA,
      listingId: ANUNCIO,
      buyerId: COMPRADOR,
      sellerId: VENDEDOR,
      participantIds: [COMPRADOR, VENDEDOR],
      status,
      unreadCounts: {},
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
  });
}

async function listar(caminho, filtro = () => true) {
  let docs = [];
  await semear(async (db) => {
    const snap = await db.collection(caminho).get();
    docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
  return docs.filter(filtro);
}

const mensagens = () => listar('conversations/' + CONVERSA + '/messages');

async function chamar(handler, authCtx, data) {
  try {
    const resultado = await handler.run({ data, auth: authCtx });
    return { ok: true, resultado };
  } catch (erro) {
    console.log('CHAMADA-FALHOU', erro.code, erro.message);
    return { ok: false, codigo: erro.code, mensagem: erro.message, detalhes: erro.details };
  }
}

const entrada = (overrides) => ({
  conversationId: CONVERSA,
  content: TEXTO,
  idempotencyKey: 'stride-test-r-msg-0001',
  ...overrides,
});

describe('callable sendMessage (mensagens do chat) em processo', () => {
  it('S1 comprador envia mensagem: autor vem do token, mensagem e operacao gravadas', async () => {
    await semearConversa();
    const r = await chamar(sendMessage, auth(COMPRADOR), entrada({ idempotencyKey: 'stride-test-r-s1-0001' }));
    expect(r.ok).toBe(true);
    const msgs = await mensagens();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].senderId).toBe(COMPRADOR);
    expect(msgs[0].content).toBe(TEXTO);
    expect(msgs[0].createdAt).toBeTruthy();
    const operacoes = await listar('conversations/' + CONVERSA + '/operations', (d) => d.actorUid === COMPRADOR);
    expect(operacoes).toHaveLength(1);
  });

  it('S2 cliente tenta forjar senderId: invalid-argument, nenhuma mensagem gravada', async () => {
    await semearConversa();
    const r = await chamar(sendMessage, auth(COMPRADOR), entrada({ idempotencyKey: 'stride-test-r-s2-0001', senderId: VENDEDOR }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('invalid-argument');
    expect(await mensagens()).toHaveLength(0);
  });

  it('S3 terceiro nao participa da conversa: permission-denied, nenhuma mensagem', async () => {
    await semearConversa();
    const r = await chamar(sendMessage, auth(TERCEIRO), entrada({ idempotencyKey: 'stride-test-r-s3-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('permission-denied');
    expect(await mensagens()).toHaveLength(0);
  });

  it('S4 chamada sem autenticacao: unauthenticated', async () => {
    await semearConversa();
    const r = await chamar(sendMessage, undefined, entrada({ idempotencyKey: 'stride-test-r-s4-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('unauthenticated');
    expect(await mensagens()).toHaveLength(0);
  });

  it('S5 e-mail nao verificado: failed-precondition, nenhuma mensagem', async () => {
    await semearConversa();
    const r = await chamar(sendMessage, auth(COMPRADOR, false), entrada({ idempotencyKey: 'stride-test-r-s5-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('failed-precondition');
    expect(r.mensagem).toContain('Email verification');
    expect(await mensagens()).toHaveLength(0);
  });

  it('S6 conversa encerrada: failed-precondition, nenhuma mensagem', async () => {
    await semearConversa({ status: 'closed' });
    const r = await chamar(sendMessage, auth(COMPRADOR), entrada({ idempotencyKey: 'stride-test-r-s6-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('failed-precondition');
    expect(r.mensagem).toContain('not active');
    expect(await mensagens()).toHaveLength(0);
  });

  it('S7 conteudo vazio: invalid-argument, nenhuma mensagem', async () => {
    await semearConversa();
    const r = await chamar(sendMessage, auth(COMPRADOR), entrada({ content: '   ', idempotencyKey: 'stride-test-r-s7-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('invalid-argument');
    expect(await mensagens()).toHaveLength(0);
  });

  it('S8 conteudo acima de 2000 caracteres: invalid-argument, nenhuma mensagem', async () => {
    await semearConversa();
    const r = await chamar(sendMessage, auth(COMPRADOR), entrada({ content: 'a'.repeat(2001), idempotencyKey: 'stride-test-r-s8-0001' }));
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe('invalid-argument');
    expect(await mensagens()).toHaveLength(0);
  });

  it('S9 reenvio com a mesma chave de idempotencia: mesmo resultado, uma unica mensagem', async () => {
    await semearConversa();
    const chave = 'stride-test-r-s9-0001';
    const primeira = await chamar(sendMessage, auth(COMPRADOR), entrada({ idempotencyKey: chave }));
    const segunda = await chamar(sendMessage, auth(COMPRADOR), entrada({ idempotencyKey: chave }));
    expect(primeira.ok).toBe(true);
    expect(segunda.ok).toBe(true);
    expect(segunda.resultado.messageId).toBe(primeira.resultado.messageId);
    expect(await mensagens()).toHaveLength(1);
  });
});

