/**
 * Cenarios STRIDE-I (Divulgacao de informacao) - camada de regras no emulador local.
 *
 * Alvo: emuladores locais, projectId demo-handmade. Firestore 127.0.0.1:18080, Storage 127.0.0.1:19199.
 * Functions Emulator desligado. Nenhuma chamada ao projeto de desenvolvimento.
 * Dados: apenas contas example.com sinteticas e identificadores com prefixo stride-test-i-.
 *
 * Regras testadas, lidas diretamente do repositorio:
 *   repositorio/firebase/firestore.rules
 *   repositorio/firebase/storage.rules
 * O SHA-256 de cada arquivo e impresso e gravado no resultado.
 *
 * Metodo (mesmo padrao de cenarios-r.mjs):
 *  - Fixtures de servidor sao semeados com as regras desligadas.
 *  - Probes usam operacao bruta em try/catch, sem assertFails:
 *      PERMITIDO = a operacao resolveu; NEGADO = permission-denied ou storage/unauthorized; erro = falha de harness.
 *  - Cada cenario tem controles positivos. Um controle falho gera INCONCLUSIVO, nunca BLOQUEADO.
 *  - Um probe negativo que resolve gera BURLADO (informacao divulgada indevidamente).
 *
 * Uso (a partir de stride-trabalho/testes):
 *   firebase.cmd emulators:exec --only firestore,storage --project demo-handmade "node cenarios-i.mjs N"
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import firebase from 'firebase/compat/app';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';

const PROJECT_ID = 'demo-handmade';
const HOST = '127.0.0.1';
const PORTA_FS = 18080;
const PORTA_ST = 19199;
const RODADA = process.argv[2] || 'manual';
const PASTA = import.meta.dirname;
const REPO = path.resolve(PASTA, '..', '..', 'repositorio');
const REGRAS_FS_PATH = path.join(REPO, 'firebase', 'firestore.rules');
const REGRAS_ST_PATH = path.join(REPO, 'firebase', 'storage.rules');
const RESULTADO_PATH = path.resolve(PASTA, 'resultado-i-rodada-' + RODADA + '.json');
const BRUTO_PATH = path.resolve(PASTA, '..', 'brutos', 'i-rodada-' + RODADA + '.txt');

const linhas = [];
function emitir(linha) {
  linhas.push(linha);
  console.log(linha);
}

emitir('alvo projectId=' + PROJECT_ID + ' firestore=' + HOST + ':' + PORTA_FS + ' storage=' + HOST + ':' + PORTA_ST + ' rodada=' + RODADA);
if (process.env.FIRESTORE_EMULATOR_HOST !== HOST + ':' + PORTA_FS) {
  emitir('ABORTADO: FIRESTORE_EMULATOR_HOST=' + (process.env.FIRESTORE_EMULATOR_HOST || '(ausente)'));
  process.exit(2);
}

const fsBytes = readFileSync(REGRAS_FS_PATH);
const stBytes = readFileSync(REGRAS_ST_PATH);
const fsSha256 = createHash('sha256').update(fsBytes).digest('hex');
const stSha256 = createHash('sha256').update(stBytes).digest('hex');
emitir('regras firestore=repositorio/firebase/firestore.rules sha256=' + fsSha256);
emitir('regras storage=repositorio/firebase/storage.rules sha256=' + stSha256);

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { host: HOST, port: PORTA_FS, rules: fsBytes.toString('utf8') },
  storage: { host: HOST, port: PORTA_ST, rules: stBytes.toString('utf8') },
});

const ts = () => firebase.firestore.FieldValue.serverTimestamp();
const emFuturo = () => firebase.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000);
const emPassado = () => firebase.firestore.Timestamp.fromMillis(Date.now() - 60 * 1000);
const emailDe = (uid) => uid.replace('stride-test-i-', '') + '@example.com';

const U = {
  titular: 'stride-test-i-titular',
  estranho: 'stride-test-i-estranho',
  moderador: 'stride-test-i-moderador',
  suspenso: 'stride-test-i-suspenso',
  incompleto: 'stride-test-i-incompleto',
};
const ANUNCIO = {
  ativo: 'stride-test-i-anuncio-ativo',
  rascunho: 'stride-test-i-anuncio-rascunho',
  removido: 'stride-test-i-anuncio-removido',
};
const CONVERSA = 'conversation_1234567890abcdef1234567890abcdef';
const PEDIDO = 'order_1234567890abcdef1234567890abcdef';
const EXPORT_OK = 'stride-test-i-export-ok';
const EXPORT_EXP = 'stride-test-i-export-expirado';
const EXPORT_PEND = 'stride-test-i-export-pendente';

function cliente(uid, claims) {
  return env.authenticatedContext(uid, Object.assign({ email: emailDe(uid), email_verified: true }, claims || {}));
}
const fsDe = (uid, claims) => cliente(uid, claims).firestore();
const stDe = (uid, claims) => cliente(uid, claims).storage();
const anonimo = () => env.unauthenticatedContext();
const fsAnon = () => anonimo().firestore();
const stAnon = () => anonimo().storage();

async function semear(fn) {
  await env.withSecurityRulesDisabled(async (contexto) => fn(contexto.firestore()));
}
async function semearStorage(caminho, conteudo, metadados) {
  await env.withSecurityRulesDisabled(async (contexto) => {
    await contexto.storage().ref(caminho).put(Buffer.from(conteudo), metadados);
  });
}

const resultados = [];
const observacoes = [];

function classificar(erro) {
  const codigo = erro && erro.code;
  const msg = String((erro && erro.message) || erro);
  if (codigo === 'permission-denied' || codigo === 'storage/unauthorized' || /PERMISSION_DENIED|insufficient permissions|storage\/unauthorized|unauthorized/i.test(msg)) {
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
  emitir('PROBE|' + cenario + '|' + id + '|esperado=' + esperado + '|observado=' + observado + '|' + (ok ? 'OK' : 'DIVERGE') + '|' + descricao + (detalhe ? ' |erro=' + detalhe : ''));
}

function perfilCompleto(uid, status, perfilStatus) {
  return {
    uid,
    email: emailDe(uid),
    fullName: 'Nome Pessoal ' + uid,
    phone: '+550000000000',
    cpf: '00000000000',
    birthDate: '1990-01-01',
    addressLine: 'Rua Teste 100',
    accountType: 'individual',
    city: 'Cidade Teste',
    state: 'SP',
    emailVerified: true,
    role: 'user',
    status: status || 'active',
    profileStatus: perfilStatus || 'complete',
    subscriptionPlan: 'free',
    schemaVersion: 1,
    revision: 1,
    lastProfileRequestId: 'stride-test-i-seed-000001',
    lastProfileUpdateRequestId: 'stride-test-i-seed-000001',
    createdAt: ts(),
    updatedAt: ts(),
  };
}

async function semearUsuarios() {
  await semear(async (db) => {
    await db.doc('users/' + U.titular).set(perfilCompleto(U.titular));
    await db.doc('users/' + U.estranho).set(perfilCompleto(U.estranho));
    await db.doc('users/' + U.moderador).set(perfilCompleto(U.moderador));
    await db.doc('users/' + U.suspenso).set(perfilCompleto(U.suspenso, 'suspended'));
    await db.doc('users/' + U.incompleto).set(perfilCompleto(U.incompleto, 'active', 'draft'));
  });
}

async function semearAnuncios() {
  const base = (id, status) => ({
    listingId: id,
    sellerId: U.titular,
    status,
    title: 'Anuncio de teste ' + status,
    description: 'Descricao sintetica do anuncio de teste.',
    category: 'wood',
    condition: 'new',
    listingType: 'sale',
    pricingMode: 'fixed',
    priceCents: 10000,
    city: 'Cidade Teste',
    state: 'SP',
    views: 0,
    schemaVersion: 1,
    createdAt: ts(),
    updatedAt: ts(),
  });
  await semear(async (db) => {
    await db.doc('listings/' + ANUNCIO.ativo).set(Object.assign(base(ANUNCIO.ativo, 'active'), { orderParticipantIds: [] }));
    await db.doc('listings/' + ANUNCIO.rascunho).set(base(ANUNCIO.rascunho, 'draft'));
    await db.doc('listings/' + ANUNCIO.removido).set(base(ANUNCIO.removido, 'removed'));
    await db.doc('listingLocations/' + ANUNCIO.ativo).set({ listingId: ANUNCIO.ativo, latitude: -23.55, longitude: -46.63, precision: 'approximate_2dp', updatedAt: ts() });
    await db.doc('listingMetrics/' + ANUNCIO.ativo).set({ listingId: ANUNCIO.ativo, views: 12, updatedAt: ts() });
    await db.doc('listingMetrics/' + ANUNCIO.rascunho).set({ listingId: ANUNCIO.rascunho, views: 0, updatedAt: ts() });
    await db.doc('listings/' + ANUNCIO.ativo + '/media/stride-test-i-midia-pronta').set({
      mediaId: 'stride-test-i-midia-pronta', listingId: ANUNCIO.ativo, sellerId: U.titular, status: 'ready',
      storagePath: 'listing-media/' + U.titular + '/' + ANUNCIO.ativo + '/stride-test-i-midia-pronta/original',
      rejectionReason: 'exif_gps_detectado', expiresAt: emFuturo(), expectedSizeBytes: 12, expectedContentType: 'image/jpeg',
      schemaVersion: 1, createdAt: ts(), updatedAt: ts(),
    });
    await db.doc('listings/' + ANUNCIO.ativo + '/media/stride-test-i-midia-aguardando').set({
      mediaId: 'stride-test-i-midia-aguardando', listingId: ANUNCIO.ativo, sellerId: U.titular, status: 'awaiting_upload',
      storagePath: 'listing-media/' + U.titular + '/' + ANUNCIO.ativo + '/stride-test-i-midia-aguardando/original',
      expiresAt: emFuturo(), expectedSizeBytes: 12, expectedContentType: 'image/jpeg', schemaVersion: 1, createdAt: ts(), updatedAt: ts(),
    });
    await db.doc('listings/' + ANUNCIO.rascunho + '/media/stride-test-i-midia-rascunho').set({
      mediaId: 'stride-test-i-midia-rascunho', listingId: ANUNCIO.rascunho, sellerId: U.titular, status: 'ready',
      storagePath: 'listing-media/' + U.titular + '/' + ANUNCIO.rascunho + '/stride-test-i-midia-rascunho/original',
      expiresAt: emFuturo(), expectedSizeBytes: 12, expectedContentType: 'image/jpeg', schemaVersion: 1, createdAt: ts(), updatedAt: ts(),
    });
  });
}

async function semearPrivados() {
  await semear(async (db) => {
    await db.doc('consents/' + U.titular + '/records/terms').set({ uid: U.titular, document: 'terms', documentVersion: '2.0', granted: true, requestId: 'stride-test-i-consent-0001', schemaVersion: 1, createdAt: ts() });
    await db.doc('blocks/' + U.titular + '/items/' + U.estranho).set({ blockedUid: U.estranho, createdAt: ts() });
    await db.doc('notifications/' + U.titular + '/items/stride-test-i-notif-1').set({ type: 'proposal_received', createdAt: ts(), readAt: null });
    await db.doc('favorites/' + U.titular + '/items/' + ANUNCIO.ativo).set({ listingId: ANUNCIO.ativo, createdAt: ts() });
    await db.doc('privacyExportRequests/' + EXPORT_OK).set({ exportId: EXPORT_OK, uid: U.titular, status: 'ready', storagePath: 'privacy-exports/' + U.titular + '/' + EXPORT_OK + '/data.json', expiresAt: emFuturo(), schemaVersion: 1, createdAt: ts() });
    await db.doc('privacyExportRequests/' + EXPORT_EXP).set({ exportId: EXPORT_EXP, uid: U.titular, status: 'ready', storagePath: 'privacy-exports/' + U.titular + '/' + EXPORT_EXP + '/data.json', expiresAt: emPassado(), schemaVersion: 1, createdAt: ts() });
    await db.doc('privacyExportRequests/' + EXPORT_PEND).set({ exportId: EXPORT_PEND, uid: U.titular, status: 'pending', storagePath: 'privacy-exports/' + U.titular + '/' + EXPORT_PEND + '/data.json', expiresAt: emFuturo(), schemaVersion: 1, createdAt: ts() });
    await db.doc('sellerProfiles/' + U.titular).set({ uid: U.titular, displayName: 'Vendedor Teste', accountType: 'individual', city: 'Cidade Teste', state: 'SP', sellerSince: ts(), profileRevision: 1, visibility: 'public', schemaVersion: 1 });
    await db.doc('sellerProfiles/' + U.estranho).set({ uid: U.estranho, displayName: 'Privado Teste', accountType: 'individual', city: 'Cidade Teste', state: 'SP', sellerSince: ts(), profileRevision: 1, visibility: 'private', schemaVersion: 1 });
    await db.doc('sellerProfiles/' + U.suspenso).set({ uid: U.suspenso, displayName: 'Suspenso Teste', accountType: 'individual', city: 'Cidade Teste', state: 'SP', sellerSince: ts(), profileRevision: 1, visibility: 'public', schemaVersion: 1 });
    await db.doc('sellerProfiles/' + U.incompleto).set({ uid: U.incompleto, displayName: 'Incompleto Teste', accountType: 'individual', city: 'Cidade Teste', state: 'SP', sellerSince: ts(), profileRevision: 1, visibility: 'public', schemaVersion: 1 });
    await db.doc('reviewAggregates/' + U.titular).set({ subjectUid: U.titular, ratingCount: 3, ratingSum: 12 });
    await db.doc('reviewAggregates/' + U.estranho).set({ subjectUid: U.estranho, ratingCount: 2, ratingSum: 11 });
  });
}

async function semearOperacional() {
  await semear(async (db) => {
    await db.doc('payments/stride-test-i-pag-1').set({ paymentId: 'stride-test-i-pag-1', buyerUid: U.estranho, sellerUid: U.titular, participantIds: [U.estranho, U.titular], state: 'approved', amountCents: 10000, providerPaymentId: 'mp-stride-test-i-1', schemaVersion: 1, createdAt: ts() });
    await db.doc('paymentAttempts/stride-test-i-att-1').set({ uid: U.titular, status: 'pending', schemaVersion: 1, createdAt: ts() });
    await db.doc('refundAttempts/stride-test-i-ref-1').set({ uid: U.titular, status: 'pending', schemaVersion: 1, createdAt: ts() });
    await db.doc('paymentEvents/stride-test-i-ev-1').set({ eventId: 'stride-test-i-ev-1', provider: 'mercado_pago', providerEventId: 'mp-ev-stride-test-i-1', outcome: 'applied', schemaVersion: 1, createdAt: ts() });
    await db.doc('sellerConnections/' + U.titular).set({ uid: U.titular, provider: 'mercado_pago', accountRef: 'stride-test-i-conta', schemaVersion: 1, createdAt: ts() });
    await db.doc('oauthStates/stride-test-i-state-1').set({ uid: U.titular, createdAt: ts() });
    await db.doc('providerAccountLinks/stride-test-i-link-1').set({ uid: U.titular, schemaVersion: 1, createdAt: ts() });
    await db.doc('platformConfig/global').set({ maintenance: false, schemaVersion: 1 });
    await db.doc('deviceRegistrations/stride-test-i-dev-1').set({ uid: U.titular, token: 'stride-test-i-token-fake', schemaVersion: 1, createdAt: ts() });
    await db.doc('notificationDeliveryJobs/stride-test-i-job-1').set({ uid: U.titular, status: 'queued', schemaVersion: 1, createdAt: ts() });
    await db.doc('conversations/' + CONVERSA).set({ conversationId: CONVERSA, participantIds: [U.titular, U.estranho], listingId: ANUNCIO.ativo, buyerId: U.estranho, sellerId: U.titular, status: 'active', unreadCounts: {}, schemaVersion: 1, createdAt: ts(), updatedAt: ts() });
    await db.doc('conversations/' + CONVERSA + '/operations/stride-test-i-op-1').set({ actorUid: U.titular, action: 'chat.message_sent', payloadHash: 'stride-test-i-hash', schemaVersion: 1, createdAt: ts() });
    await db.doc('conversations/' + CONVERSA + '/rateLimits/' + U.titular).set({ windowStartedAt: ts(), count: 3 });
    await db.doc('orderOperations/' + U.titular + '/requests/stride-test-i-req-1').set({ actorUid: U.titular, action: 'order.mark_shipped', payloadHash: 'stride-test-i-hash', schemaVersion: 1, createdAt: ts() });
    await db.doc('orders/' + PEDIDO).set({ orderId: PEDIDO, buyerId: U.estranho, sellerId: U.titular, participantIds: [U.estranho, U.titular], status: 'shipped', paymentStatus: 'approved', revision: 2, schemaVersion: 1, createdAt: ts(), updatedAt: ts() });
  });
}

async function semearStorageObjetos() {
  const meta = (uid) => ({ contentType: 'image/jpeg', customMetadata: { ownerUid: uid } });
  await semearStorage('listing-media/' + U.titular + '/' + ANUNCIO.ativo + '/stride-test-i-midia-pronta/original', 'original-bytes', meta(U.titular));
  await semearStorage('listing-media/' + U.titular + '/' + ANUNCIO.ativo + '/stride-test-i-midia-pronta/display', 'display-bytes', meta(U.titular));
  await semearStorage('listing-media/' + U.titular + '/' + ANUNCIO.ativo + '/stride-test-i-midia-pronta/thumb', 'thumb-bytes', meta(U.titular));
  await semearStorage('listing-media/' + U.titular + '/' + ANUNCIO.rascunho + '/stride-test-i-midia-rascunho/display', 'display-bytes', meta(U.titular));
  await semearStorage('listing-media/' + U.titular + '/' + ANUNCIO.ativo + '/stride-test-i-midia-aguardando/display', 'display-bytes', meta(U.titular));
  await semearStorage('privacy-exports/' + U.titular + '/' + EXPORT_OK + '/data.json', '{"ok":true}', { contentType: 'application/json' });
  await semearStorage('privacy-exports/' + U.titular + '/' + EXPORT_OK + '/manifest.json', '{"manifest":true}', { contentType: 'application/json' });
  await semearStorage('privacy-exports/' + U.titular + '/' + EXPORT_EXP + '/data.json', '{"exp":true}', { contentType: 'application/json' });
  await semearStorage('privacy-exports/' + U.titular + '/' + EXPORT_PEND + '/data.json', '{"pend":true}', { contentType: 'application/json' });
  await semearStorage('profile-avatars/' + U.titular + '/avatar', 'avatar-bytes', meta(U.titular));
}

async function cenarioI01() {
  const C = 'APP-I01';
  const titular = fsDe(U.titular);
  const estranho = fsDe(U.estranho);
  const anon = fsAnon();
  await probe(C, 'I01.1', 'PERMITIDO', 'titular le o proprio cadastro (controle)', () => titular.doc('users/' + U.titular).get());
  await probe(C, 'I01.2', 'NEGADO', 'estranho le o cadastro do titular', () => estranho.doc('users/' + U.titular).get());
  await probe(C, 'I01.3', 'NEGADO', 'visitante sem login le o cadastro do titular', () => anon.doc('users/' + U.titular).get());
  await probe(C, 'I01.4', 'NEGADO', 'estranho enumera a colecao users (limite 10)', () => estranho.collection('users').limit(10).get());
  await probe(C, 'I01.5', 'NEGADO', 'titular enumera a colecao users inteira', () => titular.collection('users').limit(10).get());
  await probe(C, 'I01.6', 'NEGADO', 'estranho le os consentimentos do titular', () => estranho.doc('consents/' + U.titular + '/records/terms').get());
  await probe(C, 'I01.7', 'PERMITIDO', 'titular le os proprios consentimentos (controle)', () => titular.doc('consents/' + U.titular + '/records/terms').get());
}

async function cenarioI02() {
  const C = 'APP-I02';
  const titular = fsDe(U.titular);
  const estranho = fsDe(U.estranho);
  const anon = fsAnon();
  await probe(C, 'I02.1', 'PERMITIDO', 'titular le um bloqueio proprio (controle)', () => titular.doc('blocks/' + U.titular + '/items/' + U.estranho).get());
  await probe(C, 'I02.2', 'NEGADO', 'estranho le o bloqueio do titular', () => estranho.doc('blocks/' + U.titular + '/items/' + U.estranho).get());
  await probe(C, 'I02.3', 'PERMITIDO', 'titular lista os proprios bloqueios com limite (controle)', () => titular.collection('blocks/' + U.titular + '/items').limit(10).get());
  await probe(C, 'I02.4', 'NEGADO', 'estranho lista os bloqueios do titular', () => estranho.collection('blocks/' + U.titular + '/items').limit(10).get());
  await probe(C, 'I02.5', 'NEGADO', 'titular lista os bloqueios sem limite', () => titular.collection('blocks/' + U.titular + '/items').get());
  await probe(C, 'I02.6', 'PERMITIDO', 'titular le a propria notificacao (controle)', () => titular.doc('notifications/' + U.titular + '/items/stride-test-i-notif-1').get());
  await probe(C, 'I02.7', 'NEGADO', 'estranho lista as notificacoes do titular', () => estranho.collection('notifications/' + U.titular + '/items').limit(10).get());
  await probe(C, 'I02.8', 'NEGADO', 'visitante sem login le as notificacoes do titular', () => anon.doc('notifications/' + U.titular + '/items/stride-test-i-notif-1').get());
}

async function cenarioI03() {
  const C = 'APP-I03';
  const anon = fsAnon();
  const estranho = fsDe(U.estranho);
  const titular = fsDe(U.titular);
  await probe(C, 'I03.1', 'PERMITIDO', 'visitante le anuncio ativo (publico por desenho, controle)', () => anon.doc('listings/' + ANUNCIO.ativo).get());
  await probe(C, 'I03.2', 'NEGADO', 'visitante le anuncio em rascunho', () => anon.doc('listings/' + ANUNCIO.rascunho).get());
  await probe(C, 'I03.3', 'NEGADO', 'visitante le anuncio removido', () => anon.doc('listings/' + ANUNCIO.removido).get());
  await probe(C, 'I03.4', 'NEGADO', 'estranho le anuncio em rascunho do titular', () => estranho.doc('listings/' + ANUNCIO.rascunho).get());
  await probe(C, 'I03.5', 'PERMITIDO', 'titular le o proprio rascunho (controle)', () => titular.doc('listings/' + ANUNCIO.rascunho).get());
  await probe(C, 'I03.6', 'PERMITIDO', 'visitante lista anuncios ativos com filtro e limite (controle)', () => anon.collection('listings').where('status', '==', 'active').limit(10).get());
  await probe(C, 'I03.7', 'NEGADO', 'visitante lista anuncios sem filtro (incluiria rascunhos)', () => anon.collection('listings').limit(10).get());
  await probe(C, 'I03.8', 'NEGADO', 'titular le a localizacao exata/aproximada no documento server-only', () => titular.doc('listingLocations/' + ANUNCIO.ativo).get());
  await probe(C, 'I03.9', 'NEGADO', 'estranho le a localizacao de anuncio ativo', () => estranho.doc('listingLocations/' + ANUNCIO.ativo).get());
}

async function cenarioI04() {
  const C = 'APP-I04';
  const titular = fsDe(U.titular);
  const estranho = fsDe(U.estranho);
  const anon = fsAnon();
  const midia = 'listings/' + ANUNCIO.ativo + '/media/stride-test-i-midia-pronta';
  await probe(C, 'I04.1', 'PERMITIDO', 'vendedor le o estado de upload da propria midia (controle)', () => titular.doc(midia).get());
  await probe(C, 'I04.2', 'NEGADO', 'estranho le o estado de upload e o motivo de rejeicao da midia', () => estranho.doc(midia).get());
  await probe(C, 'I04.3', 'NEGADO', 'visitante le o estado de upload da midia', () => anon.doc(midia).get());
  await probe(C, 'I04.4', 'PERMITIDO', 'visitante le metricas de anuncio ativo (publico por desenho, controle)', () => anon.doc('listingMetrics/' + ANUNCIO.ativo).get());
  await probe(C, 'I04.5', 'NEGADO', 'visitante le metricas de anuncio em rascunho', () => anon.doc('listingMetrics/' + ANUNCIO.rascunho).get());
}

async function cenarioI05() {
  const C = 'APP-I05';
  const anon = fsAnon();
  await probe(C, 'I05.1', 'PERMITIDO', 'visitante le perfil publico de vendedor ativo e completo (controle)', () => anon.doc('sellerProfiles/' + U.titular).get());
  await probe(C, 'I05.2', 'NEGADO', 'visitante le perfil de vendedor com visibilidade privada', () => anon.doc('sellerProfiles/' + U.estranho).get());
  await probe(C, 'I05.3', 'NEGADO', 'visitante le perfil de vendedor suspenso', () => anon.doc('sellerProfiles/' + U.suspenso).get());
  await probe(C, 'I05.4', 'NEGADO', 'visitante le perfil de vendedor com cadastro incompleto', () => anon.doc('sellerProfiles/' + U.incompleto).get());
  await probe(C, 'I05.5', 'NEGADO', 'visitante enumera a colecao sellerProfiles', () => anon.collection('sellerProfiles').limit(10).get());
  await probe(C, 'I05.6', 'NEGADO', 'titular altera o proprio perfil publico diretamente', () => fsDe(U.titular).doc('sellerProfiles/' + U.titular).update({ displayName: 'Alterado' }));
}

async function cenarioI06() {
  const C = 'APP-I06';
  const anon = fsAnon();
  await probe(C, 'I06.1', 'PERMITIDO', 'visitante le agregado de avaliacao consistente (controle)', () => anon.doc('reviewAggregates/' + U.titular).get());
  await probe(C, 'I06.2', 'NEGADO', 'visitante le agregado inconsistente (soma acima de 5 por avaliacao)', () => anon.doc('reviewAggregates/' + U.estranho).get());
  await probe(C, 'I06.3', 'PERMITIDO', 'visitante le agregado inexistente sem erro de permissao (controle)', () => anon.doc('reviewAggregates/stride-test-i-sem-avaliacao').get());
  await probe(C, 'I06.4', 'NEGADO', 'visitante enumera a colecao reviewAggregates', () => anon.collection('reviewAggregates').limit(10).get());
}

async function cenarioI07() {
  const C = 'APP-I07';
  const titular = fsDe(U.titular);
  const estranho = fsDe(U.estranho);
  const moderador = fsDe(U.moderador, { moderator: true });
  const anon = fsAnon();
  await probe(C, 'I07.1', 'NEGADO', 'titular le o registro de pagamento canonico', () => titular.doc('payments/stride-test-i-pag-1').get());
  await probe(C, 'I07.2', 'NEGADO', 'moderador le o registro de pagamento canonico', () => moderador.doc('payments/stride-test-i-pag-1').get());
  await probe(C, 'I07.3', 'NEGADO', 'titular le tentativas de pagamento', () => titular.doc('paymentAttempts/stride-test-i-att-1').get());
  await probe(C, 'I07.4', 'NEGADO', 'titular le tentativas de estorno', () => titular.doc('refundAttempts/stride-test-i-ref-1').get());
  await probe(C, 'I07.5', 'NEGADO', 'titular le eventos brutos do provedor de pagamento', () => titular.doc('paymentEvents/stride-test-i-ev-1').get());
  await probe(C, 'I07.6', 'NEGADO', 'titular le a conexao com o provedor (dados da conta do vendedor)', () => titular.doc('sellerConnections/' + U.titular).get());
  await probe(C, 'I07.7', 'NEGADO', 'visitante le estados OAuth', () => anon.doc('oauthStates/stride-test-i-state-1').get());
  await probe(C, 'I07.8', 'NEGADO', 'titular le vinculos de conta do provedor', () => titular.doc('providerAccountLinks/stride-test-i-link-1').get());
  await probe(C, 'I07.9', 'NEGADO', 'moderador le a configuracao da plataforma', () => moderador.doc('platformConfig/global').get());
  await probe(C, 'I07.10', 'NEGADO', 'titular le os proprios registros de dispositivo (token de push)', () => titular.doc('deviceRegistrations/stride-test-i-dev-1').get());
  await probe(C, 'I07.11', 'NEGADO', 'titular le jobs internos de entrega de notificacao', () => titular.doc('notificationDeliveryJobs/stride-test-i-job-1').get());
  await probe(C, 'I07.12', 'NEGADO', 'participante le operacoes internas de idempotencia do chat', () => estranho.doc('conversations/' + CONVERSA + '/operations/stride-test-i-op-1').get());
  await probe(C, 'I07.13', 'NEGADO', 'titular le o limitador de taxa do proprio chat', () => titular.doc('conversations/' + CONVERSA + '/rateLimits/' + U.titular).get());
  await probe(C, 'I07.14', 'NEGADO', 'titular le operacoes internas de pedido', () => titular.doc('orderOperations/' + U.titular + '/requests/stride-test-i-req-1').get());
}

async function cenarioI08() {
  const C = 'APP-I08';
  const anon = fsAnon();
  const estranho = fsDe(U.estranho);
  const moderador = fsDe(U.moderador, { moderator: true });
  await probe(C, 'I08.1', 'NEGADO', 'visitante enumera pedidos', () => anon.collection('orders').limit(10).get());
  await probe(C, 'I08.2', 'NEGADO', 'visitante enumera conversas', () => anon.collection('conversations').limit(10).get());
  await probe(C, 'I08.3', 'NEGADO', 'visitante enumera propostas', () => anon.collection('proposals').limit(10).get());
  await probe(C, 'I08.4', 'NEGADO', 'visitante enumera recibos de pagamento', () => anon.collection('paymentReceipts').limit(10).get());
  await probe(C, 'I08.5', 'NEGADO', 'estranho enumera propostas sem filtro de participacao', () => estranho.collection('proposals').limit(10).get());
  await probe(C, 'I08.6', 'NEGADO', 'estranho enumera pedidos sem filtro de participacao', () => estranho.collection('orders').limit(10).get());
  await probe(C, 'I08.7', 'NEGADO', 'estranho enumera avaliacoes sem filtro de participacao', () => estranho.collection('reviews').limit(10).get());
  await probe(C, 'I08.8', 'PERMITIDO', 'moderador lista denuncias com limite (controle de escopo)', () => moderador.collection('reports').limit(10).get());
  await probe(C, 'I08.9', 'NEGADO', 'estranho lista denuncias sem filtro', () => estranho.collection('reports').limit(10).get());
}

async function cenarioI09() {
  const C = 'APP-I09';
  const titular = fsDe(U.titular);
  const estranho = fsDe(U.estranho);
  const anon = fsAnon();
  await probe(C, 'I09.1', 'PERMITIDO', 'titular le a propria solicitacao de exportacao (controle)', () => titular.doc('privacyExportRequests/' + EXPORT_OK).get());
  await probe(C, 'I09.2', 'NEGADO', 'estranho le a exportacao do titular pelo identificador', () => estranho.doc('privacyExportRequests/' + EXPORT_OK).get());
  await probe(C, 'I09.3', 'NEGADO', 'visitante le a exportacao do titular', () => anon.doc('privacyExportRequests/' + EXPORT_OK).get());
  await probe(C, 'I09.4', 'NEGADO', 'titular enumera as solicitacoes de exportacao', () => titular.collection('privacyExportRequests').limit(10).get());
  await probe(C, 'I09.5', 'NEGADO', 'titular altera o status da propria exportacao', () => titular.doc('privacyExportRequests/' + EXPORT_OK).update({ status: 'expired' }));
}

async function cenarioST01() {
  const C = 'APP-ST01';
  const original = 'listing-media/' + U.titular + '/' + ANUNCIO.ativo + '/stride-test-i-midia-pronta/original';
  await probe(C, 'ST01.1', 'PERMITIDO', 'vendedor le o original da propria foto com midia pronta (controle)', () => stDe(U.titular).ref(original).getMetadata());
  await probe(C, 'ST01.2', 'NEGADO', 'estranho le o original (foto com metadados) de outro vendedor', () => stDe(U.estranho).ref(original).getMetadata());
  await probe(C, 'ST01.3', 'NEGADO', 'visitante le o original da foto', () => stAnon().ref(original).getMetadata());
  await env.withSecurityRulesDisabled(async (contexto) => {
    await contexto.firestore().doc('listings/' + ANUNCIO.ativo + '/media/stride-test-i-midia-pronta').update({ status: 'removed' });
  });
  await probe(C, 'ST01.4', 'NEGADO', 'vendedor le o original apos a midia ser removida', () => stDe(U.titular).ref(original).getMetadata());
}

async function cenarioST02() {
  const C = 'APP-ST02';
  const display = 'listing-media/' + U.titular + '/' + ANUNCIO.ativo + '/stride-test-i-midia-pronta/display';
  const thumb = 'listing-media/' + U.titular + '/' + ANUNCIO.ativo + '/stride-test-i-midia-pronta/thumb';
  const rascunho = 'listing-media/' + U.titular + '/' + ANUNCIO.rascunho + '/stride-test-i-midia-rascunho/display';
  const aguardando = 'listing-media/' + U.titular + '/' + ANUNCIO.ativo + '/stride-test-i-midia-aguardando/display';
  await probe(C, 'ST02.1', 'PERMITIDO', 'visitante le a variante publica de anuncio ativo com midia pronta (controle)', () => stAnon().ref(display).getMetadata());
  await probe(C, 'ST02.2', 'PERMITIDO', 'visitante le a miniatura de anuncio ativo com midia pronta (controle)', () => stAnon().ref(thumb).getMetadata());
  await probe(C, 'ST02.3', 'NEGADO', 'visitante le a variante de anuncio em rascunho', () => stAnon().ref(rascunho).getMetadata());
  await probe(C, 'ST02.4', 'NEGADO', 'estranho le a variante de anuncio em rascunho do titular', () => stDe(U.estranho).ref(rascunho).getMetadata());
  await probe(C, 'ST02.5', 'PERMITIDO', 'titular le a propria variante de anuncio em rascunho (controle)', () => stDe(U.titular).ref(rascunho).getMetadata());
  await probe(C, 'ST02.6', 'NEGADO', 'visitante le variante de midia ainda nao processada', () => stAnon().ref(aguardando).getMetadata());
}

async function cenarioST03() {
  const C = 'APP-ST03';
  const okPath = 'privacy-exports/' + U.titular + '/' + EXPORT_OK + '/data.json';
  const manifest = 'privacy-exports/' + U.titular + '/' + EXPORT_OK + '/manifest.json';
  const expirado = 'privacy-exports/' + U.titular + '/' + EXPORT_EXP + '/data.json';
  const pendente = 'privacy-exports/' + U.titular + '/' + EXPORT_PEND + '/data.json';
  await probe(C, 'ST03.1', 'PERMITIDO', 'titular le o proprio arquivo de exportacao pronto e valido (controle)', () => stDe(U.titular).ref(okPath).getMetadata());
  await probe(C, 'ST03.2', 'NEGADO', 'estranho le o arquivo de exportacao do titular', () => stDe(U.estranho).ref(okPath).getMetadata());
  await probe(C, 'ST03.3', 'NEGADO', 'visitante le o arquivo de exportacao do titular', () => stAnon().ref(okPath).getMetadata());
  await probe(C, 'ST03.4', 'NEGADO', 'titular le exportacao expirada', () => stDe(U.titular).ref(expirado).getMetadata());
  await probe(C, 'ST03.5', 'NEGADO', 'titular le exportacao ainda nao pronta', () => stDe(U.titular).ref(pendente).getMetadata());
  await probe(C, 'ST03.6', 'NEGADO', 'titular le outro arquivo da mesma exportacao (fora do nome permitido)', () => stDe(U.titular).ref(manifest).getMetadata());
}

async function cenarioST04() {
  const C = 'APP-ST04';
  const avatar = 'profile-avatars/' + U.titular + '/avatar';
  await probe(C, 'ST04.1', 'PERMITIDO', 'conta autenticada le o avatar publico minimo (exposicao intencional, registrada)', () => stDe(U.estranho).ref(avatar).getMetadata());
  await probe(C, 'ST04.2', 'NEGADO', 'visitante sem login le o avatar', () => stAnon().ref(avatar).getMetadata());
  await probe(C, 'ST04.3', 'NEGADO', 'estranho sobrescreve o avatar de outra conta', () => stDe(U.estranho).ref(avatar).put(Buffer.from('invasor-bytes'), { contentType: 'image/jpeg', customMetadata: { ownerUid: U.estranho } }));
  await probe(C, 'ST04.4', 'PERMITIDO', 'titular troca o proprio avatar com metadado do dono (controle)', () => stDe(U.titular).ref(avatar).put(Buffer.from('avatar-novo-bytes'), { contentType: 'image/jpeg', customMetadata: { ownerUid: U.titular } }));
  observacoes.push({ cenario: 'APP-ST04', id: 'ST04.obs', campo: 'avatar-legivel-por-conta-autenticada', valor: 'exposicao-intencional-documentada-em-storage.rules' });
  emitir('OBS|APP-ST04|ST04.obs|avatar-legivel-por-conta-autenticada=exposicao-intencional');
}

const CENARIOS = [
  ['APP-I01', cenarioI01], ['APP-I02', cenarioI02], ['APP-I03', cenarioI03], ['APP-I04', cenarioI04],
  ['APP-I05', cenarioI05], ['APP-I06', cenarioI06], ['APP-I07', cenarioI07], ['APP-I08', cenarioI08],
  ['APP-I09', cenarioI09], ['APP-ST01', cenarioST01], ['APP-ST02', cenarioST02], ['APP-ST03', cenarioST03],
  ['APP-ST04', cenarioST04],
];

for (const [id, executar] of CENARIOS) {
  await env.clearFirestore();
  await semearUsuarios();
  await semearAnuncios();
  await semearPrivados();
  await semearOperacional();
  await semearStorageObjetos();
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
  alvo: { projectId: PROJECT_ID, firestore: HOST + ':' + PORTA_FS, storage: HOST + ':' + PORTA_ST, functionsEmulator: 'desligado' },
  regras: {
    firestore: { arquivo: 'repositorio/firebase/firestore.rules', sha256: fsSha256 },
    storage: { arquivo: 'repositorio/firebase/storage.rules', sha256: stSha256 },
  },
  veredictos,
  hashVeredictos,
  totalProbes: resultados.length,
  divergentes,
  observacoes,
  probes: resultados,
}, null, 2), 'utf8');
writeFileSync(BRUTO_PATH, linhas.join('\n') + '\n', 'utf8');
await env.cleanup();
