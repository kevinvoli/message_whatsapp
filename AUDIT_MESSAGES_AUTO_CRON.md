# AUDIT — Messages Automatiques & Tâches CRON
**Date** : 2026-02-26
**Branche** : `inification`
**Périmètre** : `message_whatsapp/src/`

---

## RÉSUMÉ EXÉCUTIF

L'infrastructure messages automatiques et crons est **partiellement fonctionnelle**. Les jobs de dispatch (SLA, read-only, offline reinject) sont opérationnels. En revanche, **le cœur de la fonctionnalité "message auto" est codé mais jamais branché** : `AutoMessageOrchestrator.handleClientMessage()` n'est appelé nulle part.

| Catégorie | État |
|-----------|------|
| Messages auto CRUD (admin) | ✅ Fonctionnel |
| Envoi automatique de messages | ❌ Point d'entrée manquant |
| Cron purge idempotency (3h) | ✅ Fonctionnel |
| SLA timeout par poste (5 min) | ✅ Fonctionnel |
| Offline reinject (9h) | ✅ Fonctionnel |
| Read-only enforcement (10 min) | ✅ Fonctionnel |
| Gestion dynamique des settings cron | ✅ Fonctionnel |

---

## 1. MESSAGES AUTOMATIQUES

### 1.1 Entité `MessageAuto`

**Fichier** : `src/message-auto/entities/message-auto.entity.ts`
**Table SQL** : `messages_predefinis`

```typescript
@Entity({ name: 'messages_predefinis', engine: 'InnoDB ROW_FORMAT=DYNAMIC' })
export class MessageAuto {
  id: string;           // UUID
  body: string;         // Contenu du message
  delai?: number;       // ⚠️ Jamais utilisé
  canal?: AutoMessageChannel; // ⚠️ Jamais exploité ('whatsapp' par défaut)
  position: number;     // Position dans la séquence (1, 2, 3...)
  actif: boolean;       // Message activé ou non
  conditions?: { poste_id?, channel_id?, client_type? }; // ⚠️ Non validé
  createdAt: Date;
  updatedAt: Date;
}
```

**Points à noter** :
- Convention camelCase ✅ conforme aux phases d'uniformisation
- Pas de soft delete (`deletedAt` absent)
- `delai` et `canal` définis mais jamais lus dans le code
- `conditions` est un JSON libre sans validation (type `any`)

---

### 1.2 Service `MessageAutoService`

**Fichier** : `src/message-auto/message-auto.service.ts`

**Méthodes disponibles** :

| Méthode | État | Description |
|---------|------|-------------|
| `create()` | ✅ | Création d'un message auto |
| `findAll()` | ✅ | Liste tous les messages |
| `findOne(id)` | ✅ | Récupère par ID |
| `update(id, dto)` | ✅ | Modification |
| `remove(id)` | ✅ | Suppression |
| `getAutoMessageByPosition(position)` | ✅ | Récupère par position (random si plusieurs) |
| `sendAutoMessage(chatId, position)` | ✅ code / ❌ jamais appelé | Envoie le message |

**Logique de `sendAutoMessage()`** :
1. Récupère le chat (vérifie poste et channel)
2. Marque `read_only = true`, `auto_message_status = 'sending'`
3. Formate le texte avec `#name#` et `#numero#`
4. Crée le message via `messageService.createAgentMessage()`
5. Notifie via gateway WebSocket
6. Passe `auto_message_status = 'sent'`

**Problèmes** :
- `sendAutoMessage()` n'est appelé que depuis `AutoMessageOrchestrator`, lui-même jamais déclenché
- `normalizeClientName()` supprime les titres (Mr, Mme...) — peut supprimer trop
- Pas de gestion d'erreur si la création du message échoue

---

### 1.3 `AutoMessageOrchestrator` — **DEAD CODE**

**Fichier** : `src/message-auto/auto-message-orchestrator.service.ts`

**Status** : ✅ Code complet | ❌ **JAMAIS APPELÉ**

**Logique implémentée** :
```
handleClientMessage(chat)
  ├── Anti-double via locks en mémoire (Map)
  ├── Si auto_message_step >= 3 → read_only = true, stop
  ├── Délai humain simulé : 20-45 * 10 ms
  └── setTimeout → executeAutoMessage()
           ├── Re-vérifie les conditions
           ├── Appelle MessageAutoService.sendAutoMessage()
           └── Incrémente auto_message_step
```

**Verrous** : `this.locks` (Map) + `this.pendingTimeouts` (Map) — bien pensé

**BUG potentiel** : délai calculé comme `(20-45) * 10` — l'intention est probablement **secondes** (200-450 s = 3-7 min) mais doit être vérifiée.

**PROBLÈME CRITIQUE** : `handleClientMessage()` n'est injecté ni appelé depuis aucun service. Il faudrait l'appeler dans la chaîne de traitement des messages entrants clients.

---

### 1.4 Controller `MessageAutoController`

**Fichier** : `src/message-auto/message-auto.controller.ts`
**Guard** : `@UseGuards(AdminGuard)` ✅

| Route | Méthode | Description |
|-------|---------|-------------|
| `POST /message-auto` | `create()` | Créer un message auto |
| `GET /message-auto` | `findAll()` | Lister tous |
| `GET /message-auto/:id` | `findOne()` | Détail |
| `PATCH /message-auto/:id` | `update()` | Modifier |
| `DELETE /message-auto/:id` | `remove()` | Supprimer |

**État** : ✅ CRUD admin fonctionnel

---

### 1.5 Flux souhaité (actuel vs. cible)

```
REÇU
  Client envoie message
        ↓
  Webhook (Whapi ou Meta)
        ↓
  UnifiedIngressService.ingestWhapi/ingestMeta()
        ↓
  InboundMessageService.handleMessages()
        ↓
  DispatcherService.assignConversation()
        ↓
  ❌ [MANQUANT] AutoMessageOrchestrator.handleClientMessage(chat)
        ↓
  setTimeout (délai humain 3-7 min)
        ↓
  AutoMessageOrchestrator.executeAutoMessage()
        ↓
  MessageAutoService.sendAutoMessage()
        ↓
  Gateway → notifie frontend
```

**Seule l'étape manquante empêche l'ensemble de fonctionner.**

---

## 2. TÂCHES CRON

### 2.1 Configuration globale

**Fichier** : `src/app.module.ts`

```typescript
@Module({
  imports: [
    ScheduleModule.forRoot(),  // ✅ Activé
  ],
  providers: [AppService, TasksService],
})
```

**État** : ✅ Module activé

---

### 2.2 `TasksService` — Placeholder vide

**Fichier** : `src/jorbs/tasks.service.ts`

```typescript
@Injectable()
export class TasksService {
  // @Cron(CronExpression.EVERY_10_SECONDS)  // commenté
  // @Cron(CronExpression.EVERY_MINUTE)      // commenté
  // @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT) // commenté
}
```

**État** : ❌ Vide — tous les crons commentés. À utiliser ou supprimer.

---

### 2.3 `WebhookIdempotencyPurgeService` ✅

**Fichier** : `src/whapi/webhook-idempotency-purge.service.ts`

```typescript
@Cron('0 3 * * *')   // Tous les jours à 3h du matin
async purgeOldEvents(): Promise<void> {
  const ttlDays = parseInt(process.env.WEBHOOK_IDEMPOTENCY_TTL_DAYS) || 14;
  const cutoff = new Date(Date.now() - ttlDays * 86400000);
  const result = await this.webhookEventRepository.delete({ createdAt: LessThan(cutoff) });
  this.metricsService.recordIdempotencyPurge(result.affected);
}
```

**État** : ✅ Actif
**Configurable via** : `WEBHOOK_IDEMPOTENCY_TTL_DAYS` (défaut 14 jours)

---

### 2.4 `DispatchSettingsService` — Gestion dynamique des crons ✅

**Fichier** : `src/dispatcher/services/dispatch-settings.service.ts`

Orchestrateur central qui :
1. À `onModuleInit()` : charge les settings depuis BDD, reschédule tout
2. À chaque `updateSettings()` : valide le cron, sauvegarde, reschédule, crée un audit

**Jobs gérés** :

| Nom | Type | Fréquence par défaut | Job associé |
|-----|------|----------------------|-------------|
| `read-only-enforcement` | Interval | 10 minutes | `ReadOnlyEnforcementJob.enforce24h()` |
| `offline-reinject` | Cron | `0 9 * * *` (9h) | `OfflineReinjectionJob.offlineReinject()` |
| SLA monitor | Interval par poste | 5 minutes | `FirstResponseTimeoutJob` |

**Validation cron** : ✅ Vérifie format (5 ou 6 champs), ranges, et teste `new CronJob()`.

**Audit** : ✅ Table `dispatch_settings_audit` — enregistre before/after de chaque changement.

---

### 2.5 `FirstResponseTimeoutJob` ✅

**Fichier** : `src/jorbs/first-response-timeout.job.ts`

**Architecture** : Un `setInterval` par poste, stocké dans une Map.

```typescript
private agentSlaIntervals = new Map<string, NodeJS.Timeout>();

async startAgentSlaMonitor(posteId: string, intervalMinutes = 5) {
  // Exécution immédiate + interval
  runCheck();
  const interval = setInterval(runCheck, intervalMs);
  this.agentSlaIntervals.set(posteId, interval);
}
```

**Cycle de vie** :
- Démarré par : `WhatsappMessageGateway.handleAgentConnect()` (WebSocket `agent_connect`)
- Arrêté par : `stopAgentSlaMonitor(posteId)` (déconnexion)
- Refreshé par : `DispatchSettingsService.refreshSlaIntervals(minutes)` (changement de settings)

**État** : ✅ Fonctionnel

**Méthode `testAutoMessage()`** : ❌ Vide (commentée) — à implémenter ou supprimer

---

### 2.6 `OfflineReinjectionJob` ✅

**Fichier** : `src/jorbs/offline-reinjection.job.ts`

**Logique** :
```
Pour chaque chat ACTIF où last_poste_message_at = NULL
  Si le poste assigné est offline (is_active = false)
    → dispatcher.reinjectConversation(chat)  // Ré-assigne à un autre poste
```

**Déclenché par** : Cron `0 9 * * *` via `DispatchSettingsService`

**État** : ✅ Fonctionnel

---

### 2.7 `ReadOnlyEnforcementJob` ✅

**Fichier** : `src/jorbs/read-only-enforcement.job.ts`

**Logique** :
```
Pour chaque chat ACTIF où :
  - read_only = false
  - last_client_message_at < now - 24h
  → chat.read_only = true
  → gateway.emitConversationReadonly(chat)  // Notifie le frontend
```

**Déclenché par** : Interval 10 min via `DispatchSettingsService`

**État** : ✅ Fonctionnel

---

## 3. ENDPOINTS ADMIN — DISPATCH SETTINGS

**Fichier** : `src/dispatcher/dispatcher.controller.ts`
**Guard** : `@UseGuards(AdminGuard)` ✅

| Route | Description |
|-------|-------------|
| `GET /queue` | Liste la queue |
| `POST /queue/reset` | Reset complète la queue |
| `POST /queue/block/:posteId` | Bloque un poste |
| `POST /queue/unblock/:posteId` | Débloque un poste |
| `GET /queue/dispatch` | Snapshot queue + waiting |
| `GET /queue/dispatch/settings` | Récupère les paramètres cron |
| `POST /queue/dispatch/settings` | Met à jour les paramètres |
| `POST /queue/dispatch/settings/reset` | Reset aux defaults |

**État** : ✅ Tous implémentés

---

## 4. ÉTAT DES MODULES (WIRING)

### `MessageAutoModule`

```typescript
providers: [
  MessageAutoService,
  WhatsappChatService,
  FirstResponseTimeoutJob,
  // ❌ AutoMessageOrchestrator absent ici
]
```

### `WhapiModule`

```typescript
providers: [
  WhapiService,
  AutoMessageOrchestrator,  // ✅ Fourni
  MessageAutoService,
  // ❌ Jamais injecté dans un autre service de ce module
]
```

### `DispatcherModule`

```typescript
providers: [
  DispatcherService,
  QueueService,
  OfflineReinjectionJob,         // ✅
  ReadOnlyEnforcementJob,        // ✅
  DispatchSettingsService,       // ✅
  FirstResponseTimeoutJob,       // ✅
]
exports: [DispatcherService, QueueService, DispatchSettingsService]
```

---

## 5. CHAMPS `WhatsappChat` LIÉS AUX MESSAGES AUTO

Champs attendus par le code (à confirmer en entité) :

| Champ | Utilisé par | Rôle |
|-------|-------------|------|
| `auto_message_step` | AutoMessageOrchestrator | Étape actuelle (0-3) |
| `last_auto_message_sent_at` | AutoMessageOrchestrator | Timestamp du dernier envoi auto |
| `auto_message_status` | MessageAutoService | `'sending'` / `'sent'` |
| `waiting_client_reply` | AutoMessageOrchestrator | Attend réponse client |
| `read_only` | ReadOnlyEnforcementJob, MessageAutoService | Chat en lecture seule |
| `last_client_message_at` | ReadOnlyEnforcementJob | Dernier message client |
| `last_poste_message_at` | OfflineReinjectionJob | Dernier message agent |

---

## 6. PROBLÈMES IDENTIFIÉS

### P0 — CRITIQUE : AutoMessageOrchestrator jamais déclenché

| Aspect | Détail |
|--------|--------|
| Problème | `handleClientMessage()` n'est appelé depuis aucun service |
| Impact | La fonctionnalité de messages auto est 100% inactive |
| Fix | Injecter `AutoMessageOrchestrator` dans `InboundMessageService` (ou `DispatcherService`) et appeler `handleClientMessage(chat)` après assignation |

### P1 — Vérifier délai dans AutoMessageOrchestrator

```typescript
// Code actuel
const delay = Math.floor(Math.random() * (45 - 20 + 1) + 20) * 10;
// Résultat : 200 à 450 (unité inconnue — ms? s?)
// Si ms → 0.2-0.45s (trop rapide)
// Si le *10 = "dix fois plus long" → 2000-4500ms (2-4.5s, plausible)
// Intention probable : 3-7 minutes pour simuler un vrai agent
```

**À vérifier** avec l'équipe : l'unité de délai souhaitée.

### P2 — Champs définis mais inutilisés

| Champ | Table | Fix possible |
|-------|-------|--------------|
| `MessageAuto.delai` | `messages_predefinis` | Utiliser pour délai par message (override du délai global) |
| `MessageAuto.canal` | `messages_predefinis` | Implémenter filtrage multi-canal |
| `TasksService` | — | Utiliser ou supprimer ce service |
| `FirstResponseTimeoutJob.testAutoMessage()` | — | Implémenter ou supprimer |

### P3 — Pas de soft delete sur `MessageAuto`

L'entité n'a pas de `deletedAt` / `@DeleteDateColumn`. La suppression est définitive. Si l'historique des envois fait référence à un message supprimé, il y a perte d'info.

### P4 — `conditions` dans `MessageAuto` non validé

Le champ `conditions` est un JSON libre `{ poste_id?, channel_id?, client_type? }` sans DTO de validation. Des valeurs inattendues peuvent passer sans erreur.

---

## 7. TABLEAU RÉCAPITULATIF GLOBAL

| Composant | Fichier | État | Priorité |
|-----------|---------|------|----------|
| `MessageAuto` entity | `message-auto/entities/message-auto.entity.ts` | ✅ OK | — |
| `MessageAutoService` | `message-auto/message-auto.service.ts` | ✅ OK | — |
| `AutoMessageOrchestrator` | `message-auto/auto-message-orchestrator.service.ts` | ❌ Dead code | P0 |
| `MessageAutoController` | `message-auto/message-auto.controller.ts` | ✅ OK | — |
| `ScheduleModule` | `app.module.ts` | ✅ OK | — |
| `TasksService` | `jorbs/tasks.service.ts` | ❌ Vide | P2 |
| `WebhookIdempotencyPurgeService` | `whapi/webhook-idempotency-purge.service.ts` | ✅ Actif | — |
| `FirstResponseTimeoutJob` | `jorbs/first-response-timeout.job.ts` | ✅ Actif | — |
| `OfflineReinjectionJob` | `jorbs/offline-reinjection.job.ts` | ✅ Actif | — |
| `ReadOnlyEnforcementJob` | `jorbs/read-only-enforcement.job.ts` | ✅ Actif | — |
| `DispatchSettingsService` | `dispatcher/services/dispatch-settings.service.ts` | ✅ Actif | — |
| `DispatchSettings` entity | `dispatcher/entities/dispatch-settings.entity.ts` | ✅ OK | — |
| `DispatchSettingsAudit` entity | `dispatcher/entities/dispatch-settings-audit.entity.ts` | ✅ OK | — |
| `DispatcherController` | `dispatcher/dispatcher.controller.ts` | ✅ OK | — |

---

## 8. ÉVOLUTIONS FUTURES POSSIBLES

### 8.1 Messages auto multi-canal
Exploiter `MessageAuto.canal` pour envoyer par SMS ou email selon le canal du client.

### 8.2 Délai personnalisé par message
Exploiter `MessageAuto.delai` pour que chaque message ait son propre délai avant envoi (ex : message 1 après 2 min, message 2 après 10 min).

### 8.3 Conditions avancées sur les messages auto
Valider et exploiter `MessageAuto.conditions` (par poste, par channel, par type client) pour envoyer des séquences différentes selon le contexte.

### 8.4 Dashboard de suivi des messages auto
Panel admin pour voir en temps réel : combien de chats sont en cours de séquence auto, à quelle étape, les taux de conversion (client répond après message X).

### 8.5 Cron de nettoyage des `auto_message_step`
Reset automatique du `auto_message_step` des vieux chats pour éviter les chats bloqués indéfiniment.

### 8.6 Métriques des jobs cron
Exposer dans le panel admin les metrics de chaque job : nombre d'exécutions, erreurs, conversations rejectées, temps d'exécution.

### 8.7 A/B testing des messages auto
Plusieurs messages par position + logique random déjà en place (`getAutoMessageByPosition` renvoie un aléatoire). Ajouter un suivi pour mesurer l'efficacité de chaque variante.

### 8.8 Notifications en cas d'échec job
Si `OfflineReinjectionJob` ou `ReadOnlyEnforcementJob` échouent, envoyer une alerte (email, webhook interne).

### 8.9 Historique des exécutions cron
Stocker en BDD chaque exécution des jobs (timestamp, durée, résultat, nb d'éléments traités) pour débogage et audit.

---

## 9. ACTIONS RECOMMANDÉES (PAR PRIORITÉ)

| Priorité | Action | Effort estimé |
|----------|--------|---------------|
| P0 | Brancher `AutoMessageOrchestrator` dans le flux inbound | Faible (injection + 1 appel) |
| P0 | Vérifier et corriger le calcul du délai | Faible |
| P1 | Tester le flux complet de messages auto de bout en bout | Moyen |
| P2 | Implémenter les `conditions` sur `MessageAuto` | Moyen |
| P2 | Utiliser `MessageAuto.delai` dans l'orchestrateur | Faible |
| P3 | Ajouter soft delete sur `MessageAuto` | Faible |
| P3 | Nettoyer ou implémenter `TasksService` | Faible |
| P4 | Dashboard métriques messages auto | Fort |
| P4 | Historique des exécutions cron | Moyen |
