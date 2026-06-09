# Plan — Panneau médias du poste (front commercial)

**Date :** 2026-06-09  
**Branche :** production  
**Objectif :** Ajouter un panneau latéral droit sur le front commercial affichant les médias échangés sur ce poste, filtré par les types de médias autorisés par l'admin.

---

## 1. Contexte et besoin

### Besoin
- L'admin active ou désactive le panneau pour chaque poste
- L'admin choisit quels **types** de médias sont visibles dans le panneau (image, vidéo, audio, document, voix, sticker…)
- Le commercial voit le panneau uniquement si son poste est autorisé
- Le panneau est un tiroir latéral droit toggle (ouvert/fermé par un bouton)

### Source des médias
Les médias du panneau viennent de **`WhatsappMedia`** (médias de conversation stockés localement sur le serveur), **pas** de la Médiathèque admin. Ce sont les fichiers échangés dans les conversations du poste (entrants et sortants) qui ont une copie locale (`local_url IS NOT NULL`).

---

## 2. Architecture cible

### 2.1 Données

**Table `whatsapp_poste` — 2 nouvelles colonnes uniquement :**

```sql
media_panel_enabled  TINYINT(1)    NOT NULL DEFAULT 0
media_panel_types    VARCHAR(255)  NULL         -- JSON array ex: '["image","video","document"]'
```

Pas de nouvelle table de jointure — la configuration tient en 2 colonnes.

### 2.2 Backend

```
src/whatsapp_poste/
├── entities/whatsapp_poste.entity.ts        MODIFIER (+ 2 colonnes)
├── dto/update-poste-panel.dto.ts            CRÉER
├── whatsapp_poste.service.ts                MODIFIER (+ méthodes panel)
├── whatsapp_poste.controller.ts             MODIFIER (+ endpoints)
└── whatsapp_poste.module.ts                 MODIFIER (+ WhatsappMedia dans forFeature)

src/database/migrations/
└── AddMediaPanelToPoste1749513600001.ts     CRÉER
```

**Endpoints backend :**

| Méthode | Route | Guard | Description |
|---|---|---|---|
| `GET` | `/poste/:id/panel` | AdminGuard | Config du panneau (enabled + types) |
| `PUT` | `/poste/:id/panel` | AdminGuard | Mettre à jour config panneau |
| `GET` | `/poste-panel/media` | AuthGuard('jwt') | Médias du panneau pour le commercial connecté |

### 2.3 Admin

```
admin/src/app/
├── ui/
│   ├── PostesView.tsx                  MODIFIER (+ bouton "Panneau" par poste)
│   └── PosteMediaPanelModal.tsx        CRÉER (modal toggle + checkboxes types)
└── lib/
    ├── definitions.ts                  MODIFIER (+ type PostePanelConfig)
    └── api.ts                          MODIFIER (+ getPostePanelConfig, updatePostePanelConfig)
```

### 2.4 Frontend commercial

```
front/src/
├── app/whatsapp/page.tsx               MODIFIER (+ état panneau)
├── components/panel/MediaPanel.tsx     CRÉER (tiroir latéral)
└── lib/api.ts                          MODIFIER (+ getPanelMedia)
```

---

## 3. Backend — Détails d'implémentation

### 3.1 Migration

**Fichier :** `src/database/migrations/AddMediaPanelToPoste1749513600001.ts`

```typescript
async up(queryRunner: QueryRunner): Promise<void> {
  // Idempotent
  const table = await queryRunner.getTable('whatsapp_poste');

  if (!table?.findColumnByName('media_panel_enabled')) {
    await queryRunner.addColumn('whatsapp_poste', new TableColumn({
      name: 'media_panel_enabled', type: 'tinyint', width: 1,
      isNullable: false, default: 0,
    }));
  }
  if (!table?.findColumnByName('media_panel_types')) {
    await queryRunner.addColumn('whatsapp_poste', new TableColumn({
      name: 'media_panel_types', type: 'varchar', length: '255',
      isNullable: true, default: null,
    }));
  }
}

async down(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.dropColumn('whatsapp_poste', 'media_panel_types');
  await queryRunner.dropColumn('whatsapp_poste', 'media_panel_enabled');
}
```

**Timestamp :** `1749513600001` = 2026-06-10 00:00:00 UTC

### 3.2 Entité `WhatsappPoste` — ajouts

```typescript
@Column({ name: 'media_panel_enabled', type: 'tinyint', width: 1, default: 0 })
media_panel_enabled: boolean;

// Stocké en JSON string : '["image","video"]' — null = aucun type autorisé
@Column({ name: 'media_panel_types', type: 'varchar', length: 255, nullable: true })
media_panel_types: string | null;
```

**Helper pour lire les types :**
```typescript
get panelTypes(): string[] {
  if (!this.media_panel_types) return [];
  try { return JSON.parse(this.media_panel_types); }
  catch { return []; }
}
```

### 3.3 DTO

**Fichier :** `src/whatsapp_poste/dto/update-poste-panel.dto.ts`

```typescript
const VALID_TYPES = ['image','video','audio','document','voice','sticker','gif'] as const;

export class UpdatePostePanelDto {
  @IsBoolean()
  enabled: boolean;

  @IsArray()
  @IsIn(VALID_TYPES, { each: true })
  types: string[];   // ex: ['image', 'video', 'document']
}
```

### 3.4 Service — nouvelles méthodes

**Fichier :** `src/whatsapp_poste/whatsapp_poste.service.ts`

```typescript
// Admin : lire config panneau
async getPanelConfig(posteId: string) {
  const poste = await this.posteRepo.findOneByOrFail({ id: posteId });
  return {
    enabled: poste.media_panel_enabled,
    types: poste.media_panel_types
      ? JSON.parse(poste.media_panel_types)
      : [],
  };
}

// Admin : mettre à jour config panneau
async updatePanelConfig(posteId: string, dto: UpdatePostePanelDto) {
  await this.posteRepo.update(posteId, {
    media_panel_enabled: dto.enabled,
    media_panel_types: dto.types.length > 0
      ? JSON.stringify(dto.types)
      : null,
  });
}

// Commercial : médias du panneau (basé sur le JWT)
async getPanelMediaForCommercial(commercialId: string, page = 1, limit = 30) {
  // 1. Résoudre poste du commercial
  const commercial = await this.commercialRepo.findOne({
    where: { id: commercialId },
    relations: ['poste'],
  });
  const poste = commercial?.poste;

  if (!poste?.media_panel_enabled) {
    return { enabled: false, types: [], items: [], total: 0, pages: 0 };
  }

  const types: string[] = poste.media_panel_types
    ? JSON.parse(poste.media_panel_types)
    : [];

  if (types.length === 0) {
    return { enabled: true, types: [], items: [], total: 0, pages: 0 };
  }

  // 2. Requête des médias du poste avec filtre sur les types autorisés
  const qb = this.mediaRepo
    .createQueryBuilder('media')
    .innerJoin('media.message', 'msg')
    .select([
      'media.id', 'media.local_url', 'media.media_type',
      'media.mime_type', 'media.file_name', 'media.file_size',
      'media.duration_seconds', 'media.downloaded_at', 'media.createdAt',
      'msg.direction', 'msg.from_name', 'msg.from',
    ])
    .where('msg.poste_id = :posteId', { posteId: poste.id })
    .andWhere('media.local_url IS NOT NULL')
    .andWhere('media.media_type IN (:...types)', { types })
    .andWhere('media.deletedAt IS NULL')
    .andWhere('msg.deletedAt IS NULL')
    .orderBy('media.createdAt', 'DESC')
    .skip((page - 1) * limit)
    .take(limit);

  const [items, total] = await qb.getManyAndCount();

  return {
    enabled: true,
    types,
    items,
    total,
    pages: Math.ceil(total / limit),
  };
}
```

### 3.5 Controller — nouveaux endpoints

**Fichier :** `src/whatsapp_poste/whatsapp_poste.controller.ts`

```typescript
// ⚠️ Déclarer '/poste-panel/media' AVANT '/:id/panel' pour éviter
//    que NestJS interprète 'poste-panel' comme un :id

// Commercial — médias du panneau
@Get('poste-panel/media')
@UseGuards(AuthGuard('jwt'))
async getMyPanelMedia(
  @Request() req,
  @Query('page') page = 1,
  @Query('limit') limit = 30,
) {
  return this.posteService.getPanelMediaForCommercial(req.user.id, +page, +limit);
}

// Admin — lire config panneau
@Get(':id/panel')
@UseGuards(AdminGuard)
async getPanelConfig(@Param('id') id: string) {
  return this.posteService.getPanelConfig(id);
}

// Admin — mettre à jour config panneau
@Put(':id/panel')
@UseGuards(AdminGuard)
async updatePanelConfig(@Param('id') id: string, @Body() dto: UpdatePostePanelDto) {
  await this.posteService.updatePanelConfig(id, dto);
}
```

### 3.6 Module

**Fichier :** `src/whatsapp_poste/whatsapp_poste.module.ts`

Ajouter dans `TypeOrmModule.forFeature([...])` :
- `WhatsappMedia` (pour la requête des médias du panneau)
- `WhatsappCommercial` (pour résoudre commercial → poste)

---

## 4. Admin — Détails d'implémentation

### 4.1 Type TypeScript

**Fichier :** `admin/src/app/lib/definitions.ts`

```typescript
export type PostePanelConfig = {
  enabled: boolean;
  types: string[];   // ex: ['image', 'video', 'document']
};
```

Mettre à jour le type `Poste` pour inclure les nouveaux champs :
```typescript
media_panel_enabled?: boolean;
media_panel_types?: string | null;
```

### 4.2 Appels API admin

**Fichier :** `admin/src/app/lib/api.ts`

```typescript
export async function getPostePanelConfig(posteId: string): Promise<PostePanelConfig>
  → GET /poste/{posteId}/panel

export async function updatePostePanelConfig(
  posteId: string,
  payload: { enabled: boolean; types: string[] }
): Promise<void>
  → PUT /poste/{posteId}/panel
```

### 4.3 Bouton dans `PostesView.tsx`

Dans la colonne Actions du tableau, ajouter un bouton icône `LayoutPanelRight` (lucide) qui ouvre `PosteMediaPanelModal` avec le poste sélectionné.

### 4.4 `PosteMediaPanelModal.tsx` — structure

```
Modale (max-w-md)
├── Header : "Panneau médias — {poste.name}" + X
├── Corps
│   ├── Toggle switch : "Activer le panneau médias pour ce poste"
│   │   ← si désactivé, le reste est grisé (opacity-50, pointer-events-none)
│   │
│   └── Checkboxes types de médias (grid 2 colonnes) :
│       ☑ Images           ☑ Vidéos
│       ☑ Audios           ☑ Documents
│       ☐ Vocaux (voice)   ☐ Stickers
│       ☐ GIFs
│       ← Au moins 1 doit être coché si le panneau est activé
└── Footer : Annuler | Enregistrer
```

**Comportement :**
- Au mount : `getPostePanelConfig(poste.id)` → pré-coche les types
- Enregistrer : `updatePostePanelConfig(poste.id, { enabled, types })`
- Toast succès "Panneau mis à jour" / erreur

---

## 5. Frontend commercial — Détails d'implémentation

### 5.1 Type

**Fichier :** `front/src/types/` — ajouter dans le fichier de types existant (`chat.ts` ou nouveau `media-panel.ts`) :

```typescript
export type PanelMedia = {
  id: string;
  local_url: string;
  media_type: 'image' | 'video' | 'audio' | 'document' | 'voice' | 'sticker' | 'gif';
  mime_type: string;
  file_name: string | null;
  file_size: string | null;
  duration_seconds: number | null;
  downloaded_at: string | null;
  createdAt: string;
  message: {
    direction: 'IN' | 'OUT';
    from_name: string;
    from: string;
  } | null;
};

export type PanelMediaResponse = {
  enabled: boolean;
  types: string[];
  items: PanelMedia[];
  total: number;
  pages: number;
};
```

### 5.2 API call commercial

**Fichier :** `front/src/lib/api.ts`

```typescript
export async function getPanelMedia(page = 1, limit = 30): Promise<PanelMediaResponse>
  → GET /poste-panel/media?page={page}&limit={limit}
```

### 5.3 Modification de `page.tsx`

```typescript
// Nouvel état
const [panelOpen, setPanelOpen] = useState(false);
const [panelEnabled, setPanelEnabled] = useState(false);

// Au mount : vérifier si le panneau est activé pour ce poste
useEffect(() => {
  getPanelMedia(1, 1)
    .then(r => setPanelEnabled(r.enabled))
    .catch(() => {/* silencieux */});
}, []);

// Layout — ajouter le panneau à droite de ChatMainArea
<div className="flex h-screen bg-gray-100 overflow-hidden">
  <Sidebar ... />
  <ChatMainArea
    ...
    panelEnabled={panelEnabled}
    panelOpen={panelOpen}
    onTogglePanel={() => setPanelOpen(p => !p)}
  />
  {panelEnabled && panelOpen && (
    <MediaPanel onClose={() => setPanelOpen(false)} />
  )}
</div>
```

### 5.4 Composant `MediaPanel.tsx`

**Fichier :** `front/src/components/panel/MediaPanel.tsx`

```
<aside class="w-72 shrink-0 bg-white border-l border-gray-200 flex flex-col h-full">
  ├── Header (p-3 border-b)
  │   ├── Titre "Médias" (icône Images)
  │   └── Bouton × (fermer)
  │
  ├── Corps (flex-1 overflow-y-auto p-2)
  │   ├── État chargement : skeleton 2 colonnes
  │   ├── État vide : "Aucun média disponible"
  │   └── Grille 2 colonnes de PanelMediaCard
  │
  └── Footer (p-2 border-t text-xs text-gray-400 text-center)
      "{total} média(s)"
```

**`PanelMediaCard` :**

```
<div class="rounded-lg overflow-hidden border border-gray-100 cursor-pointer hover:border-blue-300">
  ├── Zone miniature (h-20 bg-gray-50)
  │   ├── image  → <img src={mediaUrl(item.local_url)} object-cover>
  │   ├── vidéo  → icône Film (violet)
  │   ├── audio/voix → icône Music/Mic (vert)
  │   └── doc    → icône FileText (ambre)
  └── Infos (p-1.5)
      ├── Nom fichier tronqué (text-xs font-medium)
      └── Badge direction (Client=bleu / Agent=vert) + from_name
```

**Clic** → `window.open(mediaUrl(item.local_url), '_blank')`

**`mediaUrl()` dans le front commercial :**
```typescript
// Même pattern que dans GalerieMediaView côté admin
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/api\/?$/, '');
const mediaUrl = (localUrl: string) => `${API_BASE}${localUrl}`;
```

**Pagination dans le panneau :** boutons "Charger plus" (infinite scroll ou bouton en bas) — éviter une pagination complète dans un panneau étroit.

### 5.5 Bouton toggle dans le chat

Dans `ChatMainArea.tsx` (ou `ChatHeader.tsx`), si `panelEnabled` :

```tsx
<button
  onClick={onTogglePanel}
  className={`p-2 rounded-lg ${panelOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
  title="Médias du poste"
>
  <LayoutPanelRight className="w-5 h-5" />
</button>
```

---

## 6. Ordre d'implémentation

| # | Fichier | Action | Durée |
|---|---|---|---|
| **Phase 1 — Backend** | | | |
| 1 | `AddMediaPanelToPoste1749513600001.ts` | CRÉER | 20 min |
| 2 | `entities/whatsapp_poste.entity.ts` | MODIFIER (+2 colonnes) | 10 min |
| 3 | `dto/update-poste-panel.dto.ts` | CRÉER | 10 min |
| 4 | `whatsapp_poste.service.ts` | MODIFIER (+3 méthodes) | 40 min |
| 5 | `whatsapp_poste.controller.ts` | MODIFIER (+3 endpoints) | 20 min |
| 6 | `whatsapp_poste.module.ts` | MODIFIER | 10 min |
| **Phase 2 — Admin** | | | |
| 7 | `admin/lib/definitions.ts` | MODIFIER | 10 min |
| 8 | `admin/lib/api.ts` | MODIFIER | 10 min |
| 9 | `admin/ui/PosteMediaPanelModal.tsx` | CRÉER | 45 min |
| 10 | `admin/ui/PostesView.tsx` | MODIFIER | 15 min |
| **Phase 3 — Front commercial** | | | |
| 11 | `front/src/types/media-panel.ts` | CRÉER | 10 min |
| 12 | `front/src/lib/api.ts` | MODIFIER | 10 min |
| 13 | `front/src/components/panel/MediaPanel.tsx` | CRÉER | 1h |
| 14 | `front/src/app/whatsapp/page.tsx` | MODIFIER | 20 min |

**Durée totale estimée : ~4h**

---

## 7. Points de vigilance

### Ordre des routes NestJS
`GET /poste-panel/media` doit être déclaré **avant** `GET /:id/panel` dans le controller, sinon NestJS interprète `poste-panel` comme une valeur du paramètre `:id`.

### `media_panel_types` en JSON string
Le champ est un `VARCHAR(255)` stockant du JSON (`'["image","video"]'`). Toujours parser/serialiser avec `JSON.parse/stringify`. Null = aucun type autorisé.

### `WhatsappCommercial` dans le module poste
Si `WhatsappCommercialModule` n'exporte pas son repository, il faut soit importer le module, soit ajouter l'entité dans `TypeOrmModule.forFeature([WhatsappCommercial])` du module poste.

### `mediaUrl()` côté front commercial
`local_url` est un chemin relatif (`/uploads/media/...`). Même pattern que `GalerieMediaView.tsx` : préfixer avec `NEXT_PUBLIC_API_URL` sans `/api`.

### Pagination dans le panneau
Le panneau est étroit (288px). Préférer un bouton "Charger plus" à une pagination numérotée classique.

### Migration
Lancer `npm run migration:run` après déploiement backend.

---

## 8. Ce qui NE change pas

- La logique de dispatch/queue
- Les endpoints proxy de médias
- La Médiathèque admin (MediaAsset)
- Les entités `WhatsappMessage`, `WhapiChannel`

---

*Plan créé le 2026-06-09 — révisé (types de médias au lieu d'assets individuels)*
