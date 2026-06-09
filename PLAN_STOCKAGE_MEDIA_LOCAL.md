# Plan — Stockage local des médias clients

**Date :** 2026-06-09  
**Branche :** production  
**Objectif :** Télécharger et conserver une copie locale de chaque média entrant (image, vidéo, audio, document…) pour ne plus dépendre des CDN Facebook/Meta/Whapi qui expirent.

---

## 1. Contexte et problème actuel

### Ce qui existe déjà

L'entité `WhatsappMedia` stocke :
- `url` → **URL CDN externe du provider** (lien Facebook, Whapi, Messenger… stocké tel quel)
- `provider_media_id` / `whapi_media_id` → identifiant chez le provider

Les endpoints proxy (`GET /messages/media/meta/:id`, etc.) re-téléchargent le fichier depuis le CDN du provider à chaque appel. Le cache disque n'existe que pour Meta (`uploads/media-meta/`).

### Problème

- Les URLs CDN de Facebook/Meta expirent (typiquement 7 à 30 jours).
- Whapi régénère ses URLs à chaque appel, ce qui est lent et dépend du tiers.
- En cas d'expiration, le média est perdu : impossible de le ré-afficher dans la conversation.
- Pour des milliers de clients par jour, chaque rafraîchissement de page coûte un appel réseau externe.

---

## 2. Question d'architecture : monolithe vs microservice dédié

### Option A — Module intégré dans le backend NestJS existant (recommandée)

| Avantage | Détail |
|---|---|
| Accès direct aux entités | Pas de communication HTTP inter-services |
| Jobs BullMQ déjà en place | File de téléchargement asynchrone sans infrastructure supplémentaire |
| Complexité opérationnelle nulle | Un seul processus à déployer et monitorer |
| Délai d'implémentation court | Réutilise les services provider existants |

**Limite** : si les volumes explosent (dizaines de millions de fichiers/jour), on peut extraire le module plus tard sans refonte de la DB.

### Option B — Microservice NestJS dédié

| Avantage | Inconvénient |
|---|---|
| Scalabilité indépendante | Double déploiement, double CI/CD |
| Isolation CPU/RAM | Synchronisation DB complexe (FK cross-service ou event bus) |
| Technologie optimisée | Latence réseau inter-services à chaque lookup |

**Verdict** : Pour plusieurs milliers d'utilisateurs/jour (pas des millions), le microservice ajoute une complexité opérationnelle injustifiée. **L'option A est recommandée**, avec une architecture modulaire qui permet une extraction future si nécessaire. Les téléchargements lourds sont isolés dans des jobs BullMQ asynchrones qui ne bloquent pas le flux principal.

---

## 3. Schéma cible

### 3.1 Colonnes `whatsapp_media` — réutilisation + ajouts

#### Colonne réutilisée (aucun changement de sémantique)

| Colonne | Type actuel | Rôle dans ce plan |
|---|---|---|
| `url` | TEXT nullable | Conserve son rôle actuel : **URL CDN externe du provider** (Facebook, Whapi, Messenger…). C'est notre `provider_url` — pas besoin d'ajouter une colonne séparée. |

#### Nouvelles colonnes à ajouter (migration SQL)

```sql
-- URL publique locale servie par notre serveur (/media/2026/06/09/{tenantId}/{uuid}.jpg)
local_url VARCHAR(512) NULL

-- Chemin relatif sur notre disque (ex: media/2026/06/09/{tenantId}/{uuid}.jpg)
local_path VARCHAR(512) NULL

-- true si l'URL provider (url) est expirée ou inaccessible
provider_url_expired TINYINT(1) NOT NULL DEFAULT 0

-- Quand le fichier a été téléchargé localement
downloaded_at DATETIME NULL
```

**Total : 4 nouvelles colonnes.** La colonne `url` existante joue le rôle de `provider_url` — économie d'une colonne par rapport au plan initial.

### 3.2 Logique de résolution d'URL (lecture)

```
Si local_url IS NOT NULL  (copie locale disponible)
  → Servir depuis notre serveur via local_url
Sinon si provider_url_expired = false
  → Utiliser url (CDN provider) → comportement proxy actuel
  → Enqueue download en arrière-plan si pas déjà fait
Sinon (url expirée, pas de copie locale)
  → Retourner 410 Gone avec message explicite
```

---

## 4. Plan d'implémentation par phase

### Phase 1 — Migration base de données

**Fichier :** `src/migrations/AddLocalMediaStorage1749427200001.ts`

Ajouter sur `whatsapp_media` — **4 nouvelles colonnes** (`url` existante = provider URL, pas de changement) :
- `local_url VARCHAR(512) NULL`
- `local_path VARCHAR(512) NULL`
- `provider_url_expired TINYINT(1) NOT NULL DEFAULT 0`
- `downloaded_at DATETIME NULL`

Index à ajouter :
- `INDEX IDX_whatsapp_media_local_path (local_path)` — pour le job de rattrapage (lookup des non-téléchargés)

> **Note :** La colonne `url` existante conserve son rôle actuel (URL CDN provider). Elle est réutilisée comme `provider_url` — aucune nouvelle colonne pour ça.

**Durée estimée :** 30 min

---

### Phase 2 — Module `media-storage`

**Nouveau module :** `src/media-storage/`

```
src/media-storage/
├── media-storage.module.ts
├── media-storage.service.ts      ← écriture/lecture fichiers disque
├── media-download.service.ts     ← téléchargement depuis les providers
├── media-download.processor.ts   ← consumer BullMQ
└── dto/
    └── download-job.dto.ts
```

#### `MediaStorageService`

Responsabilités :
- Construire le chemin local : `uploads/media/{YYYY}/{MM}/{DD}/{tenantId}/{uuid}.{ext}`
- Écrire le buffer sur disque
- Construire l'URL publique correspondante
- Supprimer un fichier (GDPR opt-out)

#### `MediaDownloadService`

Responsabilités :
- Orchestrer le téléchargement selon le provider (`meta`, `whapi`, `messenger`, `instagram`)
- Réutiliser les services existants :
  - `CommunicationMetaService.downloadMediaByUrl()`
  - `CommunicationWhapiService.downloadMedia()`
  - `CommunicationMessengerService` + stream
- Mettre à jour `WhatsappMedia` après succès : `local_path`, `local_url`, `downloaded_at`
- En cas d'échec 404 → marquer `provider_url_expired = true`

#### `MediaDownloadProcessor` (BullMQ)

Queue : `media-download`

Payload :
```typescript
interface DownloadJobDto {
  mediaId: string;       // UUID WhatsappMedia
  provider: string;      // 'meta' | 'whapi' | 'messenger' | 'instagram'
  providerMediaId: string;
  channelId: string;
  tenantId: string;
  mimeType: string;
  priority: 'high' | 'normal'; // high = demandé par un user en live
}
```

Comportement :
- Retry 3 fois avec backoff exponentiel
- Si toutes les tentatives échouent → `provider_url_expired = true`
- Concurrence : 5 jobs en parallèle max (configurable via env `MEDIA_DOWNLOAD_CONCURRENCY`)

**Durée estimée :** 3h

---

### Phase 3 — Intégration au flux inbound

**Fichier :** `src/webhooks/inbound-message.service.ts`

Après l'appel existant `saveMedia()`, enqueue un job pour chaque média :

```typescript
// Après saveMedia() dans handleMessages()
for (const savedMedia of savedMedias) {
  await this.mediaDownloadQueue.add('download', {
    mediaId: savedMedia.id,
    provider: savedMedia.provider,
    providerMediaId: savedMedia.provider_media_id ?? savedMedia.whapi_media_id,
    channelId: savedMedia.channel_id,
    tenantId: savedMedia.tenant_id,
    mimeType: savedMedia.mime_type,
    priority: 'normal',
  });
}
```

La colonne `url` existante conserve déjà l'URL CDN du provider — rien à changer dans `saveMedia()` pour ce champ.

**Durée estimée :** 1h

---

### Phase 4 — Modification des endpoints proxy existants

**Fichier :** `src/whatsapp_message/whatsapp_message.controller.ts`

Pour chaque endpoint proxy (`/messages/media/meta/:id`, `/messages/media/whapi/:id`, `/messages/media/messenger/:id`) :

1. Chercher `WhatsappMedia` par `provider_media_id` / `whapi_media_id`
2. Si `local_url` IS NOT NULL → **redirect 302** vers `media.local_url` (notre serveur, rapide et permanent)
3. Si `provider_url_expired = true` et `local_url` IS NULL → **410 Gone**
4. Sinon → comportement proxy actuel (utilise `url` = CDN provider) + **enqueue download haute priorité** en arrière-plan

```typescript
// Début de chaque endpoint proxy
const media = await this.mediaService.findByProviderMediaId(providerMediaId);
if (media?.local_url) {
  return res.redirect(302, media.local_url);
}
if (media?.provider_url_expired) {
  return res.status(410).json({ message: 'Ce média a expiré et n\'a pas pu être sauvegardé.' });
}
// ... comportement existant (proxy via media.url vers CDN provider) + enqueue download prioritaire
```

**Durée estimée :** 1h30

---

### Phase 5 — Endpoint de service des fichiers locaux

**Nouveau endpoint :** `GET /media/*`

Options :
- **Option 5A (recommandée pour dev)** : `ServeStaticModule` de NestJS
  ```typescript
  ServeStaticModule.forRoot({
    rootPath: join(__dirname, '..', 'uploads'),
    serveRoot: '/media',
    serveStaticOptions: {
      maxAge: '365d',
      immutable: true,
    },
  })
  ```
- **Option 5B (recommandée pour prod)** : Nginx sert directement `uploads/` → `location /media/` dans la config Nginx, NestJS ne touche pas ces fichiers.

Headers de sécurité à ajouter :
- `Content-Disposition: inline` pour images/vidéos
- `X-Content-Type-Options: nosniff`
- Pas d'index de répertoire (`autoIndex: false`)

**Durée estimée :** 45 min

---

### Phase 6 — Job de rattrapage (backfill)

**Nouveau job BullMQ :** `media-backfill` (CronJob NestJS, 1x/jour à 3h du matin)

Cible : tous les `WhatsappMedia` où `local_path IS NULL` et `provider_url_expired = false` et `created_at > NOW() - INTERVAL 30 DAY`

Comportement : enqueue des jobs `download` en masse, par batch de 100, avec throttling.

Ce job permet de rattraper les médias reçus avant le déploiement de cette feature.

**Durée estimée :** 1h

---

### Phase 7 — Job de vérification d'expiration

**Nouveau job BullMQ :** `media-expiry-check` (CronJob, 1x/jour à 4h du matin)

Cible : médias avec `local_path IS NULL` et `downloaded_at IS NULL` et `created_at < NOW() - INTERVAL 7 DAY`

Comportement : tenter un HEAD sur `provider_url`, si 4xx → `provider_url_expired = true`.

Alternative plus simple : marquer automatiquement comme expiré tout média de plus de 30 jours sans copie locale (Meta garantit au moins 30 jours).

**Durée estimée :** 45 min

---

## 5. Structure des fichiers sur disque

```
uploads/
└── media/
    └── {YYYY}/
        └── {MM}/
            └── {DD}/
                └── {tenantId}/
                    └── {uuid}.{ext}
```

Exemple : `uploads/media/2026/06/09/tenant-abc123/550e8400-e29b-41d4-a716-446655440000.jpg`

**URL publique correspondante :** `/media/2026/06/09/tenant-abc123/550e8400-e29b-41d4-a716-446655440000.jpg`

### Avantages de cette structure :
- Facile à archiver par date (`tar czf archive-2026-05.tar.gz uploads/media/2026/05/`)
- Isolation par tenant native (GDPR : supprimer tout un dossier tenant)
- Pas de collision entre providers différents (UUID garantit l'unicité)

---

## 6. Variables d'environnement à ajouter

```env
# Chemin absolu du dossier de stockage (défaut: ./uploads)
MEDIA_STORAGE_PATH=./uploads

# URL de base publique pour construire les URLs locales (mises dans la colonne url existante)
MEDIA_PUBLIC_BASE_URL=https://mondomaine.com

# Concurrence du processor BullMQ
MEDIA_DOWNLOAD_CONCURRENCY=5

# Taille max d'un fichier accepté (défaut: 50MB)
MEDIA_MAX_FILE_SIZE_MB=50
```

---

## 7. Ordre d'implémentation recommandé

| # | Phase | Durée | Dépendances |
|---|---|---|---|
| 1 | Migration DB (nouvelles colonnes) | 30 min | — |
| 2 | `MediaStorageService` (écriture disque) | 1h | Phase 1 |
| 3 | `MediaDownloadService` (téléchargement providers) | 1h30 | Phase 2 |
| 4 | `MediaDownloadProcessor` (BullMQ consumer) | 1h | Phase 3 |
| 5 | Intégration flux inbound (enqueue après saveMedia) | 30 min | Phase 4 |
| 6 | Modification endpoints proxy (redirect si local_url rempli) | 1h | Phase 4 |
| 7 | Endpoint static files `/media/*` | 30 min | Phase 2 |
| 8 | Job backfill + expiry checker | 1h30 | Phase 4 |

**Total estimé : ~7h30 de développement**

---

## 8. Points de vigilance

### Espace disque
- Prévoir une estimation : 1000 médias/jour × 500 KB moyen = 500 MB/jour → ~15 GB/mois
- Mettre en place une politique de nettoyage des fichiers anciens (>6 mois ?) ou archivage S3
- Monitorer l'espace disque avec une alerte

### Sécurité
- Ne jamais exposer le chemin absolu `local_path` aux clients
- Valider que `tenantId` dans l'URL correspond bien au tenant de la session (autorisation)
- Headers `Content-Security-Policy` sur les fichiers servis

### GDPR / Opt-out
- Quand un contact fait opt-out, supprimer les fichiers locaux de ses médias
- Réutiliser le hook GDPR existant pour appeler `MediaStorageService.deleteFile()`

### Providers sans download direct
- **Whapi** : `downloadMedia()` appelle l'API Whapi → pas d'URL CDN directe, nécessite le token
- **Meta** : URL CDN expire mais `getMediaUrl()` peut en obtenir une nouvelle via Graph API avant l'expiration
- **Messenger** : stream direct possible via `resolveMediaCdnUrl()`
- **Instagram** : vérifier si le flow est identique à Messenger

### Pas de double téléchargement
- Vérifier `local_path IS NOT NULL` avant d'enqueue pour éviter les doublons (idempotence du job)

---

## 9. Ce qui NE change pas

- La logique métier de dispatch/affectation des conversations
- Les entités `WhatsappMessage`, `WhatsappChat`, `WhapiChannel`
- Les adapters provider (whapi, meta, messenger)
- Le flux `saveMedia()` dans `inbound-message.service.ts` (on ajoute seulement l'enqueue après)
- Les endpoints proxy existants (on ajoute seulement la vérification `local_url` au début — redirect si rempli)

---

## 10. Migrations à créer

```
AddLocalMediaStorage1749427200001
```

Timestamp : `1749427200001` = 2026-06-09 00:00:00 UTC

---

*Plan créé le 2026-06-09 — à valider avec l'équipe avant implémentation*
