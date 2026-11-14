/**
 * Cenarios STRIDE-R (Repudiacao) - execucao in-process contra o Firestore Emulator local.
 *
 * Alvo: emulador local, projectId demo-handmade, host 127.0.0.1, porta 18080.
 * Functions Emulator desligado. Nenhuma chamada ao projeto de desenvolvimento.
 * Dados: apenas contas example.com sinteticas e identificadores com prefixo stride-test-r-.
 *
 * Regras testadas: repositorio/firebase/firestore.rules, lidas diretamente do repositorio.
 * O SHA-256 do arquivo e impresso e gravado no resultado.
 *
 * Metodo (mesmo padrao de cenarios5.mjs):
 *  - Fixtures de servidor (trilhas, mensagens, pedidos, propostas, pagamentos, auditorias)
 *    sao semeados com as regras desligadas, simulando o que as Cloud Functions gravam via
 *    Admin SDK. Este script NAO executa callables.
 *  - Probes usam operacao bruta em try/catch, sem assertFails:
 *      PERMITIDO = a operacao resolveu; NEGADO = permission-denied; erro = falha de harness.
 *  - Cada cenario tem controles positivos (PERMITIDO esperado). Se um controle falhar, o
 *    veredito e INCONCLUSIVO, nunca BLOQUEADO. Um probe negativo que passa gera BURLADO.
 *  - Writes do cliente que passam pelas regras usam serverTimestamp, porque as regras exigem
 *    createdAt/updatedAt == request.time.
 *  - Consentimentos entram no MESMO batch do perfil (existsAfter/getAfter das regras).
 *
 * Uso (a partir de stride-trabalho/testes):
 *   firebase.cmd emulators:exec --only firestore --project demo-handmade "node cenarios-r.mjs 1"
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import 'firebase/compat/firestore';
import firebase from 'firebase/compat/app';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const PROJECT_ID = 'demo-handmade';
const HOST = '127.0.0.1';
const PORTA = 18080;
const RODADA = process.argv[2] || 'manual';
const PASTA = import.meta.dirname;
const REGRAS_PATH = path.resolve(PASTA, '..', '..', 'repositorio', 'firebase', 'firestore.rules');
const RESULTADO_PATH = path.resolve(PASTA, 'resultado-r-rodada-' + RODADA + '.json');
const BRUTO_PATH = path.resolve(PASTA, '..', 'brutos', 'r-rodada-' + RODADA + '.txt');

const linhas = [];
function emitir(linha) {
  linhas.push(linha);
  console.log(linha);
}

emitir('alvo projectId=' + PROJECT_ID + ' host=' + HOST + ' porta=' + PORTA + ' rodada=' + RODADA);
if (process.env.FIRESTORE_EMULATOR_HOST !== HOST + ':' + PORTA) {
  emitir('ABORTADO: FIRESTORE_EMULATOR_HOST=' + (process.env.FIRESTORE_EMULATOR_HOST || '(ausente)'));
  process.exit(2);
}

const regrasBytes = readFileSync(REGRAS_PATH);
const regrasSha256 = createHash('sha256').update(regrasBytes).digest('hex');
emitir('regras arquivo=repositorio/firebase/firestore.rules sha256=' + regrasSha256);

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { host: HOST, port: PORTA, rules: regrasBytes.toString('utf8') },
});

const ts = () => firebase.firestore.FieldValue.serverTimestamp();
const dataFixa = (iso) => firebase.firestore.Timestamp.fromDate(new Date(iso));
const emailDe = (uid) => uid.replace('stride-test-r-', '') + '@example.com';

const U = {
  comprador: 'stride-test-r-comprador',
  vendedor: 'stride-test-r-vendedor',
  terceiro: 'stride-test-r-terceiro',
  moderador: 'stride-test-r-moderador',
};

function cliente(uid, claims) {
  return env.authenticatedContext(
    uid,
    Object.assign({ email: emailDe(uid), email_verified: true }, claims || {}),
  ).firestore();
}

function anonimo() {
  return env.unauthenticatedContext().firestore();
}

async function semear(fn) {
  await env.withSecurityRulesDisabled(async (contexto) => {
    await fn(contexto.firestore());
  });
}

const resultados = [];
const observacoes = [];

function classificar(erro) {
  const codigo = erro && erro.code;
  const msg = String((erro && erro.message) || erro);
  if (codigo === 'permission-denied' || /PERMISSION_DENIED|insufficient permissions/i.test(msg)) {
    return 'NEGADO';
  }
  return 'erro';
}

async function probe(cenario, id, esperado, descricao, operacao) {
  let observado = 'PERMITIDO';
  let detalhe = '';
  try {
    await operacao();
  } catch (erro) {
    observado = classificar(erro);
    if (observado === 'erro') detalhe = String((erro && erro.message) || erro).slice(0, 200);
  }
  const ok = observado === esperado;
  resultados.push({ cenario, id, esperado, observado, ok, descricao, detalhe });
  emitir('PROBE|' + cenario + '|' + id + '|esperado=' + esperado + '|observado=' + observado +
    '|' + (ok ? 'OK' : 'DIVERGE') + '|' + descricao + (detalhe ? ' |erro=' + detalhe : ''));
}

function perfil(uid, status) {
  return {
    uid: uid,
    email: emailDe(uid),
    accountType: 'individual',
    fullName: 'Teste ' + uid,
    phone: '+550000000000',
    city: 'Cidade Teste',
    state: 'SP',
    emailVerified: true,
    role: 'user',
    status: status || 'active',
    subscriptionPlan: 'free',
    profileStatus: 'complete',
    schemaVersion: 1,
    revision: 1,
    lastProfileRequestId: 'stride-test-r-seed-000001',
    lastProfileUpdateRequestId: 'stride-test-r-seed-000001',
    createdAt: ts(),
    updatedAt: ts(),
  };
}

async function semearUsuarios() {
  await semear(async (db) => {
    await db.doc('users/' + U.comprador).set(perfil(U.comprador));
    await db.doc('users/' + U.vendedor).set(perfil(U.vendedor));
    await db.doc('users/' + U.terceiro).set(perfil(U.terceiro));
    await db.doc('users/' + U.moderador).set(perfil(U.moderador));
  });
}

// ---------------------------------------------------------------- APP-R01
async function cenarioR01() {
  const C = 'APP-R01';
  const pedido = 'orders/stride-test-r-pedido-1';
  const evento = pedido + '/events/evento-envio';
  await semear(async (db) => {
    await db.doc(pedido).set({
      orderId: 'stride-test-r-pedido-1',
      participantIds: [U.comprador, U.vendedor],
      buyerUid: U.comprador,
      sellerUid: U.vendedor,
      status: 'shipped',
      revision: 2,
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
    await db.doc(evento).set({
      eventId: 'evento-envio',
      orderId: 'stride-test-r-pedido-1',
      fromStatus: 'paid',
      toStatus: 'shipped',
      actorUid: U.vendedor,
      actorRole: 'seller',
      reason: 'mark_shipped',
      schemaVersion: 1,
      createdAt: ts(),
    });
  });
  const comprador = cliente(U.comprador);
  const vendedor = cliente(U.vendedor);
  const terceiro = cliente(U.terceiro);
  const anon = anonimo();
  await probe(C, 'R01.1', 'PERMITIDO', 'comprador participante le evento', () => comprador.doc(evento).get());
  await probe(C, 'R01.2', 'PERMITIDO', 'vendedor participante le evento', () => vendedor.doc(evento).get());
  await probe(C, 'R01.3', 'NEGADO', 'terceiro le evento', () => terceiro.doc(evento).get());
  await probe(C, 'R01.4', 'NEGADO', 'anonimo le evento', () => anon.doc(evento).get());
  await probe(C, 'R01.5', 'NEGADO', 'comprador altera actorUid de evento existente',
    () => comprador.doc(evento).update({ actorUid: U.comprador }));
  await probe(C, 'R01.6', 'NEGADO', 'vendedor apaga evento', () => vendedor.doc(evento).delete());
  await probe(C, 'R01.7', 'NEGADO', 'comprador cria evento forjado com actorUid do vendedor',
    () => comprador.doc(pedido + '/events/evento-forjado').set({
      eventId: 'evento-forjado',
      orderId: 'stride-test-r-pedido-1',
      fromStatus: 'shipped',
      toStatus: 'delivered',
      actorUid: U.vendedor,
      actorRole: 'seller',
      reason: 'confirm_delivery',
      schemaVersion: 1,
      createdAt: ts(),
    }));
  await probe(C, 'R01.8', 'NEGADO', 'vendedor altera status do pedido diretamente',
    () => vendedor.doc(pedido).update({ status: 'completed' }));
  await probe(C, 'R01.9', 'PERMITIDO', 'comprador lista eventos com limite (controle)',
    () => comprador.collection(pedido + '/events').limit(10).get());
  await probe(C, 'R01.10', 'NEGADO', 'terceiro lista eventos com limite',
    () => terceiro.collection(pedido + '/events').limit(10).get());
}

// ---------------------------------------------------------------- APP-R02
async function cenarioR02() {
  const C = 'APP-R02';
  const conversa = 'conversations/stride-test-r-conversa-1';
  const mensagem = conversa + '/messages/mensagem-1';
  await semear(async (db) => {
    await db.doc(conversa).set({
      conversationId: 'stride-test-r-conversa-1',
      participantIds: [U.comprador, U.vendedor],
      listingId: 'stride-test-r-anuncio-1',
      status: 'active',
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
    await db.doc(mensagem).set({
      messageId: 'mensagem-1',
      conversationId: 'stride-test-r-conversa-1',
      senderId: U.comprador,
      type: 'user_text',
      content: 'Fechamos por R$ 100?',
      safetyFlags: [],
      schemaVersion: 1,
      createdAt: ts(),
    });
  });
  const comprador = cliente(U.comprador);
  const vendedor = cliente(U.vendedor);
  const terceiro = cliente(U.terceiro);
  await probe(C, 'R02.1', 'PERMITIDO', 'comprador participante le mensagem', () => comprador.doc(mensagem).get());
  await probe(C, 'R02.2', 'PERMITIDO', 'vendedor participante le mensagem', () => vendedor.doc(mensagem).get());
  await probe(C, 'R02.3', 'NEGADO', 'terceiro le mensagem', () => terceiro.doc(mensagem).get());
  await probe(C, 'R02.4', 'NEGADO', 'vendedor cria mensagem com senderId do comprador',
    () => vendedor.doc(conversa + '/messages/mensagem-forjada').set({
      messageId: 'mensagem-forjada',
      conversationId: 'stride-test-r-conversa-1',
      senderId: U.comprador,
      type: 'user_text',
      content: 'Aceito o valor',
      safetyFlags: [],
      schemaVersion: 1,
      createdAt: ts(),
    }));
  await probe(C, 'R02.5', 'NEGADO', 'comprador grava mensagem direta (sem caminho do servidor)',
    () => comprador.doc(conversa + '/messages/mensagem-direta').set({
      messageId: 'mensagem-direta',
      conversationId: 'stride-test-r-conversa-1',
      senderId: U.comprador,
      type: 'user_text',
      content: 'Mensagem direta',
      safetyFlags: [],
      schemaVersion: 1,
      createdAt: ts(),
    }));
  await probe(C, 'R02.6', 'NEGADO', 'comprador altera conteudo da propria mensagem',
    () => comprador.doc(mensagem).update({ content: 'Texto alterado' }));
  await probe(C, 'R02.7', 'NEGADO', 'vendedor apaga mensagem do comprador', () => vendedor.doc(mensagem).delete());
  await probe(C, 'R02.8', 'NEGADO', 'comprador altera status da conversa',
    () => comprador.doc(conversa).update({ status: 'closed' }));
  await probe(C, 'R02.9', 'PERMITIDO', 'comprador lista mensagens com limite (controle)',
    () => comprador.collection(conversa + '/messages').limit(10).get());
  await probe(C, 'R02.10', 'NEGADO', 'terceiro lista mensagens com limite',
    () => terceiro.collection(conversa + '/messages').limit(10).get());
}

// ---------------------------------------------------------------- APP-R03
async function cenarioR03() {
  const C = 'APP-R03';
  const proposta = 'proposals/stride-test-r-proposta-1';
  await semear(async (db) => {
    await db.doc(proposta).set({
      proposalId: 'stride-test-r-proposta-1',
      participantIds: [U.comprador, U.vendedor],
      buyerUid: U.comprador,
      sellerUid: U.vendedor,
      listingId: 'stride-test-r-anuncio-1',
      conversationId: 'stride-test-r-conversa-1',
      status: 'pending',
      amountCents: 10000,
      listingRevision: 1,
      listingSnapshot: { priceCents: 12000, pricingMode: 'fixed' },
      schemaVersion: 1,
      createdAt: ts(),
      expiresAt: dataFixa('2030-01-01T00:00:00Z'),
    });
  });
  const comprador = cliente(U.comprador);
  const vendedor = cliente(U.vendedor);
  const terceiro = cliente(U.terceiro);
  await probe(C, 'R03.1', 'PERMITIDO', 'comprador participante le proposta', () => comprador.doc(proposta).get());
  await probe(C, 'R03.2', 'PERMITIDO', 'vendedor participante le proposta', () => vendedor.doc(proposta).get());
  await probe(C, 'R03.3', 'NEGADO', 'terceiro le proposta', () => terceiro.doc(proposta).get());
  await probe(C, 'R03.4', 'NEGADO', 'vendedor marca proposta como aceita diretamente',
    () => vendedor.doc(proposta).update({ status: 'accepted' }));
  await probe(C, 'R03.5', 'NEGADO', 'comprador reduz amountCents da propria proposta',
    () => comprador.doc(proposta).update({ amountCents: 1 }));
  await probe(C, 'R03.6', 'NEGADO', 'comprador apaga proposta', () => comprador.doc(proposta).delete());
  await probe(C, 'R03.7', 'NEGADO', 'comprador cria proposta nova diretamente',
    () => comprador.doc('proposals/stride-test-r-proposta-2').set({
      proposalId: 'stride-test-r-proposta-2',
      participantIds: [U.comprador, U.vendedor],
      buyerUid: U.comprador,
      sellerUid: U.vendedor,
      listingId: 'stride-test-r-anuncio-1',
      status: 'pending',
      amountCents: 9000,
      listingRevision: 1,
      listingSnapshot: { priceCents: 12000, pricingMode: 'fixed' },
      schemaVersion: 1,
      createdAt: ts(),
      expiresAt: dataFixa('2030-01-01T00:00:00Z'),
    }));
  await probe(C, 'R03.8', 'PERMITIDO', 'comprador lista propostas filtrando participacao (controle)',
    () => comprador.collection('proposals').where('participantIds', 'array-contains', U.comprador).limit(10).get());
  await probe(C, 'R03.9', 'NEGADO', 'terceiro lista propostas sem filtro',
    () => terceiro.collection('proposals').limit(10).get());
}

// ---------------------------------------------------------------- APP-R04
async function cenarioR04() {
  const C = 'APP-R04';
  const pagamento = 'payments/stride-test-r-pagamento-1';
  const recibo = 'paymentReceipts/stride-test-r-pagamento-1';
  const evento = 'paymentEvents/stride-test-r-evento-pagamento-1';
  await semear(async (db) => {
    await db.doc(pagamento).set({
      paymentId: 'stride-test-r-pagamento-1',
      orderId: 'stride-test-r-pedido-1',
      buyerUid: U.comprador,
      sellerUid: U.vendedor,
      participantIds: [U.comprador, U.vendedor],
      state: 'approved',
      amountCents: 10000,
      provider: 'mercado_pago',
      providerPaymentId: 'mp-stride-test-1',
      schemaVersion: 1,
      createdAt: ts(),
    });
    await db.doc(recibo).set({
      paymentId: 'stride-test-r-pagamento-1',
      orderId: 'stride-test-r-pedido-1',
      participantIds: [U.comprador, U.vendedor],
      amountCents: 10000,
      status: 'approved',
      schemaVersion: 1,
      createdAt: ts(),
    });
    await db.doc(evento).set({
      eventId: 'stride-test-r-evento-pagamento-1',
      provider: 'mercado_pago',
      providerEventId: 'mp-evento-stride-test-1',
      paymentId: 'stride-test-r-pagamento-1',
      outcome: 'applied',
      schemaVersion: 1,
      createdAt: ts(),
    });
  });
  const comprador = cliente(U.comprador);
  const vendedor = cliente(U.vendedor);
  const terceiro = cliente(U.terceiro);
  await probe(C, 'R04.1', 'PERMITIDO', 'comprador participante le recibo', () => comprador.doc(recibo).get());
  await probe(C, 'R04.2', 'NEGADO', 'terceiro le recibo', () => terceiro.doc(recibo).get());
  await probe(C, 'R04.3', 'NEGADO', 'comprador le pagamento canonico', () => comprador.doc(pagamento).get());
  await probe(C, 'R04.4', 'NEGADO', 'vendedor le evento do provedor', () => vendedor.doc(evento).get());
  await probe(C, 'R04.5', 'NEGADO', 'comprador altera status do recibo para refunded',
    () => comprador.doc(recibo).update({ status: 'refunded' }));
  await probe(C, 'R04.6', 'NEGADO', 'vendedor grava evento de provedor forjado',
    () => vendedor.doc('paymentEvents/stride-test-r-evento-forjado').set({
      eventId: 'stride-test-r-evento-forjado',
      provider: 'mercado_pago',
      providerEventId: 'mp-evento-forjado',
      paymentId: 'stride-test-r-pagamento-1',
      outcome: 'applied',
      schemaVersion: 1,
      createdAt: ts(),
    }));
  await probe(C, 'R04.7', 'NEGADO', 'vendedor altera estado do pagamento canonico',
    () => vendedor.doc(pagamento).update({ state: 'refunded' }));
  await probe(C, 'R04.8', 'PERMITIDO', 'comprador lista recibos filtrando participacao (controle)',
    () => comprador.collection('paymentReceipts').where('participantIds', 'array-contains', U.comprador).limit(10).get());
}

// ---------------------------------------------------------------- APP-R05
async function cenarioR05() {
  const C = 'APP-R05';
  const auditoria = 'auditLogs/stride-test-r-auditoria-1';
  const caso = 'moderationCases/stride-test-r-caso-1';
  const denuncia = 'reports/stride-test-r-denuncia-1';
  await semear(async (db) => {
    await db.doc(auditoria).set({
      actorUid: U.vendedor,
      action: 'listing.updated',
      entityType: 'listing',
      entityId: 'stride-test-r-anuncio-1',
      changedFields: ['priceCents'],
      schemaVersion: 1,
      createdAt: ts(),
    });
    await db.doc(caso).set({
      caseId: 'stride-test-r-caso-1',
      reportId: 'stride-test-r-denuncia-1',
      internalNote: 'Nota interna de teste',
      decision: 'dismissed',
      schemaVersion: 1,
      createdAt: ts(),
    });
    await db.doc(denuncia).set({
      reportId: 'stride-test-r-denuncia-1',
      reporterUid: U.comprador,
      subjectOwnerUid: U.vendedor,
      listingId: 'stride-test-r-anuncio-1',
      reason: 'conteudo_enganoso',
      status: 'open',
      schemaVersion: 1,
      createdAt: ts(),
    });
  });
  const comprador = cliente(U.comprador);
  const moderador = cliente(U.moderador, { moderator: true });
  const anon = anonimo();
  await probe(C, 'R05.1', 'NEGADO', 'comprador le trilha de auditoria', () => comprador.doc(auditoria).get());
  await probe(C, 'R05.2', 'NEGADO', 'moderador le trilha de auditoria', () => moderador.doc(auditoria).get());
  await probe(C, 'R05.3', 'NEGADO', 'moderador grava auditoria forjada',
    () => moderador.doc('auditLogs/stride-test-r-auditoria-forjada').set({
      actorUid: U.comprador,
      action: 'listing.updated',
      entityType: 'listing',
      entityId: 'stride-test-r-anuncio-1',
      changedFields: ['priceCents'],
      schemaVersion: 1,
      createdAt: ts(),
    }));
  await probe(C, 'R05.4', 'NEGADO', 'moderador altera trilha de auditoria existente',
    () => moderador.doc(auditoria).update({ changedFields: [] }));
  await probe(C, 'R05.5', 'NEGADO', 'moderador apaga trilha de auditoria', () => moderador.doc(auditoria).delete());
  await probe(C, 'R05.6', 'NEGADO', 'anonimo le trilha de auditoria', () => anon.doc(auditoria).get());
  await probe(C, 'R05.7', 'NEGADO', 'moderador le nota interna de moderacao', () => moderador.doc(caso).get());
  await probe(C, 'R05.8', 'NEGADO', 'moderador altera caso de moderacao diretamente',
    () => moderador.doc(caso).update({ decision: 'removed' }));
  await probe(C, 'R05.9', 'PERMITIDO', 'moderador le denuncia (controle do claim)', () => moderador.doc(denuncia).get());
}

// ---------------------------------------------------------------- APP-R06
async function cenarioR06() {
  const C = 'APP-R06';
  const denuncia = 'reports/stride-test-r-denuncia-1';
  const disputa = 'disputes/stride-test-r-disputa-1';
  await semear(async (db) => {
    await db.doc(denuncia).set({
      reportId: 'stride-test-r-denuncia-1',
      reporterUid: U.comprador,
      subjectOwnerUid: U.vendedor,
      listingId: 'stride-test-r-anuncio-1',
      reason: 'conteudo_enganoso',
      status: 'open',
      schemaVersion: 1,
      createdAt: ts(),
    });
    await db.doc(disputa).set({
      disputeId: 'stride-test-r-disputa-1',
      orderId: 'stride-test-r-pedido-1',
      participantIds: [U.comprador, U.vendedor],
      buyerUid: U.comprador,
      sellerUid: U.vendedor,
      openedByUid: U.comprador,
      status: 'open',
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
  });
  const comprador = cliente(U.comprador);
  const vendedor = cliente(U.vendedor);
  const terceiro = cliente(U.terceiro);
  const moderador = cliente(U.moderador, { moderator: true });
  await probe(C, 'R06.1', 'PERMITIDO', 'denunciante le a propria denuncia', () => comprador.doc(denuncia).get());
  await probe(C, 'R06.2', 'NEGADO', 'terceiro le denuncia', () => terceiro.doc(denuncia).get());
  await probe(C, 'R06.3', 'PERMITIDO', 'moderador le denuncia', () => moderador.doc(denuncia).get());
  await probe(C, 'R06.4', 'PERMITIDO', 'moderador lista denuncias com limite', () => moderador.collection('reports').limit(10).get());
  await probe(C, 'R06.5', 'NEGADO', 'denunciante lista denuncias sem filtro', () => comprador.collection('reports').limit(10).get());
  await probe(C, 'R06.6', 'PERMITIDO', 'denunciante lista as proprias denuncias (filtro)',
    () => comprador.collection('reports').where('reporterUid', '==', U.comprador).limit(10).get());
  await probe(C, 'R06.7', 'NEGADO', 'denunciante altera status da denuncia',
    () => comprador.doc(denuncia).update({ status: 'dismissed' }));
  await probe(C, 'R06.8', 'NEGADO', 'moderador altera status da denuncia diretamente',
    () => moderador.doc(denuncia).update({ status: 'dismissed' }));
  await probe(C, 'R06.9', 'PERMITIDO', 'vendedor participante le disputa', () => vendedor.doc(disputa).get());
  await probe(C, 'R06.10', 'NEGADO', 'terceiro le disputa', () => terceiro.doc(disputa).get());
  await probe(C, 'R06.11', 'PERMITIDO', 'moderador le disputa', () => moderador.doc(disputa).get());
  await probe(C, 'R06.12', 'NEGADO', 'comprador marca disputa como resolvida',
    () => comprador.doc(disputa).update({ status: 'resolved' }));
  await probe(C, 'R06.13', 'NEGADO', 'moderador marca disputa como resolvida diretamente',
    () => moderador.doc(disputa).update({ status: 'resolved' }));
}

// ---------------------------------------------------------------- APP-R07
function pacoteCadastro(db, uid, n, opcoes) {
  const o = opcoes || {};
  const rid = 'stride-test-r-cadastro-' + String(n).padStart(6, '0');
  const consentimento = (tipo, extra) => Object.assign({
    uid: uid,
    document: tipo,
    documentVersion: '2.0',
    granted: true,
    requestId: rid,
    schemaVersion: 1,
    createdAt: ts(),
  }, extra || {});
  const usuario = Object.assign({
    uid: uid,
    email: emailDe(uid),
    accountType: 'individual',
    fullName: 'Cadastro Teste',
    phone: '+550000000000',
    city: 'Cidade Teste',
    state: 'SP',
    emailVerified: true,
    role: 'user',
    status: 'active',
    subscriptionPlan: 'free',
    profileStatus: 'complete',
    schemaVersion: 1,
    revision: 1,
    lastProfileRequestId: rid,
    lastProfileUpdateRequestId: rid,
    createdAt: ts(),
    updatedAt: ts(),
  }, o.usuario || {});
  const lote = db.batch();
  if (!o.semUsuario) lote.set(db.doc('users/' + uid), usuario);
  if (!o.semTermos) lote.set(db.doc('consents/' + uid + '/records/terms'), consentimento('terms', o.termos));
  if (!o.semPrivacidade) lote.set(db.doc('consents/' + uid + '/records/privacy'), consentimento('privacy', o.privacidade));
  return lote;
}

async function cenarioR07() {
  const C = 'APP-R07';
  const N = (n) => 'stride-test-r-novo-' + n;
  const rid = (n) => 'stride-test-r-cadastro-' + String(n).padStart(6, '0');
  const novo1 = cliente(N(1));
  const terms1 = 'consents/' + N(1) + '/records/terms';
  const privacy1 = 'consents/' + N(1) + '/records/privacy';
  await probe(C, 'R07.1', 'PERMITIDO', 'cadastro atomico do proprio titular (perfil + termos + privacidade)',
    () => pacoteCadastro(novo1, N(1), 1, {}).commit());
  await probe(C, 'R07.2', 'PERMITIDO', 'titular le o proprio consentimento de termos (controle)',
    () => novo1.doc(terms1).get());
  await probe(C, 'R07.3', 'NEGADO', 'terceiro le consentimento de termos alheio',
    () => cliente(U.terceiro).doc(terms1).get());
  await probe(C, 'R07.4', 'NEGADO', 'titular altera consentimento gravado (write-once)',
    () => novo1.doc(terms1).update({ granted: false }));
  await probe(C, 'R07.5', 'NEGADO', 'titular apaga consentimento de privacidade',
    () => novo1.doc(privacy1).delete());
  await probe(C, 'R07.6', 'NEGADO', 'cadastro com createdAt forjado (diferente de request.time)',
    () => pacoteCadastro(cliente(N(2)), N(2), 2, { termos: { createdAt: dataFixa('2020-01-01T00:00:00Z') } }).commit());
  await probe(C, 'R07.7', 'NEGADO', 'cadastro com termos nao concedidos (granted=false)',
    () => pacoteCadastro(cliente(N(3)), N(3), 3, { termos: { granted: false } }).commit());
  await probe(C, 'R07.8', 'NEGADO', 'cadastro sem consentimento de privacidade (vinculo do lote)',
    () => pacoteCadastro(cliente(N(4)), N(4), 4, { semPrivacidade: true }).commit());
  await probe(C, 'R07.9', 'NEGADO', 'termos com requestId diferente do cadastro',
    () => pacoteCadastro(cliente(N(5)), N(5), 5, { termos: { requestId: rid(99) } }).commit());
  await probe(C, 'R07.10', 'NEGADO', 'termos com documentVersion diferente da versao fixada (2.0)',
    () => pacoteCadastro(cliente(N(6)), N(6), 6, { termos: { documentVersion: '1.0' } }).commit());
  await probe(C, 'R07.11', 'NEGADO', 'titular grava consentimento no caminho de outro uid',
    () => cliente(N(7)).doc('consents/' + N(8) + '/records/terms').set({
      uid: N(8),
      document: 'terms',
      documentVersion: '2.0',
      granted: true,
      requestId: rid(7),
      schemaVersion: 1,
      createdAt: ts(),
    }));
}

// ---------------------------------------------------------------- APP-R08
async function cenarioR08() {
  const C = 'APP-R08';
  const perfilV = 'users/' + U.vendedor;
  const vendedor = cliente(U.vendedor);
  const terceiro = cliente(U.terceiro);
  await probe(C, 'R08.1', 'PERMITIDO', 'vendedor le o proprio perfil', () => vendedor.doc(perfilV).get());
  await probe(C, 'R08.2', 'NEGADO', 'terceiro le perfil do vendedor', () => terceiro.doc(perfilV).get());
  await probe(C, 'R08.3', 'NEGADO', 'vendedor apaga o proprio perfil', () => vendedor.doc(perfilV).delete());
  await probe(C, 'R08.4', 'NEGADO', 'vendedor define status deleted',
    () => vendedor.doc(perfilV).update({ status: 'deleted', revision: 2, updatedAt: ts(), lastProfileUpdateRequestId: 'stride-test-r-upd-000001' }));
  await probe(C, 'R08.5', 'NEGADO', 'vendedor eleva role para admin',
    () => vendedor.doc(perfilV).update({ role: 'admin', revision: 2, updatedAt: ts(), lastProfileUpdateRequestId: 'stride-test-r-upd-000002' }));
  await probe(C, 'R08.6', 'PERMITIDO', 'vendedor altera nome com incremento de revisao (controle)',
    () => vendedor.doc(perfilV).update({ fullName: 'Nome Atualizado', revision: 2, updatedAt: ts(), lastProfileUpdateRequestId: 'stride-test-r-upd-000003' }));
  let preservado = 'erro';
  try {
    const dados = (await vendedor.doc(perfilV).get()).data();
    preservado = Object.values(dados).some((valor) => valor === 'Teste ' + U.vendedor);
  } catch (erro) {
    preservado = 'erro';
  }
  observacoes.push({ cenario: C, id: 'R08.obs', campo: 'valor-anterior-de-fullName-preservado-no-documento', valor: preservado });
  emitir('OBS|' + C + '|R08.obs|valor-anterior-preservado=' + preservado);
  await probe(C, 'R08.7', 'NEGADO', 'vendedor repete revisao sem incrementar',
    () => vendedor.doc(perfilV).update({ fullName: 'Nome Repetido', revision: 2, updatedAt: ts(), lastProfileUpdateRequestId: 'stride-test-r-upd-000004' }));
}

// ---------------------------------------------------------------- APP-R09
async function cenarioR09() {
  const C = 'APP-R09';
  const exclusao = 'accountDeletionRequests/stride-test-r-exclusao-1';
  const segredo = 'accountDeletionSecrets/stride-test-r-exclusao-1';
  const exportacao = 'privacyExportRequests/stride-test-r-exportacao-1';
  await semear(async (db) => {
    await db.doc(exclusao).set({
      deletionRequestId: 'stride-test-r-exclusao-1',
      uid: U.comprador,
      status: 'manual_review_required',
      stage: 'private_data',
      scheduledAt: null,
      dueAt: dataFixa('2030-01-01T00:00:00Z'),
      reasonCode: 'transaction_retention_review',
      schemaVersion: 1,
      createdAt: ts(),
    });
    await db.doc(segredo).set({
      deletionRequestId: 'stride-test-r-exclusao-1',
      uid: U.comprador,
      tombstoneUid: 'deleted_stride-test-r-amostra',
      schemaVersion: 1,
      createdAt: ts(),
    });
    await db.doc(exportacao).set({
      exportId: 'stride-test-r-exportacao-1',
      uid: U.comprador,
      status: 'ready',
      schemaVersion: 1,
      createdAt: ts(),
      expiresAt: dataFixa('2030-01-01T00:00:00Z'),
    });
  });
  const comprador = cliente(U.comprador);
  const terceiro = cliente(U.terceiro);
  await probe(C, 'R09.1', 'PERMITIDO', 'titular le a propria solicitacao de exclusao', () => comprador.doc(exclusao).get());
  await probe(C, 'R09.2', 'NEGADO', 'terceiro le solicitacao de exclusao alheia', () => terceiro.doc(exclusao).get());
  await probe(C, 'R09.3', 'NEGADO', 'titular lista solicitacoes de exclusao',
    () => comprador.collection('accountDeletionRequests').limit(10).get());
  await probe(C, 'R09.4', 'NEGADO', 'titular altera status da solicitacao para pending',
    () => comprador.doc(exclusao).update({ status: 'pending' }));
  await probe(C, 'R09.5', 'NEGADO', 'titular le o segredo do tombstone', () => comprador.doc(segredo).get());
  await probe(C, 'R09.6', 'NEGADO', 'titular grava segredo de tombstone forjado',
    () => comprador.doc('accountDeletionSecrets/stride-test-r-forjado').set({
      deletionRequestId: 'stride-test-r-forjado',
      uid: U.comprador,
      tombstoneUid: 'deleted_forjado',
      schemaVersion: 1,
      createdAt: ts(),
    }));
  await probe(C, 'R09.7', 'PERMITIDO', 'titular le a propria exportacao (controle)', () => comprador.doc(exportacao).get());
  await probe(C, 'R09.8', 'NEGADO', 'titular altera status da exportacao',
    () => comprador.doc(exportacao).update({ status: 'expired' }));
}

// ---------------------------------------------------------------- APP-R10
async function cenarioR10() {
  const C = 'APP-R10';
  const avaliacao = 'reviews/stride-test-r-avaliacao-1';
  await semear(async (db) => {
    await db.doc(avaliacao).set({
      reviewId: 'stride-test-r-avaliacao-1',
      orderId: 'stride-test-r-pedido-1',
      authorUid: U.comprador,
      subjectUid: U.vendedor,
      participantIds: [U.comprador, U.vendedor],
      rating: 5,
      comment: 'Texto de teste',
      schemaVersion: 1,
      createdAt: ts(),
    });
  });
  const comprador = cliente(U.comprador);
  const vendedor = cliente(U.vendedor);
  const terceiro = cliente(U.terceiro);
  await probe(C, 'R10.1', 'PERMITIDO', 'autor le a propria avaliacao', () => comprador.doc(avaliacao).get());
  await probe(C, 'R10.2', 'PERMITIDO', 'avaliado le a avaliacao recebida', () => vendedor.doc(avaliacao).get());
  await probe(C, 'R10.3', 'NEGADO', 'terceiro le a avaliacao', () => terceiro.doc(avaliacao).get());
  await probe(C, 'R10.4', 'NEGADO', 'autor altera a nota', () => comprador.doc(avaliacao).update({ rating: 1 }));
  await probe(C, 'R10.5', 'NEGADO', 'avaliado apaga a avaliacao', () => vendedor.doc(avaliacao).delete());
  await probe(C, 'R10.6', 'NEGADO', 'autor cria segunda avaliacao do mesmo pedido',
    () => comprador.doc('reviews/stride-test-r-avaliacao-2').set({
      reviewId: 'stride-test-r-avaliacao-2',
      orderId: 'stride-test-r-pedido-1',
      authorUid: U.comprador,
      subjectUid: U.vendedor,
      participantIds: [U.comprador, U.vendedor],
      rating: 5,
      comment: 'Segunda avaliacao',
      schemaVersion: 1,
      createdAt: ts(),
    }));
  await probe(C, 'R10.7', 'PERMITIDO', 'autor lista avaliacoes filtrando participacao (controle)',
    () => comprador.collection('reviews').where('participantIds', 'array-contains', U.comprador).limit(10).get());
}

// ---------------------------------------------------------------- execucao
const CENARIOS = [
  ['APP-R01', cenarioR01],
  ['APP-R02', cenarioR02],
  ['APP-R03', cenarioR03],
  ['APP-R04', cenarioR04],
  ['APP-R05', cenarioR05],
  ['APP-R06', cenarioR06],
  ['APP-R07', cenarioR07],
  ['APP-R08', cenarioR08],
  ['APP-R09', cenarioR09],
  ['APP-R10', cenarioR10],
];

for (const [id, executar] of CENARIOS) {
  await env.clearFirestore();
  await semearUsuarios();
  emitir('CENARIO|' + id + '|inicio');
  await executar();
}

function veredito(cenario) {
  const itens = resultados.filter((r) => r.cenario === cenario);
  if (itens.some((r) => r.observado === 'erro')) return 'INCONCLUSIVO';
  if (itens.some((r) => !r.ok && r.esperado === 'NEGADO')) return 'BURLADO';
  if (itens.some((r) => !r.ok)) return 'INCONCLUSIVO';
  return 'BLOQUEADO';
}

const veredictos = {};
for (const [id] of CENARIOS) {
  veredictos[id] = veredito(id);
  emitir('VEREDITO|' + id + '|' + veredictos[id]);
}

const resumo = JSON.stringify({
  veredictos,
  probes: resultados.map((r) => [r.cenario, r.id, r.esperado, r.observado, r.ok]),
});
const hashVeredictos = createHash('sha256').update(resumo).digest('hex');
const divergentes = resultados.filter((r) => !r.ok).length;
emitir('TOTAL_PROBES=' + resultados.length + ' DIVERGENTES=' + divergentes);
emitir('HASH_VEREDICTOS=' + hashVeredictos);

writeFileSync(RESULTADO_PATH, JSON.stringify({
  rodada: RODADA,
  alvo: { projectId: PROJECT_ID, host: HOST, porta: PORTA, functionsEmulator: 'desligado' },
  regras: { arquivo: 'repositorio/firebase/firestore.rules', sha256: regrasSha256 },
  veredictos,
  hashVeredictos,
  totalProbes: resultados.length,
  divergentes,
  observacoes,
  probes: resultados,
}, null, 2), 'utf8');
writeFileSync(BRUTO_PATH, linhas.join('\n') + '\n', 'utf8');
await env.cleanup();
