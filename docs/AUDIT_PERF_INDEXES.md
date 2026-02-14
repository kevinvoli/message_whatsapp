# Audit perf indexes (Phase A P2)

Date: 2026-02-14  
Objectif: verifier p95 des requetes critiques et proposer optimisation indexes.

## Requetes critiques
1. Chat list par poste
```sql
EXPLAIN SELECT * FROM whatsapp_chat WHERE poste_id = ? ORDER BY last_activity_at DESC LIMIT 50;
```

2. Messages par chat
```sql
EXPLAIN SELECT * FROM whatsapp_message WHERE chat_id = ? ORDER BY createdAt ASC LIMIT 100;
```

3. Messages non lus
```sql
EXPLAIN SELECT COUNT(*) FROM whatsapp_message WHERE chat_id = ? AND direction = 'IN' AND status IN ('sent','delivered');
```

4. Dernier message par chat
```sql
EXPLAIN SELECT * FROM whatsapp_message WHERE chat_id = ? ORDER BY timestamp DESC LIMIT 1;
```

5. Event log idempotency (lookup)
```sql
EXPLAIN SELECT * FROM webhook_event_log WHERE tenant_id = ? AND provider = ? AND event_key = ? LIMIT 1;
```

## Indexes attendus
- `whatsapp_chat(tenant_id, chat_id)` UNIQUE
- `whatsapp_message(tenant_id, provider, provider_message_id, direction)` UNIQUE
- `webhook_event_log(tenant_id, provider, event_key)` UNIQUE
- `whatsapp_message(chat_id, createdAt)` (a verifier si present)
- `whatsapp_chat(poste_id, last_activity_at)` (a verifier si present)

## Sortie attendue
- Plans `EXPLAIN` exportes (avant/apres)
- Liste des indexes manquants
- Estimation impact p95

## Resultats (EXPLAIN)
> Requetes lancees avec valeurs exemplaires (`poste-1`, `chat-1`, `tenant-1`).

1) Chat list par poste
- key: `FK_35be81d4f1c41e45429091a22a4`
- Extra: `Using index condition; Using where; Using filesort`

2) Messages par chat
- key: `FK_9efa365f72958880ee182ab584b`
- Extra: `Using index condition; Using where; Using filesort`

3) Messages non lus
- key: `FK_9efa365f72958880ee182ab584b`
- Extra: `Using index condition; Using where`

4) Dernier message par chat
- key: `FK_9efa365f72958880ee182ab584b`
- Extra: `Using index condition; Using where; Using filesort`

5) Event log idempotency lookup
- Extra: `Impossible WHERE noticed after reading const tables` (valeurs inexistantes)

## Recommandations
- Ajouter index composite pour supprimer les `filesort`:
  - `whatsapp_chat (poste_id, last_activity_at)`
  - `whatsapp_message (chat_id, createdAt)`
  - `whatsapp_message (chat_id, timestamp)`
- Verifier la presence d'index sur `webhook_event_log (tenant_id, provider, event_key)` (deja cree par migration).
