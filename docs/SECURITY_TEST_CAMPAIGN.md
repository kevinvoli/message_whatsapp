# Campagne Tests Securite - Webhook Multi-Provider

Date: 2026-02-14

## Scenarios obligatoires
1. Signatures invalides (Meta/Whapi)
2. RawBody absent en prod
3. Tenant spoofing (provider/external_id)
4. Replay storm x10 (idempotency)
5. WS cross-tenant

## Execution (tests automatisees)
- `npm run test:e2e --prefix message_whatsapp -- --runInBand`
- `npm run test:adapters --prefix message_whatsapp -- --runInBand`

## Evidences
- Logs e2e
- Capture metriques (signature_invalid, tenant_resolution_failed, idempotency_conflict)
