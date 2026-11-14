# Analise Estatica — APP-S05: Verificacao de Assinatura no Webhook Stripe

## 1. Escopo e Metodologia
Analise do endpoint publico de webhook Stripe (`stripeWebhook`) em `functions/src/payments/payment-webhook.ts`. O objetivo e verificar:
1. Se a assinatura criptografica do webhook e validada antes de qualquer processamento ou escrita em banco de dados;
2. A linha exata da verificacao de assinatura via SDK oficial (`stripe.webhooks.constructEvent`);
3. A linha exata da primeira operacao de escrita em banco de dados;
4. Confirmar que o gateway Mercado Pago esta fora de escopo (nao possui webhook exposto em producao).

## 2. Evidencias de Codigo

### 2.1 Definicao do Endpoint
- **Arquivo:** `functions/src/payments/payment-webhook.ts`
- **Linha:** 657
- **Assinatura:**
  ```typescript
  export const stripeWebhook = onRequest(
    {
      region: REGION,
      timeoutSeconds: 30,
      secrets: [stripeTestSecretKey, stripeWebhookSecret],
    },
    async (request, response) => { ... }
  );
  ```

### 2.2 Verificacao de Assinatura Criptografica
- **Linhas 681-686:**
  ```typescript
  const stripe = new Stripe(secret);
  event = stripe.webhooks.constructEvent(
    request.rawBody,
    signature,
    webhookSecret,
  );
  ```
- **Linhas 687-693:**
  ```typescript
  } catch (error) {
    logger.warn('Stripe webhook signature verification failed.', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    response.status(401).send('invalid signature');
    return;
  }
  ```
- Se a assinatura for invalida ou ausente, a requisicao e abortada com status HTTP 401 e retorno imediato (`return`), sem alcancar qualquer logica de negocio.

### 2.3 Ordem Cronologica de Execucao e Primeira Escrita
1. Linhas 668-671: validacao do metodo HTTP (exige `POST`, senao 405).
2. Linhas 672-678: validacao de presenca das chaves e do header `stripe-signature` (senao 503).
3. **Linhas 682-686: validacao da assinatura criptografica com `stripe.webhooks.constructEvent`.**
4. Linhas 694-703: filtro de tipos de evento suportados (eventos nao suportados recebem 204 sem escrita).
5. Linhas 709-712: bloqueio de eventos em modo livemode (apenas sandbox permitido, senao 400).
6. **Primeira escrita em banco de dados:**
   - Apenas nas linhas 714 (`processSellerPlanPayment`), 716 (`processStripeBoostPaymentEvent`) ou 723 (`processPaymentEvent`).
   - Dentro de `processPaymentEvent`, a primeira mutacao ocorre dentro da transacao do Firestore (L250+ ou L450+), exclusivamente apos a validacao da assinatura.

### 2.4 Status do Gateway Mercado Pago
- Conforme L654 de `functions/src/payments/payment-webhook.ts`:
  `export const processMercadoPagoPaymentEvent = processPaymentEvent;`
  Trata-se apenas de um alias de reconciliacao interna, sem endpoint `onRequest` publico exposto. O Mercado Pago esta formalmente fora de escopo de exposicao a webhooks no estado atual da base de codigo.

## 3. Conclusao
A verificacao criptografica de assinatura via HMAC SHA-256 e realizada **antes** de qualquer parse do payload do evento e **antes** de qualquer mutacao de estado no Firestore. Tentativas de spoofing de eventos de pagamento sao **BLOQUEADAS** na camada de transporte.
