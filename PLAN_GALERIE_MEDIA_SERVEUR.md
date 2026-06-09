# Plan — Galerie des médias stockés sur le serveur

**Date :** 2026-06-09  
**Branche :** production  
**Statut :** ✅ LIVRÉ COMPLET — 0 erreur TypeScript  
**Objectif :** Page admin permettant de naviguer dans tous les médias téléchargés localement, avec filtres par canal, poste, direction (envoyé/reçu) et type de média.  
**Dépendance :** Feature stockage local (`PLAN_STOCKAGE_MEDIA_LOCAL.md`) ✅ LIVRÉ

---

## 1. Contexte

La feature de stockage local (`src/media-storage/`) télécharge et conserve une copie locale de chaque média entrant dans `uploads/media/YYYY/MM/DD/{tenant}/{uuid}.ext`. Ces fichiers sont servis par Express static sous `/uploads/media/...`.

Cette page est l'équivalent, pour les médias de conversation, de ce que la Médiathèque est pour les assets de campagne — mais avec des filtres supplémentaires (direction IN/OUT, canal, poste) et **en lecture seule** (pas d'upload ni de suppression manuelle via l'UI).

### Différence avec la Médiathèque admin

| Critère | Médiathèque | Galerie médias |
|---|---|---|
| Source | `media_asset` (assets admin) | `whatsapp_media` (msgs conversation) |
| Upload | Oui (admin) | Non (auto, via webhook) |
| Suppression | Oui | Non (gérée par crons/GDPR) |
| Filtres | Type, catégorie, recherche | Canal, poste, direction, type |
| Direction | N/A | IN (client) / OUT (agent) |

---

## 2. Architecture cible

### 2.1 Backend

Endpoint dans le module `media-storage` :

```
GET /media-storage/gallery
  ?channelId=<uuid>
  &posteId=<uuid>
  &direction=IN|OUT
  &mediaType=image|video|audio|document|voice|sticker
  &page=1
  &limit=24
  &sort=createdAt|fileSize
  &order=asc|desc

GET /media-storage/gallery/filters
  → { channels: [...], postes: [...] }
```

**Guard :** `AdminGuard` (lecture seule, panel admin uniquement)  
**Filtre implicite :** `local_url IS NOT NULL` — seuls les médias effectivement stockés sur le serveur sont retournés.

### 2.2 Admin Frontend

```
admin/src/app/
├── ui/
│   └── GalerieMediaView.tsx        ← composant principal ✅
└── dashboard/
    └── galerie-media/
        └── page.tsx                ← route Next.js ✅
```

Fichiers modifiés :
- `admin/src/app/lib/definitions.ts` — types `StoredMedia`, `StoredMediaResponse`, `GalerieFilterOptions` ✅
- `admin/src/app/lib/api.ts` — `getStoredMedias()` + `getGalerieFilterOptions()` ✅
- `admin/src/app/data/admin-data.ts` — entrée de navigation "Galerie médias" ✅

---

## 3. Backend — Implémentation livrée

### 3.1 DTO ✅

**Fichier :** `src/media-storage/dto/gallery-query.dto.ts`

```typescript
import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GalleryQueryDto {
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() posteId?: string;
  @IsOptional() @IsIn(['IN', 'OUT']) direction?: 'IN' | 'OUT';
  @IsOptional()
  @IsIn(['image','video','audio','document','voice','sticker','gif','location','contact'])
  mediaType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 24;
  @IsOptional() @IsIn(['createdAt', 'fileSize']) sort?: string = 'createdAt';
  @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc' = 'desc';
}
```

### 3.2 Service ✅

**Fichier :** `src/media-storage/galerie-media.service.ts`

- `findGallery(dto)` : QueryBuilder avec `INNER JOIN media.message AS msg`, `LEFT JOIN media.channel AS channel`, `LEFT JOIN msg.poste AS poste`. Filtre `local_url IS NOT NULL` + `deletedAt IS NULL` sur media et message. Filtres dynamiques, tri, pagination.
- `getFilterOptions()` : retourne les canaux distincts et postes distincts présents dans les médias locaux via `getRawMany()`.

**Structure de retour `findGallery` :**
```
{
  items: WhatsappMedia[],   // media.message et media.channel hydratés
  total: number,
  pages: number
}
```

**Arbre d'hydratation TypeORM (important) :**
```
media
├── message                  ← WhatsappMessage (direction, from, from_name, poste_id)
│   └── poste                ← WhatsappPoste (id, name, code) — imbriqué ici, PAS au niveau racine
└── channel                  ← WhapiChannel (id, label, phone_number, provider)
```

### 3.3 Controller ✅

**Fichier :** `src/media-storage/galerie-media.controller.ts`

```typescript
@Controller('media-storage')   // ← PAS de préfixe 'api/' (cohérent avec les autres controllers)
@UseGuards(AdminGuard)
export class GalerieMediaController {
  @Get('gallery') async getGallery(@Query() dto: GalleryQueryDto) { ... }
  @Get('gallery/filters') async getFilterOptions() { ... }
}
```

> **Note convention :** Le projet n'a PAS de `app.setGlobalPrefix('api')` dans `main.ts`. Le préfixe `/api/` dans `NEXT_PUBLIC_API_URL` est inclus dans la variable d'env côté frontend, pas dans le backend. Seul le controller `notification.controller.ts` déroge à cette règle avec `@Controller('api/notifications')`.

### 3.4 Module ✅

**Fichier :** `src/media-storage/media-storage.module.ts`

- `controllers: [GalerieMediaController]` ajouté
- `GalerieMediaService` ajouté dans `providers`
- `WhatsappMessage` **non ajouté** dans `TypeOrmModule.forFeature` — non nécessaire car le service n'injecte que le repo `WhatsappMedia` et effectue les JOINs via QueryBuilder (les métadonnées d'entités sont globalement disponibles)

---

## 4. Frontend Admin — Implémentation livrée

### 4.1 Types TypeScript ✅

**Fichier :** `admin/src/app/lib/definitions.ts`

```typescript
export type StoredMediaType =
  | 'image' | 'video' | 'audio' | 'document' | 'voice'
  | 'sticker' | 'gif' | 'location' | 'contact';

export type MediaDirection = 'IN' | 'OUT';

export type StoredMedia = {
  id: string;
  local_url: string;
  media_type: StoredMediaType;
  mime_type: string;
  file_name: string | null;
  file_size: string | null;
  caption: string | null;
  duration_seconds: number | null;
  width: string | null;
  height: string | null;
  downloaded_at: string | null;
  createdAt: string;
  message: {
    direction: MediaDirection;
    from: string;
    from_name: string;
    poste_id: string | null;
    poste: { id: string; name: string; code: string } | null;  // imbriqué sous message
  } | null;
  channel: {
    id: string;
    label: string | null;
    phone_number: string | null;
    provider: string | null;
  } | null;
  // PAS de poste au niveau racine — il est dans media.message.poste
};

export type StoredMediaResponse = {
  items: StoredMedia[];
  total: number;
  pages: number;
};

export type GalerieFilterOptions = {
  channels: { id: string; label: string | null; phone_number: string | null }[];
  postes:   { id: string; name: string; code: string }[];
};
```

### 4.2 Appels API ✅

**Fichier :** `admin/src/app/lib/api.ts`

```typescript
// URL CORRECTE : ${API_BASE_URL}/media-storage/gallery (sans /api/ redondant)
export async function getStoredMedias(params?: { ... }): Promise<StoredMediaResponse>
export async function getGalerieFilterOptions(): Promise<GalerieFilterOptions>
```

### 4.3 Navigation ✅

**Fichier :** `admin/src/app/data/admin-data.ts`

Entrée `{ id: 'galerie-media', name: 'Galerie médias', icon: HardDrive }` ajoutée dans le groupe Analytics.

### 4.4 Page route ✅

**Fichier :** `admin/src/app/dashboard/galerie-media/page.tsx`

### 4.5 Composant `GalerieMediaView.tsx` ✅

**Fichier :** `admin/src/app/ui/GalerieMediaView.tsx`

Structure :
- **Onglets type** : Tous / Images / Vidéos / Audios / Documents / Vocaux / Stickers
- **Toggle direction** : Tous / Reçus (IN, bleu) / Envoyés (OUT, vert)
- **Select canal** : peuplé depuis `getGalerieFilterOptions()`
- **Select poste** : peuplé depuis `getGalerieFilterOptions()`
- **Select tri** : Date récent/ancien, Taille grande/petite
- **Grille** : 2-6 colonnes responsive, skeleton loader, état vide
- **StoredMediaCard** : miniature (img pour image/sticker, icône pour autres), badge direction, taille, date, canal, poste (`media.message?.poste`), expéditeur si IN
- **Clic** : `window.open(media.local_url, '_blank')`
- **Pagination** : Précédent / Page X / Y / Suivant

---

## 5. Bilan d'implémentation

| # | Fichier | Statut |
|---|---|---|
| 1 | `src/media-storage/dto/gallery-query.dto.ts` | ✅ CRÉÉ |
| 2 | `src/media-storage/galerie-media.service.ts` | ✅ CRÉÉ |
| 3 | `src/media-storage/galerie-media.controller.ts` | ✅ CRÉÉ |
| 4 | `src/media-storage/media-storage.module.ts` | ✅ MODIFIÉ |
| 5 | `admin/src/app/lib/definitions.ts` | ✅ MODIFIÉ |
| 6 | `admin/src/app/lib/api.ts` | ✅ MODIFIÉ |
| 7 | `admin/src/app/data/admin-data.ts` | ✅ MODIFIÉ |
| 8 | `admin/src/app/dashboard/galerie-media/page.tsx` | ✅ CRÉÉ |
| 9 | `admin/src/app/ui/GalerieMediaView.tsx` | ✅ CRÉÉ |

**TypeScript :** 0 erreur nouvelle (2 erreurs préexistantes `LocationMapThumb.tsx` non liées)

---

## 6. Corrections post-implémentation

### Bug 1 — Préfixe `/api/` en double dans api.ts ✅ CORRIGÉ

**Symptôme :** `GET /api/media-storage/gallery → 404 Not Found`

**Cause :** L'agent a généré `${API_BASE_URL}/api/media-storage/gallery` alors que `API_BASE_URL` inclut déjà `/api` (ex : `https://api.gicop.ci/api`). Tous les autres endpoints du projet utilisent `${API_BASE_URL}/resource` sans répéter `/api/`.

**Fix :** Retiré `/api/` des deux fetch dans `api.ts` → `${API_BASE_URL}/media-storage/gallery`.

### Bug 2 — `poste` au mauvais niveau dans le type TypeScript ✅ CORRIGÉ

**Symptôme :** `media.poste` toujours `undefined` → le poste ne s'affichait jamais dans les cards.

**Cause :** Le type `StoredMedia` plaçait `poste` à la racine, mais TypeORM hydrate `poste` imbriqué sous `media.message.poste` (puisque le JOIN est `msg.poste`, pas `media.poste`).

**Fix :**
- `definitions.ts` : `poste` déplacé dans `message.poste` (supprimé du niveau racine)
- `GalerieMediaView.tsx` : `media.poste` → `media.message?.poste`

---

## 7. Points de vigilance futurs

### Convention routes backend
Le projet **n'utilise pas** `app.setGlobalPrefix('api')`. Le préfixe `/api` est dans `NEXT_PUBLIC_API_URL`. Ne jamais ajouter `/api/` dans les `@Controller()` (sauf héritage de `notification.controller.ts` qui déroge).

### `getFilterOptions()` et TypeORM raw aliases
`getRawMany()` avec `select(['col AS alias'])` retourne les colonnes préfixées par l'alias d'entité en TypeORM (ex: `channel_id` au lieu de `id`). Si les filtres ne se peuplent pas, remplacer par :
```typescript
qb.select('channel.id', 'id').addSelect('channel.label', 'label')...
```

### Volume et performance
La galerie filtre sur `local_url IS NOT NULL`. L'index `IDX_whatsapp_media_local_path` n'indexe pas `local_url` directement. Si la table `whatsapp_media` grossit fortement, envisager un index sur `(local_url, created_at)`.

### Sécurité
Les `local_url` (`/uploads/media/...`) sont accessibles sans auth via Express static. C'est intentionnel. Ne jamais exposer `local_path` (chemin absolu disque) dans la réponse API.

---

*Plan créé le 2026-06-09 — Implémentation complète le 2026-06-09*
