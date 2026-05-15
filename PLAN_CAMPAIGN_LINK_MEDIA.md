# Plan — Médias dans les liens campagne + Médiathèque

**Date de rédaction** : 2026-05-15  
**Branche cible** : `production`  
**Priorité** : P1

---

## Vue d'ensemble

Deux fonctionnalités liées :

1. **Médiathèque** — bibliothèque centralisée de tous les fichiers médias uploadés sur la plateforme, accessible depuis le menu admin, avec organisation par type / catégorie / tags.
2. **Média dans les liens campagne** — lors de la création d'un lien campagne, l'admin peut sélectionner un média existant dans la médiathèque (ou en uploader un nouveau), dont l'URL publique est automatiquement insérée dans le message pré-rempli du lien `wa.me`.

---

## Flux complet

```
╔══════════════════════════════════════════════════════════╗
║              MÉDIATHÈQUE (module autonome)               ║
╠══════════════════════════════════════════════════════════╣
║  Upload fichier → MediaAsset créé en DB + fichier disque ║
║  Organisation :  type | catégorie | tags                 ║
║  Grille admin : miniatures, filtres, recherche           ║
╚══════════════════════════════════════════════════════════╝
                          │
                          │ sélection d'un MediaAsset
                          ▼
╔══════════════════════════════════════════════════════════╗
║            LIEN CAMPAGNE (module existant)               ║
╠══════════════════════════════════════════════════════════╣
║  media_asset_id → mediaAsset.publicUrl insérée dans      ║
║  predefined_message :                                    ║
║  "Notre offre spéciale 🎁\nhttps://api.../media/x.jpg"  ║
║                                                          ║
║  buildUrls() → wa.me/{phone}?text=Notre%20offre...       ║
╚══════════════════════════════════════════════════════════╝
                          │
                          │ contact clique
                          ▼
╔══════════════════════════════════════════════════════════╗
║                   WHATSAPP CLIENT                        ║
╠══════════════════════════════════════════════════════════╣
║  Message pré-rempli affiché avec miniature (link preview)║
║  Contact envoie → tryAttribute() → attribution           ║
╚══════════════════════════════════════════════════════════╝
```

---

## PARTIE A — Médiathèque (nouveau module)

### A1 — Entité `MediaAsset`

**Fichier** : `src/media-asset/entities/media-asset.entity.ts`

```typescript
@Entity({ name: 'media_asset' })
export class MediaAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nom affiché dans la médiathèque (modifiable par l'admin)
  @Column({ name: 'name', type: 'varchar', length: 255 })
  name: string;

  // Nom original du fichier à l'upload
  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName: string;

  // Chemin relatif sur le serveur : uploads/media-assets/{uuid}.jpg
  @Column({ name: 'file_path', type: 'varchar', length: 500 })
  filePath: string;

  // URL publique : https://api.gicop.ci/uploads/media-assets/{uuid}.jpg
  @Column({ name: 'public_url', type: 'varchar', length: 500 })
  publicUrl: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({
    name: 'media_type',
    type: 'enum',
    enum: ['image', 'video', 'audio', 'document'],
  })
  mediaType: 'image' | 'video' | 'audio' | 'document';

  // Taille en octets
  @Column({ name: 'file_size', type: 'int' })
  fileSize: number;

  // Dossier/catégorie libre : "Promotions", "Produits", "Saison été"…
  @Column({ name: 'category', type: 'varchar', length: 100, nullable: true })
  category: string | null;

  // Tags JSON : ["promo","été","soldes"]
  @Column({ name: 'tags', type: 'json', nullable: true })
  tags: string[] | null;

  // Couleur de label pour différencier visuellement dans la grille
  @Column({ name: 'color_label', type: 'varchar', length: 7, nullable: true })
  colorLabel: string | null; // ex: "#3B82F6"

  // Nombre de liens campagne qui utilisent ce média (dénormalisé pour perf)
  @Column({ name: 'usage_count', type: 'int', default: 0 })
  usageCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

---

### A2 — Migration médiathèque

**Fichier** : `src/database/migrations/20260515_create_media_asset.ts`

```sql
CREATE TABLE media_asset (
  id            VARCHAR(36)   NOT NULL PRIMARY KEY,
  name          VARCHAR(255)  NOT NULL,
  original_name VARCHAR(255)  NOT NULL,
  file_path     VARCHAR(500)  NOT NULL,
  public_url    VARCHAR(500)  NOT NULL,
  mime_type     VARCHAR(100)  NOT NULL,
  media_type    ENUM('image','video','audio','document') NOT NULL,
  file_size     INT           NOT NULL,
  category      VARCHAR(100)  NULL,
  tags          JSON          NULL,
  color_label   VARCHAR(7)    NULL,
  usage_count   INT           NOT NULL DEFAULT 0,
  created_at    DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at    DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
);
```

---

### A3 — Endpoints médiathèque

**Fichier** : `src/media-asset/media-asset.controller.ts`

```
GET    /media-assets                   Liste avec filtres (type, category, search, tags)
POST   /media-assets/upload            Upload d'un nouveau fichier
PATCH  /media-assets/:id               Renommer, changer catégorie/tags/couleur
DELETE /media-assets/:id               Supprime fichier + enregistrement DB
GET    /media-assets/categories        Liste des catégories existantes (distinct)
GET    /media-assets/stats             Compteurs par type + taille totale
```

**Paramètres de filtre `GET /media-assets`** :
- `type` : `image | video | audio | document | all`
- `category` : string (filtre exact)
- `search` : string (filtre sur `name` + `originalName`)
- `tags` : string CSV (filtre OR)
- `page` / `limit` : pagination
- `sort` : `name | createdAt | fileSize | usageCount`
- `order` : `asc | desc`

---

### A4 — Logique service clé

**Upload** : génère un UUID pour le nom de fichier (évite les collisions et les noms non ASCII), calcule `publicUrl` depuis `process.env.APP_DOMAIN`, détecte `mediaType` depuis `mimeType`.

**Suppression** :
- Si `usageCount > 0` : retourner une erreur `409 Conflict` avec le message "Ce média est utilisé dans X lien(s) campagne. Détachez-le d'abord."
- Si `usageCount === 0` : supprimer le fichier disque + la ligne DB.

**PATCH** : ne modifie que `name`, `category`, `tags`, `colorLabel` — jamais `filePath`/`publicUrl`.

---

### A5 — Module NestJS

**Fichier** : `src/media-asset/media-asset.module.ts`

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([MediaAsset])],
  controllers: [MediaAssetController],
  providers: [MediaAssetService],
  exports: [MediaAssetService],
})
export class MediaAssetModule {}
```

Importé dans `AppModule` et dans `CampaignLinkModule`.

---

## PARTIE B — Mise à jour des liens campagne

### B1 — Migration campagne

**Fichier** : `src/database/migrations/20260515_add_media_to_campaign_link.ts`

```sql
ALTER TABLE campaign_link
  ADD COLUMN media_asset_id VARCHAR(36) NULL,
  ADD CONSTRAINT fk_campaign_link_media_asset
    FOREIGN KEY (media_asset_id) REFERENCES media_asset(id)
    ON DELETE SET NULL;
```

> `ON DELETE SET NULL` : si le média est supprimé de la médiathèque,  
> la FK devient NULL mais le lien campagne survit (l'URL reste dans `predefined_message`).

---

### B2 — Entité `CampaignLink` — ajout FK

```typescript
@Column({ name: 'media_asset_id', type: 'varchar', nullable: true })
mediaAssetId: string | null;

@ManyToOne(() => MediaAsset, { nullable: true, onDelete: 'SET NULL', eager: false })
@JoinColumn({ name: 'media_asset_id' })
mediaAsset: MediaAsset | null;
```

---

### B3 — Endpoints campagne mis à jour

```
POST   /campaign-links/:id/media-asset/:assetId   Attache un asset existant
DELETE /campaign-links/:id/media-asset             Détache l'asset (sans le supprimer)
POST   /campaign-links/:id/media-upload            Upload rapide → crée l'asset + attache
```

**`POST /campaign-links/:id/media-upload`** — raccourci "upload depuis le formulaire campagne" :
1. Upload le fichier → crée un `MediaAsset` avec `category = 'campagne'`
2. Attache automatiquement cet asset au lien campagne
3. Incrémente `mediaAsset.usageCount`

---

### B4 — Logique service campagne

#### `attachAsset(linkId, assetId)`

```typescript
async attachAsset(linkId: string, assetId: string): Promise<CampaignLink> {
  const [link, asset] = await Promise.all([
    this.findOne(linkId),
    this.mediaAssetService.findOne(assetId),
  ]);

  // Détacher l'ancien asset si présent
  if (link.mediaAssetId && link.mediaAssetId !== assetId) {
    await this.mediaAssetService.decrementUsage(link.mediaAssetId);
  }

  // Insérer l'URL dans predefined_message (remplace l'ancienne URL si existante)
  const baseMessage = this.stripMediaUrl(link.predefinedMessage);
  const newMessage = `${baseMessage}\n${asset.publicUrl}`.trim();

  await this.linkRepository.update(linkId, {
    mediaAssetId: assetId,
    predefinedMessage: newMessage,
  });
  await this.mediaAssetService.incrementUsage(assetId);

  // Recalculer directUrl + trackedUrl
  const channel = await this.channelRepository.findOne({
    where: { channel_id: link.channelId },
  });
  const phone = channel ? await this.resolvePhone(channel) : null;
  if (phone) {
    const { directUrl, trackedUrl } = this.buildUrls(phone, newMessage, link.shortCode);
    await this.linkRepository.update(linkId, { directUrl, trackedUrl });
  }

  return this.findOne(linkId);
}
```

#### `detachAsset(linkId)`

```typescript
async detachAsset(linkId: string): Promise<void> {
  const link = await this.findOne(linkId);
  if (!link.mediaAssetId) return;

  const cleanMessage = this.stripMediaUrl(link.predefinedMessage);
  await this.mediaAssetService.decrementUsage(link.mediaAssetId);
  await this.linkRepository.update(linkId, {
    mediaAssetId: null,
    predefinedMessage: cleanMessage,
  });

  const channel = await this.channelRepository.findOne({
    where: { channel_id: link.channelId },
  });
  const phone = channel ? await this.resolvePhone(channel) : null;
  if (phone) {
    const { directUrl, trackedUrl } = this.buildUrls(phone, cleanMessage, link.shortCode);
    await this.linkRepository.update(linkId, { directUrl, trackedUrl });
  }
}

private stripMediaUrl(message: string): string {
  return message
    .replace(/\n?https?:\/\/\S+\/uploads\/media-assets\/\S+/g, '')
    .trim();
}
```

---

## PARTIE C — Admin UI

### C1 — Nouvelle vue : `MediathequeView.tsx`

**Emplacement** : `admin/src/app/ui/MediathequeView.tsx`  
**ViewMode** : `mediatheque` (à ajouter dans `definitions.ts`)  
**Menu** : groupe "Contenu" avec `campaign-links`

#### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  Médiathèque                          [+ Uploader]  [Catégories ▼] │
├─────────────────────────────────────────────────────────────────────┤
│  🔍 Rechercher...                                                   │
│                                                                     │
│  [ Tous (42) ] [ 🖼 Images (28) ] [ 🎬 Vidéos (8) ] [ 🎵 Audio (3) ] [ 📄 Documents (3) ]│
│                                                                     │
│  Catégorie : [ Toutes ▼ ]    Trier par : [ Date ▼ ]                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ 🟦       │  │ 🟩       │  │ 📄       │  │ 🎬       │           │
│  │ [IMAGE]  │  │ [IMAGE]  │  │ doc.pdf  │  │ promo.mp4│           │
│  │          │  │          │  │          │  │          │           │
│  │promo.jpg │  │offre.png │  │ 2.1 Mo   │  │ 8.4 Mo   │           │
│  │ 1.2 Mo   │  │ 890 Ko   │  │Produits  │  │Promotions│           │
│  │ 3 liens  │  │ 1 lien   │  │ 0 lien   │  │ 2 liens  │           │
│  │ [⋮]      │  │ [⋮]      │  │ [⋮]      │  │ [⋮]      │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
└─────────────────────────────────────────────────────────────────────┘
```

#### Différenciation visuelle par type

| Type | Couleur badge | Icône | Fond miniature |
|---|---|---|---|
| Image | `#3B82F6` bleu | `ImageIcon` | miniature réelle |
| Vidéo | `#8B5CF6` violet | `VideoIcon` | fond noir + icône play |
| Audio | `#10B981` vert | `MicIcon` | fond vert + forme d'onde |
| Document | `#F59E0B` orange | `FileTextIcon` | fond gris + extension |

#### Actions sur chaque carte

- **Clic** → ouvre le modal de détail (renommer, catégorie, tags, couleur, aperçu grand format)
- **Menu `⋮`** → Renommer / Copier l'URL / Supprimer

#### Modal d'upload

```
┌──────────────────────────────────────────────┐
│  Uploader un nouveau média                   │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │  Glisser-déposer ou cliquer          │   │
│  │  JPG PNG WEBP GIF MP4 MP3 OGG PDF   │   │
│  │  Taille max : 16 Mo                  │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  Nom affiché   [___________________________] │
│  Catégorie     [___________ ▼ ou nouvelle  ] │
│  Tags          [tag1] [tag2] [+ ajouter    ] │
│  Couleur label ● ● ● ● ● ○                  │
│                                              │
│              [Annuler]  [Uploader]           │
└──────────────────────────────────────────────┘
```

---

### C2 — Mise à jour `CampaignLinksView.tsx`

#### Formulaire de création — section média

```
┌──────────────────────────────────────────────────────────────┐
│  Média associé (optionnel)                                   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Aucun média sélectionné                               │ │
│  │                                                        │ │
│  │  [  Choisir dans la médiathèque  ]  [  Upload rapide  ]│ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Si un média est sélectionné** :

```
┌──────────────────────────────────────────────────────────────┐
│  Média associé                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  [miniature 80×80]  promo_ete.jpg          [✕]       │   │
│  │  Image · 1.2 Mo · Catégorie : Promotions             │   │
│  │  URL : https://api.gicop.ci/uploads/media-assets/... │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

#### Modal "Choisir dans la médiathèque" (MediaPickerModal)

```
┌────────────────────────────────────────────────────────────────┐
│  Sélectionner un média                                    [✕]  │
├────────────────────────────────────────────────────────────────┤
│  🔍 Rechercher...   [ Tous ▼ ]  [ Catégorie ▼ ]               │
├────────────────────────────────────────────────────────────────┤
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  │
│  │[IMAGE] │  │[IMAGE] │  │[IMAGE] │  │[DOC]   │  │[VIDEO] │  │
│  │ img1   │  │ img2   │  │ img3   │  │ doc.pdf│  │vid.mp4 │  │
│  └────────┘  └────────┘  └────────┘  └────────┘  └────────┘  │
│                                                                │
│  ← 1 / 3 →                                                    │
├────────────────────────────────────────────────────────────────┤
│                           [Annuler]  [Sélectionner]            │
└────────────────────────────────────────────────────────────────┘
```

#### Affichage dans la liste des liens campagne

Ajouter une colonne "Média" :

```
│ Nom       │ Canal  │ Clics │ Média                  │ Actions │
│ Promo été │ META   │  24   │ 🖼 promo_ete.jpg        │ ...     │
│ Bienvenue │ WHAPI  │   8   │ 📄 conditions.pdf       │ ...     │
│ Test      │ META   │   1   │  —                      │ ...     │
```

---

### C3 — Ajouter la vue dans la navigation

**Fichier** : `admin/src/app/ui/Navigation.tsx`

Ajouter dans le groupe existant ou créer un groupe "Contenu" :

```typescript
{ id: 'mediatheque', name: 'Médiathèque', icon: LibraryIcon }
```

**Fichier** : `admin/src/app/lib/definitions.ts`

```typescript
// ViewMode — ajouter :
| 'mediatheque'
```

**Fichier** : `admin/src/app/page.tsx` (ou dashboard principal)

```tsx
{view === 'mediatheque' && <MediathequeView />}
```

---

### C4 — Fonctions API à ajouter dans `api.ts`

```typescript
// ── Médiathèque ──────────────────────────────────────────────────────────────
export async function getMediaAssets(params?: {
  type?: string; category?: string; search?: string;
  page?: number; limit?: number; sort?: string; order?: string;
}): Promise<{ items: MediaAsset[]; total: number; pages: number }> { ... }

export async function uploadMediaAsset(payload: {
  file: File; name: string; category?: string; tags?: string[]; colorLabel?: string;
}): Promise<MediaAsset> { ... }

export async function updateMediaAsset(id: string, payload: {
  name?: string; category?: string; tags?: string[]; colorLabel?: string;
}): Promise<MediaAsset> { ... }

export async function deleteMediaAsset(id: string): Promise<void> { ... }

export async function getMediaCategories(): Promise<string[]> { ... }

// ── Liens campagne — média ────────────────────────────────────────────────────
export async function attachMediaAssetToLink(
  linkId: string, assetId: string,
): Promise<CampaignLink> { ... }

export async function detachMediaAssetFromLink(linkId: string): Promise<void> { ... }

export async function uploadMediaDirectToLink(
  linkId: string, file: File,
): Promise<CampaignLink> { ... }
```

---

### C5 — Types à ajouter dans `definitions.ts`

```typescript
export type MediaAssetType = 'image' | 'video' | 'audio' | 'document';

export type MediaAsset = {
  id: string;
  name: string;
  originalName: string;
  publicUrl: string;
  mimeType: string;
  mediaType: MediaAssetType;
  fileSize: number;
  category: string | null;
  tags: string[] | null;
  colorLabel: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
};

// Mise à jour de CampaignLink
export type CampaignLink = {
  // ... champs existants ...
  media_asset_id: string | null;
  media_asset: MediaAsset | null;
};
```

---

## PARTIE D — Infrastructure

### D1 — Volume Docker

**Fichier** : `docker-compose.yml`

```yaml
services:
  back:
    volumes:
      - ./uploads:/app/uploads   # médias persistants entre redéploiements
```

### D2 — Assets statiques NestJS

**Fichier** : `src/main.ts`

```typescript
import { join } from 'path';
app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
```

### D3 — Dossier uploads à créer sur le serveur

```bash
mkdir -p /var/www/whatsapp/uploads/media-assets
chmod 755 /var/www/whatsapp/uploads/media-assets
```

---

## Ordre d'implémentation recommandé

| # | Tâche | Fichiers | Durée |
|---|---|---|---|
| 1 | Volume Docker + assets statiques | `docker-compose.yml`, `main.ts` | 10 min |
| 2 | Migration `media_asset` | `migrations/20260515_create_media_asset.ts` | 10 min |
| 3 | Entité + module + service `MediaAsset` | `media-asset/` | 30 min |
| 4 | Endpoints `GET/POST/PATCH/DELETE /media-assets` | `media-asset.controller.ts` | 20 min |
| 5 | Migration FK sur `campaign_link` | `migrations/20260515_add_media_to_campaign_link.ts` | 5 min |
| 6 | Entité `CampaignLink` + service (`attachAsset`, `detachAsset`, `stripMediaUrl`) | `campaign-link.*` | 30 min |
| 7 | Types + API admin | `definitions.ts`, `api.ts` | 15 min |
| 8 | Vue `MediathequeView.tsx` (grille, filtres, upload modal) | `MediathequeView.tsx` | 60 min |
| 9 | Modal `MediaPickerModal.tsx` (sélecteur depuis campagne) | `MediaPickerModal.tsx` | 30 min |
| 10 | Mise à jour `CampaignLinksView.tsx` (section média + picker) | `CampaignLinksView.tsx` | 30 min |
| 11 | Navigation + routing | `Navigation.tsx`, `page.tsx`, `definitions.ts` | 10 min |

**Durée totale estimée : ~4h30**

---

## Récapitulatif des dépendances

```
AppModule
  └── MediaAssetModule          (nouveau)
  └── CampaignLinkModule
        └── MediaAssetModule    (importé pour injecter MediaAssetService)
```

Aucune dépendance circulaire — `MediaAssetModule` n'importe rien des modules existants.

---

## Points de vigilance

| Point | Détail |
|---|---|
| `APP_DOMAIN` obligatoire | Sans lui, `publicUrl` sera vide → pas de miniature WhatsApp. Afficher un avertissement si non configuré. |
| Suppression avec `usageCount > 0` | Bloquer côté backend (409) + expliquer dans l'UI ("utilisé dans 3 liens") |
| Taille max fichier | 16 Mo côté Multer **et** côté WhatsApp (limite réelle : 5 Mo images, 16 Mo vidéos) |
| HTTPS obligatoire | WhatsApp ne génère pas de miniature pour les URL HTTP |
| `ON DELETE SET NULL` | Si le `MediaAsset` est supprimé malgré tout, la FK devient NULL mais l'URL reste dans `predefined_message` — l'URL devient alors cassée. La protection `usageCount > 0` empêche ce cas. |
