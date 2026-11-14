# Plano de execução R (Repudiação)

Estado: pré-registro. Registrado em 2026-11-01, antes da primeira execução de `testes/cenarios-r.mjs`.

## Objetivo

Verificar, por execução dinâmica no Firestore Emulator, se a camada de regras do repositório impede que um participante, um terceiro ou um moderador negue ou forje ações: autoria, imutabilidade e acesso às trilhas. Regras testadas: `repositorio/firebase/firestore.rules` (blob igual ao commit 64cfb85; SHA-256 `d5b016c6…a25b6`).

## Pré-condições e limites

1. Alvo: emuladores locais, projectId `demo-handmade`, `127.0.0.1:18080`. O script aborta se `FIRESTORE_EMULATOR_HOST` não for esse valor.
2. Functions Emulator desligado. Nenhuma integração externa (Stripe, Mercado Pago, Algolia, FCM, e-mail) é executada.
3. Nenhuma chamada ao projeto de desenvolvimento. Todos os comandos Firebase usam `--project demo-handmade`. O `.firebaserc` não é usado.
4. Dados: apenas contas `example.com` e identificadores com prefixo `stride-test-r-`. O emulador é efêmero: nada persiste após a execução.
5. Callables não são executadas. Os fixtures de servidor (trilhas, mensagens, pedidos, pagamentos) são semeados com as regras desligadas, simulando o Admin SDK. A lógica de gravação das trilhas nos callables é analisada estaticamente no relatório.
6. BlueStacks (`127.0.0.1:5555`) não é usado. Os cenários são de regras e de dados; o app não gera nem altera trilhas, e subir um APK exigiria build com configuração de emulador e exporia o aparelho a serviços reais.
7. Git: somente leitura (`rev-parse`, `status`, `hash-object`). Sem `fetch`, `push`, `commit`, `checkout` ou alteração de branch.
8. Comparação com a regra publicada no projeto real: registrada em 2026-10-24 (`evidencias/_comum/infra-readonly-20261024.txt`). Não repetida nesta etapa.

## Cenários e hipóteses

| ID | Alvo | Hipótese defendida | Probes negativos | Controles positivos |
|---|---|---|---|---|
| APP-R01 | `orders/{id}/events` | Eventos de transição do pedido não podem ser alterados, apagados ou forjados; só participantes leem | 6 | 3 |
| APP-R02 | `conversations/{id}/messages` | Mensagens não podem ser gravadas, alteradas ou apagadas pelo cliente; autoria não é forjável; só participantes leem | 6 | 3 |
| APP-R03 | `proposals/{id}` | Partes e valores de proposta não são alteráveis diretamente; aceite não é forjável | 6 | 3 |
| APP-R04 | `payments`, `paymentReceipts`, `paymentEvents` | Estado canônico e eventos do provedor são server-only; recibo só para participantes | 6 | 2 |
| APP-R05 | `auditLogs`, `moderationCases` | Trilha de auditoria e notas internas são inacessíveis a clientes, inclusive moderadores | 7 | 1 |
| APP-R06 | `reports`, `disputes` | Leitura por papel com consulta limitada; decisões de moderação não são gravadas direto | 10 | 6 |
| APP-R07 | `users` + `consents` | Consentimento é gravado uma vez, com `request.time`, vinculado ao cadastro no mesmo lote | 7 | 2 |
| APP-R08 | `users` (próprio perfil) | Titular não apaga, não muda status/papel e não repete revisão; a alteração incrementa a revisão | 4 | 3 |
| APP-R09 | `accountDeletionRequests`, `accountDeletionSecrets`, `privacyExportRequests` | Solicitações de privacidade e segredo do tombstone não são legíveis nem graváveis pelo titular | 6 | 2 |
| APP-R10 | `reviews` | Avaliação não é alterável nem apagável; segunda avaliação do mesmo pedido é negada | 3 | 3 |

Observação registrada (não é veredito): APP-R08.obs verifica se o valor anterior de `fullName` permanece no documento após uma alteração.

## Critérios de veredito

- **BLOQUEADO**: todos os probes negativos `NEGADO` e todos os controles `PERMITIDO`.
- **BURLADO**: algum probe negativo resolveu (`PERMITIDO`).
- **INCONCLUSIVO**: erro de harness, ou controle positivo não `PERMITIDO`, sem burla observada.

Um controle positivo falho impede o veredito BLOQUEADO, porque um `NEGADO` causado por claim ou fixture quebrado não prova defesa.

## Execução

- Duas sessões independentes do emulador, cada uma com `firebase.cmd emulators:exec --only firestore --project demo-handmade "node cenarios-r.mjs N"`.
- Concordância exigida: `HASH_VEREDICTOS` idêntico nas duas rodadas.
- Evidências: `testes/resultado-r-rodada-N.json` e `brutos/r-rodada-N.txt`.
- Registro de ambiente no relatório: Java 21.0.12.1, Node v24.22.1, Firebase CLI e versão de `@firebase/rules-unit-testing`.

## Limites declarados

- Não cobre execução de callables, triggers, Cloud Logging nem retenção de logs.
- Não cobre a regra publicada no projeto real nesta etapa.
- Teste não produz certeza absoluta. O método reduz incerteza com controles positivos, repetição em sessões separadas e hash dos veredictos.
