# Rapport d'analyse — Provider Instagram : nom et photo de profil non résolus

**Date :** 2026-06-15
**Périmètre :** `message_whatsapp/` (backend), `admin/` et `front/` (affichage)

---

## 1. Résumé exécutif

Les messages Instagram arrivent correctement sur la plateforme (ingestion webhook OK). En revanche :

- Le **nom** du contact Instagram **dispose déjà d'un mécanisme de résolution** (appel Graph API), mais celui-ci peut échouer silencieusement pour plusieurs raisons de configuration/permissions.
- La **photo de profil** Instagram n'est **pas du tout implémentée** : aucun appel API n'existe pour la récupérer, et les colonnes `chat_pic` / `chat_pic_full` restent à `'default.png'`.

---

## 2. Flux d'exécution attendu

```
Webhook Instagram (POST /webhooks/instagram)
  → whapi.controller.ts:442-563   (vérif signature + dédup + provider='instagram')
    → UnifiedIngressService.ingestInstagram()
      → InstagramAdapter.normalizeMessages()        ← ne remplit PAS fromName
        → UnifiedMessage { from: igsid, ... }
      → InboundMessageService.handleMessages()
        → resolveInstagramFromName(igsid, channelId)   ← appel Graph API ICI
          → ChannelService.findByChannelId()  → { token, page_id, external_id }
          → communication_messenger.getInstagramUserName(igsid, token, pageId)
            → Méthode 1 : GET /me/conversations?platform=instagram&user_id={igsid}
            → Méthode 2 : GET /{igsid}?fields=name,username
        → message.fromName = name (ou undefined si échec)
      → dispatcher.service → WhatsappChat.name = fromName ?? 'Instagram #XXXXXX'
      → WebSocket → front/admin affichent chat.name
```

Aucune étape équivalente n'existe pour la **photo de profil**.

---

## 3. Détail par composant

### 3.1 Ingestion webhook — ✅ fonctionne

- `message_whatsapp/src/whapi/whapi.controller.ts:442-563`
- Validation HMAC + idempotence OK, route vers `UnifiedIngressService.ingestInstagram()` avec `provider='instagram'`, `channelId`, `tenantId`.

### 3.2 Adapter Instagram — ne fournit pas le nom (normal, Meta ne l'envoie pas)

- `message_whatsapp/src/webhooks/adapters/instagram.adapter.ts:65-91`
- `UnifiedMessage` produit sans `fromName` (le payload webhook IG ne contient que `sender.id`, voir `instagram-webhook.interface.ts:58-65`).
- Comportement attendu : la résolution du nom doit se faire ensuite via API.

### 3.3 Résolution du nom — code présent, peut échouer silencieusement

- `message_whatsapp/src/webhooks/inbound-message.service.ts:99-104` déclenche `resolveInstagramFromName()` (lignes 536-573).
- `resolveInstagramFromName()` :
  1. Charge le canal via `channelId`
  2. Extrait `pageId = channel.page_id ?? channel.external_id`
  3. Appelle `communication_messenger.service.getInstagramUserName(igsid, token, pageId)`

- `message_whatsapp/src/communication_whapi/communication_messenger.service.ts:135-242` :
  - **Méthode 1** : `GET /me/conversations?platform=instagram&user_id={igsid}&fields=participants` — extrait `name`/`username` du participant ≠ page.
  - **Méthode 2** (fallback) : `GET /{igsid}?fields=name,username`
  - Cache 1h par IGSID, timeout 5s par appel.

#### Causes probables de l'échec actuel

| # | Cause | Symptôme dans les logs |
|---|-------|------------------------|
| 1 | `page_id` non configuré sur le canal Instagram → pas de dérivation du Page Access Token | `IG_NAME[2/3] NO_PAGE_ID` |
| 2 | Permissions Meta manquantes (`instagram_manage_messages`, `pages_read_engagement`) | `IG_NAME_CONV_FAILED ...` / `IG_NAME_DIRECT_FAILED ...` avec code d'erreur Graph |
| 3 | Token invalide/expiré (User Token au lieu de Page Access Token) | `... (401) Invalid access token` |
| 4 | Timeout 5s dépassé | absence totale de log `IG_NAME_*` |

**Action recommandée :** vérifier en priorité que le canal Instagram a bien un `page_id` renseigné (Facebook Page ID liée au compte IG professionnel), puis consulter les logs `INSTAGRAM_NAME[*]` / `IG_NAME_*` pour identifier le point de blocage exact.

### 3.4 Photo de profil — ❌ non implémentée

- Aucune méthode `getInstagramUserProfilePic()` (ou équivalent) n'existe dans `communication_messenger.service.ts`.
- `inbound-message.service.ts` n'appelle aucune route pour récupérer `profile_pic_url`.
- `whatsapp_chat.entity.ts:132-147` : colonnes `chat_pic` et `chat_pic_full` existent (utilisées pour WhatsApp) mais restent à `'default.png'` pour Instagram.
- Contrainte spécifique Instagram Graph API : `profile_pic_url` retourné par `/{igsid}?fields=profile_pic_url` est une URL CDN **à durée de vie courte** → nécessiterait un téléchargement/stockage local (le module `media-storage/` existant pourrait être réutilisé pour ça).

### 3.5 Affichage front/admin — conforme, dépend des données en base

- `admin/src/app/ui/ConversationsView.tsx:722,784` et `front/src/components/chat/ChatHeader.tsx:95` affichent directement `chat.name` / `clientName`.
- L'avatar est généré dynamiquement à partir de la première lettre de `chat.name` (pas d'`<img>` séparé visible côté Instagram) — donc tant que `chat_pic`/`chat_pic_full` restent `default.png`, aucune vraie photo ne peut s'afficher même si on les remplissait, **sauf** si le composant avatar gère déjà l'affichage d'une image quand `chat_pic` ≠ `default.png` (à vérifier au moment de l'implémentation).

---

## 4. Plan d'action proposé

### Étape 1 — Diagnostic du nom (rapide, pas de code)
1. Vérifier en base que le canal Instagram concerné a bien `page_id` rempli (table `whapi_channels` ou `MessagingApplication` selon migration).
2. Consulter les logs applicatifs pour les entrées `INSTAGRAM_NAME[*]` / `IG_NAME_*` sur un message récent et identifier le point d'échec exact (NO_PAGE_ID, CONV_FAILED, DIRECT_FAILED, timeout).
3. Selon le résultat : compléter la configuration du canal (page_id, token avec permissions `instagram_manage_messages` + `pages_read_engagement`).

### Étape 2 — Implémentation de la photo de profil (développement)
1. Ajouter `getInstagramUserProfilePic(igsid, token, pageId?)` dans `communication_messenger.service.ts`, sur le même modèle que `getInstagramUserName()` (appel `/{igsid}?fields=profile_pic_url`, cache court car URL CDN expirable).
2. Dans `inbound-message.service.ts`, après résolution du nom, appeler cette méthode et déclencher le téléchargement de l'image via le module `media-storage/` existant pour stocker localement (`local_url`/`local_path`), puis assigner `chat.chat_pic` / `chat_pic_full`.
3. Vérifier que les composants avatar front/admin affichent bien `chat_pic`/`chat_pic_full` quand différent de `default.png` (sinon ajuster l'UI).

### Étape 3 — Refactoring optionnel (qualité)
- `getUserName()` (Messenger) et `getInstagramUserName()` (Instagram) partagent une logique quasi identique (cache, PAT derivation, 2 méthodes, timeout). Mutualisation possible dans une méthode générique paramétrée par `platform`.

---

## 5. Fichiers de référence

| Fichier | Lignes | Rôle |
|---|---|---|
| `message_whatsapp/src/whapi/whapi.controller.ts` | 442-563 | Webhook endpoint Instagram |
| `message_whatsapp/src/webhooks/unified-ingress.service.ts` | 123-138 | Routage vers adapter |
| `message_whatsapp/src/webhooks/adapters/instagram.adapter.ts` | 65-91 | Normalisation (sans `fromName`) |
| `message_whatsapp/src/webhooks/inbound-message.service.ts` | 99-104, 536-573 | Résolution du nom |
| `message_whatsapp/src/communication_whapi/communication_messenger.service.ts` | 53-242 | Appels Graph API (Messenger + Instagram) |
| `message_whatsapp/src/channel/entities/channel.entity.ts` | 32-36, 61-62 | Colonnes `provider`, `external_id`, `page_id` |
| `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts` | 119, 132-147 | Colonnes `name`, `chat_pic`, `chat_pic_full` |
| `message_whatsapp/src/dispatcher/dispatcher.service.ts` | 203-205, 249-250, 309-310, 333-334 | Mise à jour du nom du chat |
| `admin/src/app/ui/ConversationsView.tsx` | 722, 784 | Affichage du nom (admin) |
| `front/src/components/chat/ChatHeader.tsx` | 95 | Affichage du nom (commercial) |
