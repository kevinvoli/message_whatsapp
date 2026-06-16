# Plan d'implémentation — Résolution nom + photo de profil Instagram

**Date :** 2026-06-15
**Base :** `RAPPORT_ANALYSE_PROVIDER_INSTAGRAM_2026-06-15.md` + doc officielle Meta Instagram Platform API (v25.0)

---

## Contexte

Le projet ingère déjà les DM Instagram (webhook `POST /webhooks/instagram` → `InstagramAdapter` → `UnifiedIngressService`). Le code de résolution du nom (`getInstagramUserName`) et même la création d'un canal `provider='instagram'` existent déjà (`ChannelService.create()` lignes 241-311). Les problèmes identifiés initialement :

1. **Aucun canal `instagram` n'existe en base** → les messages IG transitent par le canal `messenger` (channel_id `1124330211008757`). Le lookup de nom IG ne trouve jamais de canal IG configuré.
2. **`resolveInstagramFromName()` n'a pas le fallback `findChannelByExternalId`** que possède `resolveMessengerFromName()`. Donc même avec un canal IG dont `channel_id` est NULL, le lookup échoue.
3. **Aucune implémentation de photo de profil** : `chat_pic` / `chat_pic_full` restent à `'default.png'`.

---

## ⚠️ MISE À JOUR (2026-06-15) — Diagnostic en production : T0 OK, blocage = App Review Meta

Un canal `provider='instagram'` **existe déjà en base et est correctement configuré**. Logs capturés sur un DM Instagram réel (`docker logs whatsapp-back`) :

```
IG[3/8] channel_lookup ig_account_id=17841405097000191 channel_found=true channel_id=17841405097000191
        provider=instagram page_id=1124330211008757 external_id=17841405097000191 has_secret=true has_token=true
INSTAGRAM_NAME[1/3] START igsid=978380681756360 channelId=17841405097000191 has_token=true
        page_id=1124330211008757 external_id=17841405097000191 pageId_used=1124330211008757
IG_NAME_CONV_FAILED   token_index=0 — (#298) Reading mailbox messages requires the extended permission read_mailbox
IG_NAME_CONV_FAILED   token_index=1 — (#200) App does not have Advanced Access to instagram_manage_messages
                      permission, and recipient user does not have role on app.
IG_NAME_DIRECT_FAILED token_index=0 — (#100) The page is not linked to an Instagram account or the linked
                      IG account is not a professional account
IG_NAME_DIRECT_FAILED token_index=1 — (#200) App does not have Advanced Access to instagram_manage_messages
                      permission, and recipient user does not have role on app.
INSTAGRAM_NAME[3/3] FAIL igsid=978380681756360 — aucun nom retourné.
```

### Conclusions

- **Tâche 0 (config canal) : ✅ FAIT** — `provider=instagram`, `external_id` = IG Business Account ID (17841405097000191), `page_id` = Facebook Page ID (1124330211008757), token présent. Le lookup direct par `channel_id` fonctionne.
- **Tâche 1 (fallback `findChannelByExternalId`) : NON BLOQUANT** — le lookup direct par `channel_id` réussit déjà dans ce cas. À garder en backlog par cohérence/robustesse (P2), mais ne débloque pas le problème actuel.
- **Le code de résolution (`getInstagramUserName`) fonctionne correctement** — il atteint bien l'API Graph avec les bons tokens (brut + PAT dérivé via `page_id`).

### Cause racine réelle : permissions Instagram en Standard Access (App Review non soumis)

Vérifié sur App Dashboard Meta → **Contrôle de l'app → Permissions** : statut **"Non soumis"** pour toutes les permissions Instagram :

- `instagram_manage_messages`
- `instagram_basic`
- `instagram_business_basic`
- `instagram_business_manage_messages`
- `pages_read_engagement`
- `pages_manage_metadata`
- `pages_show_list`

→ Ces permissions sont en **Standard Access** : l'API Graph ne répond correctement que pour des utilisateurs ayant un **rôle sur l'app** (testeur/développeur/admin). C'est pour ça que Messenger et WhatsApp fonctionnent (permissions différentes, déjà couvertes par la vérification Business/WABA) alors qu'Instagram échoue pour de vrais clients.

### Plan d'action révisé (remplace l'ordre T0→T7 ci-dessous pour le court terme)

| Action | Responsable | Délai |
|---|---|---|
| **1. Débloquer les tests immédiatement** : App Dashboard → Rôles → ajouter le compte Instagram de test comme **Testeur Instagram** | Ops/Admin Meta | Quelques minutes |
| **2. Soumettre l'App Review** pour le cas d'usage "Instagram Messaging", permissions minimum : `instagram_basic`, `instagram_manage_messages`, `pages_read_engagement`, `pages_manage_metadata`, `pages_show_list` (description du cas d'usage + capture/vidéo du flux DM → affichage nom/photo) | Ops/Admin Meta | 2-15 jours (validation Meta) |
| **3. Une fois Advanced Access obtenu** : revérifier les logs `IG_NAME_*` — la résolution du nom devrait fonctionner sans changement de code | Backend-dev | Immédiat après validation |
| **4. Implémenter T2-T7** (photo de profil + tests) | Backend-dev | Après validation de T3, voir détail ci-dessous |

Les tâches T1, T2-T7 ci-dessous **restent valides** pour la suite (photo de profil notamment, totalement absente), mais ne sont plus le chemin critique immédiat — celui-ci est désormais **côté Meta App Review**.

---

### Documentation officielle vérifiée (Meta, API v25.0)

- **Endpoint** : `GET /{IGSID}?fields=name,username,profile_pic,...`
- **Deux hôtes selon le flux d'auth** :
  - *Instagram Login* → `graph.instagram.com`, permissions `instagram_business_basic` + `instagram_business_manage_messages`, token = Instagram User Access Token.
  - *Facebook Login* (flux actuel du projet) → `graph.facebook.com`, permissions `instagram_basic` + `instagram_manage_messages` + `pages_manage_metadata` + `pages_read_engagement` + `pages_show_list`, token = **Page Access Token** (déjà dérivé via `derivePageAccessToken()`).
- **`profile_pic` est une URL CDN qui expire « after a few days »** → stockage local obligatoire + refresh périodique.
- Consentement utilisateur requis (automatiquement obtenu quand l'utilisateur envoie un DM — c'est notre cas).

---

## Éléments réutilisables identifiés

| Élément | Chemin | Réutilisation |
|---|---|---|
| Création canal `instagram` | `src/channel/channel.service.ts:241-311` | **Déjà complet** — aucune création de code, juste configurer une entrée |
| `findChannelByExternalId()` | `src/channel/channel.service.ts:583-587` | À appeler dans le fallback du lookup IG |
| `getInstagramUserName()` | `src/communication_whapi/communication_messenger.service.ts:135-242` | À valider/conserver (conforme doc) |
| `derivePageAccessToken()` | `communication_messenger.service.ts:23-45` | Réutiliser pour la photo (même token PAT) |
| `nameCache` / `patCache` | `communication_messenger.service.ts:12-14` | Pattern de cache à dupliquer pour les URLs de photo |
| `MediaStorageService.store()` | `src/media-storage/media-storage.service.ts:50-78` | **Réutiliser tel quel** pour écrire le fichier photo sur disque |
| `MediaDownloadService` (pattern) | `src/media-storage/media-download.service.ts` | Modèle pour télécharger une URL CDN avec token de canal |
| Static assets `/uploads/media/...` | déjà servi par Nginx/useStaticAssets | Sert aussi les photos de profil sans config supplémentaire |
| Hook de résolution nom | `inbound-message.service.ts:102-104` | Point d'injection identique pour la photo |

---

## Risques de duplication

1. **Logique de download URL CDN → buffer → store local** : présente dans `CommunicationMessengerService.downloadMedia()` (lignes 480-557) et dans `MediaDownloadService`. La récupération de la photo IG fait exactement ça (GET URL CDN → buffer → `MediaStorageService.store()`). **Ne pas réécrire un nouvel axios.get arraybuffer** : extraire ou réutiliser un helper de téléchargement binaire générique.
2. **`getUserName` (Messenger) vs `getInstagramUserName` (IG)** : ~80 % de logique commune (cache, dérivation PAT, fallback Conversations API → profil direct). Voir Tâche F (refactoring optionnel) — **ne pas dupliquer une 3ᵉ fois** pour la photo.
3. **Résolution `pageId = channel.page_id ?? channel.external_id`** : déjà répétée dans `resolveInstagramFromName` et `getInstagramUserName`. Centraliser le calcul du token effectif.

---

## Contrat d'interface

Pas d'endpoint HTTP nouveau exposé au front (le flux est interne webhook). Contrats internes :

```ts
// CommunicationMessengerService — nouvelle méthode
getInstagramUserProfilePic(
  igsid: string,
  accessToken: string,
  pageId?: string,
): Promise<string | null>   // retourne l'URL CDN brute (expirante), ou null

// Nouveau service de stockage photo (ou méthode dans MediaStorageService)
storeProfilePic(
  cdnUrl: string,
  ownerKey: string,    // ex: chatId "igsid@instagram"
  tenantId: string | null,
): Promise<{ localUrl: string; localPath: string } | null>

// WhatsappChat — colonnes existantes alimentées
chat_pic: string        // localUrl (ex: /uploads/profile-pics/2026/06/.../xxx.jpg)
chat_pic_full: string   // identique ou variante full-size
// + nouvelle colonne (Tâche E)
profile_pic_fetched_at: Date | null
```

---

## Tâches (ordre recommandé)

### Tâche 0 — Configurer le canal Instagram en base (ops/config, pré-requis bloquant)
**Responsable** : ops + backend-dev — 0,5 j
**Aucun code**, utilise `POST /channels` (provider=instagram) déjà implémenté.

Champs à fournir (vérifiés vs doc Meta) :
- `provider`: `'instagram'`
- `channel_id`: **Instagram Business Account ID (IGSID du compte pro)** — c'est l'`entry[0].id` que Meta envoie dans le webhook IG (le code `whapi.controller.ts:484` calcule `igAccountId = rawEntryId ?? recipientId`). C'est sur cette valeur que le webhook fait `findChannelByExternalId('instagram', igAccountId)`.
- `external_id`: **identique au `channel_id`** (= IG Business Account ID). Critique : le webhook (`whapi.controller.ts:496`) résout le canal **uniquement** par `external_id`.
- `page_id`: **Facebook Page ID** liée au compte IG (nécessaire à `derivePageAccessToken` en flux Facebook Login).
- `token`: System User Token (avec `permanent_token: true`) **ou** Page Access Token, portant les permissions `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`, `pages_read_engagement`, `pages_show_list`.
- `meta_app_id`, `meta_app_secret` : ceux de l'app Meta (le `meta_app_secret` sert à `assertInstagramSignature` — `whapi.controller.ts:502`).
- `verify_token` : pour le challenge GET.

**Obtention des IDs/tokens** :
- IG Business Account ID + Page ID : Graph API Explorer → `GET /me/accounts?fields=name,instagram_business_account{id,username}` avec un User Token de l'admin de la page.
- System User Token permanent : App Dashboard → Business Settings → Système Users → générer token avec les permissions ci-dessus + assigner l'app et la page.
- Abonner la page au webhook field `messages` Instagram (App Dashboard → Webhooks → Instagram).

**Point de vigilance** : si les DM IG continuent d'arriver sur l'`entry.id` de la **page Messenger** (`1124330211008757`) et non sur l'IG Business Account ID, alors `external_id` du canal IG doit être cette valeur. **À confirmer en lisant les logs `IG[2/8] ids raw_entry_id=...`** sur un message réel avant de figer la config. Cette vérification conditionne toute la suite.

---

### Tâche 1 — Fix du fallback de lookup dans `resolveInstagramFromName()` (P0)
**Responsable** : backend-dev — 0,5 j — dépend de rien (peut démarrer en // de T0)
**Fichier** : `src/webhooks/inbound-message.service.ts:536-573`

Aligner sur `resolveMessengerFromName` (lignes 514-516) :
```ts
const channel =
  (await this.channelService.findByChannelId(channelId)) ??
  (await this.channelService.findChannelByExternalId('instagram', channelId));
```
Raison : quand le canal IG a `channel_id` NULL, le webhook (`whapi.controller.ts:518`) passe `channelId = igAccountId`, et `findByChannelId(igAccountId)` échoue. Le fallback par `external_id` est indispensable.

Conserver les logs `INSTAGRAM_NAME[1/3]` existants (utiles au diagnostic).

---

### Tâche 2 — Migration TypeORM : colonne de suivi du refresh photo (P1)
**Responsable** : backend-dev — 0,5 j — pré-requis de T4
**Fichiers** : nouvelle migration `src/database/migrations/AddProfilePicFetchedAt<13digits>.ts` + `src/whatsapp_chat/entities/whatsapp_chat.entity.ts`

Ajouter sur `whatsapp_chat` :
```ts
@Column({ name: 'profile_pic_fetched_at', type: 'timestamp', nullable: true })
profile_pic_fetched_at: Date | null;
```
Justification : `profile_pic` IG expire en quelques jours → besoin de savoir quand re-télécharger. Pas besoin de stocker l'URL CDN brute (jetable). Les colonnes `chat_pic` / `chat_pic_full` (length 100) suffisent pour l'URL locale `/uploads/profile-pics/...` — **vérifier que 100 caractères suffisent** ; sinon passer en `length: 255` dans la même migration.

Nom de classe : timestamp JS 13 chiffres (ex: `AddProfilePicFetchedAt1750000000000`). `migration:run` est automatique au déploiement (ne pas proposer de run manuel).

---

### Tâche 3 — `getInstagramUserProfilePic()` dans le service Messenger (P1)
**Responsable** : backend-dev — 1 j — dépend de T0 (token configuré)
**Fichier** : `src/communication_whapi/communication_messenger.service.ts`

Nouvelle méthode, calquée sur `getInstagramUserName` (lignes 135-242) :
- Endpoint : `GET https://graph.facebook.com/{version}/{igsid}?fields=profile_pic&access_token={effectiveToken}` (flux Facebook Login, cohérent avec l'existant).
- Réutiliser `derivePageAccessToken(pageId, accessToken)` pour obtenir le PAT (lignes 23-45).
- Essayer token brut puis PAT dérivé (même boucle `tokensToTry` que le nom).
- Cache court (`profilePicUrlCache`, TTL ~1h) — l'URL expire en jours mais on évite le spam d'appels Graph.
- Retour : l'URL CDN brute (string) ou `null`. Logs `IG_PIC_*` (resolved/empty/failed) dans le style existant.
- **Ne pas** télécharger ici — séparation des responsabilités (le download est en T4).

Gestion d'erreurs Graph : capturer `error.code` / `error.message` comme le code existant (lignes 231-238), pas de throw.

---

### Tâche 4 — Téléchargement + stockage local de la photo (P1)
**Responsable** : backend-dev — 1 j — dépend de T3 + T2
**Fichiers** :
- `src/media-storage/media-storage.service.ts` (ajout méthode) **ou** nouveau `src/media-storage/profile-pic.service.ts`
- consommé depuis `inbound-message.service.ts`

Logique :
1. Helper de téléchargement binaire : `axios.get(cdnUrl, { responseType: 'arraybuffer', timeout: 15000 })`. **Réutiliser le pattern de `downloadMedia` (communication_messenger.service.ts:536-545)** — idéalement extraire un util `downloadBinary(url)` partagé pour éviter la 3ᵉ copie (voir Risque de duplication #1).
2. `MediaStorageService.store(buffer, mimeType, key, tenantId)` existe déjà (lignes 50-78) et écrit dans `/uploads/media/...`. Pour isoler les photos, ajouter une variante `storeProfilePic()` qui écrit sous `uploads/profile-pics/{YYYY}/{MM}/{DD}/{tenant}/{key}.{ext}` → URL `/uploads/profile-pics/...`. **Factoriser le cœur d'écriture** (mkdir + writeFile + mimeToExt) entre `store` et `storeProfilePic`.
3. Retourner `{ localUrl, localPath }`.
4. Idempotence : ne re-télécharger que si `profile_pic_fetched_at` est null ou plus vieux que N jours (ex: 3 j, marge sous l'expiration CDN).

S'assurer que `uploads/profile-pics` est servi statiquement (même `useStaticAssets` que `uploads/media`) — **vérifier `main.ts`** ; si le static root est `uploads/`, c'est déjà couvert.

---

### Tâche 5 — Intégration dans le flux inbound (P1)
**Responsable** : backend-dev — 0,5 j — dépend de T1, T4
**Fichier** : `src/webhooks/inbound-message.service.ts`

1. À côté de la résolution du nom (lignes 102-104), ajouter une résolution de photo **fire-and-forget non bloquante** (hors mutex, comme le nom) :
   - Résoudre le canal via le même fallback que T1 (factoriser : un helper `resolveInstagramChannel(channelId)` qui retourne `{ channel, pageId }` partagé entre nom et photo, évite le double lookup).
   - Appeler `getInstagramUserProfilePic` → si URL, télécharger via T4 → obtenir `localUrl`.
2. Mettre à jour le chat : après `assignConversation` (ligne 111), si `localUrl` obtenu et chat actuellement à `default.png` ou `profile_pic_fetched_at` périmé →
   `await this.chatService.update(conversation.chat_id, { chat_pic: localUrl, chat_pic_full: localUrl, profile_pic_fetched_at: new Date() })`.
   (`chatService.update` déjà utilisé lignes 160, 174.)
3. Ne déclencher la photo que pour `message.provider === 'instagram'`. **Performance** : ne pas appeler Graph à chaque message — court-circuiter si le chat a déjà une photo récente (lecture `profile_pic_fetched_at`). Pour un nouveau chat, le dispatcher crée le chat avec `chat_pic` par défaut (dispatcher.service.ts:270) — la mise à jour se fait juste après.

---

### Tâche 6 — Refresh périodique des photos expirées (P2)
**Responsable** : backend-dev — 1 j — dépend de T4, T5
**Fichier** : `src/media-storage/` (nouveau cron, ex: `profile-pic-refresh.service.ts`) — les crons vivent dans les modules (cf. CLAUDE.md).

`@Cron` quotidien : sélectionner les chats IG (`chat_id LIKE '%@instagram'`) avec `profile_pic_fetched_at < NOW() - INTERVAL 3 DAY`, re-résoudre + re-télécharger, mettre à jour. Borne le batch (LIMIT) + idempotence. Justification : l'URL CDN re-générée à chaque appel Graph est fraîche ; on rafraîchit le fichier local avant péremption visible.

**Optionnel / à débattre** : si l'historique des photos n'est pas critique, ce cron peut être P3 — la photo se rafraîchit naturellement au prochain message du client (T5). Le cron ne sert qu'aux clients silencieux.

---

### Tâche F — Refactoring (optionnel, P2)
**Responsable** : backend-dev — 1 j
Mutualiser dans `communication_messenger.service.ts` :
- Un helper privé `buildTokensToTry(accessToken, pageId)` (logique répétée nom/photo, lignes 146-157).
- Un helper `graphGet<T>(idOrPath, fields, token)` avec timeout 5s + parsing d'erreur unifié (dupliqué dans `getUserName`, `getInstagramUserName`, futur `getInstagramUserProfilePic`).
- Évaluer une méthode générique `getInstagramProfileFields(igsid, token, pageId, fields[])` retournant `{name?, username?, profile_pic?}` en **un seul appel Graph** → le nom ET la photo en une requête au lieu de deux (gain latence + quota). Si retenu, T3 et la résolution nom convergent. **Recommandé** car `fields=name,username,profile_pic` est un seul GET d'après la doc.

> Décision d'architecture suggérée : implémenter directement T3 sous forme de `getInstagramProfile(igsid, token, pageId)` retournant `{name, profile_pic}` plutôt que deux méthodes séparées — économise un appel Graph par client et supprime la duplication dès le départ. Dans ce cas, adapter `resolveInstagramFromName` pour consommer ce profil unifié.

---

### Tâche 7 — Tests (P1, en // des tâches concernées)
**Responsable** : tester — 1 j
**Fichiers** : `src/webhooks/inbound-message.service.spec.ts`, `src/communication_whapi/communication_messenger.service.spec.ts` (à créer si absent), `src/media-storage/*.spec.ts`

Cas à couvrir :
1. `resolveInstagramFromName` : canal trouvé par `channel_id` ; canal trouvé par fallback `external_id` (channel_id NULL) ; canal introuvable → undefined ; token manquant → undefined ; **non-régression du fallback** (le bug corrigé en T1).
2. `getInstagramUserProfilePic` / `getInstagramProfile` : succès profil direct ; dérivation PAT appelée quand pageId fourni ; erreur Graph (code 190 token expiré) → null sans throw ; cache hit n'appelle pas axios.
3. `storeProfilePic` : écrit dans `uploads/profile-pics/...`, retourne localUrl correct selon mimeType ; téléchargement échoué → null.
4. Intégration inbound : message IG entrant → `chat_pic` mis à jour + `profile_pic_fetched_at` renseigné ; message IG avec photo récente → **pas** de second appel Graph (court-circuit perf).
5. Mock axios (pas d'appel réseau réel) ; mock `fs` pour `store`.

---

## Fichiers impactés

| Fichier | Nature |
|---|---|
| `src/webhooks/inbound-message.service.ts` | T1 fallback lookup ; T5 résolution+update photo ; helper `resolveInstagramChannel` |
| `src/communication_whapi/communication_messenger.service.ts` | T3 `getInstagramUserProfilePic`/`getInstagramProfile` ; T-F helpers mutualisés |
| `src/whatsapp_chat/entities/whatsapp_chat.entity.ts` | T2 colonne `profile_pic_fetched_at` (+ éventuel length 255 sur chat_pic) |
| `src/database/migrations/AddProfilePicFetchedAt<ts>.ts` | T2 nouvelle migration |
| `src/media-storage/media-storage.service.ts` | T4 `storeProfilePic` + factorisation cœur écriture |
| `src/media-storage/profile-pic-refresh.service.ts` (nouveau) | T6 cron refresh |
| `src/media-storage/media-storage.module.ts` | T6 déclarer le nouveau service/cron |
| `src/main.ts` | T4 vérifier static serving `uploads/profile-pics` |
| specs associés | T7 |
| **Config base (pas de code)** | T0 entrée canal `instagram` via `POST /channels` |

---

## Points d'attention

- **Bloquant amont** : T0 doit confirmer **sur quel `entry.id` arrivent réellement les DM IG** (logs `IG[2/8]`). Si c'est l'ID de la page Messenger et non l'IG Business Account ID, l'`external_id` du canal IG doit valoir cet ID — sinon `findChannelByExternalId` échoue et tout le reste reste inerte. Ne pas figer la config avant cette observation.
- **Conflit canal messenger / instagram** : si un canal `messenger` et un canal `instagram` partagent le même `external_id` (page liée), `findChannelByExternalId('instagram', x)` les distingue par `provider` (ligne 585) — OK. Mais vérifier que le webhook IG ne soit pas intercepté par le routing Messenger en amont.
- **Sécurité** : `meta_app_secret` requis sur le canal IG pour `assertInstagramSignature` (whapi.controller.ts:502). Sans lui → 401 en prod. Ne jamais logguer `token`/`meta_app_secret` (déjà respecté). `sanitizeChannel()` appliqué aux retours.
- **Expiration URL CDN** : la photo locale est la source de vérité côté front ; ne jamais stocker l'URL CDN brute en base (jetable). `profile_pic_fetched_at` pilote le refresh.
- **Performance / quota Graph** : court-circuiter la résolution photo si `profile_pic_fetched_at` récent ; privilégier un **seul GET** `fields=name,username,profile_pic` (Tâche F) plutôt que deux appels.
- **Pas de breaking change** : colonnes `chat_pic`/`chat_pic_full` déjà existantes, défaut `default.png` conservé en fallback. La nouvelle colonne est nullable.
- **Zéro `any`, zéro N+1, queries paramétrées** : le cron T6 doit utiliser un `IN`/batch, pas de requête par chat dans une boucle.

## Ordre d'exécution conseillé

T0 (config+observation logs) ∥ T1 → vérifier nom IG résolu en prod → T2 → T3 → T4 → T5 → T7 → T6 (et T-F intégrée idéalement dès T3).

## Sources

- [Instagram User Profile API (Instagram Login)](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile/)
- [Instagram User Profile API (Facebook Login / Messenger Platform)](https://developers.facebook.com/docs/messenger-platform/instagram/features/user-profile/)
- [Instagram Conversations API](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/conversations-api)
