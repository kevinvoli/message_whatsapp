# Plan d'implémentation — Résolution photos de profil (tous providers)

**Date :** 2026-06-16
**Base :** Audit complet du code (lecture seule) — aucun provider ne résout les photos de profil actuellement.

---

## Diagnostic initial

| Provider | Nom résolu | Photo résolue | Raison |
|---|---|---|---|
| **Whapi** (WhatsApp) | ✅ Oui (webhook `pushName`) | ❌ Non | Aucun appel API Whapi pour photo ; webhook ne contient pas de photo |
| **Meta** (WhatsApp Cloud API) | ✅ Oui (webhook `profile.name`) | ❌ Impossible | WhatsApp Cloud API n'expose pas les photos de profil des clients (restriction Meta) |
| **Messenger** | ✅ Oui (`getUserName()`) | ❌ Non | `getUserName()` appelle `fields=name,first_name,last_name` — `profile_pic` absent des fields |
| **Instagram** | ⚠️ Bloqué (App Review) | ❌ Non | `getInstagramUserName()` appelle `fields=name,username` — `profile_pic` absent ; + App Review requis |

### État des colonnes en base

- `whatsapp_chat.chat_pic` : `varchar(100)`, default `'default.png'` → valeur réelle à la création : `''` (vide).
- `whatsapp_chat.chat_pic_full` : `varchar(100)`, default `'default.png'` → valeur réelle à la création : `''` (vide).
- Aucune colonne de tracking du refresh (`profile_pic_fetched_at`) n'existe.

### Infrastructure réutilisable existante

| Élément | Fichier | Rôle |
|---|---|---|
| `MediaStorageService.store()` | `src/media-storage/media-storage.service.ts:50-78` | Écrit un buffer sur disque, retourne `{ localUrl, localPath }` |
| `useStaticAssets` root `uploads/` | `src/main.ts:18-20` | `/uploads/profile-pics/...` déjà servi statiquement |
| `derivePageAccessToken()` | `src/communication_whapi/communication_messenger.service.ts:23-45` | Dérive PAT depuis page_id + token (Messenger/Instagram) |
| `chatService.update()` | `src/webhooks/inbound-message.service.ts:160,174` | Pattern existant pour mise à jour du chat |

---

## Architecture cible

Un seul service transversal `ProfilePicService` (nouveau, dans `src/media-storage/`) :

```
ProfilePicService
  ├── downloadAndStore(cdnUrl, ownerKey, tenantId) → { localUrl, localPath } | null
  │     Télécharge l'URL CDN, écrit sous uploads/profile-pics/{yyyy}/{mm}/{dd}/{tenant}/{key}.{ext}
  └── shouldRefresh(profilePicFetchedAt: Date | null, ttlDays = 3) → boolean
        null → true (jamais fetchée) | > ttlDays → true | sinon → false
```

Consommé par :
- `InboundMessageService` (Messenger + Instagram) — post-ingest non bloquant
- `CommunicationWhapiService` (Whapi) — via hook post-ingest

---

## Migration commune (tous providers)

**1 seule migration** couvre tous les providers :

```ts
// src/database/migrations/AddProfilePicFetchedAt1750041600000.ts
// + MODIFY COLUMN chat_pic/chat_pic_full varchar(255) si actuellement 100
ALTER TABLE whatsapp_chat
  ADD COLUMN profile_pic_fetched_at TIMESTAMP NULL DEFAULT NULL,
  MODIFY COLUMN chat_pic VARCHAR(255) NOT NULL DEFAULT 'default.png',
  MODIFY COLUMN chat_pic_full VARCHAR(255) NOT NULL DEFAULT 'default.png';
```

> **Note :** cette migration est déjà en cours d'implémentation par T2 du plan Instagram (voir `PLAN_IMPLEMENTATION_PROVIDER_INSTAGRAM_2026-06-15.md`). Ne pas créer une deuxième migration — utiliser celle-ci pour les 4 providers.

---

## Tâches par provider

---

### Provider 1 — Messenger (P0, le plus simple)

**Statut :** Infrastructure déjà en place (résolution nom), juste ajouter `profile_pic` aux fields.

**Fichier :** `src/communication_whapi/communication_messenger.service.ts`

**T-M1 — Ajouter `profile_pic` dans `getUserName()`** (ou créer `getMessengerProfile()`)

Option recommandée : créer `getMessengerProfile(psid, accessToken, pageId?)` retournant `{ name: string | null; profilePicUrl: string | null }` — appel Graph API avec `fields=first_name,last_name,profile_pic` — même pattern cache/PAT/timeout que `getInstagramUserName()`.

Endpoint : `GET https://graph.facebook.com/{version}/{psid}?fields=first_name,last_name,profile_pic&access_token={token}`

> Permissions requises : `pages_read_engagement` (déjà approuvée en prod — 1.5k appels). Aucune App Review supplémentaire.

**T-M2 — Intégration dans `resolveMessengerFromName()`** (`inbound-message.service.ts:506-534`)

Renommer/adapter en `resolveMessengerProfile()` : appeler `getMessengerProfile()` → récupérer nom ET photo en une requête → stocker photo via `ProfilePicService.downloadAndStore()` → `chatService.update({ chat_pic, chat_pic_full, profilePicFetchedAt })`.

Court-circuit : ne déclencher que si `profilePicFetchedAt` null ou > 3 jours.

**Effort :** 0,5 j — Aucune App Review requise.

---

### Provider 2 — Instagram (P0, en cours T2-T5)

**Statut :** T2-T5 en cours d'implémentation (voir `PLAN_IMPLEMENTATION_PROVIDER_INSTAGRAM_2026-06-15.md`).

**Blocage :** App Review Meta pour `instagram_manage_messages` (Advanced Access non soumis → soumettre via App Dashboard → Contrôle de l'app).

**T-I3 — `getInstagramProfile(igsid, accessToken, pageId?)`** dans `communication_messenger.service.ts`

Endpoint : `GET https://graph.facebook.com/{version}/{igsid}?fields=name,username,profile_pic&access_token={token}`

Retourne `{ name: string | null; profilePicUrl: string | null }`.

**T-I4 — `ProfilePicService.downloadAndStore()`**

Télécharge l'URL CDN Instagram (`profile_pic` expire en quelques jours), stocke sous `uploads/profile-pics/`, retourne `localUrl`.

**T-I5 — Intégration dans `resolveInstagramFromName()`** (`inbound-message.service.ts:536-573`)

Même pattern que Messenger (T-M2) — fire-and-forget post-ingest.

**Effort :** 2 j — Bloqué par App Review pour les vrais clients (code fonctionnel dès maintenant pour testeurs avec rôle sur l'app).

---

### Provider 3 — Whapi/WhatsApp (P1)

**Statut :** À implémenter — l'API Whapi expose un endpoint de contact avec photo.

**T-W1 — Vérifier l'endpoint Whapi pour la photo de profil**

Whapi expose `GET /contacts/{contact_id}` retournant notamment :
- `imgUrl` ou `profilePicThumb` : URL de la photo de profil du contact WhatsApp.

À vérifier dans la doc Whapi (`https://whapi.cloud/docs`) et dans `CommunicationWhapiService` (`src/communication_whapi/communication_whapi.service.ts`) pour le pattern d'appel (baseUrl, headers Authorization).

**T-W2 — `getWhapiContactProfilePic(phone, channelToken)`** dans `CommunicationWhapiService`

```ts
async getWhapiContactProfilePic(phone: string, token: string): Promise<string | null>
// GET {WHAPI_BASE_URL}/contacts/{phone}
// headers: { Authorization: `Bearer ${token}` }
// retourne response.data.imgUrl ?? response.data.profilePicThumb ?? null
```

Cache 1h par phone. Timeout 5s. Erreur silencieuse (null si 404/403).

Logs : `WHAPI_PIC_START`, `WHAPI_PIC_RESOLVED`, `WHAPI_PIC_FAILED`.

**T-W3 — Intégration dans le flux inbound Whapi** (`inbound-message.service.ts`)

Ajouter hook post-ingest pour `message.provider === 'whapi'` : appeler `getWhapiContactProfilePic(message.from, channel.token)` → si URL, `ProfilePicService.downloadAndStore()` → `chatService.update()`.

Court-circuit : ne déclencher que si `profilePicFetchedAt` null ou > 3 jours.

**Effort :** 1 j.

---

### Provider 4 — Meta WhatsApp Cloud API (NON FAISABLE)

**Statut :** ❌ Impossible — restriction Meta.

WhatsApp Cloud API (`graph.facebook.com/v22.0/{phone_number_id}/...`) n'expose pas les photos de profil des utilisateurs clients. Seule la photo de profil du **numéro business** est accessible, pas celle des clients qui envoient des messages.

**Action :** Aucune implémentation. Conserver `default.png` / initiale du nom pour les contacts WhatsApp Meta. Documenter cette limitation dans le code (commentaire sur `chat_pic` dans le dispatcher pour le provider `meta`).

---

## Tâche commune — Refresh périodique (P2)

**T-CRON — `ProfilePicRefreshService`** (`src/media-storage/profile-pic-refresh.service.ts`)

`@Cron` quotidien (ex: `0 3 * * *`) :
- Sélectionner les chats avec photo résolvable (provider IN `instagram`, `messenger`, `whapi`) ET `profile_pic_fetched_at < NOW() - INTERVAL 3 DAY` (ou NULL).
- Batch LIMIT 100 par exécution pour éviter le flood API.
- Re-déclencher la résolution via les services correspondants.
- Zéro N+1 : charger les canaux en batch (`IN (:...channelIds)`), pas de requête par chat.

Justification : les URLs CDN (Instagram notamment) expirent en quelques jours — sans cron, la photo disparaît pour les contacts silencieux.

**Effort :** 1 j.

---

## Ordre d'exécution recommandé

```
Migration (commune, T2 du plan Instagram) ← pré-requis de tout
    ↓
ProfilePicService.downloadAndStore() ← briques communes
    ↓
[en parallèle]
T-M1/M2 (Messenger)     T-I3/I4/I5 (Instagram)     T-W1/W2/W3 (Whapi)
(aucun blocage)          (bloqué App Review)         (vérif doc Whapi d'abord)
    ↓
T-CRON (refresh quotidien)
```

---

## Fichiers impactés (synthèse)

| Fichier | Modification |
|---|---|
| `src/whatsapp_chat/entities/whatsapp_chat.entity.ts` | + colonne `profilePicFetchedAt` ; `chat_pic`/`chat_pic_full` → length 255 |
| `src/database/migrations/AddProfilePicFetchedAt1750041600000.ts` | Nouvelle migration (commune tous providers) |
| `src/media-storage/profile-pic.service.ts` (**nouveau**) | `downloadAndStore()` + `shouldRefresh()` |
| `src/media-storage/profile-pic-refresh.service.ts` (**nouveau**) | Cron quotidien refresh |
| `src/media-storage/media-storage.module.ts` | Déclarer les 2 nouveaux services |
| `src/communication_whapi/communication_messenger.service.ts` | + `getMessengerProfile()` + `getInstagramProfile()` |
| `src/communication_whapi/communication_whapi.service.ts` | + `getWhapiContactProfilePic()` |
| `src/webhooks/inbound-message.service.ts` | Résolution photo post-ingest (Messenger + Instagram + Whapi) |

---

## Points d'attention

- **Meta WhatsApp Cloud API** : ne jamais tenter de résoudre la photo — impossble via l'API. Laisser `default.png`.
- **Expiration CDN Instagram** : l'URL `profile_pic` IG expire en quelques jours. Toujours stocker localement, jamais en base l'URL brute. Le cron gère le refresh.
- **Messenger `profile_pic`** : URL CDN Facebook, expire aussi — même traitement (download local + cron).
- **Whapi** : photo disponible uniquement si le contact a une photo de profil WhatsApp visible (respect des paramètres de confidentialité du contact). Gérer le 404 silencieusement.
- **Performance** : court-circuit systématique sur `profilePicFetchedAt` — ne jamais appeler l'API si photo déjà fraîche (< 3 jours). Le cache in-memory dans les services (1h TTL) protège contre les appels répétés en rafale.
- **Longueur URL** : les URLs locales `/uploads/profile-pics/2026/06/16/tenant-uuid/igsid.jpg` peuvent dépasser 100 chars — passer `chat_pic`/`chat_pic_full` à `varchar(255)` dans la migration.
- **Zéro N+1** dans le cron : charger les canaux en batch avant la boucle.
- **Zéro `any`** TypeScript.
- **Jamais de credentials dans les logs** (`token`, `meta_app_secret`).

---

## Statut global

| Tâche | Provider | Priorité | Statut |
|---|---|---|---|
| Migration `profile_pic_fetched_at` | Tous | P0 | En cours (T2 plan Instagram) |
| `ProfilePicService.downloadAndStore()` | Tous | P0 | En cours (T4 plan Instagram) |
| `getInstagramProfile()` + intégration | Instagram | P0 | En cours (T3-T5 plan Instagram) |
| `getMessengerProfile()` + intégration | Messenger | P0 | À faire |
| `getWhapiContactProfilePic()` + intégration | Whapi | P1 | À faire (vérif doc Whapi d'abord) |
| Meta WhatsApp Cloud API | Meta | — | Impossible (restriction API) |
| Cron refresh quotidien | Tous | P2 | À faire |
