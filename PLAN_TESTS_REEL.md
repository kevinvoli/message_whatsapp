# PLAN DE TESTS RÉELS — Projet WhatsApp Demutualisation & Dispatching

**Date:** 2026-03-03
**Objectif:** Valider le comportement réel de l'application de bout en bout sur un environnement fonctionnel.
**Pré-requis:** Backend démarré (port 3002), Frontend (3000), Admin (3001), MySQL accessible.

---

## TABLE DES MATIÈRES

1. [Pré-requis & Setup](#1-pré-requis--setup)
2. [Tests d'authentification](#2-tests-dauthentification)
3. [Tests gestion des ressources (CRUD Admin)](#3-tests-gestion-des-ressources)
4. [Tests messages texte](#4-tests-messages-texte)
5. [Tests médias](#5-tests-médias)
6. [Tests webhook Whapi](#6-tests-webhook-whapi)
7. [Tests webhook Meta](#7-tests-webhook-meta)
8. [Tests dispatch & queue](#8-tests-dispatch--queue)
9. [Tests auto-messages](#9-tests-auto-messages)
10. [Tests temps réel (WebSocket)](#10-tests-temps-réel-websocket)
11. [Tests métriques & stats](#11-tests-métriques--stats)
12. [Tests de charge & limites](#12-tests-de-charge--limites)
13. [Tests de sécurité](#13-tests-de-sécurité)
14. [Checklist finale Go/No-Go](#14-checklist-finale-gono-go)

---

## 1. PRÉ-REQUIS & SETUP

### 1.1 Environnement nécessaire

```
□ MySQL démarré + base `whatsappflow` créée
□ Migrations exécutées: cd message_whatsapp && npm run migration:run
□ Backend lancé: cd message_whatsapp && npm run start:dev
□ Frontend lancé: cd front && npm run dev
□ Admin lancé: cd admin && npm run dev
□ Variables d'environnement configurées dans .env
□ Compte Whapi actif avec token valide
□ Numéro de test WhatsApp disponible (réel ou sandbox)
```

### 1.2 Données de test à préparer

```
□ Email admin: défini dans ADMIN_EMAIL (ex: admin@test.com)
□ Mot de passe admin: défini dans ADMIN_PASSWORD (ex: Admin1234!!)
□ Email commercial test: commercial1@test.com / Password: Test1234!!
□ Numéro WhatsApp client de test (téléphone réel)
□ Token Whapi canal de test
□ Image de test (.jpg < 5MB)
□ Document de test (.pdf < 10MB)
```

### 1.3 Outils utilisés

```
□ cURL ou Postman/Insomnia pour les appels API
□ Navigateur (Chrome DevTools → Network, Console)
□ Téléphone avec WhatsApp pour tester les webhooks
□ Logs backend: tail -f (ou console du terminal dev)
```

---

## 2. TESTS D'AUTHENTIFICATION

### TEST-AUTH-001 — Login Admin valide

**Endpoint:** `POST /auth/admin/login`

```bash
curl -X POST http://localhost:3002/auth/admin/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"admin@test.com","password":"Admin1234!!"}'
```

**Attendu:**
- HTTP 200
- Body: `{"message":"Login successful"}` (ou token)
- Cookie HTTP-only JWT posé (`Set-Cookie` dans headers)

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-AUTH-002 — Login Admin mauvais mot de passe

```bash
curl -X POST http://localhost:3002/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"mauvais"}'
```

**Attendu:**
- HTTP 401 Unauthorized
- Body: `{"message":"Unauthorized"}` ou similaire

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-AUTH-003 — Profil admin (token valide)

```bash
curl -X GET http://localhost:3002/auth/admin/profile \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Body: `{"id":"...","email":"admin@test.com","name":"Admin"}`

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-AUTH-004 — Accès admin sans token

```bash
curl -X GET http://localhost:3002/auth/admin/profile
```

**Attendu:**
- HTTP 401 Unauthorized

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-AUTH-005 — Login Commercial valide

**Pré-requis:** Commercial créé via admin (TEST-CRUD-003)

```bash
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -c cookies_commercial.txt \
  -d '{"email":"commercial1@test.com","password":"Test1234!!"}'
```

**Attendu:**
- HTTP 200
- Cookie JWT commercial posé

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-AUTH-006 — Logout Admin

```bash
curl -X POST http://localhost:3002/auth/admin/logout \
  -b cookies.txt -c cookies.txt
```

**Attendu:**
- HTTP 200
- Cookie JWT supprimé ou expiré

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

## 3. TESTS GESTION DES RESSOURCES

> Tous ces tests nécessitent le cookie admin (`-b cookies.txt`)

### TEST-CRUD-001 — Créer un Poste

```bash
curl -X POST http://localhost:3002/poste \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Poste Commercial A","code":"PCA","is_active":true,"is_queue_enabled":true}'
```

**Attendu:**
- HTTP 201
- Body: `{"id":1,"name":"Poste Commercial A","code":"PCA",...}`
- Stocker l'`id` retourné pour les tests suivants

**ID obtenu:** `_______`
**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-CRUD-002 — Lister les Postes

```bash
curl -X GET http://localhost:3002/poste \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Array contenant le poste créé ci-dessus

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-CRUD-003 — Créer un Commercial

```bash
curl -X POST http://localhost:3002/users \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Commercial Test 1","email":"commercial1@test.com","password":"Test1234!!","poste_id":ID_POSTE}'
```

**Attendu:**
- HTTP 201
- Body avec id commercial (password NON retourné en clair)

**ID obtenu:** `_______`
**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-CRUD-004 — Créer un Canal Whapi

```bash
curl -X POST http://localhost:3002/channel \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"channel_id":"CHANNEL_TEST_001","token":"TOKEN_WHAPI_ICI","provider":"whapi","external_id":"phone_number_here","is_business":true}'
```

**Attendu:**
- HTTP 201
- Body avec les infos du canal créé

**ID obtenu:** `_______`
**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-CRUD-005 — Mettre à jour un Poste

```bash
curl -X PATCH http://localhost:3002/poste/ID_POSTE \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Poste Commercial A - Modifié"}'
```

**Attendu:**
- HTTP 200
- Body avec champ `name` mis à jour

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-CRUD-006 — Créer un Contact

```bash
curl -X POST http://localhost:3002/contact \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"name":"Client Test","phone":"+33612345678","is_active":true,"source":"whatsapp"}'
```

**Attendu:**
- HTTP 201
- Body avec id contact (UUID)

**ID obtenu:** `_______`
**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-CRUD-007 — Supprimer un Commercial (soft delete)

```bash
curl -X DELETE http://localhost:3002/users/ID_COMMERCIAL \
  -b cookies.txt
```

**Attendu:**
- HTTP 200 (ou 204)
- Le commercial n'apparaît plus dans la liste
- Vérifier en DB: `deletedAt` est rempli (pas supprimé physiquement)

```sql
SELECT id, email, deleted_at FROM whatsapp_commercial WHERE id = 'ID_COMMERCIAL';
```

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

## 4. TESTS MESSAGES TEXTE

### TEST-MSG-001 — Envoyer un message texte (Admin → Chat)

**Pré-requis:** Chat existant en DB (créé par webhook test ou existant)

```bash
curl -X POST http://localhost:3002/messages \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "chat_id": "CHAT_ID_ICI@s.whatsapp.net",
    "text": "Bonjour, ceci est un message de test.",
    "poste_id": ID_POSTE,
    "channel_id": "CHANNEL_TEST_001"
  }'
```

**Attendu:**
- HTTP 201
- Body: `{"id":...,"direction":"OUT","status":"SENT","text":"Bonjour..."}`
- Message visible dans Whapi dashboard
- Message reçu sur le téléphone client de test

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-MSG-002 — Lister les messages d'un chat

```bash
curl -X GET "http://localhost:3002/messages/CHAT_ID_ICI@s.whatsapp.net" \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Array de messages avec direction IN/OUT, statuts, timestamps
- Message envoyé en TEST-MSG-001 présent

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-MSG-003 — Répondre à un message (quoted reply)

**Pré-requis:** ID d'un message existant (`quoted_message_id`)

```bash
curl -X POST http://localhost:3002/messages \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "chat_id": "CHAT_ID_ICI@s.whatsapp.net",
    "text": "Je réponds à votre message.",
    "poste_id": ID_POSTE,
    "channel_id": "CHANNEL_TEST_001",
    "quoted_message_id": "MESSAGE_ID_ICI"
  }'
```

**Attendu:**
- HTTP 201
- Message reçu sur le téléphone avec citation visible
- Champ `quoted_message_id` renseigné en DB

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-MSG-004 — Tentative envoi message sans auth

```bash
curl -X POST http://localhost:3002/messages \
  -H "Content-Type: application/json" \
  -d '{"chat_id":"test@s.whatsapp.net","text":"test","poste_id":1,"channel_id":"ch1"}'
```

**Attendu:**
- HTTP 401 Unauthorized

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

## 5. TESTS MÉDIAS

### TEST-MEDIA-001 — Upload image (Commercial)

**Pré-requis:** Cookie commercial (`cookies_commercial.txt`) + fichier image `test.jpg`

```bash
curl -X POST http://localhost:3002/messages/media \
  -b cookies_commercial.txt \
  -F "file=@./test.jpg;type=image/jpeg" \
  -F "chat_id=CHAT_ID_ICI@s.whatsapp.net" \
  -F "caption=Image de test" \
  -F "media_type=image"
```

**Attendu:**
- HTTP 201
- Body: `{"id":...,"direction":"OUT","status":"SENT",...}`
- Image reçue sur le téléphone client
- Entrée créée dans `whatsapp_media` en DB

**Vérifier en DB:**
```sql
SELECT * FROM whatsapp_media ORDER BY created_at DESC LIMIT 1;
```

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-MEDIA-002 — Upload document PDF

```bash
curl -X POST http://localhost:3002/messages/media \
  -b cookies_commercial.txt \
  -F "file=@./test.pdf;type=application/pdf" \
  -F "chat_id=CHAT_ID_ICI@s.whatsapp.net" \
  -F "caption=Document de test" \
  -F "media_type=document"
```

**Attendu:**
- HTTP 201
- Document reçu sur le téléphone client
- `mime_type: application/pdf` en DB

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-MEDIA-003 — Stream média Whapi (récupération)

```bash
# Récupérer le provider_media_id depuis TEST-MEDIA-001
curl -X GET http://localhost:3002/messages/media/whapi/MESSAGE_ID_MEDIA \
  -b cookies.txt -o test_download.jpg
```

**Attendu:**
- HTTP 200
- Fichier `test_download.jpg` créé et valide
- Content-Type: `image/jpeg`

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-MEDIA-004 — Upload média par Admin (doit échouer — guard commercial)

```bash
curl -X POST http://localhost:3002/messages/media \
  -b cookies.txt \
  -F "file=@./test.jpg;type=image/jpeg" \
  -F "chat_id=CHAT_ID_ICI@s.whatsapp.net" \
  -F "media_type=image"
```

**Attendu:**
- HTTP 401 ou 403 (AdminGuard ne permet pas POST /messages/media)
- **Note:** Ce comportement est VOULU selon l'audit

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

## 6. TESTS WEBHOOK WHAPI

### TEST-WH-001 — Réception message texte entrant (simulé)

**Pré-requis:** Token webhook Whapi configuré dans `.env`

```bash
# Construire la signature HMAC
SECRET="WHAPI_WEBHOOK_SECRET_VALUE_ICI"
PAYLOAD='{"event":{"type":"messages","action":"add"},"messages":[{"id":"wamid.TEST001","from":"33612345678@s.whatsapp.net","chat_id":"33612345678@s.whatsapp.net","type":"text","text":{"body":"Bonjour depuis test webhook"},"timestamp":1709459200,"from_me":false}]}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p | tr -d '\n')

curl -X POST http://localhost:3002/webhooks/whapi \
  -H "Content-Type: application/json" \
  -H "x-whapi-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

**Attendu:**
- HTTP 200
- Chat créé en DB: `SELECT * FROM whatsapp_chat WHERE chat_id = '33612345678@s.whatsapp.net';`
- Message créé en DB: `SELECT * FROM whatsapp_message WHERE chat_id = '33612345678@s.whatsapp.net' ORDER BY timestamp DESC LIMIT 1;`
- WebSocket broadcast reçu côté frontend (visible dans les outils dev)

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-WH-002 — Webhook sans signature (doit échouer)

```bash
curl -X POST http://localhost:3002/webhooks/whapi \
  -H "Content-Type: application/json" \
  -d '{"event":{"type":"messages"},"messages":[]}'
```

**Attendu:**
- HTTP 401 ou 403 (signature invalide)

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-WH-003 — Webhook signature invalide (doit échouer)

```bash
curl -X POST http://localhost:3002/webhooks/whapi \
  -H "Content-Type: application/json" \
  -H "x-whapi-signature: invalidsignature123" \
  -d '{"event":{"type":"messages"},"messages":[]}'
```

**Attendu:**
- HTTP 401 ou 403

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-WH-004 — Idempotency (même webhook deux fois)

**Envoyer le même payload deux fois avec le même ID message:**

```bash
# Première fois
curl -X POST http://localhost:3002/webhooks/whapi \
  -H "Content-Type: application/json" \
  -H "x-whapi-signature: $SIGNATURE" \
  -d "$PAYLOAD"

# Deuxième fois (même payload)
curl -X POST http://localhost:3002/webhooks/whapi \
  -H "Content-Type: application/json" \
  -H "x-whapi-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

**Attendu:**
- Les deux retournent HTTP 200
- Vérifier en DB: un seul message créé (pas de doublon)

```sql
SELECT COUNT(*) FROM whatsapp_message WHERE id = 'wamid.TEST001';
-- Résultat attendu: 1
```

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-WH-005 — Mise à jour statut message (DELIVERED)

```bash
PAYLOAD_STATUS='{"event":{"type":"statuses"},"statuses":[{"id":"wamid.TEST001","status":"delivered","timestamp":1709459300}]}'
SIGNATURE=$(echo -n "$PAYLOAD_STATUS" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p | tr -d '\n')

curl -X POST http://localhost:3002/webhooks/whapi \
  -H "Content-Type: application/json" \
  -H "x-whapi-signature: $SIGNATURE" \
  -d "$PAYLOAD_STATUS"
```

**Attendu:**
- HTTP 200
- Statut du message en DB passe de SENT → DELIVERED
- WebSocket broadcast status update

```sql
SELECT status FROM whatsapp_message WHERE id = 'wamid.TEST001';
-- Attendu: DELIVERED
```

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-WH-006 — Webhook avec média (image)

```bash
PAYLOAD_MEDIA='{"event":{"type":"messages","action":"add"},"messages":[{"id":"wamid.MEDIA001","from":"33612345678@s.whatsapp.net","chat_id":"33612345678@s.whatsapp.net","type":"image","image":{"id":"whapi_media_123","mime_type":"image/jpeg","caption":"Photo test"},"timestamp":1709459400,"from_me":false}]}'
SIGNATURE=$(echo -n "$PAYLOAD_MEDIA" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p | tr -d '\n')

curl -X POST http://localhost:3002/webhooks/whapi \
  -H "Content-Type: application/json" \
  -H "x-whapi-signature: $SIGNATURE" \
  -d "$PAYLOAD_MEDIA"
```

**Attendu:**
- HTTP 200
- Entrée dans `whatsapp_media` créée
- `mime_type: image/jpeg`, `provider: whapi`

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

## 7. TESTS WEBHOOK META

### TEST-META-001 — Vérification webhook Meta (hub challenge)

```bash
curl -X GET "http://localhost:3002/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=WHATSAPP_VERIFY_TOKEN_ICI&hub.challenge=12345"
```

**Attendu:**
- HTTP 200
- Body: `12345` (echo du challenge)

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-META-002 — Réception message texte Meta (simulé)

```bash
APP_SECRET="WHATSAPP_APP_SECRET_ICI"
PAYLOAD_META='{"object":"whatsapp_business_account","entry":[{"id":"WABA_ID","changes":[{"value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"33612345678","phone_number_id":"PHONE_ID"},"contacts":[{"profile":{"name":"Client Test"},"wa_id":"33612345678"}],"messages":[{"from":"33612345678","id":"wamid.META001","timestamp":"1709459200","text":{"body":"Bonjour depuis Meta webhook"},"type":"text"}]},"field":"messages"}]}]}'
SIGNATURE=$(echo -n "$PAYLOAD_META" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | base64)

curl -X POST http://localhost:3002/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=$SIGNATURE" \
  -d "$PAYLOAD_META"
```

**Attendu:**
- HTTP 200
- Chat créé en DB (provider: meta)
- Message créé en DB

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-META-003 — Webhook Meta sans signature

```bash
curl -X POST http://localhost:3002/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"object":"whatsapp_business_account","entry":[]}'
```

**Attendu:**
- HTTP 401 ou 403

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

## 8. TESTS DISPATCH & QUEUE

### TEST-QUEUE-001 — Snapshot de la queue

```bash
curl -X GET http://localhost:3002/queue/dispatch \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Body: `{"queue_size":N,"waiting_count":N,"waiting_items":[...]}`

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-QUEUE-002 — Paramètres dispatch actuels

```bash
curl -X GET http://localhost:3002/queue/dispatch/settings \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Body: `{"no_reply_reinject_interval_minutes":5,"auto_message_enabled":true,...}`

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-QUEUE-003 — Modifier les settings dispatch

```bash
curl -X POST http://localhost:3002/queue/dispatch/settings \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"no_reply_reinject_interval_minutes":10,"auto_message_enabled":true}'
```

**Attendu:**
- HTTP 200 ou 201
- Settings mis à jour
- Entrée créée dans `dispatch_settings_audit`

**Vérifier en DB:**
```sql
SELECT * FROM dispatch_settings_audit ORDER BY created_at DESC LIMIT 1;
```

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-QUEUE-004 — Bloquer un poste

```bash
curl -X POST http://localhost:3002/queue/block/ID_POSTE \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Le poste ne reçoit plus de nouveaux chats

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-QUEUE-005 — Débloquer un poste

```bash
curl -X POST http://localhost:3002/queue/unblock/ID_POSTE \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Le poste peut recevoir des chats à nouveau

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-QUEUE-006 — Reset complet de la queue

**⚠️ Attention: Destructif — utiliser uniquement en test**

```bash
curl -X POST http://localhost:3002/queue/reset \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- `queue_position` table vidée

**Vérifier:**
```sql
SELECT COUNT(*) FROM queue_position;
-- Attendu: 0
```

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-QUEUE-007 — Audit des settings dispatch (historique)

```bash
curl -X GET "http://localhost:3002/queue/dispatch/settings/audit/page?page=1&limit=10" \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Array des changements historiques avec payload JSON + createdAt

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-QUEUE-008 — Flux complet d'assignation (E2E)

**Scénario:** Client envoie un message → chat créé → dispatch → assigné à un poste

1. Envoyer webhook entrant (TEST-WH-001 avec un nouveau chat_id)
2. Vérifier en DB que le chat a bien un `poste_id` assigné :

```sql
SELECT chat_id, status, poste_id, assigned_at, assigned_mode
FROM whatsapp_chat
WHERE chat_id = 'NOUVEAU_CHAT_ID@s.whatsapp.net';
```

**Attendu:**
- `status = 'ACTIF'` (si poste disponible) ou `'EN_ATTENTE'`
- `poste_id` non null si assigné
- `assigned_at` renseigné
- `first_response_deadline_at` renseigné (X heures après assigned_at)

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

## 9. TESTS AUTO-MESSAGES

### TEST-AUTO-001 — Créer un auto-message

```bash
curl -X POST http://localhost:3002/message-auto \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"body":"Bonjour ! Un conseiller va vous répondre dans les plus brefs délais.","delai":30,"canal":"whatsapp","position":1,"actif":true}'
```

**Attendu:**
- HTTP 201
- Body: `{"id":...,"body":"Bonjour !...","actif":true}`

**ID obtenu:** `_______`
**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-AUTO-002 — Lister les auto-messages

```bash
curl -X GET http://localhost:3002/message-auto \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Array contenant l'auto-message créé

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-AUTO-003 — Déclencher l'auto-message (E2E)

**Scénario:** Nouveau chat entrant → auto-message déclenché après délai

1. S'assurer que `auto_message_enabled: true` dans DispatchSettings
2. Envoyer webhook entrant avec un nouveau numéro (TEST-WH-001 variant)
3. Attendre le délai configuré (ex: 30 secondes)

**Attendu:**
- Auto-message reçu sur le téléphone client (si délai écoulé)
- En DB: `chat.auto_message_step = 1`, `last_auto_message_sent_at` renseigné

```sql
SELECT auto_message_step, last_auto_message_sent_at, auto_message_enabled
FROM whatsapp_chat
WHERE chat_id = 'CHAT_ID@s.whatsapp.net';
```

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-AUTO-004 — Désactiver auto-messages sur un scope

```bash
# Créer scope config: désactiver pour un poste spécifique
curl -X POST http://localhost:3002/message-auto/scope-config \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"scope_type":"poste","scope_id":"ID_POSTE","label":"Poste Commercial A","enabled":false}'
```

**Attendu:**
- HTTP 200 ou 201
- Auto-messages désactivés pour ce poste spécifique

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

## 10. TESTS TEMPS RÉEL (WEBSOCKET)

### TEST-WS-001 — Connexion WebSocket (Frontend)

**Procédure manuelle:**
1. Ouvrir http://localhost:3000 dans le navigateur
2. Se connecter en tant que commercial
3. Ouvrir DevTools → Network → WS (filtrer WebSocket)
4. Vérifier la connexion Socket.io active

**Attendu:**
- Connexion WebSocket établie (status 101 Switching Protocols)
- Pas d'erreurs dans la console

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-WS-002 — Réception message en temps réel

**Procédure:**
1. Frontend ouvert + connecté (TEST-WS-001)
2. Envoyer webhook entrant (TEST-WH-001)
3. Observer l'interface

**Attendu:**
- Le message apparaît en temps réel dans la liste des chats (sans F5)
- Badge unread_count mis à jour
- Notification sonore ou visuelle (si implémentée)

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-WS-003 — Mise à jour statut en temps réel

**Procédure:**
1. Frontend ouvert + message envoyé visible
2. Envoyer webhook statut DELIVERED (TEST-WH-005)
3. Observer l'icône de statut du message

**Attendu:**
- Icône de statut change (double coche grise → double coche bleue)
- Changement visible sans rechargement

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-WS-004 — Update queue en temps réel (Admin)

**Procédure:**
1. Panel admin ouvert sur la vue Queue
2. Envoyer un nouveau webhook entrant (nouveau chat)

**Attendu:**
- La file d'attente se met à jour en temps réel
- Le nouveau chat apparaît dans la liste

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

## 11. TESTS MÉTRIQUES & STATS

### TEST-METRICS-001 — Métriques globales

```bash
curl -X GET http://localhost:3002/api/metriques/globales \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Body: `{"totalMessages":N,"chatsActifs":N,"commerciauxConnectes":N,...}`
- Valeurs cohérentes avec l'état actuel de la DB

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-METRICS-002 — Performance commerciaux

```bash
curl -X GET http://localhost:3002/api/metriques/commerciaux \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Array par commercial: `{id, name, nbChatsActifs, nbMessagesEnvoyes, tauxReponse, tempsReponseMoyen}`

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-METRICS-003 — Statut des canaux

```bash
curl -X GET http://localhost:3002/api/metriques/channels \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Array des canaux avec statut (up/down, messages traités, etc.)

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-METRICS-004 — Performance temporelle (7 jours)

```bash
curl -X GET "http://localhost:3002/api/metriques/performance-temporelle?jours=7" \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Données par jour sur 7 jours

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-METRICS-005 — Métriques webhook

```bash
curl -X GET http://localhost:3002/metrics/webhook \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Body: stats webhooks (total reçus, processed, failed, rate limit hits)

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-METRICS-006 — Stats globales

```bash
curl -X GET http://localhost:3002/stats \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Counts: chats, messages, commerciaux, postes, canaux

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

## 12. TESTS DE CHARGE & LIMITES

### TEST-CHARGE-001 — Rate limit webhook (Whapi)

**Envoyer 20 webhooks en rafale depuis la même IP:**

```bash
for i in {1..20}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3002/webhooks/whapi \
    -H "Content-Type: application/json" \
    -H "x-whapi-signature: $SIGNATURE" \
    -d "$PAYLOAD" &
done
wait
```

**Attendu:**
- Premières N requêtes: HTTP 200
- Après seuil: HTTP 429 Too Many Requests (rate limit)
- Logs backend indiquent rate limit triggered

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-CHARGE-002 — Payload > 1MB

```bash
# Générer un payload > 1MB
python3 -c "print('a' * 1100000)" > big_payload.txt

curl -X POST http://localhost:3002/webhooks/whapi \
  -H "Content-Type: application/json" \
  -H "x-whapi-signature: ANYTHING" \
  -d @big_payload.txt
```

**Attendu:**
- HTTP 413 Payload Too Large

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-CHARGE-003 — Pagination messages

```bash
curl -X GET "http://localhost:3002/messages?limit=10&offset=0" \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Array de max 10 messages
- Répéter avec `offset=10` pour page suivante

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

## 13. TESTS DE SÉCURITÉ

### TEST-SEC-001 — Accès ressources admin avec token commercial

```bash
# Login commercial d'abord
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -c cookies_com.txt \
  -d '{"email":"commercial1@test.com","password":"Test1234!!"}'

# Tentative d'accès admin avec ce token
curl -X GET http://localhost:3002/poste \
  -b cookies_com.txt
```

**Attendu:**
- HTTP 401 ou 403 (AdminGuard bloque les commerciaux)

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-SEC-002 — Injection SQL dans les paramètres

```bash
curl -X GET "http://localhost:3002/messages/'; DROP TABLE whatsapp_message; --@s.whatsapp.net" \
  -b cookies.txt
```

**Attendu:**
- HTTP 400 (bad request, validation échoue) ou 404
- **Absolument PAS de 500 Server Error**
- Aucune modification en DB

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-SEC-003 — Token JWT expiré

```bash
# Utiliser un token JWT expiré (simuler avec un jwt forgé ou attendre expiration)
curl -X GET http://localhost:3002/auth/admin/profile \
  -H "Cookie: jwt=EXPIRED_JWT_TOKEN"
```

**Attendu:**
- HTTP 401 Unauthorized

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-SEC-004 — CORS (origin non autorisée)

```bash
curl -X GET http://localhost:3002/auth/admin/profile \
  -H "Origin: http://evil.com" \
  -H "Cookie: jwt=VALID_JWT"
```

**Attendu:**
- Absence du header `Access-Control-Allow-Origin: http://evil.com`
- OU HTTP 403

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

### TEST-SEC-005 — Mot de passe en clair dans les réponses

```bash
curl -X GET http://localhost:3002/users \
  -b cookies.txt
```

**Attendu:**
- HTTP 200
- Body SANS champ `password` dans les objets commerciaux

**Résultat:** `[ ] OK  [ ] KO — Note:`

---

## 14. CHECKLIST FINALE GO/NO-GO

### Fonctionnel

```
[ ] Auth admin (login/logout/profil)
[ ] Auth commercial (login/logout)
[ ] CRUD Postes (créer, lire, modifier, supprimer)
[ ] CRUD Commerciaux (créer, lire, modifier, supprimer soft)
[ ] CRUD Canaux (créer, lire, modifier, supprimer)
[ ] CRUD Contacts (créer, lire, modifier, supprimer soft)
[ ] CRUD Auto-messages (créer, lire, modifier, supprimer)
[ ] Envoi message texte (Admin → WhatsApp)
[ ] Envoi média image (Commercial → WhatsApp)
[ ] Envoi média document (Commercial → WhatsApp)
[ ] Réception message entrant (Webhook Whapi)
[ ] Mise à jour statut message (SENT → DELIVERED → READ)
[ ] Dispatch automatique des chats entrants
[ ] Queue (reset, block/unblock poste)
[ ] Auto-messages déclenchés après délai
[ ] Quoted reply (répondre à un message)
[ ] Temps réel: messages entrants visible sans F5
[ ] Temps réel: statuts mis à jour sans F5
[ ] Métriques globales retournées
```

### Sécurité

```
[ ] HMAC signature Whapi validée (rejette les non signés)
[ ] HMAC signature Meta validée (rejette les non signés)
[ ] AdminGuard bloque les commerciaux
[ ] JwtGuard bloque les non authentifiés
[ ] Pas de mots de passe dans les réponses API
[ ] Pas d'injection SQL possible
[ ] Rate limiting actif sur les webhooks
[ ] Idempotency active (pas de doublons)
```

### Technique

```
[ ] npm run build — 0 erreur TypeScript
[ ] npm run migration:run — migrations jouées sans erreur
[ ] npm run test — tous les 45 tests passent
[ ] Pas de console.log en production
[ ] Variables d'environnement toutes configurées
[ ] HTTPS configuré (requis Meta API en prod)
[ ] Soft delete vérifié (deletedAt rempli, enregistrement toujours en DB)
```

### Performance

```
[ ] Pagination fonctionnelle (limit/offset)
[ ] Rate limit actif (429 après seuil)
[ ] Payload > 1MB rejeté (413)
[ ] WebSocket stable (pas de déconnexions)
```

---

## RÉSULTATS GLOBAUX

| Catégorie | Total | OK | KO | N/A |
|-----------|-------|----|----|-----|
| Authentification | 6 | | | |
| CRUD Admin | 7 | | | |
| Messages texte | 4 | | | |
| Médias | 4 | | | |
| Webhook Whapi | 6 | | | |
| Webhook Meta | 3 | | | |
| Dispatch & Queue | 8 | | | |
| Auto-messages | 4 | | | |
| WebSocket | 4 | | | |
| Métriques | 6 | | | |
| Charge & Limites | 3 | | | |
| Sécurité | 5 | | | |
| **TOTAL** | **60** | | | |

---

**Score Go/No-Go:**
- **≥ 55/60 OK** → ✅ GO en production
- **50-54/60 OK** → ⚠️ GO conditionnel (corriger les KO critiques d'abord)
- **< 50/60 OK** → ❌ NO-GO (blocages à corriger)

---

*Document de test — Projet WhatsApp Demutualisation — 2026-03-03*
