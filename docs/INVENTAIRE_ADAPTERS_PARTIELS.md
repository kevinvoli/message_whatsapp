# Inventaire des adapters partiels existants

Date: 2026-02-14  
Scope: `message_whatsapp/src/webhooks/adapters`

## 1) Etat actuel
- Adapters présents:
  - `message_whatsapp/src/webhooks/adapters/whapi.adapter.ts`
  - `message_whatsapp/src/webhooks/adapters/meta.adapter.ts`
  - `message_whatsapp/src/webhooks/adapters/provider-adapter.registry.ts`
  - `message_whatsapp/src/webhooks/adapters/provider-adapter.interface.ts`
- Tests associés:
  - `message_whatsapp/src/webhooks/adapters/__tests__/whapi.adapter.spec.ts`
  - `message_whatsapp/src/webhooks/adapters/__tests__/meta.adapter.spec.ts`
  - `message_whatsapp/src/webhooks/adapters/__tests__/provider-adapter.registry.spec.ts`

## 2) Adapters partiels historiques (legacy)
- `metaToWhapi()` (ancien mapping Meta -> pseudo Whapi) **retiré**.
- Aucun adapter partiel actif dans le code actuel.

## 3) Conclusion
Tous les adapters actifs sont unifiés et testés.  
Aucun code partiel n’a été conservé dans `adapters/`.
