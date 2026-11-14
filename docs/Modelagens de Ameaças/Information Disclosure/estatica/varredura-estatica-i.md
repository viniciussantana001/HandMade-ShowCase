# Varredura estática: letra I (Information disclosure)

Data: 2026-11-06. Repositório: commit 64cfb85, com as 181 alterações pré-existentes no working tree. Esta varredura não alterou nada no repositório.

Método: somente leitura. `git grep` e `git log -S --no-textconv --all` sobre arquivos e histórico, verificação de nomes de arquivos ignorados e leitura de código. Nenhum valor de credencial foi copiado para este arquivo; quando um padrão casou, a classificação foi feita por formato, sem exibir o conteúdo.

## 1. Arquivos rastreados com padrões de credencial

| Padrão | Ocorrências | Arquivos | Classificação |
|---|---|---|---|
| Chave pública de cliente do Firebase (`AIza…`) | 1 por arquivo, em 3 arquivos; 3 em um arquivo | `apps/mobile/android/app/src/{development,production,staging}/google-services.json`; `apps/mobile/lib/core/config/firebase_options.dart` | Esperado. Identificador do projeto, não segredo de servidor. A proteção depende das regras e do App Check. |
| Chave privada (cabeçalho PEM) | 0 | — | Ausente. |
| `sk_live_`, `rk_live_`, `whsec_` (formato real) | 0 | — | Ausente. |
| `AKIA…` (AWS), `xox[baprs]-` (Slack), `ya29.` (Google OAuth), `APP_USR-` (Mercado Pago) em formato real | 0 | — | Ausente. |
| `"type": "service_account"` | 0 | — | Ausente. |
| `client_secret` | 1 arquivo | `functions/src/payments/mercado-pago-api.ts` | Nome de campo no código, sem valor literal longo. |
| Chave admin do Algolia em `apps/` | 0 | — | Ausente. |

## 2. Histórico do git (todos os refs, sem filtro de texto)

| Padrão | Commits | Arquivo | Classificação |
|---|---|---|---|
| `sk_live_` | 1 (68d004f, 2026-09-08) | `scripts/ci/check_repository.py` | Padrão de detecção do próprio verificador. Sem token com formato real e sem bloco PEM. |
| Cabeçalho de chave privada | 1 (68d004f) | `scripts/ci/check_repository.py` | Mesmo verificador. Sem corpo base64. |
| `APP_USR-` | 2 (6d6e792, 7ae9777, 2026-09-05) | `functions/test/payment.test.ts` | Prefixo literal. Sem formato real de token. |
| `sk_test_` | 2 (68d004f, b4828cf, 2026-09-07) | `functions/src/payments/*` e `functions/src/seller-commerce/*` | Prefixo de validação (`startsWith`). Sem formato real de token. |
| `xoxb-`, `ya29.`, `"type": "service_account"` | 0 | — | Ausente. |

No `HEAD` atual, os formatos reais de `sk_test_` e `APP_USR-` também têm zero ocorrências.

## 3. Arquivos ignorados pelo git e de ambiente

| Arquivo | Rastreado | Ignorado | Atribuição de segredo com valor longo | Token de teste real |
|---|---|---|---|---|
| `functions/.env.example` | sim | não | 0 | não |
| `functions/.env.<dev>` | não | sim | 0 | não |
| `functions/.env.<prod>` | não | sim | 0 | não |
| `functions/.env.<staging>` | não | sim | 0 | não |
| `functions/.env.local` | não | sim | 0 | não |

O `.gitignore` contém duas regras `.env*`. A busca por arquivos ignorados foi limitada à raiz do repositório e a até dois níveis de pastas, sem entrar em `node_modules`.

## 4. Metadados de imagem (processamento de mídia)

`functions/src/listings/process-listing-media.ts` gera as variantes `display` e `thumb` com `sharp(...).rotate()` (linhas 177 e 187). Não há `withMetadata()` nem `keepMetadata()` no arquivo. Pelo comportamento padrão do sharp, as variantes públicas saem sem EXIF, inclusive sem coordenadas GPS. O original é gravado como enviado pelo cliente, e fica restrito ao vendedor pelas regras de Storage (teste ST01).

## 5. Logs e campos pessoais

- Chamadas de `console.*` ou `logger.*` em uma linha com `email`, `phone`, `cpf`, `fullName`, `cnpj` ou `birth`: 0 arquivos em `functions/src`. Limite: chamadas que ocupam várias linhas não são cobertas por esta busca.
- Campos de contato, documento ou endereço (`phone`, `cpf`, `cnpj`, `birthDate`, `street`) em `functions/src/listings/`: 0 arquivos.
