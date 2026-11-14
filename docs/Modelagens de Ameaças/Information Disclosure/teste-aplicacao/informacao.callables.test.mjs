// Fase 2 da letra I (Divulgacao de informacao): callables e projecoes em processo.
// Alvo: Firestore Emulator 127.0.0.1:18080, projectId demo-handmade. Sem Functions Emulator, sem triggers.
// Pagamentos: nenhum callable de pagamento e invocado. Dados: contas example.com sinteticas.
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
const abrir = (rel) => import(pathToFileURL(path.join(SRC, rel)).href);

const { sendMessage } = await abrir('chat/send-message.ts');
const { updateOrderFulfillment } = await abrir('orders/update-order-fulfillment.ts');
const { projectSellerProfile } = await abrir('profile/seller-profile-projection.ts');
const { projectListingForSearch } = await abrir('search/listing-search-projection.ts');
const { roundListingCoordinate } = await abrir('domain/listing.ts');

const env = await initializeTestEnvironment({
  projectId: PROJETO,
  firestore: { host: '127.0.0.1', port: 18080, rules: readFileSync(REGRAS, 'utf8') },
});

const ts = () => firebase.firestore.FieldValue.serverTimestamp();
const TITULAR = 'stride-test-i-titular';
const ESTRANHO = 'stride-test-i-estranho';
const TERCEIRO = 'stride-test-i-terceiro';
const CONVERSA = 'conversation_1234567890abcdef1234567890abcdef';
const CONVERSA_INEXISTENTE = 'conversation_ffffffffffffffffffffffffffffffff';
const PEDIDO = 'order_1234567890abcdef1234567890abcdef';
const PEDIDO_INEXISTENTE = 'order_ffffffffffffffffffffffffffffffff';
const ANUNCIO = 'stride-test-i-anuncio-1';

const auth = (uid, verificado = true) => ({
  uid,
  token: { email: uid.replace('stride-test-i-', '') + '@example.com', email_verified: verificado },
});

async function semear(fn) {
  await env.withSecurityRulesDisabled(async (contexto) => fn(contexto.firestore()));
}

const perfil = () => ({
  status: 'active',
  profileStatus: 'complete',
  emailVerified: true,
  role: 'user',
  schemaVersion: 1,
  createdAt: ts(),
  updatedAt: ts(),
});

async function semearBase() {
  await env.clearFirestore();
  await semear(async (db) => {
    await db.doc('users/' + TITULAR).set(perfil());
    await db.doc('users/' + ESTRANHO).set(perfil());
    await db.doc('users/' + TERCEIRO).set(perfil());
    await db.doc('conversations/' + CONVERSA).set({
      conversationId: CONVERSA,
      participantIds: [TITULAR, ESTRANHO],
      listingId: ANUNCIO,
      buyerId: ESTRANHO,
      sellerId: TITULAR,
      status: 'active',
      unreadCounts: {},
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
    await db.doc('orders/' + PEDIDO).set({
      orderId: PEDIDO,
      buyerId: ESTRANHO,
      sellerId: TITULAR,
      participantIds: [ESTRANHO, TITULAR],
      status: 'paid',
      paymentStatus: 'approved',
      revision: 1,
      listingSnapshot: { deliveryOptions: ['pickup'] },
      schemaVersion: 1,
      createdAt: ts(),
      updatedAt: ts(),
    });
  });
}

async function chamar(handler, authCtx, data) {
  try {
    const resultado = await handler.run({ data, auth: authCtx });
    return { ok: true, resultado };
  } catch (erro) {
    return { ok: false, codigo: erro.code, mensagem: erro.message, detalhes: erro.details };
  }
}

const momento = (ms) => firebase.firestore.Timestamp.fromMillis(ms);

const perfilComDadosPessoais = {
  uid: TITULAR,
  status: 'active',
  profileStatus: 'complete',
  accountType: 'individual',
  fullName: 'Nome Pessoal Teste',
  tradeName: 'Ateliê Teste',
  phone: '+5511999999999',
  email: 'titular@example.com',
  cpf: '00000000000',
  birthDate: '1990-01-01',
  addressLine: 'Rua Teste 100',
  cep: '01000000',
  city: 'Cidade Teste',
  state: 'SP',
  revision: 3,
  sellerActivatedAt: momento(1700000000000),
  subscriptionExpiresAt: null,
};

const anuncioComDadosPessoais = {
  status: 'active',
  title: 'Vaso de cerâmica',
  description: 'Descrição sintética do anúncio de teste.',
  category: 'wood',
  condition: 'new',
  listingType: 'sale',
  pricingMode: 'fixed',
  priceCents: 12000,
  city: 'Cidade Teste',
  state: 'SP',
  publishedAt: momento(1700000000000),
  views: 3,
  sellerId: TITULAR,
  sellerEmail: 'titular@example.com',
  sellerPhone: '+5511999999999',
  street: 'Rua Teste 100',
  cep: '01000000',
  addressLine: 'Rua Teste 100',
  cpf: '00000000000',
};

describe('oraculo de existencia nos callables (letra I)', () => {
  it('O1 mensagens: conversa inexistente (not-found) se distingue de conversa existente sem participacao (permission-denied), sem detalhe interno', async () => {
    await semearBase();
    const inexistente = await chamar(sendMessage, auth(TERCEIRO), {
      conversationId: CONVERSA_INEXISTENTE,
      content: 'Mensagem de teste',
      idempotencyKey: 'stride-test-i-o1-0001',
    });
    const existente = await chamar(sendMessage, auth(TERCEIRO), {
      conversationId: CONVERSA,
      content: 'Mensagem de teste',
      idempotencyKey: 'stride-test-i-o1-0002',
    });
    expect(inexistente.ok).toBe(false);
    expect(inexistente.codigo).toBe('not-found');
    expect(existente.ok).toBe(false);
    expect(existente.codigo).toBe('permission-denied');
    expect(inexistente.codigo).not.toBe(existente.codigo);
    for (const r of [inexistente, existente]) {
      expect(r.mensagem).not.toMatch(/\.ts|\bat\b|Error:|stack/i);
    }
  });

  it('O2 pedidos: pedido inexistente (not-found) se distingue de pedido existente sem participacao (permission-denied)', async () => {
    await semearBase();
    const inexistente = await chamar(updateOrderFulfillment, auth(TERCEIRO), {
      orderId: PEDIDO_INEXISTENTE,
      action: 'mark_shipped',
      expectedRevision: 1,
      idempotencyKey: 'stride-test-i-o2-0001',
      fulfillmentMethod: 'pickup',
    });
    const existente = await chamar(updateOrderFulfillment, auth(TERCEIRO), {
      orderId: PEDIDO,
      action: 'mark_shipped',
      expectedRevision: 1,
      idempotencyKey: 'stride-test-i-o2-0002',
      fulfillmentMethod: 'pickup',
    });
    expect(inexistente.codigo).toBe('not-found');
    expect(existente.codigo).toBe('permission-denied');
    expect(inexistente.codigo).not.toBe(existente.codigo);
  });
});

describe('projecao publica do vendedor (letra I)', () => {
  it('P1 perfil publico nao carrega dados pessoais de contato, documento ou endereco', () => {
    const pub = projectSellerProfile(TITULAR, perfilComDadosPessoais);
    expect(pub).toBeDefined();
    const chaves = Object.keys(pub);
    for (const proibido of ['email', 'phone', 'cpf', 'birthDate', 'addressLine', 'cep', 'fullName', 'status', 'revision']) {
      expect(chaves).not.toContain(proibido);
    }
    expect(pub.uid).toBe(TITULAR);
    expect(pub.visibility).toBe('public');
    expect(pub.schemaVersion).toBe(1);
    expect(pub.displayName).toBe('Ateliê Teste');
  });

  it('P2 achado documentado: sem nome comercial, o nome completo da pessoa vira o nome publico', () => {
    const semNomeComercial = { ...perfilComDadosPessoais, tradeName: undefined, companyName: undefined };
    const pub = projectSellerProfile(TITULAR, semNomeComercial);
    expect(pub).toBeDefined();
    expect(pub.displayName).toBe('Nome Pessoal Teste');
  });

  it('P3 perfil suspenso, incompleto ou de outro uid nao gera projecao publica', () => {
    expect(projectSellerProfile(TITULAR, { ...perfilComDadosPessoais, status: 'suspended' })).toBeUndefined();
    expect(projectSellerProfile(TITULAR, { ...perfilComDadosPessoais, profileStatus: 'draft' })).toBeUndefined();
    expect(projectSellerProfile(ESTRANHO, perfilComDadosPessoais)).toBeUndefined();
  });
});

describe('projecao de busca e localizacao aproximada (letra I)', () => {
  it('S1 registro de busca nao carrega identificadores, contato ou endereco do vendedor', () => {
    const registro = projectListingForSearch(ANUNCIO, anuncioComDadosPessoais, undefined);
    expect(registro).toBeDefined();
    const chaves = Object.keys(registro);
    for (const proibido of ['sellerId', 'sellerEmail', 'sellerPhone', 'street', 'cep', 'addressLine', 'cpf', '_geoloc']) {
      expect(chaves).not.toContain(proibido);
    }
    expect(registro.objectID).toBe(ANUNCIO);
  });

  it('S2 anuncio nao ativo (rascunho ou removido) nao entra no indice de busca', () => {
    expect(projectListingForSearch(ANUNCIO, { ...anuncioComDadosPessoais, status: 'draft' }, undefined)).toBeUndefined();
    expect(projectListingForSearch(ANUNCIO, { ...anuncioComDadosPessoais, status: 'removed' }, undefined)).toBeUndefined();
  });

  it('S3 localizacao aproximada na escrita (duas casas decimais) chega ao indice sem precisao extra', () => {
    const aproximada = {
      latitude: roundListingCoordinate(-23.5505199),
      longitude: roundListingCoordinate(-46.6333094),
    };
    const registro = projectListingForSearch(ANUNCIO, anuncioComDadosPessoais, aproximada);
    expect(registro._geoloc).toEqual({ lat: -23.55, lng: -46.63 });
  });

  it('S4 a projecao copia a localizacao que recebe; a protecao depende do fluxo de escrita (dependencia documentada)', () => {
    const exata = { latitude: -23.5505199, longitude: -46.6333094 };
    const registro = projectListingForSearch(ANUNCIO, anuncioComDadosPessoais, exata);
    expect(registro._geoloc).toEqual({ lat: -23.5505199, lng: -46.6333094 });
  });

  it('R1 arredondamento da localizacao usado na escrita: duas casas e sem zero negativo', () => {
    expect(roundListingCoordinate(-23.5505199)).toBe(-23.55);
    expect(roundListingCoordinate(-46.6333094)).toBe(-46.63);
    expect(Object.is(roundListingCoordinate(-0.001), 0)).toBe(true);
  });
});

