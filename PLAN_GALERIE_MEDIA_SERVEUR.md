# Plan — Galerie des médias stockés sur le serveur

**Date :** 2026-06-09  
**Branche :** production  
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

Nouveau endpoint dans le module `media-storage` existant :

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
```

**Guard :** `AdminGuard` (lecture seule, panel admin uniquement)  
**Filtre implicite :** `local_url IS NOT NULL` — seuls les médias effectivement stockés sur le serveur sont retournés.

### 2.2 Admin Frontend

```
admin/src/app/
├── ui/
│   └── GalerieMediaView.tsx        ← composant principal (nouveau)
└── dashboard/
    └── galerie-media/
        └── page.tsx                ← route Next.js (nouveau)
```

Fichiers modifiés :
- `admin/src/app/lib/definitions.ts` — nouveaux types `StoredMedia`, `StoredMediaResponse`
- `admin/src/app/lib/api.ts` — nouvelle fonction `getStoredMedias()`
- `admin/src/app/data/admin-data.ts` — entrée de navigation

---

## 3. Backend — Détails d'implémentation

### 3.1 DTO

**Fichier :** `src/media-storage/dto/gallery-query.dto.ts`

```typescript
import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GalleryQueryDto {
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() posteId?: string;
  @IsOptional() @IsIn(['IN', 'OUT']) direction?: 'IN' | 'OUT';
  @IsOptional() @IsIn(['image','video','audio','document','voice','sticker','gif','location','contact'])
  mediaType?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number = 24;
  @IsOptional() @IsIn(['createdAt','fileSize']) sort?: string = 'createdAt';
  @IsOptional() @IsIn(['asc','desc']) order?: 'asc' | 'desc' = 'desc';
}
```

### 3.2 Service

**Fichier :** `src/media-storage/galerie-media.service.ts`

```typescript
@Injectable()
export class GalerieMediaService {
  constructor(
    @InjectRepository(WhatsappMedia)
    private readonly mediaRepo: Repository<WhatsappMedia>,
  ) {}

  async findGallery(dto: GalleryQueryDto) {
    const qb = this.mediaRepo
      .createQueryBuilder('media')
      .innerJoin('media.message', 'msg')            // direction + poste_id + from_name + from
      .leftJoin('media.channel', 'channel')          // label canal
      .leftJoin('msg.poste', 'poste')                // nom du poste
      .select([
        'media.id',
        'media.local_url',
        'media.media_type',
        'media.mime_type',
        'media.file_name',
        'media.file_size',
        'media.caption',
        'media.duration_seconds',
        'media.width',
        'media.height',
        'media.downloaded_at',
        'media.createdAt',
        'msg.direction',
        'msg.from',
        'msg.from_name',
        'msg.poste_id',
        'channel.id',
        'channel.label',
        'channel.phone_number',
        'channel.provider',
        'poste.id',
        'poste.name',
        'poste.code',
      ])
      .where('media.local_url IS NOT NULL');          // seuls les médias locaux

    if (dto.channelId)  qb.andWhere('media.channel_id = :channelId', { channelId: dto.channelId });
    if (dto.posteId)    qb.andWhere('msg.poste_id = :posteId', { posteId: dto.posteId });
    if (dto.direction)  qb.andWhere('msg.direction = :direction', { direction: dto.direction });
    if (dto.mediaType)  qb.andWhere('media.media_type = :mediaType', { mediaType: dto.mediaType });

    const sortCol = dto.sort === 'fileSize' ? 'media.file_size' : 'media.createdAt';
    qb.orderBy(sortCol, (dto.order ?? 'desc').toUpperCase() as 'ASC' | 'DESC');

    const page  = dto.page  ?? 1;
    const limit = dto.limit ?? 24;
    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, pages: Math.ceil(total / limit) };
  }

  async getFilterOptions() {
    const channels = await this.mediaRepo
      .createQueryBuilder('media')
      .innerJoin('media.channel', 'channel')
      .where('media.local_url IS NOT NULL')
      .select(['channel.id AS id', 'channel.label AS label', 'channel.phone_number AS phone_number'])
      .distinct(true)
      .getRawMany();

    const postes = await this.mediaRepo
      .createQueryBuilder('media')
      .innerJoin('media.message', 'msg')
      .innerJoin('msg.poste', 'poste')
      .where('media.local_url IS NOT NULL')
      .andWhere('msg.poste_id IS NOT NULL')
      .select(['poste.id AS id', 'poste.name AS name', 'poste.code AS code'])
      .distinct(true)
      .getRawMany();

    return { channels, postes };
  }
}
```

**Note JOIN :** `INNER JOIN` sur `message` filtre les médias orphelins (sans message associé). Acceptable car un média sans message ne peut pas avoir de direction ni de poste.

### 3.3 Controller

**Fichier :** `src/media-storage/galerie-media.controller.ts`

```typescript
@Controller('media-storage')
@UseGuards(AdminGuard)
export class GalerieMediaController {
  constructor(private readonly galerieService: GalerieMediaService) {}

  @Get('gallery')
  async getGallery(@Query() dto: GalleryQueryDto) {
    return this.galerieService.findGallery(dto);
  }

  @Get('gallery/filters')
  async getFilterOptions() {
    return this.galerieService.getFilterOptions();
  }
}
```

### 3.4 Mise à jour du module

**Fichier :** `src/media-storage/media-storage.module.ts`

Ajouter dans `providers` :
```typescript
GalerieMediaService,
GalerieMediaController,
```
Ajouter `WhatsappMessage` dans `TypeOrmModule.forFeature([...])` si pas déjà présent (vérifier).

Ajouter dans `controllers` :
```typescript
controllers: [GalerieMediaController],
```

---

## 4. Frontend Admin — Détails d'implémentation

### 4.1 Types TypeScript

**Fichier :** `admin/src/app/lib/definitions.ts` — ajouter en fin de fichier :

```typescript
export type StoredMediaType = 'image' | 'video' | 'audio' | 'document' | 'voice' | 'sticker' | 'gif' | 'location' | 'contact';
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
  msg: {
    direction: MediaDirection;
    from: string;
    from_name: string;
    poste_id: string | null;
  };
  channel: {
    id: string;
    label: string | null;
    phone_number: string | null;
    provider: string | null;
  } | null;
  poste: {
    id: string;
    name: string;
    code: string;
  } | null;
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

### 4.2 Appels API

**Fichier :** `admin/src/app/lib/api.ts` — ajouter :

```typescript
export async function getStoredMedias(params?: {
  channelId?: string;
  posteId?: string;
  direction?: 'IN' | 'OUT';
  mediaType?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
}): Promise<StoredMediaResponse> {
  const qs = new URLSearchParams();
  if (params?.channelId)  qs.set('channelId',  params.channelId);
  if (params?.posteId)    qs.set('posteId',    params.posteId);
  if (params?.direction)  qs.set('direction',  params.direction);
  if (params?.mediaType)  qs.set('mediaType',  params.mediaType);
  if (params?.page)       qs.set('page',       String(params.page));
  if (params?.limit)      qs.set('limit',      String(params.limit));
  if (params?.sort)       qs.set('sort',       params.sort);
  if (params?.order)      qs.set('order',      params.order);
  const res = await fetch(`${API_BASE_URL}/media-storage/gallery?${qs}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Erreur chargement galerie médias');
  return res.json();
}

export async function getGalerieFilterOptions(): Promise<GalerieFilterOptions> {
  const res = await fetch(`${API_BASE_URL}/media-storage/gallery/filters`, { credentials: 'include' });
  if (!res.ok) throw new Error('Erreur chargement filtres galerie');
  return res.json();
}
```

### 4.3 Navigation

**Fichier :** `admin/src/app/data/admin-data.ts`

Dans le groupe "Analytics" (ou "Conversations" selon pertinence), ajouter :
```typescript
{ id: 'galerie-media', name: 'Galerie médias', icon: HardDrive, badge: null }
```
Import nécessaire : `HardDrive` de `lucide-react`.

### 4.4 Page route

**Fichier :** `admin/src/app/dashboard/galerie-media/page.tsx`

```typescript
import GalerieMediaView from '@/app/ui/GalerieMediaView';

export default function GalerieMediaPage() {
  return <GalerieMediaView />;
}
```

### 4.5 Composant principal — `GalerieMediaView.tsx`

**Fichier :** `admin/src/app/ui/GalerieMediaView.tsx`

#### Structure du composant

```
GalerieMediaView
├── Barre de filtres
│   ├── Tabs types de médias : Tous | Images | Vidéos | Audios | Documents | Autres
│   ├── Select canal (options depuis getGalerieFilterOptions)
│   ├── Select poste (options depuis getGalerieFilterOptions)
│   ├── Toggle direction : Tous | Reçus (IN) | Envoyés (OUT)
│   └── Select tri : Date ↓ | Date ↑ | Taille ↓
├── Compteur total ("X médias stockés")
├── Grille médias (responsive, 2-6 colonnes)
│   └── StoredMediaCard (voir ci-dessous)
└── Pagination (Précédent / Page X/Y / Suivant)
```

#### `StoredMediaCard` — contenu de chaque carte

```
┌─────────────────────────────┐
│  [miniature ou icône type]  │ ← image: <img>, vidéo: poster ou icône, audio: icône onde, doc: icône PDF
│                             │
│  Badge direction:           │ ← "Client" (IN, bleu) | "Agent" (OUT, vert)
│  Nom fichier (ou type)      │
│  Taille · Date téléchargé   │
│  Canal: label               │
│  Poste: name (si défini)    │
│  De: from_name (si IN)      │
└─────────────────────────────│
```

**Clic sur la carte :** ouvre l'URL locale dans un nouvel onglet (`window.open(media.local_url, '_blank')`).

#### Groupement par type (variante)

Si aucun filtre de type sélectionné, les médias peuvent être affichés en sections par type :
```
── Images (N) ──────────────────────
[grille images]

── Vidéos (N) ──────────────────────
[grille vidéos]

── Audios (N) ──────────────────────
[grille audios]

── Documents (N) ───────────────────
[grille documents]
```
Mais cette variante nécessite N requêtes ou une logique de groupement côté client. **Recommandé :** garder la liste unique + onglets de type (même pattern que la Médiathèque).

#### Gestion des miniatures

| Type | Affichage |
|---|---|
| `image` | `<img src={media.local_url} loading="lazy" />` |
| `video` | Icône `Video` (lucide) + durée si disponible |
| `audio` / `voice` | Icône `Music` ou `Mic` + durée |
| `document` | Icône `FileText` + nom fichier |
| `sticker` | `<img src={media.local_url} />` (même qu'image) |
| `location` | Icône `MapPin` |
| Autres | Icône `File` générique |

#### État de chargement et erreurs

- Skeleton loader pendant `loading` (grille de placeholders)
- Message vide : "Aucun média stocké ne correspond à vos filtres" avec icône
- Erreur réseau : toast d'erreur

---

## 5. Ordre d'implémentation

| # | Fichier | Action | Durée |
|---|---|---|---|
| 1 | `src/media-storage/dto/gallery-query.dto.ts` | CRÉER | 15 min |
| 2 | `src/media-storage/galerie-media.service.ts` | CRÉER | 45 min |
| 3 | `src/media-storage/galerie-media.controller.ts` | CRÉER | 20 min |
| 4 | `src/media-storage/media-storage.module.ts` | MODIFIER (ajouter service+controller+entity) | 10 min |
| 5 | `admin/src/app/lib/definitions.ts` | MODIFIER (ajouter types) | 15 min |
| 6 | `admin/src/app/lib/api.ts` | MODIFIER (ajouter appels API) | 15 min |
| 7 | `admin/src/app/data/admin-data.ts` | MODIFIER (entrée navigation) | 5 min |
| 8 | `admin/src/app/dashboard/galerie-media/page.tsx` | CRÉER | 5 min |
| 9 | `admin/src/app/ui/GalerieMediaView.tsx` | CRÉER | 2h30 |

**Durée totale estimée : ~4h**

---

## 6. Points de vigilance

### JOIN INNER vs LEFT
Le `INNER JOIN` sur `msg` (message) filtre les médias orphelins, mais peut exclure des médias dont le message a été supprimé (soft-delete). Si `WhatsappMessage` a un `deletedAt`, ajouter `.andWhere('msg.deletedAt IS NULL')` dans le QueryBuilder.

### Volume de données
Sans pagination stricte côté backend, une requête peut retourner des milliers de lignes. Le `limit: 24` par défaut + `local_url IS NOT NULL` réduisent fortement le scope, mais **s'assurer que les index existants couvrent les colonnes filtrées** :
- `IDX_whatsapp_media_local_path` (existant) — couvre `local_url IS NOT NULL` partiellement
- `channel_id` sur `whatsapp_media` — vérifier existence d'un index FK
- `poste_id` + `direction` sur `whatsapp_message` — index `IDX_msg_poste_dir_time` (existant) couvre `(poste_id, direction, createdAt)`

### Sécurité URLs
Les `local_url` sont de la forme `/uploads/media/...`. Elles sont publiquement accessibles via Express static **sans authentification**. C'est intentionnel (même comportement que la Médiathèque et les proxies média existants). Ne pas exposer `local_path` (chemin absolu disque) dans la réponse API.

### WhatsappMessage entity dans le module
`WhatsappMessage` n'est pas actuellement dans `TypeOrmModule.forFeature([...])` de `MediaStorageModule`. Il faut l'ajouter pour que `GalerieMediaService` puisse faire les JOINs via le repository `WhatsappMedia`.

**Alternative :** utiliser directement le `QueryBuilder` sur `WhatsappMedia` avec des JOINs (pas besoin d'injecter le repository de `WhatsappMessage` séparément — le QB peut joindre des entités non injectées).

### Médias sans message (direction inconnue)
Si `INNER JOIN msg` est trop restrictif, utiliser `LEFT JOIN` et gérer `msg.direction = null` côté frontend (badge "Inconnu" ou absence de badge). À décider selon les données réelles en production.

---

## 7. Ce qui NE change pas

- Aucune migration SQL nécessaire (pas de nouvelle colonne)
- Les crons de backfill/expiry/purge (`MediaBackfillService`) ne sont pas modifiés
- Les endpoints proxy (`/messages/media/...`) ne sont pas modifiés
- Les données sources (`whatsapp_media`) ne sont pas modifiées — page lecture seule uniquement

---

*Plan créé le 2026-06-09*
