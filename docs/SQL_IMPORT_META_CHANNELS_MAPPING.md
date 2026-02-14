# SQL Import - Mapping Meta (WABA entry.id) vers tenant

Date: 2026-02-14  
Objectif: associer `entry.id` (WABA ID) aux tenants existants via table `channels`.

## Hypothese
Le `tenant_id` de reference est `whapi_channels.id`.

## Etapes
1) Lister les channels Whapi existants (source de verite tenant)
```sql
SELECT id AS tenant_id, channel_id
FROM whapi_channels
ORDER BY createdAt DESC;
```

2) Ajouter les mappings Meta connus (remplacer les valeurs)
```sql
-- Exemple: associer WABA_ID a un tenant existant
INSERT INTO channels (id, tenant_id, provider, external_id, channel_id, created_at, updated_at)
VALUES
  (UUID(), '<TENANT_ID_1>', 'meta', '<WABA_ID_1>', '<PHONE_NUMBER_ID_1>', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (UUID(), '<TENANT_ID_2>', 'meta', '<WABA_ID_2>', '<PHONE_NUMBER_ID_2>', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  channel_id = VALUES(channel_id),
  updated_at = CURRENT_TIMESTAMP;
```

3) Verifier la coherence
```sql
-- WABA doit etre unique (provider, external_id)
SELECT provider, external_id, COUNT(*) c
FROM channels
WHERE provider = 'meta'
GROUP BY provider, external_id
HAVING c > 1;
```

4) Validation fonctionnelle
```sql
-- Trouver le tenant a partir du WABA
SELECT tenant_id, channel_id
FROM channels
WHERE provider = 'meta' AND external_id = '<WABA_ID_1>';
```
