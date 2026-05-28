# Plan d'implémentation — Onglet F (Mot-clé) : Multi-mots-clés + Médias

**Date** : 2026-05-28  
**Branche** : `production`  
**Périmètre** : Messages automatiques déclenchés par mot-clé (trigger `F`)  
**Révision** : v5 — version finale validée pour implémentation

---

## Contexte et état des lieux

### Ce qui existe déjà

| Composant | Fichier | État |
|-----------|---------|------|
| Entité `MessageAuto` | `src/message-auto/entities/message-auto.entity.ts` | ✅ Opérationnel |
| Entité `AutoMessageKeyword` | `src/message-auto/entities/auto-message-keyword.entity.ts` | ✅ Opérationnel |
| Détection trigger F | `src/jorbs/auto-message-master.job.ts` — `runTriggerF()` | ✅ Texte seulement |
| Sélection template | `src/message-auto/message-auto.service.ts` — `getTemplateForTrigger()` | ✅ Sans relation media |
| Envoi message auto | `src/message-auto/message-auto.service.ts` — `sendAutoMessageForTrigger()` | ✅ Texte seulement |
| Envoi média agent | `src/whatsapp_message/whatsapp_message.service.ts` — `createAgentMediaMessage()` | ✅ Opérationnel |
| Module média | `src/media-asset/` + table `media_asset` | ✅ Opérationnel |
| `incrementUsage` / `decrementUsage` | `src/media-asset/media-asset.service.ts` | ✅ Disponible |
| Admin UI | `admin/src/app/ui/MessageAutoView.tsx` | ✅ Texte seulement |
| `MediaPickerModal` | `admin/src/app/ui/MediaPickerModal.tsx` | ✅ Complet (search, filtres, aperçu, pagination) |
| API admin médias | `admin/src/app/lib/api.ts` — `getMediaAssets()` | ✅ Disponible |

### Problèmes identifiés

**Problème 1 — Multi-mots-clés (UX) :**  
La relation `MessageAuto → AutoMessageKeyword` supporte déjà plusieurs mots-clés par template au niveau données/API. Mais l'UI manque de deux fonctionnalités :
- Le `TemplatePanel` n'affiche pas combien de mots-clés sont configurés pour chaque template.
- Le `KeywordManagerModal` ne permet d'ajouter qu'un seul mot-clé à la fois (pas d'ajout en lot).

**Problème 2 — Médias :**  
`sendAutoMessageForTrigger()` appelle uniquement `createAgentMessage()` (texte pur). Il n'y a aucun champ `media_asset_id` sur `messages_predefinis`. Les templates ne peuvent pas envoyer d'image, d'audio ou de document.

---

## Architecture de la solution

### Principe retenu : liaison FK vers `media_asset`

Plutôt que de stocker une URL brute, on lie le template au catalogue de médias existant (`media_asset`). Avantages :
- Réutilisation de l'upload et de la gestion déjà en place.
- Gestion du `usage_count` via les méthodes existantes `incrementUsage` / `decrementUsage`.
- Un média supprimé de la médiathèque ne casse pas le template (FK ON DELETE SET NULL).

### Logique d'envoi (comme WhatsApp natif)

```
Template déclenché
  │
  ├── body seul (mediaAssetId null)  → 1 bulle texte          [comportement actuel]
  │
  ├── média seul (body = '')         → 1 bulle média sans légende
  │
  └── body + média                   → 1 bulle média + body en légende
                                        (comme WhatsApp : texte affiché sous l'image)
```

**Règle :** `body` reste `TEXT NOT NULL` en base. Pour un template "média seul", `body = ''`. La validation impose : `body.trim() !== ''` OU `mediaAssetId` est présent.

### Correction flux trigger F (point critique)

**Problème actuel :** `runTriggerF()` trouve un mot-clé, puis appelle `sendAutoMessageForTrigger(chatId, KEYWORD, matchedKw.messageAuto.position)`. Ensuite `getTemplateForTrigger()` fait un tirage aléatoire dans le pool de templates ayant cette position. Si deux templates mot-clé ont la même position, le mauvais peut être sélectionné.

**Solution :** Deux nouvelles méthodes dans `MessageAutoService` :

1. `templateMatchesChatScope(template, chat)` — vérifie si un template est **compatible** avec le scope du chat (utilisé en filtre).
2. `selectBestKeywordTemplateForChat(matchingKeywords, chat)` — parmi les templates compatibles, **choisit le meilleur** selon la priorité `poste > canal > global`.
3. `sendAutoMessageTemplate(chatId, template)` — envoie le template sélectionné.

`runTriggerF()` utilise ces méthodes dans l'ordre : match texte → filtre scope → priorité → envoi.

---

## Phases d'implémentation

---

### Phase 1 — Migration BDD

**Fichier** : `src/database/migrations/AddMediaToAutoMessage1749168000001.ts`

Ajout d'**une seule colonne** à la table `messages_predefinis` :

| Colonne | Type | Contrainte |
|---------|------|-----------|
| `media_asset_id` | `varchar(36)` | nullable, FK → `media_asset.id` ON DELETE SET NULL |

> `body` reste `TEXT NOT NULL` — pas de modification de colonne existante.

```typescript
await queryRunner.addColumn('messages_predefinis',
  new TableColumn({ name: 'media_asset_id', type: 'varchar', length: '36', isNullable: true })
);
await queryRunner.createForeignKey('messages_predefinis', new TableForeignKey({
  columnNames: ['media_asset_id'],
  referencedTableName: 'media_asset',
  referencedColumnNames: ['id'],
  onDelete: 'SET NULL',
  name: 'FK_messages_predefinis_media_asset_id',
}));
```

**`down()`** : drop FK puis drop la colonne.

---

### Phase 2 — Backend

#### US 2.1 — Entité `MessageAuto`

**Fichier** : `src/message-auto/entities/message-auto.entity.ts`

Ajouter deux champs (pas `mediaCaption` — `body` fait office de légende) :

```typescript
@Column({ name: 'media_asset_id', type: 'varchar', length: 36, nullable: true })
mediaAssetId: string | null;

@ManyToOne(() => MediaAsset, { nullable: true, onDelete: 'SET NULL', eager: false })
@JoinColumn({ name: 'media_asset_id' })
mediaAsset: MediaAsset | null;
```

#### US 2.2 — DTOs

**Fichier** : `src/message-auto/dto/create-message-auto.dto.ts`

```typescript
import { IsNotEmpty, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

// body : validé seulement si mediaAssetId absent
@ValidateIf(o => !o.mediaAssetId)
@IsNotEmpty()
@IsString()
body: string;

@IsOptional()
@IsUUID()
mediaAssetId?: string | null;
```

Dans le **service**, normaliser et valider différemment selon `create()` et `update()` :

**`create()`** — valider sur le DTO directement :
```typescript
const body = dto.body ?? '';
if (!dto.mediaAssetId && !body.trim()) {
  throw new BadRequestException('body ou mediaAssetId est requis');
}
```

**`update()`** — valider sur l'état **fusionné** avec l'existant (un PATCH `{ actif: false }` ne fournit ni `body` ni `mediaAssetId`, le garde ne doit pas rejeter) :
```typescript
const nextBody          = dto.body ?? message.body ?? '';
const nextMediaAssetId  = dto.mediaAssetId !== undefined ? dto.mediaAssetId : message.mediaAssetId;

if (!nextMediaAssetId && !nextBody.trim()) {
  throw new BadRequestException('body ou mediaAssetId est requis');
}
```

> `body` reste `text NOT NULL` en base. Pour un template "média seul", le service stocke `''`.

**Fichier** : `src/message-auto/dto/update-message-auto.dto.ts`  
Hérite via `PartialType(CreateMessageAutoDto)` → aucun changement nécessaire.

#### US 2.3 — Service `MessageAutoService`

**Fichier** : `src/message-auto/message-auto.service.ts`

**2.3.a — Charger `mediaAsset` dans `getTemplateForTrigger()`** _(correction critique)_

```typescript
// Avant (manquant) :
const allTemplates = await this.autoMessageRepo.find({
  where: { trigger_type: trigger, position: step, actif: true },
});

// Après :
const allTemplates = await this.autoMessageRepo.find({
  where: { trigger_type: trigger, position: step, actif: true },
  relations: ['mediaAsset'],
});
```

**2.3.b — Charger `mediaAsset` dans `findOne()`, `findAll()`, `findByTrigger()`**

```typescript
relations: ['keywords', 'mediaAsset'],
```

**2.3.c — Nouvelle méthode `sendAutoMessageTemplate()`** _(pour trigger F)_

Envoie directement un template résolu, avec vérification de scope avant l'envoi.

**Helper privé `templateMatchesChatScope()`** — vérifie la compatibilité scope (utilisé comme filtre) :

```typescript
private templateMatchesChatScope(
  template: MessageAuto,
  chat: { poste_id?: string | null; last_msg_client_channel_id?: string | null },
): boolean {
  if (template.scope_type === 'poste') {
    return template.scope_id === chat.poste_id;
  }
  if (template.scope_type === 'canal') {
    return template.scope_id === chat.last_msg_client_channel_id;
  }
  // scope global : vérifier les exclusions
  const excChannels: string[] = template.conditions?.excluded_channel_ids ?? [];
  const excPostes:   string[] = template.conditions?.excluded_poste_ids   ?? [];
  if (chat.last_msg_client_channel_id && excChannels.includes(chat.last_msg_client_channel_id)) return false;
  if (chat.poste_id                   && excPostes.includes(chat.poste_id))                     return false;
  return true;
}
```

**Méthode publique `selectBestKeywordTemplateForChat()`** — sélection priorisée parmi les mots-clés compatibles :

```typescript
selectBestKeywordTemplateForChat(
  matchingKeywords: AutoMessageKeyword[],
  chat: { poste_id?: string | null; last_msg_client_channel_id?: string | null },
): AutoMessageKeyword | undefined {
  const scopedMatches = matchingKeywords.filter(
    (kw) => this.templateMatchesChatScope(kw.messageAuto, chat),
  );

  // priorité : poste > canal > global
  return (
    scopedMatches.find(
      (kw) => kw.messageAuto.scope_type === 'poste' && kw.messageAuto.scope_id === chat.poste_id,
    ) ??
    scopedMatches.find(
      (kw) => kw.messageAuto.scope_type === 'canal' && kw.messageAuto.scope_id === chat.last_msg_client_channel_id,
    ) ??
    scopedMatches.find((kw) => !kw.messageAuto.scope_type)
  );
}
```

**Méthode publique `sendAutoMessageTemplate()`** — garde défensif conservé même si le scope est déjà vérifié en amont par `selectBestKeywordTemplateForChat()` (la méthode est publique, un futur appelant pourrait ne pas passer par le pipeline F) :

```typescript
async sendAutoMessageTemplate(
  chatId: string,
  template: MessageAuto,
): Promise<void> {
  const chat = await this.chatService.findBychat_id(chatId);
  if (!chat || !chat.last_msg_client_channel_id) return;

  // Garde défensif : vérifier le scope même si l'appelant l'a déjà fait
  if (!this.templateMatchesChatScope(template, chat)) return;

  await this.updateTriggerTracking(chatId, AutoMessageTriggerType.KEYWORD, template.position);

  void this.messageService.typingStart(chatId).catch(() => {});
  try {
    if (template.mediaAsset) {
      const fileBuffer = await fs.promises.readFile(template.mediaAsset.filePath);
      const caption = template.body?.trim()
        ? this.formatMessageAuto({ message: template.body, name: chat.name, numero: chat.contact_client })
        : undefined;
      const msg = await this.messageService.createAgentMediaMessage({
        chat_id: chat.chat_id,
        poste_id: null,
        timestamp: new Date(),
        channel_id: chat.last_msg_client_channel_id,
        mediaBuffer: fileBuffer,
        mimeType: template.mediaAsset.mimeType,
        fileName: template.mediaAsset.originalName,
        mediaType: template.mediaAsset.mediaType,
        caption,
      });
      await this.gateway.notifyAutoMessage(msg, chat);
    } else {
      const text = this.formatMessageAuto({ message: template.body, name: chat.name, numero: chat.contact_client });
      const msg = await this.messageService.createAgentMessage({
        chat_id: chat.chat_id, poste_id: null, text, timestamp: new Date(),
        channel_id: chat.last_msg_client_channel_id,
      });
      await this.gateway.notifyAutoMessage(msg, chat);
    }
  } catch (err) {
    this.logger.error(`sendAutoMessageTemplate: échec ${chatId}: ${(err as Error).message}`, undefined, MessageAutoService.name);
  } finally {
    void this.messageService.typingStop(chatId).catch(() => {});
  }
}
```

**2.3.d — Modifier `sendAutoMessageForTrigger()`** (tous triggers sauf F via le nouveau chemin)

Même logique `if (template.mediaAsset) … else …` dans la méthode existante (charger `mediaAsset` est déjà garanti via `getTemplateForTrigger()` corrigé en 2.3.a).

**2.3.e — Gestion `usage_count`** _(compter tous les templates qui référencent le média)_

Injecter `MediaAssetService` dans `MessageAutoService`.

`usage_count` = **nombre de templates (actifs ou non) qui référencent ce média**. On ne gère pas les changements de `actif` — trop complexe pour un bénéfice marginal.

- **Lors de l'association** (`create()` et `update()`) : si `mediaAssetId` change → `incrementUsage(nouveau)` et `decrementUsage(ancien)`.
- **Lors de la suppression** (`remove()`) : si le template avait un `mediaAssetId` → `decrementUsage()`.

**Ordre d'opérations pour garantir la cohérence** : sauvegarder le template EN PREMIER, puis ajuster `usage_count`. Si le `save()` échoue, `usage_count` n'est pas touché.

```typescript
// Exemple dans update() :
const ancien = message.mediaAssetId;
const nouveau = dto.mediaAssetId ?? null;

// 1. Sauvegarder d'abord
await this.autoMessageRepo.save({ ...message, ...rest });

// 2. Ajuster usage_count seulement si le save a réussi
if (ancien !== nouveau) {
  if (nouveau) await this.mediaAssetService.incrementUsage(nouveau);
  if (ancien) await this.mediaAssetService.decrementUsage(ancien);
}
```

> Pas de transaction nécessaire : si l'ajustement du `usage_count` échoue après un `save()` réussi, l'écart reste minime et peut être corrigé par une commande de recalcul (`SELECT COUNT(*) FROM messages_predefinis WHERE media_asset_id = ?`). Ce cas est non-bloquant.

#### US 2.4 — Corriger `runTriggerF()` dans `AutoMessageMasterJob`

**Fichier** : `src/jorbs/auto-message-master.job.ts`

Charger la relation `mediaAsset` sur le mot-clé, puis appeler `sendAutoMessageTemplate()` :

```typescript
// Avant :
const keywords = await this.keywordRepo.find({
  where: { actif: true },
  relations: ['messageAuto'],
});
// ...
await this.messageAutoService.sendAutoMessageForTrigger(
  chat.chat_id, AutoMessageTriggerType.KEYWORD, matchedKw.messageAuto.position,
);

// Après :
const keywords = await this.keywordRepo.find({
  where: { actif: true },
  relations: ['messageAuto', 'messageAuto.mediaAsset'],
});

// 1. Filtrer les templates inactifs ou de mauvais trigger_type
const activeKeywords = keywords.filter(
  kw => kw.messageAuto.actif && kw.messageAuto.trigger_type === AutoMessageTriggerType.KEYWORD,
);
if (!activeKeywords.length) return;

// 2. Trouver tous les mots-clés qui matchent le texte
const matchingKeywords = activeKeywords.filter(
  (kw) => this.matchesKeyword(lastMsg.text!, kw),
);
if (!matchingKeywords.length) return;

// 3. Sélection priorisée : poste > canal > global (avec scope check)
const matchedKw = this.messageAutoService.selectBestKeywordTemplateForChat(
  matchingKeywords, chat,
);
if (!matchedKw) return;

await this.messageAutoService.sendAutoMessageTemplate(
  chat.chat_id, matchedKw.messageAuto,
);
```

Résultat : un template canal dédié prend toujours la priorité sur un template global, même si le mot-clé global arrive en premier dans la liste DB.

#### US 2.5 — Module `MessageAutoModule`

**Fichier** : `src/message-auto/message-auto.module.ts`

- Importer `MediaAssetModule` (ou injecter `MediaAssetService` via `forwardRef` si circulaire).
- Pas besoin d'importer `OutboundRouterModule` — `createAgentMediaMessage()` du `WhatsappMessageService` suffit.

---

### Phase 3 — Admin UI

#### US 3.1 — Type `MessageAuto` dans `definitions.ts`

**Fichier** : `admin/src/app/lib/definitions.ts`

Le projet utilise `export type`, pas `export interface`. **Modifier le type existant** (ne pas créer un nouveau) :

```typescript
export type MessageAuto = {
  // ... champs existants ...
  mediaAssetId?: string | null;
  mediaAsset?: MediaAsset | null;   // type MediaAsset déjà défini dans definitions.ts
};
```

#### US 3.2 — Fonctions API dans `api.ts`

**Fichier** : `admin/src/app/lib/api.ts`

Mettre à jour `createMessageAuto()` et `updateMessageAuto()` pour inclure `mediaAssetId` dans le body JSON.

#### US 3.3 — Réutiliser `MediaPickerModal` existant

**Ne pas recréer ce composant.** Il existe déjà :  
`admin/src/app/ui/MediaPickerModal.tsx`

Il gère déjà : recherche, filtres par type, catégories, aperçu, pagination, sélection visuelle.

Interface existante :
```typescript
interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
}
```

Dans `TemplateFormFields`, importer et utiliser directement :
```typescript
import MediaPickerModal from '@/app/ui/MediaPickerModal';
```

#### US 3.4 — `TemplateFormFields` — Section média

**Fichier** : `admin/src/app/ui/MessageAutoView.tsx`

Ajouter en bas des champs existants, une section "Média associé" :

```
┌──────────────────────────────────────────────────────────────┐
│ Média associé (optionnel)                                    │
│                                                              │
│  Si un média est sélectionné, le champ "Message" ci-dessus  │
│  sera utilisé comme légende (comme WhatsApp).                │
│                                                              │
│  [Aucun média]   [Choisir depuis la médiathèque ▸]          │
│                                                              │
│  ── Quand un média est sélectionné ──                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🖼  photo_accueil.jpg  (image/jpeg — 145 Ko)        │   │
│  │                                        [✕ Retirer]  │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

État local ajouté dans `TemplateFormFields` :
```typescript
const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
```

Le `formData` stocke `mediaAssetId: string | null`. Quand l'utilisateur choisit un asset via `MediaPickerModal.onSelect`, on met à jour `formData.mediaAssetId`.

Le label du champ `body` est mis à jour dynamiquement :
```typescript
<label>{formData.mediaAssetId ? 'Légende (optionnel)' : 'Message'}</label>
```

#### US 3.5 — `TemplatePanel` — Badge média

Dans la colonne "Message" du tableau, ajouter un badge après le texte tronqué :

```typescript
{tpl.mediaAsset && (
  <span className="ml-1 inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
    <TypeIcon type={tpl.mediaAsset.mediaType} size={12} />
    {tpl.mediaAsset.name}
  </span>
)}
```

---

### Phase 4 — Améliorations multi-mots-clés (UX)

> Les données multi-mots-clés fonctionnent déjà (OneToMany `MessageAuto → AutoMessageKeyword`). Ces user stories améliorent uniquement l'UX.

#### US 4.1 — Affichage des mots-clés dans `TemplatePanel`

Nouvelle colonne "Mots-clés" (trigger F uniquement) affichant les 2 premiers + badge "+N" :

```
│ # │ Message              │ Mots-clés          │ Délai  │ Actif │
│ 1 │ Bonjour ! Que puis… │ [bonjour] [bjr] +2 │ Global │  Oui  │
```

Clic sur la zone → ouvre `KeywordManagerModal`.

#### US 4.2 — Ajout en lot dans `KeywordManagerModal`

Ajouter un onglet "En lot" :

```
┌──────────────────────────────────────────────────────────┐
│  [Mot-clé unique]  [En lot]                              │
│──────────────────────────────────────────────────────────│
│  Un mot-clé par ligne (ou séparés par virgule) :         │
│  ┌────────────────────────────────────────────────────┐  │
│  │ bonjour                                            │  │
│  │ bjr                                                │  │
│  │ bonsoir, bsr                                       │  │
│  └────────────────────────────────────────────────────┘  │
│  Type par défaut : [Contains ▼]  [ ] Sensible à la casse │
│                                                          │
│                           [Ajouter 4 mots-clés]          │
└──────────────────────────────────────────────────────────┘
```

Comportement :
- Split sur newline ET virgule, trim, déduplique, filtre vides
- Appelle `POST /message-auto/:id/keywords` pour chaque mot en parallèle (`Promise.all`)
- Rafraîchit la liste après

---

## Ordre de livraison recommandé

### Sprint 1 — Core (valeur immédiate)

| Priorité | US | Description |
|----------|----|-------------|
| P0 | 1.1 | Migration BDD — colonne `media_asset_id` |
| P0 | 2.1 | Entité — champs `mediaAssetId` + relation `mediaAsset` |
| P0 | 2.2 | DTOs — `mediaAssetId` + validation cross-champ `body` |
| P0 | 2.3a | Service — `relations: ['mediaAsset']` dans `getTemplateForTrigger()` |
| P0 | 2.3b | Service — `relations: ['mediaAsset']` dans `findOne/findAll/findByTrigger` |
| P0 | 2.3c | Service — nouvelle méthode `sendAutoMessageTemplate()` |
| P0 | 2.3d | Service — logique média dans `sendAutoMessageForTrigger()` |
| P0 | 2.3e | Service — gestion `usage_count` (inject `MediaAssetService`) |
| P0 | 2.4 | Job — corriger `runTriggerF()` pour appeler `sendAutoMessageTemplate()` |
| P0 | 2.5 | Module — import `MediaAssetModule` |
| P0 | 3.1 | Admin — type `MessageAuto` dans `definitions.ts` |
| P0 | 3.2 | Admin — maj `api.ts` |
| P0 | 3.3 | Admin — import `MediaPickerModal` existant |
| P0 | 3.4 | Admin — section média dans `TemplateFormFields` |
| P0 | 3.5 | Admin — badge média dans `TemplatePanel` |

### Sprint 2 — UX confort

| Priorité | US | Description |
|----------|----|-------------|
| P1 | 4.1 | Colonne mots-clés dans `TemplatePanel` |
| P1 | 4.2 | Ajout en lot dans `KeywordManagerModal` |

---

## Fichiers impactés (résumé)

### Backend — 6 fichiers

| Fichier | Modification |
|---------|-------------|
| `src/database/migrations/AddMediaToAutoMessage1749168000001.ts` | **Nouveau** |
| `src/message-auto/entities/message-auto.entity.ts` | +2 champs (`mediaAssetId` + relation) |
| `src/message-auto/dto/create-message-auto.dto.ts` | +1 champ + validation cross-champ `body` |
| `src/message-auto/message-auto.service.ts` | +relation dans `getTemplateForTrigger` + `templateMatchesChatScope()` + `selectBestKeywordTemplateForChat()` + `sendAutoMessageTemplate()` + logique média + `usage_count` ordonné |
| `src/message-auto/message-auto.module.ts` | Import `MediaAssetModule` |
| `src/jorbs/auto-message-master.job.ts` | `runTriggerF()` : charger `mediaAsset` + filtrer templates inactifs/mauvais trigger + appeler `sendAutoMessageTemplate()` |

### Admin UI — 3 fichiers

| Fichier | Modification |
|---------|-------------|
| `admin/src/app/lib/definitions.ts` | +2 champs sur `MessageAuto` |
| `admin/src/app/lib/api.ts` | Maj `createMessageAuto` / `updateMessageAuto` |
| `admin/src/app/ui/MessageAutoView.tsx` | Section média dans `TemplateFormFields` + badge `TemplatePanel` + lot dans `KeywordManagerModal` |

**Total : 9 fichiers (8 modifiés, 1 nouveau)**

---

## Points de vigilance

1. **`body` NOT NULL + média seul** — quand `mediaAssetId` est renseigné et `body` vide, le service sauvegarde `body = ''`. La validation DTO autorise ce cas via `@ValidateIf(o => !o.mediaAssetId)`.

2. **Chemin `file_path`** — `media_asset.file_path` est un chemin absolu sur le serveur. Vérifier que le processus NestJS a les droits de lecture sur le répertoire d'upload.

3. **Idempotence** — `keyword_auto_sent_at` est mis à jour AVANT l'envoi. Si l'envoi du média échoue, pas de renvoi au tick suivant → cohérent avec la politique actuelle.

4. **Tous les triggers bénéficient du média** — `media_asset_id` étant sur `messages_predefinis` (indépendant du `trigger_type`), les triggers A, B, C… peuvent aussi utiliser un média sans migration supplémentaire. Seul `runTriggerF()` est corrigé dans ce sprint ; les autres passent par `sendAutoMessageForTrigger()` mis à jour.

5. **`OutboundRouterService` non injecté dans `MessageAutoService`** — `createAgentMediaMessage()` du `WhatsappMessageService` encapsule déjà le routing. Ajouter une deuxième dépendance directe créerait une redondance inutile.
