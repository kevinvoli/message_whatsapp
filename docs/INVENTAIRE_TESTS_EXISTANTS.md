# Inventaire des tests existants

Date: 2026-02-14  
Scope: `message_whatsapp` (backend)

## 1) Vue d'ensemble
- **Unit tests (spec.ts)**: services, controllers, gateways, adapters, idempotency, sécurité webhook.
- **E2E (test/*.e2e-spec.ts)**: endpoints admin + webhook + flow message.
- **Perf/chaos/load**: plans documentés uniquement (pas de tests automatisés intégrés).

## 2) Suites E2E existantes
- `message_whatsapp/test/app.e2e-spec.ts`  
  - Smoke app (GET /).
- `message_whatsapp/test/auth-chat-admin.e2e-spec.ts`  
  - Auth admin + accès `/chats` et `/auth/admin/profile`.
- `message_whatsapp/test/webhook-security.e2e-spec.ts`  
  - Signatures Whapi + Meta, secrets manquants/invalides.
- `message_whatsapp/test/message-flow.e2e-spec.ts`  
  - Webhook -> persistance -> lecture admin -> réponse sortante.

## 3) Tests unitaires ciblés migration webhook
- Adapters:
  - `message_whatsapp/src/webhooks/adapters/__tests__/whapi.adapter.spec.ts`
  - `message_whatsapp/src/webhooks/adapters/__tests__/meta.adapter.spec.ts`
  - `message_whatsapp/src/webhooks/adapters/__tests__/provider-adapter.registry.spec.ts`
- Idempotency:
  - `message_whatsapp/src/webhooks/idempotency/__tests__/webhook-idempotency.service.spec.ts`
  - `message_whatsapp/src/whapi/__tests__/webhook-idempotency-purge.service.spec.ts`
- Sécurité webhook:
  - `message_whatsapp/src/whapi/__tests__/whapi-crypto.spec.ts`
  - `message_whatsapp/src/whapi/__tests__/whapi-payload-validation.spec.ts`
  - `message_whatsapp/src/whapi/__tests__/webhook-rate-limit.service.spec.ts`

## 4) Tests unitaires domaine existants (legacy)
Services/Controllers/Gateways :
- `src/*/*.service.spec.ts`
- `src/*/*.controller.spec.ts`
- `src/*/*.gateway.spec.ts`

Exemples:
- `message_whatsapp/src/whatsapp_message/whatsapp_message.service.spec.ts`
- `message_whatsapp/src/dispatcher/dispatcher.service.spec.ts`
- `message_whatsapp/src/channel/channel.service.spec.ts`

## 5) Couverture vs exigences critiques (résumé)
- **S0/S1 sécurité webhook**: couvert par `whapi-crypto` + `webhook-security.e2e`.
- **B0 adapters & Unified**: couvert par tests adapters.
- **C0 idempotency & purge**: couvert par tests idempotency + purge.
- **C1 gestion media & WS tenant-safe**: partiel (couvert côté services/gateways, pas d’E2E multi-tenant).
- **A1 backfill/SQL gates**: pas de tests automatisés (scripts manuels).
- **E0 SLO/alerting**: pas de tests automatisés (metrics smoke non automatisés).
- **F0/F1 load/chaos/shadow**: non automatisés (plans uniquement).

## 6) Gaps connus (à combler)
- Tests charge/stress/chaos automatisés.
- Tests E2E multi-tenant (isolation WS + DB).
- Tests de migration DB en CI (gates + backfill).
- Validation Go/No-Go automatisée (metrics + checklist).

## 7) Commandes utiles
- Unit tests:
  - `npm run test --prefix message_whatsapp`
- Adapters:
  - `npm run test:adapters --prefix message_whatsapp`
- E2E:
  - `E2E_RUN=true npm run test:e2e --prefix message_whatsapp`
