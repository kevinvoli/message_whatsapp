# Plan d'implémentation — Restriction lecture conversations commerciales

**Date :** 2026-05-31  
**Branche :** `production`  
**Priorité :** P1

---

## 1. Contexte & objectif

Lorsqu'une commerciale ouvre une conversation sans y répondre (réponse ≥ N caractères) puis tente d'en ouvrir une autre, un modal bloquant s'affiche. Elle doit d'abord répondre aux dernières conversations non-répondues avant de pouvoir continuer.

### Paramètres configurables (admin)

| Clé config | Description | Défaut |
|---|---|---|
| `RESTRICTION_MAX_UNRESPONDED_CONVS` | Nombre de conversations ouvertes sans réponse avant d'afficher le modal | `1` |
| `RESTRICTION_MIN_RESPONSE_CHARS` | Nombre minimum de caractères pour valider une réponse | `50` |
| `RESTRICTION_REQUIRE_LAST_MESSAGE_MINE` | La dernière réponse de la conv doit être de la commerciale | `false` |
| `RESTRICTION_ENABLED` | Active/désactive la restriction | `true` |

---

## 2. Architecture & choix techniques

### Approche : Hybride (backend persisté + frontend réactif)

- **Config** : stockée en `system_config` (déjà existant), exposée via endpoint dédié
- **Tracking des accès** : nouvelle table `commercial_conversation_access` (persiste entre refreshs)
- **Logique de restriction** : calculée côté backend au moment de l'accès, communiquée via WebSocket
- **Blocage UI** : géré dans le store Zustand + nouveau modal

Raison : si la commerciale rafraîchit la page en milieu de journée, la restriction doit tenir. Un tracking purement en mémoire serait insuffisant.

---

## 3. Épics et stories

### Epic 1 — Configuration backend (SystemConfig)

**US 1.1 — Ajouter les 4 clés de config**
- Fichier : `message_whatsapp/src/system-config/system-config.service.ts`
- Ajouter dans `CONFIG_CATALOGUE` (ou équivalent) :
  ```
  RESTRICTION_ENABLED = "true"
  RESTRICTION_MAX_UNRESPONDED_CONVS = "1"
  RESTRICTION_MIN_RESPONSE_CHARS = "50"
  RESTRICTION_REQUIRE_LAST_MESSAGE_MINE = "false"
  ```
- Ajouter une méthode helper `getRestrictionConfig()` → DTO `RestrictionConfig`

**US 1.2 — Endpoint de lecture config (frontend)**
- `GET /api/system-config/restriction` (guard JWT)
- Retourne `RestrictionConfig` (enabled, maxUnresponded, minChars, requireLastMine)
- Fichier : `message_whatsapp/src/system-config/system-config.controller.ts`

**US 1.3 — Endpoint admin lecture/écriture**
- `GET /api/admin/system-config/restriction` (AdminGuard)
- `PUT /api/admin/system-config/restriction` (AdminGuard)
- Body : `{ enabled, maxUnresponded, minChars, requireLastMine }`

---

### Epic 2 — Backend : tracking des accès conversations

**US 2.1 — Nouvelle entité `CommercialConversationAccess`**

Fichier : `message_whatsapp/src/conversation-restriction/entities/commercial-conversation-access.entity.ts`

```typescript
@Entity('commercial_conversation_access')
export class CommercialConversationAccess {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() commercial_id: string;
  @Column() chat_id: string;

  @Column({ type: 'date' }) access_date: string; // YYYY-MM-DD (clé de journée)

  @Column({ type: 'datetime' }) accessed_at: Date;

  @Column({ type: 'datetime', nullable: true }) responded_at: Date | null;
  @Column({ default: 0 }) response_length: number;

  // Index unique par (commercial_id, chat_id, access_date)
}
```

**US 2.2 — Migration TypeORM**

Fichier : `message_whatsapp/src/migrations/ConversationRestrictionAccess1748649600001.ts`
- Crée la table `commercial_conversation_access`
- Index unique `UQ_cca_commercial_chat_date` sur `(commercial_id, chat_id, access_date)`
- Index sur `(commercial_id, access_date)` pour les requêtes journalières

**US 2.3 — Module + Service `ConversationRestrictionService`**

Fichier : `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts`

Méthodes :
```typescript
// Enregistre ou met à jour l'accès du jour
async recordAccess(commercialId: string, chatId: string): Promise<void>

// Marque la conv comme répondue si textLength >= minChars
async recordResponse(commercialId: string, chatId: string, textLength: number): Promise<boolean>

// Retourne les convs ouvertes aujourd'hui sans réponse valide
async getUnrespondedToday(commercialId: string): Promise<{ chat_id: string; accessed_at: Date }[]>

// Vérifie si la restriction est déclenchée (nb unresponded >= max)
async checkRestriction(commercialId: string): Promise<RestrictionCheckResult>
// { triggered: boolean; unrespondedChatIds: string[]; config: RestrictionConfig }
```

Logique de `recordResponse()` :
- `textLength >= config.minChars` → marque `responded_at = NOW()`, `response_length = textLength`
- Si `requireLastMine = true` → vérifie aussi que `from_me = true` sur le dernier message de la conversation

**US 2.4 — Intégration dans le WebSocket Gateway**

Fichier : `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

Modifications :
1. **Événement `conversation:accessed`** (nouveau, client → serveur) :
   - Déclenché quand la commerciale sélectionne une conversation
   - Appelle `restrictionService.recordAccess(commercialId, chatId)`
   - Appelle `restrictionService.checkRestriction(commercialId)`
   - Émet `restriction:status` en retour avec le résultat

2. **Dans `handleSendMessage()`** : après envoi réussi, appeler :
   - `restrictionService.recordResponse(commercialId, chatId, text.length)`
   - Re-évaluer et émettre `restriction:status` mis à jour

3. **Nouvel événement sortant `restriction:status`** :
   ```typescript
   {
     triggered: boolean;
     unrespondedCount: number;
     unrespondedConversations: { chat_id: string; last_message: string; accessed_at: string }[];
     config: RestrictionConfig;
   }
   ```

---

### Epic 3 — Frontend : store + modal

**US 3.1 — Charger la config restriction au démarrage**

Fichier : `front/src/lib/api.ts`
- Ajouter `getRestrictionConfig(): Promise<RestrictionConfig>`

Fichier : `front/src/store/chatStore.ts`
- Ajouter état : `restrictionConfig: RestrictionConfig | null`
- Charger depuis l'API au moment de la connexion socket

**US 3.2 — Étendre le store pour la restriction**

Fichier : `front/src/store/chatStore.ts` — nouveaux états :
```typescript
restrictionTriggered: boolean;           // modal à afficher ?
restrictionUnresponded: {                // convs à répondre
  chat_id: string;
  last_message: string;
  accessed_at: string;
}[];
```

Modifier `selectConversation(chatId)` :
1. Émettre l'événement socket `conversation:accessed` avec `{ chat_id: chatId }`
2. **Ne pas sélectionner immédiatement** — attendre la réponse `restriction:status`
3. Si `triggered = true` → `restrictionTriggered = true`, sélection bloquée
4. Si `triggered = false` → procéder à la sélection normalement

Gérer l'événement entrant `restriction:status` :
- Mettre à jour `restrictionTriggered` et `restrictionUnresponded`
- Si la restriction vient d'être levée (triggered → false), compléter la sélection de conversation pendante

**US 3.3 — Nouveau composant `ConversationRestrictionModal.tsx`**

Fichier : `front/src/components/ConversationRestrictionModal.tsx`

Comportement :
- Affiché quand `restrictionTriggered = true`
- Non-fermable via Echap ou clic en dehors (bloquant)
- Affiche la liste des conversations non-répondues avec :
  - Nom du contact / numéro
  - Dernier message du client
  - Heure d'ouverture
- Cliquer sur une conversation → la sélectionne directement (bypass de la restriction pour aller répondre)
- Une fois toutes répondues → fermeture automatique

Design inspiré de `ReadCooldownModal.tsx` (pattern existant).

**US 3.4 — Intégration du modal dans la page principale**

Fichier : `front/src/app/whatsapp/page.tsx`
- Importer et placer `<ConversationRestrictionModal>` dans le rendu
- Contrôlé par `restrictionTriggered` du store

**US 3.5 — Indicateur visuel dans `ChatInput`**

Fichier : `front/src/components/chat/ChatInput.tsx`
- Si `restrictionConfig` existe et que la conversation courante est dans la liste `restrictionUnresponded` :
  - Afficher un compteur de caractères sous l'input
  - Couleur rouge si `text.length < minChars`, vert sinon
  - Pas de blocage à l'envoi (la validation est côté restriction, pas à l'envoi)

---

### Epic 4 — Admin UI : panneau configuration restriction

**US 4.1 — Page settings admin — section "Restriction lectures"**

Fichier : `admin/src/app/dashboard/settings/page.tsx` (ou page de config existante)

Formulaire avec :
```
[x] Activer la restriction de lecture

Nombre de conversations non-répondues avant blocage : [1]
Nombre minimum de caractères par réponse : [50]
[x] La dernière réponse doit venir de la commerciale
```

Bouton "Enregistrer" → `PUT /api/admin/system-config/restriction`

**US 4.2 — Appels API admin**

Fichier : `admin/src/app/lib/api.ts`
- `getRestrictionConfig()` → `GET /api/admin/system-config/restriction`
- `updateRestrictionConfig(config)` → `PUT /api/admin/system-config/restriction`

Fichier : `admin/src/app/lib/definitions.ts`
- Ajouter `interface RestrictionConfig`

---

## 4. Ordre d'implémentation recommandé

```
Étape 1 (Backend fondation)
  US 2.1 → entité CommercialConversationAccess
  US 2.2 → migration SQL
  US 1.1 → SystemConfig keys + getRestrictionConfig()
  US 2.3 → ConversationRestrictionService (module complet)

Étape 2 (Backend exposition)
  US 1.2 → endpoint GET /api/system-config/restriction
  US 1.3 → endpoints admin GET/PUT
  US 2.4 → intégration gateway (conversation:accessed + restriction:status)

Étape 3 (Frontend)
  US 3.1 → api.ts getRestrictionConfig()
  US 3.2 → store chatStore.ts (état + logique)
  US 3.3 → ConversationRestrictionModal.tsx
  US 3.4 → intégration page.tsx
  US 3.5 → indicateur ChatInput.tsx

Étape 4 (Admin)
  US 4.1 → UI settings
  US 4.2 → api.ts + definitions.ts admin
```

---

## 5. Contrats de données

### DTO `RestrictionConfig`

```typescript
export class RestrictionConfig {
  enabled: boolean;
  maxUnrespondedConvs: number;   // default: 1
  minResponseChars: number;      // default: 50
  requireLastMessageMine: boolean; // default: false
}
```

### Événement WebSocket `conversation:accessed` (client → serveur)

```typescript
{ chat_id: string }
```

### Événement WebSocket `restriction:status` (serveur → client)

```typescript
{
  triggered: boolean;
  unrespondedCount: number;
  unrespondedConversations: Array<{
    chat_id: string;
    contact_name: string;
    last_client_message: string;       // dernier message du client
    accessed_at: string;               // ISO string
  }>;
  config: RestrictionConfig;
}
```

---

## 6. Règles métier détaillées

1. **Scope journalier** : la restriction ne porte que sur les accès du jour courant (minuit–minuit). Un accès de J-1 n'est pas comptabilisé.

2. **Déclenchement du modal** : si `nbConversationsOuvertesSansRéponse >= maxUnrespondedConvs`, le modal apparaît AVANT que la nouvelle conversation se charge.

3. **Validation d'une réponse** :
   - `message.text.trim().length >= minResponseChars`
   - ET si `requireLastMessageMine = true` : après envoi, le dernier message `from_me = true` en base
   - Un message de moins de `minChars` reste envoyé normalement mais ne décompte pas la restriction

4. **Re-ouverture de la même conversation** : si la commerciale clique à nouveau sur une conversation déjà dans sa liste `unresponded`, pas de doublon en base (index UNIQUE).

5. **Restriction désactivée** (`RESTRICTION_ENABLED = false`) : `selectConversation()` bypasse entièrement la vérification.

6. **Canal dédié** : les commerciales sur un poste avec canal dédié sont soumises à la même restriction (pas d'exception).

---

## 7. Migration SQL complète

```sql
CREATE TABLE commercial_conversation_access (
  id            VARCHAR(36) NOT NULL PRIMARY KEY,
  commercial_id VARCHAR(36) NOT NULL,
  chat_id       VARCHAR(255) NOT NULL,
  access_date   DATE NOT NULL,
  accessed_at   DATETIME NOT NULL,
  responded_at  DATETIME NULL,
  response_length INT NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY UQ_cca_commercial_chat_date (commercial_id, chat_id, access_date),
  KEY IDX_cca_commercial_date (commercial_id, access_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 8. Fichiers à créer / modifier

### Nouveaux fichiers

| Fichier | Description |
|---|---|
| `message_whatsapp/src/conversation-restriction/conversation-restriction.module.ts` | Module NestJS |
| `message_whatsapp/src/conversation-restriction/conversation-restriction.service.ts` | Service métier |
| `message_whatsapp/src/conversation-restriction/entities/commercial-conversation-access.entity.ts` | Entité TypeORM |
| `message_whatsapp/src/conversation-restriction/dto/restriction-config.dto.ts` | DTO config |
| `message_whatsapp/src/migrations/ConversationRestrictionAccess1748649600001.ts` | Migration SQL |
| `front/src/components/ConversationRestrictionModal.tsx` | Modal de blocage |

### Fichiers modifiés

| Fichier | Modification |
|---|---|
| `message_whatsapp/src/system-config/system-config.service.ts` | Ajouter clés + `getRestrictionConfig()` |
| `message_whatsapp/src/system-config/system-config.controller.ts` | Ajouter endpoints restriction |
| `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts` | Ajouter `conversation:accessed` + `restriction:status` |
| `message_whatsapp/src/app.module.ts` | Importer `ConversationRestrictionModule` |
| `front/src/store/chatStore.ts` | Nouveaux états + logique restriction |
| `front/src/app/whatsapp/page.tsx` | Intégrer `<ConversationRestrictionModal>` |
| `front/src/components/chat/ChatInput.tsx` | Compteur de caractères |
| `front/src/lib/api.ts` | Ajouter `getRestrictionConfig()` |
| `admin/src/app/lib/definitions.ts` | Ajouter `RestrictionConfig` type |
| `admin/src/app/lib/api.ts` | Ajouter appels config restriction |
| `admin/src/app/dashboard/settings/page.tsx` | Section UI restriction |

---

## 9. Estimations

| Epic | Effort estimé |
|---|---|
| Epic 1 — Config backend | 1h |
| Epic 2 — Backend tracking | 3h |
| Epic 3 — Frontend | 3h |
| Epic 4 — Admin UI | 1h |
| **Total** | **~8h** |
