# Audit Schema DB Actuel (pre-migration)

Date: 2026-02-14
Source: entites TypeORM du repo (audit statique du code)

## 1) Constat global
- Schema fortement couple a Whapi.
- Multi-tenant non modele explicitement (pas de `tenant_id` sur tables coeur).
- Unicites globales potentiellement incompatibles SaaS multi-tenant.

## 2) Points critiques identifies

## Couplage provider
1. `whapi_channels` (`message_whatsapp/src/channel/entities/channel.entity.ts`)
- nom provider-specific
- `channel_id` unique global
2. `whapi_user` (`message_whatsapp/src/channel/entities/whapi-user.entity.ts`)
3. `whatsapp_media.whapi_media_id` (`message_whatsapp/src/whatsapp_media/entities/whatsapp_media.entity.ts`)

## Unicites a risque multi-tenant
1. `whatsapp_chat.chat_id` unique global (`message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`)
2. `whatsapp_message.message_id` unique global (`message_whatsapp/src/whatsapp_message/entities/whatsapp_message.entity.ts`)
3. `webhook_event_log.event_key` unique global (`message_whatsapp/src/whapi/entities/webhook-event.entity.ts`)

## Resolution tenant absente du schema coeur
- Pas de `tenant_id` sur:
1. `whatsapp_message`
2. `whatsapp_chat`
3. `whatsapp_media`
4. `contact`
5. `webhook_event_log`

## 3) Risques techniques directs
1. Collision de cles entre tenants.
2. Possibilite de rattacher des evenements au mauvais tenant si channel spoofe.
3. Difficulte a prouver isolation des donnees.

## 4) Cible minimale a figer avant code
1. Ajouter `tenant_id` sur tables coeur.
2. Introduire `provider` + `external_id` pour channels.
3. Remplacer unicites globales par unicites composites scopees tenant.
4. Etendre idempotency avec `tenant_id` et `provider_message_id`.

## 5) SQL checks a executer en DB reelle (bloquant)
```sql
-- 1. verifier channels dupliques
SELECT channel_id, COUNT(*) c
FROM whapi_channels
GROUP BY channel_id
HAVING c > 1;

-- 2. verifier messages dupliques
SELECT message_id, COUNT(*) c
FROM whatsapp_message
GROUP BY message_id
HAVING c > 1;

-- 3. verifier webhook event keys dupliques
SELECT event_key, COUNT(*) c
FROM webhook_event_log
GROUP BY event_key
HAVING c > 1;
```

## 6) Conclusion audit
- En l'etat: `NO-GO` migration prod multi-tenant stricte.
- Condition de passage: schema cible fige + checks DB reels executes + corrections appliquees.

