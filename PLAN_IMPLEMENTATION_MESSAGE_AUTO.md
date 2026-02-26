# Plan d'implémentation — Messages Automatiques
**Date** : 2026-02-26
**Branche cible** : `inification` → PR vers `master`

---

## OBJECTIFS

1. **Brancher** l'orchestrateur existant dans le flux inbound (dead code → vivant)
2. **Corriger** les bugs identifiés dans l'audit
3. **Ajouter** le contrôle admin granulaire :
   - Activation/désactivation globale
   - Activation/désactivation par poste
   - Activation/désactivation par canal
   - Activation/désactivation par provider
   - Activation/désactivation d'un message individuel (déjà `actif`, juste pas branché)
   - Configuration des délais (global + par message)

---

## ÉTAT ACTUEL (rappel rapide)

```
InboundMessageService.handleMessages()
  → DispatcherService.assignConversation()
  ❌ [TROU] AutoMessageOrchestrator jamais appelé

AutoMessageOrchestrator.handleClientMessage()  ← code complet mais dead
  → MessageAutoService.sendAutoMessage()        ← code complet mais dead

MessageAuto.actif  ← jamais filtré dans getAutoMessageByPosition()
MessageAuto.delai  ← jamais lu dans l'orchestrateur
Délai dans l'orchestrateur : hardcodé, calcul flou
```

---

## PHASE 1 — CORRECTIONS DE BUG CRITIQUES

### 1.1 Brancher `AutoMessageOrchestrator` dans le flux inbound

**Problème** : `handleClientMessage()` n'est jamais appelé.

**Fichiers à modifier** :
- `src/webhooks/inbound-message.service.ts`

**Où injecter** : Après `dispatcherService.assignConversation()` ou équivalent, lorsqu'un message client entrant est traité sur un chat déjà assigné.

**Logique d'appel** :
```typescript
// Dans InboundMessageService, après traitement du message entrant client :
//   - seulement si l'expéditeur est le client (pas un agent)
//   - seulement si le chat est ACTIF ou EN_ATTENTE
//   - seulement si last_poste_message_at est null (agent jamais répondu)

if (isClientMessage && !chat.last_poste_message_at) {
  void this.autoMessageOrchestrator.handleClientMessage(freshChat);
}
```

**À faire** :
- [ ] Lire `src/webhooks/inbound-message.service.ts` en entier
- [ ] Identifier le point d'appel exact (post-dispatch ou post-save du message)
- [ ] Injecter `AutoMessageOrchestrator` dans ce service
- [ ] Ajouter l'appel conditionnel
- [ ] Exporter `AutoMessageOrchestrator` depuis `WhapiModule` si nécessaire

---

### 1.2 Corriger `getAutoMessageByPosition()` — filtre `actif`

**Problème** : Le champ `actif` existe mais n'est pas utilisé dans la requête.

**Fichier** : `src/message-auto/message-auto.service.ts`

**Avant** :
```typescript
const messages = await this.autoMessageRepo.find({
  where: { position },
});
```

**Après** :
```typescript
const messages = await this.autoMessageRepo.find({
  where: { position, actif: true },
});
```

---

### 1.3 Corriger le calcul du délai dans l'orchestrateur

**Problème** : `(20-45) * 10` = 200-450 ms — trop rapide pour simuler un humain.

**Fichier** : `src/message-auto/auto-message-orchestrator.service.ts`

**Intention probable** : 20 à 45 secondes de délai humain.

**Avant** :
```typescript
const delay = Math.floor(Math.random() * (45 - 20 + 1) + 20) * 10;
```

**Après (temporaire, avant implémentation complète Phase 2)** :
```typescript
// Délai humain entre 20s et 45s
const delaySeconds = Math.floor(Math.random() * (45 - 20 + 1) + 20);
const delay = delaySeconds * 1000;
```

> Note : Ce délai deviendra configurable en Phase 2.

---

### 1.4 Corriger le verrou DB commenté dans l'orchestrateur

**Problème** : La double sécurité DB (idempotence) est commentée.

**Fichier** : `src/message-auto/auto-message-orchestrator.service.ts`

**Dans `executeAutoMessage()`**, décommenter et valider :
```typescript
// 🔐 Double sécurité DB : si un auto message a déjà été envoyé
// après le dernier message client → ne pas renvoyer
if (lastAuto && lastClient && lastAuto >= lastClient) {
  this.logger.debug(
    `Auto message already sent after last client message, skipping`,
    AutoMessageOrchestrator.name,
  );
  return;
}
```

---

## PHASE 2 — NOUVEAUX PARAMÈTRES ADMIN

### 2.1 Nouvelles colonnes dans `DispatchSettings`

**Fichier** : `src/dispatcher/entities/dispatch-settings.entity.ts`

Ajouter les champs suivants :

```typescript
// Activation globale des messages auto
@Column({ name: 'auto_message_enabled', type: 'boolean', default: false })
auto_message_enabled: boolean;

// Délai minimum avant envoi (en secondes)
@Column({ name: 'auto_message_delay_min_seconds', type: 'int', default: 20 })
auto_message_delay_min_seconds: number;

// Délai maximum avant envoi (en secondes)
@Column({ name: 'auto_message_delay_max_seconds', type: 'int', default: 45 })
auto_message_delay_max_seconds: number;

// Nombre max d'étapes auto (après quoi le chat passe read_only)
@Column({ name: 'auto_message_max_steps', type: 'int', default: 3 })
auto_message_max_steps: number;
```

**DEFAULTS à mettre à jour dans `dispatch-settings.service.ts`** :
```typescript
const DEFAULTS = {
  // ... existants
  auto_message_enabled: false,           // Désactivé par défaut (sécurité)
  auto_message_delay_min_seconds: 20,
  auto_message_delay_max_seconds: 45,
  auto_message_max_steps: 3,
};
```

**Migration à créer** :
```sql
-- Migration: add_auto_message_settings_to_dispatch_settings
ALTER TABLE dispatch_settings
  ADD COLUMN auto_message_enabled TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN auto_message_delay_min_seconds INT NOT NULL DEFAULT 20,
  ADD COLUMN auto_message_delay_max_seconds INT NOT NULL DEFAULT 45,
  ADD COLUMN auto_message_max_steps INT NOT NULL DEFAULT 3;
```

---

### 2.2 Nouvelle entité — `AutoMessageScopeConfig`

Permet d'activer/désactiver les messages auto par **poste**, **canal** ou **provider**.

**Nouveau fichier** : `src/message-auto/entities/auto-message-scope-config.entity.ts`

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AutoMessageScopeType {
  POSTE = 'poste',
  CANAL = 'canal',
  PROVIDER = 'provider',
}

@Entity('auto_message_scope_config')
@Index('UQ_auto_message_scope', ['scope_type', 'scope_id'], { unique: true })
export class AutoMessageScopeConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'scope_type',
    type: 'enum',
    enum: AutoMessageScopeType,
    nullable: false,
  })
  scope_type: AutoMessageScopeType;

  // ID du poste, du canal ou du provider concerné
  @Column({ name: 'scope_id', type: 'varchar', length: 100, nullable: false })
  scope_id: string;

  // Label lisible pour l'affichage admin (nom du poste, du canal...)
  @Column({ name: 'label', type: 'varchar', length: 200, nullable: true })
  label?: string | null;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

**Migration à créer** :
```sql
-- Migration: create_auto_message_scope_config
CREATE TABLE auto_message_scope_config (
  id CHAR(36) NOT NULL,
  scope_type ENUM('poste', 'canal', 'provider') NOT NULL,
  scope_id VARCHAR(100) NOT NULL,
  label VARCHAR(200) NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY UQ_auto_message_scope (scope_type, scope_id)
) ENGINE=InnoDB ROW_FORMAT=DYNAMIC;
```

---

### 2.3 Service `AutoMessageScopeConfigService`

**Nouveau fichier** : `src/message-auto/auto-message-scope-config.service.ts`

**Méthodes** :

```typescript
@Injectable()
export class AutoMessageScopeConfigService {

  // Récupérer tous les overrides
  findAll(): Promise<AutoMessageScopeConfig[]>

  // Récupérer par type (poste, canal, provider)
  findByType(type: AutoMessageScopeType): Promise<AutoMessageScopeConfig[]>

  // Créer ou mettre à jour un override (upsert)
  upsert(dto: UpsertAutoMessageScopeDto): Promise<AutoMessageScopeConfig>

  // Supprimer un override (retour au comportement global)
  remove(id: string): Promise<void>

  // Vérifier si les messages auto sont activés pour un contexte donné
  // Retourne true si aucun override ne désactive
  isEnabledFor(posteId?: string, channelId?: string, providerId?: string): Promise<boolean>
}
```

**Logique de `isEnabledFor()`** :
```
1. Charger les overrides pour les 3 scopes (poste, canal, provider)
2. Si override poste existe et enabled=false → retourner false
3. Si override canal existe et enabled=false → retourner false
4. Si override provider existe et enabled=false → retourner false
5. Sinon retourner true (pas de restriction)
```

---

### 2.4 DTOs pour `AutoMessageScopeConfig`

**Nouveau fichier** : `src/message-auto/dto/upsert-auto-message-scope.dto.ts`

```typescript
export class UpsertAutoMessageScopeDto {
  @IsEnum(AutoMessageScopeType)
  scope_type: AutoMessageScopeType;

  @IsString()
  scope_id: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsBoolean()
  enabled: boolean;
}
```

---

### 2.5 Nouveaux endpoints dans `MessageAutoController`

Ajouter à `src/message-auto/message-auto.controller.ts` :

```typescript
// --- Scope Config ---
@Get('scope-config')
findAllScopeConfig()                          // GET /message-auto/scope-config

@Get('scope-config/:type')
findScopeConfigByType(type: AutoMessageScopeType)  // GET /message-auto/scope-config/poste

@Post('scope-config')
upsertScopeConfig(dto: UpsertAutoMessageScopeDto)  // POST /message-auto/scope-config

@Delete('scope-config/:id')
removeScopeConfig(id: string)                 // DELETE /message-auto/scope-config/:id
```

**Tous protégés par `@UseGuards(AdminGuard)`** ✅

---

### 2.6 Utiliser `MessageAuto.delai` dans l'orchestrateur

Le champ `delai` sur chaque `MessageAuto` permet de surcharger le délai global.

**Logique mise à jour dans `AutoMessageOrchestrator`** :

```typescript
async handleClientMessage(chat: WhatsappChat) {
  // ... vérifications existantes ...

  // 1. Vérifier activation globale
  const settings = await this.dispatchSettingsService.getSettings();
  if (!settings.auto_message_enabled) return;

  // 2. Vérifier max steps (configurable)
  if (chat.auto_message_step >= settings.auto_message_max_steps) {
    if (!chat.read_only) {
      await this.chatService.update(chatId, { read_only: true });
    }
    return;
  }

  // 3. Vérifier activation par scope
  const scopeEnabled = await this.scopeConfigService.isEnabledFor(
    chat.poste_id,
    chat.last_msg_client_channel_id,
    chat.channel?.provider_channel_id,  // provider
  );
  if (!scopeEnabled) return;

  // 4. Vérrou mémoire
  if (this.locks.has(chatId)) return;
  this.locks.add(chatId);

  // 5. Délai : utiliser le delai du prochain message si défini, sinon settings global
  const nextStep = chat.auto_message_step + 1;
  const nextMessage = await this.messageAutoService.getAutoMessageByPosition(nextStep);

  const delaySeconds = (nextMessage?.delai && nextMessage.delai > 0)
    ? nextMessage.delai
    : this.randomBetween(
        settings.auto_message_delay_min_seconds,
        settings.auto_message_delay_max_seconds,
      );

  const delayMs = delaySeconds * 1000;

  const timeout = setTimeout(() => {
    void this.executeAutoMessage(chatId)
      .catch(...)
      .finally(() => {
        this.locks.delete(chatId);
        this.pendingTimeouts.delete(chatId);
      });
  }, delayMs);

  this.pendingTimeouts.set(chatId, timeout);
}

private randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
```

**Injections supplémentaires à ajouter dans l'orchestrateur** :
- `DispatchSettingsService`
- `AutoMessageScopeConfigService`

---

## PHASE 3 — MISE À JOUR DES MODULES

### 3.1 `MessageAutoModule`

Ajouter :
- `AutoMessageScopeConfig` dans `TypeOrmModule.forFeature([])`
- `AutoMessageOrchestrator` dans les `providers`
- `AutoMessageScopeConfigService` dans les `providers`
- Exporter `AutoMessageOrchestrator` et `AutoMessageScopeConfigService`

### 3.2 `WhapiModule`

- Importer `DispatchSettingsService` (déjà exporté depuis `DispatcherModule`) ✅
- S'assurer que `AutoMessageScopeConfigService` est disponible (via import `MessageAutoModule` ou re-déclaré)
- Injecter `AutoMessageOrchestrator` dans `InboundMessageService`

### 3.3 `DispatcherModule`

- Ajouter les nouvelles colonnes aux validations de `updateSettings()`
- Valider que `delay_min < delay_max` et que les deux sont > 0
- Valider que `max_steps` est entre 1 et 10

---

## PHASE 4 — VALIDATION ET DTO

### 4.1 Valider `conditions` dans `CreateMessageAutoDto`

**Avant** :
```typescript
@IsOptional()
conditions?: any;
```

**Après** :
```typescript
@IsOptional()
@IsObject()
@ValidateNested()
@Type(() => MessageAutoConditionsDto)
conditions?: MessageAutoConditionsDto;
```

**Nouveau DTO** :
```typescript
export class MessageAutoConditionsDto {
  @IsOptional()
  @IsUUID()
  poste_id?: string;

  @IsOptional()
  @IsString()
  channel_id?: string;

  @IsOptional()
  @IsString()
  client_type?: string;
}
```

### 4.2 Valider les nouveaux champs dans `UpdateDispatchSettingsDto`

```typescript
@IsOptional()
@IsBoolean()
auto_message_enabled?: boolean;

@IsOptional()
@IsInt()
@Min(1)
@Max(3600)
auto_message_delay_min_seconds?: number;

@IsOptional()
@IsInt()
@Min(1)
@Max(3600)
auto_message_delay_max_seconds?: number;

@IsOptional()
@IsInt()
@Min(1)
@Max(10)
auto_message_max_steps?: number;
```

**+ Validation cross-champs** dans `DispatchSettingsService.updateSettings()` :
```typescript
if (patch.auto_message_delay_min_seconds !== undefined
    && patch.auto_message_delay_max_seconds !== undefined) {
  if (patch.auto_message_delay_min_seconds >= patch.auto_message_delay_max_seconds) {
    throw new BadRequestException('delay_min doit être < delay_max');
  }
}
```

---

## PHASE 5 — MIGRATIONS TYPEORM

Ordre d'exécution des migrations :

| # | Nom | Description |
|---|-----|-------------|
| 1 | `AddAutoMessageColumnsToDispatchSettings` | 4 nouvelles colonnes dans `dispatch_settings` |
| 2 | `CreateAutoMessageScopeConfig` | Nouvelle table `auto_message_scope_config` |

**Convention de nommage** : `{timestamp}_{NomDeLaMigration}.ts` dans `src/migrations/`

---

## RÉCAPITULATIF DES FICHIERS À CRÉER / MODIFIER

### Nouveaux fichiers

| Fichier | Description |
|---------|-------------|
| `src/message-auto/entities/auto-message-scope-config.entity.ts` | Entité scope config |
| `src/message-auto/auto-message-scope-config.service.ts` | Service scope config |
| `src/message-auto/dto/upsert-auto-message-scope.dto.ts` | DTO upsert |
| `src/migrations/{ts}_AddAutoMessageColumnsToDispatchSettings.ts` | Migration 1 |
| `src/migrations/{ts}_CreateAutoMessageScopeConfig.ts` | Migration 2 |

### Fichiers à modifier

| Fichier | Modifications |
|---------|---------------|
| `src/message-auto/message-auto.service.ts` | Fix `getAutoMessageByPosition()` → filtre `actif: true` |
| `src/message-auto/auto-message-orchestrator.service.ts` | Délai corrigé, vérif settings, vérif scopes, délai par message |
| `src/message-auto/message-auto.module.ts` | Ajouter `AutoMessageOrchestrator`, `AutoMessageScopeConfigService`, entité scope |
| `src/message-auto/message-auto.controller.ts` | Ajouter endpoints scope config |
| `src/message-auto/dto/create-message-auto.dto.ts` | Valider `conditions` avec DTO typé |
| `src/dispatcher/entities/dispatch-settings.entity.ts` | 4 nouvelles colonnes |
| `src/dispatcher/services/dispatch-settings.service.ts` | Nouveaux DEFAULTS, nouvelles validations |
| `src/webhooks/inbound-message.service.ts` | Injecter orchestrateur + appel conditionnel |
| `src/whapi/whapi.module.ts` | Vérifier exports/imports cohérents |

---

## ORDRE D'IMPLÉMENTATION (séquentiel)

```
Étape 1 ── Migrations BDD (entités + colonnes)
    ↓
Étape 2 ── Entité AutoMessageScopeConfig + service + DTO
    ↓
Étape 3 ── Mise à jour DispatchSettings (entité + service + validation)
    ↓
Étape 4 ── Fix MessageAutoService (filtre actif)
    ↓
Étape 5 ── Mise à jour AutoMessageOrchestrator (délai + checks settings + scope)
    ↓
Étape 6 ── Branchement dans InboundMessageService (point d'entrée)
    ↓
Étape 7 ── Mise à jour des modules (MessageAutoModule, WhapiModule)
    ↓
Étape 8 ── Nouveaux endpoints dans MessageAutoController
    ↓
Étape 9 ── Validation DTOs
    ↓
Étape 10 ─ Tests manuels end-to-end
```

---

## SCHÉMA DU FLUX FINAL

```
Client envoie message
        ↓
Webhook (Whapi ou Meta)
        ↓
UnifiedIngressService.ingest()
        ↓
InboundMessageService.handleMessages()
        ↓
DispatcherService.assignConversation()
        ↓
[NOUVEAU] AutoMessageOrchestrator.handleClientMessage(chat)
        │
        ├─ ✅ Check: settings.auto_message_enabled ?
        ├─ ✅ Check: chat.auto_message_step < settings.max_steps ?
        ├─ ✅ Check: scopeConfig.isEnabledFor(poste, canal, provider) ?
        ├─ ✅ Check: verrou mémoire (anti-doublon) ?
        │
        └─ setTimeout(delay) — delay = message.delai OU random(min, max)
                ↓
        AutoMessageOrchestrator.executeAutoMessage(chatId)
                │
                ├─ ✅ Recheck BDD (idempotence)
                ├─ ✅ getAutoMessageByPosition(step+1) WHERE actif=true
                │
                └─ MessageAutoService.sendAutoMessage(chatId, step)
                        │
                        ├─ Format message (#name#, #numero#)
                        ├─ createAgentMessage()
                        ├─ gateway.notifyNewMessage()
                        └─ Update chat (step++, waiting_client_reply=true)
```

---

## FONCTIONNALITÉS ADMIN RÉSULTANTES

| Fonctionnalité | Mécanisme | Endpoint |
|----------------|-----------|----------|
| Activer/désactiver globalement | `dispatch_settings.auto_message_enabled` | `POST /queue/dispatch/settings` |
| Désactiver pour un poste | `auto_message_scope_config` (scope_type=poste) | `POST /message-auto/scope-config` |
| Désactiver pour un canal | `auto_message_scope_config` (scope_type=canal) | `POST /message-auto/scope-config` |
| Désactiver pour un provider | `auto_message_scope_config` (scope_type=provider) | `POST /message-auto/scope-config` |
| Activer/désactiver un message | `message_auto.actif` | `PATCH /message-auto/:id` |
| Configurer délai global (min/max) | `dispatch_settings.auto_message_delay_*` | `POST /queue/dispatch/settings` |
| Configurer délai par message | `message_auto.delai` | `PATCH /message-auto/:id` |
| Configurer nb max d'étapes | `dispatch_settings.auto_message_max_steps` | `POST /queue/dispatch/settings` |

---

## POINTS D'ATTENTION

### Sécurité
- L'activation globale est `false` par défaut → pas de risque d'envois non voulus après déploiement
- Toutes les routes admin sont protégées par `AdminGuard`
- Le verrou mémoire (`Set<string>`) reste en place pour l'anti-doublon webhook

### Performance
- `isEnabledFor()` charge max 3 lignes de BDD — requête légère, pas de cache nécessaire
- Le `setTimeout()` est non-bloquant — pas d'impact sur le thread principal
- Les locks mémoire sont nettoyés dans le `finally()` de chaque timeout

### Robustesse
- Si `DispatchSettingsService` échoue au chargement → l'orchestrateur doit avoir un fallback `enabled=false`
- Si `sendAutoMessage()` échoue → le lock doit être libéré (déjà géré par `finally()`)
- Si le serveur redémarre → les timeouts `pendingTimeouts` sont perdus (acceptable, le prochain message client relancera la séquence)

### Ordre des vérifications (performance)
```
1. Verrou mémoire      ← rapide, en mémoire
2. Check global        ← 1 requête BDD (cacheable)
3. Check max steps     ← déjà dans chat (pas de requête)
4. Check scopes        ← 1-3 requêtes BDD max
5. Récupérer délai     ← inclus dans la requête du prochain message
```

---

## HORS SCOPE (évolutions futures)

Ces fonctionnalités sont documentées dans `AUDIT_MESSAGES_AUTO_CRON.md` mais ne font pas partie de ce plan :
- Dashboard de suivi temps réel des séquences auto
- A/B testing des variantes de messages
- Historique des exécutions cron
- Notifications en cas d'échec job
- Cron de nettoyage des `auto_message_step` orphelins
