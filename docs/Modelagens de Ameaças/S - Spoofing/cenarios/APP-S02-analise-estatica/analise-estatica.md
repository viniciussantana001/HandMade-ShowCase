# Analise Estatica — APP-S02: Resolucao de Identidade em Funcoes onCall (Cloud Functions v2)

## 1. Escopo e Metodologia
Varredura exaustiva de todas as funcoes exportadas com `onCall` no diretorio `functions/src/` do backend Firebase. O objetivo e verificar a origem da identidade utilizada para autorizar a acao sensivel: se provém criptograficamente de `request.auth` (injetado e verificado pelo Firebase Authentication SDK) ou se aceita parametro manipulavel pelo cliente via payload (`request.data`).

## 2. Inventario Completo de Endpoints onCall

| Arquivo e Linha | Nome da Funcao | Origem da Identidade | Parametro do Cliente Usado? | Avaliacao |
|---|---|---|---|---|
| `functions/src/reviews/create-review.ts:39` | `createReview` | `requireChatUser(request.auth, { verifiedEmail: true })` (L42) | Nao (`authorUid` vem de `auth.uid`) | SEGURO |
| `functions/src/moderation/resolve-listing-report.ts:49` | `resolveListingReport` | `requireModerator(request.auth)` (L52) | Nao (`moderatorUid` vem de `auth.uid` + custom claim) | SEGURO |
| `functions/src/moderation/create-listing-report.ts:19` | `createListingReport` | `requireVerifiedReporter(request.auth)` (L22) | Nao (`reporterUid` vem de `auth.uid`) | SEGURO |
| `functions/src/orders/update-order-fulfillment.ts:88` | `updateOrderFulfillment` | `requireChatUser(request.auth, { verifiedEmail: true })` (L91) | Nao (`actorUid` vem de `auth.uid`) | SEGURO |
| `functions/src/seller-commerce/get-seller-product-availability.ts:27` | `getSellerProductAvailability` | `requireVerifiedSeller(request.auth)` (L30) | Nao (`seller.uid` vem de `auth.uid`) | SEGURO |
| `functions/src/notifications/mark-notifications-read.ts:17` | `markNotificationsRead` | `requireChatUser(request.auth, { verifiedEmail: false })` (L20) | Nao (`uid` vem de `auth.uid`) | SEGURO |
| `functions/src/profile/update-profile.ts:19` | `updateProfile` | `request.auth.uid` (L37) | Nao (documento e `users/${request.auth.uid}`) | SEGURO |
| `functions/src/seller-commerce/seller-plan-checkout.ts:89` | `createSellerPlanCheckout` | `requireVerifiedSeller(request.auth)` (L90) | Nao (`seller.uid` vem de `auth.uid`) | SEGURO |
| `functions/src/seller-commerce/seller-plan-checkout.ts:174` | `cancelSellerPlan` | `requireVerifiedSeller(request.auth)` (L175) | Nao (`seller.uid` vem de `auth.uid`) | SEGURO |
| `functions/src/notifications/manage-push-device.ts:29` | `registerPushDevice` | `requireChatUser(request.auth, { verifiedEmail: false })` (L32) | Nao (`uid` vem de `auth.uid`) | SEGURO |
| `functions/src/notifications/manage-push-device.ts:80` | `unregisterPushDevice` | `requireChatUser(request.auth, { verifiedEmail: false })` (L83) | Nao (`uid` vem de `auth.uid`) | SEGURO |
| `functions/src/seller-commerce/create-listing-boost-checkout.ts:80` | `createListingBoostCheckout` | `requireVerifiedSeller(request.auth)` (L88) | Nao (`seller.uid` vem de `auth.uid`) | SEGURO |
| `functions/src/privacy/request-data-export.ts:428` | `requestDataExport` | `requirePrivacyUser(request.auth, { recentAuthentication: true })` (L431) | Nao (`uid` vem de `auth.uid`) | SEGURO |
| `functions/src/privacy/cancel-account-deletion.ts:31` | `cancelAccountDeletion` | `requirePrivacyUser(request.auth, { recentAuthentication: false })` (L34) | Nao (`uid` vem de `auth.uid`) | SEGURO |
| `functions/src/privacy/request-account-deletion.ts:68` | `requestAccountDeletion` | `requirePrivacyUser(request.auth, { recentAuthentication: true })` (L71) | Nao (`uid` vem de `auth.uid`) | SEGURO |
| `functions/src/proposals/cancel-proposal.ts:30` | `cancelProposal` | `requireChatUser(request.auth, { verifiedEmail: true })` (L33) | Nao (`buyerUid` vem de `auth.uid`) | SEGURO |
| `functions/src/proposals/create-proposal.ts:32` | `createProposal` | `requireChatUser(request.auth, { verifiedEmail: true })` (L35) | Nao (`buyerUid` vem de `auth.uid`) | SEGURO |
| `functions/src/profile/complete-profile.ts:20` | `completeProfile` | `request.auth.uid` e `request.auth.token.email` (L27, L43, L68) | Nao (`users/${request.auth.uid}`) | SEGURO |
| `functions/src/proposals/respond-to-proposal.ts:35` | `respondToProposal` | `requireChatUser(request.auth, { verifiedEmail: true })` (L38) | Nao (`sellerUid` vem de `auth.uid`) | SEGURO |
| `functions/src/listings/change-listing-status.ts:28` | `changeListingStatus` | `requireVerifiedSeller(request.auth)` (L31) | Nao (`seller.uid` vem de `auth.uid`) | SEGURO |
| `functions/src/listings/publish-listing.ts:29` | `publishListing` | `requireVerifiedSeller(request.auth)` (L32) | Nao (`seller.uid` vem de `auth.uid`) | SEGURO |
| `functions/src/listings/create-listing-draft.ts:28` | `createListingDraft` | `requireVerifiedSeller(request.auth)` (L31) | Nao (`seller.uid` vem de `auth.uid`) | SEGURO |
| `functions/src/listings/save-listing-draft.ts:67` | `saveListingDraft` | `requireVerifiedSeller(request.auth)` (L70) | Nao (`seller.uid` vem de `auth.uid`) | SEGURO |
| `functions/src/listings/update-listing.ts:38` | `updateListing` | `requireVerifiedSeller(request.auth)` (L41) | Nao (`seller.uid` vem de `auth.uid`) | SEGURO |
| `functions/src/listings/update-listing-media.ts:25` | `updateListingMedia` | `requireVerifiedSeller(request.auth)` (L28) | Nao (`seller.uid` vem de `auth.uid`) | SEGURO |
| `functions/src/listings/create-listing-media-upload.ts:25` | `createListingMediaUpload` | `requireVerifiedSeller(request.auth)` (L28) | Nao (`seller.uid` vem de `auth.uid`) | SEGURO |
| `functions/src/dashboard/get-seller-dashboard.ts:46` | `getSellerDashboard` | `requireVerifiedSeller(request.auth)` (L49) | Nao (`seller.uid` vem de `auth.uid`) | SEGURO |
| `functions/src/disputes/open-order-dispute.ts:36` | `openOrderDispute` | `requireChatUser(request.auth, { verifiedEmail: true })` (L39) | Nao (`actorUid` vem de `auth.uid`) | SEGURO |
| `functions/src/disputes/resolve-order-dispute.ts:60` | `resolveOrderDispute` | `requireModerator(request.auth)` (L63) | Nao (`moderatorUid` vem de `auth.uid` + custom claim) | SEGURO |
| `functions/src/chat/start-conversation.ts:35` | `startConversation` | `requireChatUser(request.auth, { verifiedEmail: true })` (L38) | Nao (`buyerUid` vem de `auth.uid`) | SEGURO |
| `functions/src/chat/send-message.ts:33` | `sendMessage` | `requireChatUser(request.auth, { verifiedEmail: true })` (L36) | Nao (`senderUid` vem de `auth.uid`) | SEGURO |
| `functions/src/chat/mark-conversation-read.ts:23` | `markConversationRead` | `requireChatUser(request.auth, { verifiedEmail: false })` (L26) | Nao (`callerUid` vem de `auth.uid`) | SEGURO |
| `functions/src/chat/set-user-block.ts:22` | `setUserBlock` | `requireChatUser(request.auth, { verifiedEmail: false })` (L25) | Nao (`ownerUid` vem de `auth.uid`) | SEGURO |
| `functions/src/payments/create-checkout.ts:629` | `createCheckout` | `requireChatUser(request.auth, { verifiedEmail: true })` (L632) | Nao (`buyerUid` vem de `auth.uid`) | SEGURO |
| `functions/src/payments/payment-refund.ts:359` | `refundOrderPayment` | `requireChatUser(request.auth, { verifiedEmail: true })` (L362) | Nao (`actorUid` vem de `auth.uid`) | SEGURO |
| `functions/src/payments/seller-onboarding.ts:127` | `createSellerOnboardingLink` | `requireChatUser(request.auth, { verifiedEmail: true })` (L130) | Nao (`uid` vem de `auth.uid`) | SEGURO |
| `functions/src/payments/seller-onboarding.ts:159` | `getSellerOnboardingStatus` | `requireChatUser(request.auth, { verifiedEmail: false })` (L162) | Nao (`uid` vem de `auth.uid`) | SEGURO |
| `functions/src/payments/seller-onboarding.ts:188` | `syncSellerAccountStatus` | `requireChatUser(request.auth, { verifiedEmail: true })` (L191) | Nao (`uid` vem de `auth.uid`) | SEGURO |

## 3. Conclusao
100% dos 38 endpoints `onCall` auditados utilizam a identidade extraida de `request.auth`, nunca aceitando UID arbitrario pelo payload. Tentativas de Spoofing via API de Cloud Functions sao **BLOQUEADAS** por projeto arquitetural.
