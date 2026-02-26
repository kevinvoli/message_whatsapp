# Guide de test — Messages Automatiques
**Date** : 2026-02-26

> Toutes les routes admin nécessitent un cookie de session `admin_token`.
> Remplace `<ADMIN_TOKEN>` par le token obtenu après login admin.
> Remplace `<BASE_URL>` par l'URL du backend (ex: `http://localhost:3002`).

---

## ÉTAPE 0 — Prérequis : migrations BDD

Appliquer les deux nouvelles migrations avant de démarrer :

```bash
cd message_whatsapp
npx typeorm migration:run -d src/database/data-source.ts
```

Vérifie que les deux migrations sont bien passées :
- `AddAutoMessageSettings1740604800001` → 4 colonnes dans `dispatch_settings`
- `CreateAutoMessageScopeConfig1740604800002` → table `auto_message_scope_config`

Vérification SQL rapide :
```sql
DESCRIBE dispatch_settings;
-- Doit montrer : auto_message_enabled, auto_message_delay_min_seconds,
--               auto_message_delay_max_seconds, auto_message_max_steps

SHOW TABLES LIKE 'auto_message_scope_config';
-- Doit retourner 1 résultat
```

---

## ÉTAPE 1 — Messages auto CRUD

### 1.1 Créer un message auto (position 1)

```bash
curl -X POST <BASE_URL>/message-auto \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{
    "body": "Bonjour #name#, je suis votre conseiller. Comment puis-je vous aider ?",
    "position": 1,
    "actif": true,
    "delai": 30
  }'
```

**Résultat attendu** : `201` avec l'objet créé + `id` UUID.

### 1.2 Créer un message auto (position 2)

```bash
curl -X POST <BASE_URL>/message-auto \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{
    "body": "Je reviens vers vous rapidement #name#. Êtes-vous toujours disponible ?",
    "position": 2,
    "actif": true
  }'
```

### 1.3 Créer un message auto (position 3)

```bash
curl -X POST <BASE_URL>/message-auto \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{
    "body": "Bonjour #name#, je reste à votre disposition. N'\''hésitez pas à nous recontacter.",
    "position": 3,
    "actif": true
  }'
```

### 1.4 Lister tous les messages auto

```bash
curl <BASE_URL>/message-auto \
  -H "Cookie: admin_token=<ADMIN_TOKEN>"
```

**Résultat attendu** : tableau de 3 messages, triés par `position` ASC.

### 1.5 Désactiver un message (test du filtre `actif`)

```bash
# Remplace <ID> par l'ID du message position 2
curl -X PATCH <BASE_URL>/message-auto/<ID> \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{"actif": false}'
```

**À vérifier** : après désactivation, le message position 2 ne doit plus être renvoyé si déclenché.

### 1.6 Test de validation — `conditions` invalide (doit échouer)

```bash
curl -X POST <BASE_URL>/message-auto \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{
    "body": "Test",
    "position": 4,
    "conditions": "invalid_string"
  }'
```

**Résultat attendu** : `400 Bad Request` — `conditions` doit être un objet.

### 1.7 Test de validation — `position` à 0 (doit échouer)

```bash
curl -X POST <BASE_URL>/message-auto \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{"body": "Test", "position": 0}'
```

**Résultat attendu** : `400 Bad Request` — `position` doit être `>= 1`.

### 1.8 Test de validation — `delai` négatif (doit échouer)

```bash
curl -X POST <BASE_URL>/message-auto \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{"body": "Test", "position": 1, "delai": -5}'
```

**Résultat attendu** : `400 Bad Request`.

---

## ÉTAPE 2 — Settings dispatch (activation globale + délais)

### 2.1 Lire les settings actuels

```bash
curl <BASE_URL>/queue/dispatch/settings \
  -H "Cookie: admin_token=<ADMIN_TOKEN>"
```

**Résultat attendu** : objet avec `auto_message_enabled: false` (défaut sécurisé).

### 2.2 Activer les messages auto globalement

```bash
curl -X POST <BASE_URL>/queue/dispatch/settings \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{
    "auto_message_enabled": true,
    "auto_message_delay_min_seconds": 5,
    "auto_message_delay_max_seconds": 10,
    "auto_message_max_steps": 3
  }'
```

> Pour les tests, utilise `delay_min=5` et `delay_max=10` (5-10 secondes)
> plutôt que 20-45 pour ne pas attendre trop longtemps.

**Résultat attendu** : `200` avec les nouveaux settings.

### 2.3 Test de validation — `delay_min >= delay_max` (doit échouer)

```bash
curl -X POST <BASE_URL>/queue/dispatch/settings \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{
    "auto_message_delay_min_seconds": 30,
    "auto_message_delay_max_seconds": 10
  }'
```

**Résultat attendu** : `400 Bad Request` avec message explicite sur `delay_min >= delay_max`.

### 2.4 Test de validation — `max_steps` hors borne (doit échouer)

```bash
curl -X POST <BASE_URL>/queue/dispatch/settings \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{"auto_message_max_steps": 15}'
```

**Résultat attendu** : `400 Bad Request` — `max_steps` doit être `<= 10`.

---

## ÉTAPE 3 — Scope config (activation par poste / canal / provider)

### 3.1 Lister tous les scopes (vide au départ)

```bash
curl <BASE_URL>/message-auto/scope-config \
  -H "Cookie: admin_token=<ADMIN_TOKEN>"
```

**Résultat attendu** : `[]`

### 3.2 Désactiver les messages auto pour un poste spécifique

```bash
# Remplace <POSTE_ID> par l'ID d'un poste existant
curl -X POST <BASE_URL>/message-auto/scope-config \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{
    "scope_type": "poste",
    "scope_id": "<POSTE_ID>",
    "label": "Poste test — désactivé",
    "enabled": false
  }'
```

**Résultat attendu** : `201` avec l'override créé.

### 3.3 Vérifier l'override par type

```bash
curl <BASE_URL>/message-auto/scope-config/type/poste \
  -H "Cookie: admin_token=<ADMIN_TOKEN>"
```

**Résultat attendu** : tableau avec 1 override `enabled: false`.

### 3.4 Réactiver le poste (upsert)

```bash
curl -X POST <BASE_URL>/message-auto/scope-config \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{
    "scope_type": "poste",
    "scope_id": "<POSTE_ID>",
    "enabled": true
  }'
```

**Résultat attendu** : même `id`, `enabled` passe à `true` (upsert, pas de doublon).

### 3.5 Désactiver pour un provider

```bash
curl -X POST <BASE_URL>/message-auto/scope-config \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{
    "scope_type": "provider",
    "scope_id": "meta",
    "label": "Provider Meta — messages auto désactivés",
    "enabled": false
  }'
```

**Résultat attendu** : `201` — les chats Meta ne recevront plus de messages auto.

### 3.6 Supprimer un override

```bash
# Remplace <SCOPE_ID> par l'ID de l'override à supprimer
curl -X DELETE <BASE_URL>/message-auto/scope-config/<SCOPE_ID> \
  -H "Cookie: admin_token=<ADMIN_TOKEN>"
```

**Résultat attendu** : `200` sans corps de réponse.

### 3.7 Supprimer un override inexistant (doit échouer)

```bash
curl -X DELETE <BASE_URL>/message-auto/scope-config/00000000-0000-0000-0000-000000000000 \
  -H "Cookie: admin_token=<ADMIN_TOKEN>"
```

**Résultat attendu** : `404 Not Found`.

---

## ÉTAPE 4 — Test du flux end-to-end

> Prérequis :
> - Au moins 3 messages auto actifs (positions 1, 2, 3)
> - `auto_message_enabled: true`
> - `delay_min=5`, `delay_max=10` (pour tests rapides)
> - Un agent connecté sur le frontend (pour que l'assignation fonctionne)

### 4.1 Simuler un webhook entrant (message client)

```bash
# Exemple Whapi — adapter selon le format exact du webhook
curl -X POST <BASE_URL>/whapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{
      "id": "test-msg-001",
      "chat_id": "33612345678@s.whatsapp.net",
      "from": "33612345678@s.whatsapp.net",
      "from_name": "Jean Dupont",
      "type": "text",
      "text": {"body": "Bonjour"},
      "timestamp": '<UNIX_TIMESTAMP>',
      "from_me": false
    }]
  }'
```

### 4.2 Vérifier les logs en temps réel

```bash
# Dans le terminal du serveur NestJS, cherche ces lignes :
# Orchestrator triggered — step=0 chatId=33612345678@s.whatsapp.net
# Scheduling step 1 after Xs for 33612345678@s.whatsapp.net
# Sending auto message step 1 for 33612345678@s.whatsapp.net
```

### 4.3 Vérifier en BDD après 5-10 secondes

```sql
SELECT
  chat_id,
  auto_message_step,
  auto_message_status,
  last_auto_message_sent_at,
  waiting_client_reply
FROM whatsapp_chat
WHERE chat_id = '33612345678@s.whatsapp.net';
```

**Résultat attendu** :
- `auto_message_step = 1`
- `auto_message_status = 'sent'`
- `last_auto_message_sent_at` = timestamp récent
- `waiting_client_reply = 1`

### 4.4 Vérifier que le message a bien été créé

```sql
SELECT id, text, from_me, timestamp
FROM whatsapp_message
WHERE chat_id = '33612345678@s.whatsapp.net'
ORDER BY timestamp DESC
LIMIT 5;
```

**Résultat attendu** : un message `from_me = 1` avec le texte du template position 1.

### 4.5 Envoyer un 2ème message client (déclenche step 2)

```bash
curl -X POST <BASE_URL>/whapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{
      "id": "test-msg-002",
      "chat_id": "33612345678@s.whatsapp.net",
      "from": "33612345678@s.whatsapp.net",
      "type": "text",
      "text": {"body": "Je suis intéressé"},
      "timestamp": '<UNIX_TIMESTAMP_2>',
      "from_me": false
    }]
  }'
```

**Résultat attendu après 5-10s** : `auto_message_step = 2`, message position 2 envoyé.

### 4.6 Test désactivation globale en temps réel

```bash
# Désactiver globalement
curl -X POST <BASE_URL>/queue/dispatch/settings \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{"auto_message_enabled": false}'

# Envoyer un nouveau message client
# → Aucun message auto ne doit être envoyé
```

**Log attendu** : `Auto messages disabled globally`

### 4.7 Test désactivation par poste en temps réel

```bash
# Désactiver pour le poste assigné au chat
curl -X POST <BASE_URL>/message-auto/scope-config \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=<ADMIN_TOKEN>" \
  -d '{
    "scope_type": "poste",
    "scope_id": "<POSTE_ID_ASSIGNE>",
    "enabled": false
  }'

# Réactiver global + envoyer un message client
# → Aucun message auto (bloqué par scope poste)
```

**Log attendu** : `Auto messages blocked by scope config for ...`

---

## ÉTAPE 5 — Tests de robustesse

### 5.1 Double webhook (anti-doublon verrou mémoire)

Envoyer deux webhooks identiques en rafale pour le même `chat_id` :

```bash
curl -X POST <BASE_URL>/whapi/webhook ... &
curl -X POST <BASE_URL>/whapi/webhook ... &
wait
```

**Résultat attendu** : un seul message auto envoyé (le verrou `Set<string>` bloque le second).

### 5.2 Redémarrage serveur (perte des locks mémoire)

1. Déclencher un auto message (step 1 en cours, timeout actif)
2. Redémarrer le serveur NestJS
3. Envoyer un nouveau message client

**Résultat attendu** : la séquence repart normalement depuis le step actuel en BDD.
Le timeout perdu au redémarrage est acceptable (comportement documenté).

### 5.3 Max steps atteint → read_only

Faire atteindre `auto_message_step = max_steps` (3 par défaut) puis envoyer un 4ème message client.

**Résultat attendu** :
- Log : `Max steps reached (3/3)`
- `read_only = 1` sur le chat en BDD
- Aucun nouveau message auto

---

## RÉCAPITULATIF DES VÉRIFICATIONS

| Test | Endpoint | Résultat attendu |
|------|----------|-----------------|
| CRUD messages auto | `POST /message-auto` | `201` |
| Filtre `actif` | `PATCH /message-auto/:id` `actif=false` | Message non envoyé |
| Settings activer | `POST /queue/dispatch/settings` | `200` |
| Validation delay_min >= delay_max | `POST /queue/dispatch/settings` | `400` |
| Scope poste désactivé | `POST /message-auto/scope-config` | `201` |
| Upsert scope | `POST /message-auto/scope-config` (2x) | Pas de doublon |
| Delete scope inexistant | `DELETE /message-auto/scope-config/:id` | `404` |
| Flux complet step 1 | Webhook entrant client | Message auto step 1 après délai |
| Flux complet step 2 | 2ème webhook client | Message auto step 2 |
| Désactivation globale | `auto_message_enabled: false` | Aucun envoi |
| Désactivation par poste | scope `enabled: false` | Aucun envoi |
| Anti-doublon | Double webhook | 1 seul message envoyé |
| Max steps | step >= max_steps | `read_only = true` |
