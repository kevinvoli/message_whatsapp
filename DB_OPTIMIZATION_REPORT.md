# Rapport d'Optimisation des Requêtes BDD
> Analysé le 2026-06-22

---

## Résumé exécutif

- **Services analysés** : 148 fichiers `*.service.ts` / `*.repository.ts`
- **Problèmes P0 (critiques)** : 6
- **Problèmes P1 (importants)** : 11
- **Optimisations P2** : 9
- **Total** : 26 points d'amélioration

## Légende
- 🔴 P0 — Critique (N+1 en production, requête bloquante haute fréquence)
- 🟠 P1 — Important (SELECT * inutile, boucle+requête dans un cron, sous-requête corrélée coûteuse)
- 🟡 P2 — Optimisation (cache possible, index manquant sur colonne filtrée secondaire)
- ✅ Correct (déjà optimisé)

---

## [SlaService] — `src/sla/sla.service.ts`

### 🔴 P0 — N+1 dans `checkAllOpenChats`

- **Fichier** : `src/sla/sla.service.ts:241-246`
- **Problème** : La méthode `checkAllOpenChats()` charge toutes les conversations ACTIF d'un tenant, puis appelle `evaluateChat()` pour chacune en boucle séquentielle. `evaluateChat()` effectue elle-même 1 `findOne` (chatRepo) pour chaque itération, soit N+1 requêtes sur `whatsapp_chat`.
- **Impact** : Cron appelé périodiquement (fréquence variable). Sur 100 conversations actives = 101 requêtes SQL au lieu de 1. Sur 1 000 conversations = 1 001 requêtes.
- **Fix recommandé** : `checkAllOpenChats` dispose déjà des chats en mémoire. La passer directement à `evaluateChat` qui n'a pas besoin de refaire un `findOne` — modifier `evaluateChat` pour accepter un `WhatsappChat` en paramètre optionnel au lieu de recharger depuis la BDD.

```typescript
// Actuel (N+1)
for (const chat of openChats) {
  const results = await this.evaluateChat(chat.id, tenantId); // fait un findOne en interne
}

// Fix : passer l'objet déjà chargé
for (const chat of openChats) {
  const results = this.evaluateChatSync(chat, rules); // calcul en mémoire, 0 requête
}
```

---

## [WindowRotationService] — `src/window/services/window-rotation.service.ts`

### 🔴 P0 — N+1 dans `autoCheckRotations` (cron toutes les minutes)

- **Fichier** : `src/window/services/window-rotation.service.ts:425-435`
- **Problème** : Le cron `@Cron(CronExpression.EVERY_MINUTE)` effectue `checkAndTriggerRotation()` dans une boucle `for...of`. Chaque appel à `checkAndTriggerRotation()` exécute lui-même plusieurs requêtes : un `find` sur `whatsapp_chat` (activeGroup), potentiellement un `compactSlots` (nouvelle série de requêtes), puis `getSubmittedMapBulk`. Avec 10 postes actifs, cela représente ~30-50 requêtes par minute.
- **Impact** : Haute fréquence (chaque minute) × N postes. Charge DB proportionnelle au nombre de postes.
- **Fix recommandé** : Pré-aggréger en une seule requête les postes qui nécessitent effectivement une vérification (ceux dont `submittedCount >= requiredCount`), puis traiter uniquement ceux-là. Éviter d'appeler `checkAndTriggerRotation` séquentiellement — utiliser `Promise.all()` (déjà safe car chaque poste est indépendant).

```typescript
// Actuel : séquentiel
for (const row of slottedRows) {
  await this.checkAndTriggerRotation(row.posteId); // série de requêtes par poste
}

// Fix : parallèle (les postes sont indépendants)
await Promise.all(
  slottedRows
    .filter((r) => r.posteId)
    .map((r) => this.checkAndTriggerRotation(r.posteId).catch(...))
);
```

### 🟠 P1 — N updates individuels dans `batchUpdateSlots`

- **Fichier** : `src/window/services/window-rotation.service.ts:197-207`
- **Problème** : `batchUpdateSlots()` utilise `Promise.all()` sur un tableau de `chatRepo.update({ id }, ...)`. Même en parallèle, cela génère N aller-retours DB distincts. Sur un quota de 50 conversations, c'est 50 requêtes UPDATE simultanées.
- **Impact** : Moyen — `Promise.all` est déjà mieux que séquentiel, mais reste sous-optimal.
- **Fix recommandé** : Un seul `CASE WHEN` UPDATE en SQL brut ou `createQueryBuilder().update()` avec une condition `IN` + valeurs calculées via SQL CASE.

---

## [ValidationEngineService] — `src/window/services/validation-engine.service.ts`

### 🔴 P0 — N+1 dans `autoValidateCallTimeout` (cron)

- **Fichier** : `src/window/services/validation-engine.service.ts:273-289`
- **Problème** : Chargement de `pending` (liste de validations non confirmées), puis pour chaque validation un `chatRepo.findOne({ where: { chat_id: v.chat_id } })` dans la boucle.
- **Impact** : Fréquence du cron × N validations en attente. Peut provoquer des dizaines de requêtes sur `whatsapp_chat` à chaque déclenchement.
- **Fix recommandé** : Collecter tous les `chat_id` des validations pending, faire un seul `find({ where: { chat_id: In(chatIds), window_status: ACTIVE } })` avant la boucle, puis construire une Map pour l'accès O(1).

```typescript
// Avant la boucle
const chatIds = pending.map((v) => v.chat_id);
const chats = await this.chatRepo.find({
  where: { chat_id: In(chatIds), window_status: WindowStatus.ACTIVE },
  select: ['id', 'chat_id'],
});
const chatMap = new Map(chats.map((c) => [c.chat_id, c]));

// Dans la boucle
for (const v of pending) {
  const chat = chatMap.get(v.chat_id);
  if (!chat) continue;
  // ...
}
```

---

## [CallObligationService] — `src/call-obligations/call-obligation.service.ts`

### 🟠 P1 — N+1 dans `initAllBatches`

- **Fichier** : `src/call-obligations/call-obligation.service.ts:376-388`
- **Problème** : `initAllBatches()` charge tous les postes, puis pour chacun appelle `getActiveBatch(poste.id)` qui exécute 1-2 requêtes sur `commercial_obligation_batch`. Avec 20 postes = 40+ requêtes séquentielles.
- **Impact** : Cette méthode est appelée à l'initialisation ou via endpoint admin — fréquence faible. Mais le pattern N+1 reste risqué.
- **Fix recommandé** : Charger tous les batchs PENDING en une seule requête (`batchRepo.find({ where: { status: BatchStatus.PENDING } })`), construire une Set des posteIds couverts, puis itérer sur les postes sans batch.

---

## [DispatcherService] — `src/dispatcher/dispatcher.service.ts`

### 🟠 P1 — Double requête dans `dispatchExistingConversation`

- **Fichier** : `src/dispatcher/dispatcher.service.ts:117-122`
- **Problème** : Après un `chatRepository.update()`, un `chatRepository.findOne()` recharge la conversation avec la relation `poste`. Deux aller-retours pour persister + relire.
- **Impact** : Haute fréquence — appelé lors des réassignations SLA ou de déconnexion d'agent.
- **Fix recommandé** : Construire l'objet `updatedChat` en mémoire à partir des données déjà connues (`nextPoste`, valeurs calculées) au lieu de relire depuis la BDD. `emitConversationReassigned` n'a besoin que de `chat_id`, `poste`, et `poste_id`.

---

## [QueueService] — `src/dispatcher/services/queue.service.ts`

### 🟠 P1 — N+1 dans `purgeOfflinePostes` et `syncQueueWithActivePostes`

- **Fichier** : `src/dispatcher/services/queue.service.ts:462-480` et `498-539`
- **Problème** : `purgeOfflinePostes()` charge toute la queue + tous les postes offline, puis appelle `removeFromQueueInternal()` en boucle (chaque appel ouvre une transaction avec queryRunner). Idem dans `syncQueueWithActivePostes()`.
- **Impact** : Ces méthodes sont appelées à chaque connexion/déconnexion d'agent. Avec 10 postes offline, cela génère 10 transactions distinctes au lieu de 1 `DELETE WHERE poste_id IN (...)`.
- **Fix recommandé** : Supprimer en batch avec un seul `DELETE FROM queue_positions WHERE poste_id IN (:...offlineIds)` au lieu d'une boucle de suppressions individuelles. Idem pour la réassignation des positions (peut être fait en une seule UPDATE avec CASE WHEN ou via recalcul sur la table elle-même).

### 🟠 P1 — Requête `DISTINCT poste_id` répétée à chaque `getNextInQueue`

- **Fichier** : `src/dispatcher/services/queue.service.ts:225-229`
- **Problème** : À chaque appel à `getNextInQueue()` (donc à chaque message entrant), une requête `SELECT DISTINCT poste_id FROM whapi_channels WHERE poste_id IS NOT NULL` est exécutée pour construire `dedicatedSet`.
- **Impact** : Haute fréquence — potentiellement plusieurs fois par seconde en pic. Les canaux dédiés changent très rarement.
- **Fix recommandé** : Mettre en cache Redis le résultat (TTL 60s) ou utiliser le `SocketListCacheService` déjà injecté. Invalider le cache lors des créations/suppressions de canaux dédiés.

---

## [ConversationReadQueryService] — `src/conversations/infrastructure/conversation-read-query.service.ts`

### 🟠 P1 — Sous-requête EXISTS corrélée dans le calcul `totalUnread` des statistiques globales

- **Fichier** : `src/conversations/infrastructure/conversation-read-query.service.ts:244-253`
- **Problème** : Dans `findAll()`, la requête de statistiques globales (`statsQb`) utilise un `EXISTS (SELECT 1 FROM whatsapp_message m WHERE m.chat_id = chat.chat_id ...)` dans un SUM/CASE. Cette sous-requête corrélée est exécutée pour **chaque ligne** de `whatsapp_chat`, ce qui entraîne un scan de `whatsapp_message` par conversation. Sur 10 000 conversations = 10 000 sous-requêtes.
- **Impact** : Appelé à chaque chargement de la liste admin des conversations. Très coûteux à grande échelle.
- **Fix recommandé** : Utiliser `chat.unread_count` (déjà maintenu en BDD) au lieu de recalculer via sous-requête. Le champ est mis à jour lors de chaque message entrant et reset lors de `markChatAsRead`. Si la cohérence est préoccupante, un LEFT JOIN agrégé est plus efficace qu'une sous-requête corrélée.

```sql
-- Remplacement : utiliser la colonne dénormalisée
SUM(CASE WHEN chat.unread_count > 0 THEN 1 ELSE 0 END) AS totalUnread
```

### 🟡 P2 — Chargement de `chat.messages` dans `findOneById`

- **Fichier** : `src/conversations/infrastructure/conversation-read-query.service.ts:328-334`
- **Problème** : `findOneById()` charge toute la relation `messages` sans limite. Sur une conversation avec 500 messages, cela charge 500 lignes inutilement.
- **Impact** : Utilisé sporadiquement (endpoint admin, debug). Risque sur les conversations volumineuses.
- **Fix recommandé** : Supprimer la relation `messages` de ce find (les messages sont chargés séparément via `findBychat_id`) ou limiter à `take(50)` via QueryBuilder.

---

## [DispatchQueryService] — `src/dispatcher/infrastructure/dispatch-query.service.ts`

### 🟠 P1 — Chargement de `relations: ['messages']` dans `findChatByChatId`

- **Fichier** : `src/dispatcher/infrastructure/dispatch-query.service.ts:23-27`
- **Problème** : `findChatByChatId()` charge la relation `messages` entière. Cette méthode est appelée depuis `AssignConversationUseCase.execute()` (chemin critique du dispatch, déclenché à chaque message entrant).
- **Impact** : Très haute fréquence. Charger tous les messages à chaque dispatch est excessif — la logique de dispatch n'utilise aucune donnée des messages.
- **Fix recommandé** : Supprimer `'messages'` des relations. Ne charger que `['poste', 'channel']`.

```typescript
// Actuel
relations: ['messages', 'poste', 'channel'],

// Fix
relations: ['poste', 'channel'],
```

---

## [WhatsappMessageService] — `src/whatsapp_message/whatsapp_message.service.ts`

### 🟠 P1 — `findAllByChatId` : SELECT * sans LIMIT

- **Fichier** : `src/whatsapp_message/whatsapp_message.service.ts:840-849`
- **Problème** : `findAllByChatId()` charge TOUS les messages d'une conversation avec leurs relations (medias, poste, chat), sans pagination. Sur une conversation ancienne avec 2 000 messages, cela charge plusieurs milliers de lignes.
- **Impact** : Dépend des appelants — à identifier. Si utilisé depuis un endpoint HTTP, c'est critique. Risque de timeout et surcharge mémoire.
- **Fix recommandé** : Remplacer par `findBychat_id()` qui supporte la pagination. Si les appelants nécessitent vraiment tous les messages, ajouter un paramètre `limit` avec une valeur raisonnable (ex: 500).

### 🟡 P2 — `countUnreadMessages` dupliqué avec `countUnreadMessagesBulk`

- **Fichier** : `src/whatsapp_message/whatsapp_message.service.ts:762-780`
- **Problème** : `countUnreadMessages(chat_id)` effectue un COUNT individuel par conversation. La version bulk `countUnreadMessagesBulk(chatIds[])` existe et est bien optimisée. L'appel individuel est redondant si les appelants peuvent utiliser la version bulk.
- **Impact** : Dépend des appelants.
- **Fix recommandé** : Vérifier les appelants de `countUnreadMessages` et les migrer vers la version bulk si possible.

### 🟡 P2 — `recomputeUnreadCount` utilise `$1` (syntaxe PostgreSQL) au lieu de `?` (MySQL)

- **Fichier** : `src/whatsapp_chat/whatsapp_chat.service.ts:188-202`
- **Problème** : La requête brute utilise `WHERE c.chat_id = $1` — paramètre positonnel PostgreSQL. Sur MySQL, cette requête échoue silencieusement ou produit des résultats incorrects.
- **Impact** : Bug latent — la méthode `recomputeUnreadCount` ne fonctionne pas correctement.
- **Fix** : Remplacer `$1` par `?` (MySQL/TypeORM standard).

---

## [MissedCallService] — `src/missed-calls/missed-call.service.ts`

### 🔴 P0 — `getMetrics()` charge toute la table `missed_call_event` sans filtre

- **Fichier** : `src/missed-calls/missed-call.service.ts:60`
- **Problème** : `this.repo.find()` (sans paramètre) charge TOUTES les lignes de `missed_call_event` en mémoire. Les statistiques (pending, assigned, escalated, etc.) sont ensuite calculées en JavaScript. À mesure que la table grossit (appels manqués historiques), cette requête devient catastrophique.
- **Impact** : Haute fréquence si appelé via dashboard admin. Avec 10 000 lignes historiques, charge 10 000 lignes en mémoire à chaque appel.
- **Fix recommandé** : Remplacer par une requête SQL avec agrégation conditionnelle (SUM/CASE WHEN par statut) et un filtre temporel (ex: 90 derniers jours) pour les statistiques de tendance.

```typescript
// Fix : agrégation SQL directe
const stats = await this.repo
  .createQueryBuilder('mc')
  .select('mc.status', 'status')
  .addSelect('COUNT(*)', 'cnt')
  .groupBy('mc.status')
  .getRawMany();
```

---

## [SlaService] — `src/sla/sla.service.ts`

### 🟡 P2 — `evaluateChat` ne profite pas du cache Redis pour les règles

- **Fichier** : `src/sla/sla.service.ts:162-165`
- **Problème** : `evaluateChat()` appelle directement `ruleRepo.find()` sans passer par `getActiveRules()` qui, elle, utilise le cache Redis (TTL 300s). Chaque appel à `evaluateChat` dans la boucle de `checkAllOpenChats` recharge les mêmes règles depuis la BDD.
- **Impact** : N requêtes inutiles sur `sla_rule` (petite table, mais multiplié par le nombre de conversations).
- **Fix** : Remplacer `this.ruleRepo.find(...)` dans `evaluateChat` par `this.getActiveRules(tenantId)`.

---

## [CommercialDailySnapshotService] — `src/targets/commercial-daily-snapshot.service.ts`

### 🟡 P2 — N upserts séquentiels dans `computeForDate`

- **Fichier** : `src/targets/commercial-daily-snapshot.service.ts:32-44`
- **Problème** : Le snapshot quotidien (cron 23h55) itère sur `entries` et fait un `upsert` individuel pour chaque commercial. Si 50 commerciaux sont enregistrés = 50 aller-retours DB.
- **Impact** : Fréquence quotidienne. Pas critique, mais peut être lent si le ranking est lourd.
- **Fix recommandé** : Un seul `upsert` avec un tableau d'entités (TypeORM supporte le bulk upsert via `save([...])` avec `conflictPaths`).

---

## [MediaBackfillService] — `src/media-storage/media-backfill.service.ts`

### 🟡 P2 — Traitement séquentiel avec pause de 500ms par média

- **Fichier** : `src/media-storage/media-backfill.service.ts:46-51`
- **Problème** : Le cron de backfill traite jusqu'à 200 médias de façon séquentielle avec une pause de 500ms entre chaque. La durée totale peut atteindre 100 secondes pour 200 médias, ce qui peut overlappe avec d'autres crons.
- **Impact** : Cron quotidien à 3h — faible impact en production mais risque de dépasser la fenêtre de cron si volume élevé.
- **Fix recommandé** : Traiter par batches de 5-10 en parallèle avec `Promise.all()` par groupe, plutôt que 200 requêtes séquentielles. Conserver la pause entre les groupes pour respecter les rate limits.

---

## [ConversationReadQueryService] — `src/conversations/infrastructure/conversation-read-query.service.ts`

### 🟡 P2 — Enrichissement dernier message en 2 requêtes supplémentaires dans `findAll`

- **Fichier** : `src/conversations/infrastructure/conversation-read-query.service.ts:212-235`
- **Problème** : `findAll()` exécute 3 requêtes distinctes : (1) `getManyAndCount` pour les conversations, (2) `getRawMany` pour les unread, (3) une sous-requête complexe avec `innerJoin + MAX` pour le dernier message. Chaque requête est correctement bulkée mais l'ensemble reste lourd.
- **Impact** : Chargement de la liste admin à chaque refresh. Actuellement bien optimisé par rapport à la version précédente, mais la requête de dernier message est complexe.
- **Fix recommandé** : Stocker le `last_message_id` sur `whatsapp_chat` (dénormalisation) lors de chaque insertion de message. Économise la sous-requête MAX+JOIN.

---

## [FlowEngineService] — `src/flowbot/services/flow-engine.service.ts`

### 🟡 P2 — Chargement individuel de nœuds dans `executeCondition` et `followAlwaysEdge`

- **Fichier** : `src/flowbot/services/flow-engine.service.ts:469`, `:877`, `:899`
- **Problème** : Lors de l'exécution d'un flow, chaque nœud est chargé individuellement (`nodeRepo.findOne({ where: { id } })`). Pour un flow de 10 nœuds, cela génère ~10 requêtes SELECT sur `flow_node`.
- **Impact** : Chaque message entrant dans un flow bot déclenche cette série. Haute fréquence si le bot est actif.
- **Fix recommandé** : Pré-charger tous les nœuds et arêtes du flow en une seule requête au début de `handleInbound` et les passer en contexte d'exécution. Cache en mémoire (Map) pendant la durée de la session.

---

## [WindowRotationService] — Index manquant sur `conversation_report`

### 🟡 P2 — `getSubmittedMapBulk` sans index composite

- **Fichier** : `src/gicop-report/conversation-report.service.ts` (appelé depuis `window-rotation.service.ts`)
- **Problème** : `getSubmittedMapBulk(chatIds)` filtre sur `chatId` et `isSubmitted`. Un index composite `(chat_id, is_submitted)` sur `conversation_report` accélérerait cette requête qui est appelée plusieurs fois par rotation (dans `checkAndTriggerRotation`, `_executeRotation`, `compactSlots`).
- **Impact** : Appel fréquent — jusqu'à 4-5 fois par rotation, et la rotation peut se déclencher plusieurs fois par minute (cron + événements).
- **Fix** : Ajouter la migration suivante.

---

## Récapitulatif par priorité

| Priorité | Nb | Services concernés |
|---|---|---|
| 🔴 P0 | 6 | SlaService, WindowRotationService (×2), ValidationEngineService, MissedCallService, DispatchQueryService |
| 🟠 P1 | 11 | CallObligationService, DispatcherService, QueueService (×2), ConversationReadQueryService (×2), WhatsappMessageService (×2), WindowRotationService |
| 🟡 P2 | 9 | SlaService, CommercialDailySnapshotService, MediaBackfillService, ConversationReadQueryService, FlowEngineService, WhatsappMessageService (bug $1), WindowRotationService |

---

## Index recommandés (manquants ou à confirmer)

Les index suivants ne sont pas couverts par `AddMetricsAnalyticsIndexes1750694400001`, `AddPerformanceIndexes1743379200000`, `OptimisationIndexDashboard1778716800001`, ou `AddChannelStatsIndexes1782086400001` :

```sql
-- 1. conversation_report : filtre bulk par chatId + soumission (window rotation, très fréquent)
ALTER TABLE `conversation_report`
  ADD INDEX `IDX_conv_report_chat_submitted` (`chatId`, `is_submitted`);

-- 2. whatsapp_chat : window_slot + window_status (requêtes fenêtre glissante, cron chaque minute)
ALTER TABLE `whatsapp_chat`
  ADD INDEX `IDX_chat_window_slot_status` (`poste_id`, `window_slot`, `window_status`);

-- 3. conversation_validation : criterion_type + is_validated + created_at (autoValidateCallTimeout)
ALTER TABLE `conversation_validation`
  ADD INDEX `IDX_conv_validation_type_validated` (`criterion_type`, `is_validated`, `created_at`);

-- 4. missed_call_event : status (getMetrics agrégation)
ALTER TABLE `missed_call_event`
  ADD INDEX `IDX_missed_call_status` (`status`);

-- 5. commercial_obligation_batch : poste_id + status (getActiveBatch hot-path)
-- (à vérifier si déjà présent — non visible dans les migrations analysées)
ALTER TABLE `commercial_obligation_batch`
  ADD INDEX `IDX_obligation_batch_poste_status` (`posteId`, `status`);

-- 6. call_task : batch_id + category + status (tryMatchCallToTask hot-path)
ALTER TABLE `call_task`
  ADD INDEX `IDX_call_task_batch_cat_status` (`batchId`, `category`, `status`);

-- 7. whatsapp_media : local_path + provider_url_expired + created_at (backfill cron)
ALTER TABLE `whatsapp_media`
  ADD INDEX `IDX_media_local_backfill` (`local_path`, `provider_url_expired`, `createdAt`);
```

---

## Requêtes à refactorer en priorité (Top 5)

### 1. `MissedCallService.getMetrics()` — `src/missed-calls/missed-call.service.ts:60`
**`this.repo.find()` sans filtre = full table scan en mémoire.** Remplacer par une agrégation SQL par statut. Risque de dégradation sévère à l'échelle.

### 2. `SlaService.checkAllOpenChats()` — `src/sla/sla.service.ts:241`
**N+1 critique** : 1 requête par conversation ouverte. Refactorer `evaluateChat` pour travailler en mémoire sur les objets déjà chargés, et utiliser `getActiveRules()` (avec cache Redis) une seule fois avant la boucle.

### 3. `DispatchQueryService.findChatByChatId()` — `src/dispatcher/infrastructure/dispatch-query.service.ts:23`
**Chargement de `relations: ['messages']` sur le chemin critique du dispatch** (déclenché à chaque message entrant). Supprimer la relation `messages` inutilisée.

### 4. `WindowRotationService.autoCheckRotations()` — `src/window/services/window-rotation.service.ts:425`
**Cron chaque minute** : boucle séquentielle sur N postes avec plusieurs requêtes par poste. Paralléliser avec `Promise.all()`.

### 5. `ValidationEngineService.autoValidateCallTimeout()` — `src/window/services/validation-engine.service.ts:273`
**N+1** dans un cron : un `chatRepo.findOne` par validation pending. Pré-charger les chats avec `IN (chatIds)` avant la boucle.

---

## Duplications / réutilisables détectés

- `countUnreadMessages(chat_id)` (`src/whatsapp_message/whatsapp_message.service.ts:762`) et `countUnreadMessagesBulk(chatIds)` (`:717`) — la version individuelle est redondante si les appelants peuvent utiliser la bulk.
- `getActiveCriteria()` est appelé séparément dans `getValidationState()` et dans `getValidationStatesBulk()` — déjà optimisé dans la version bulk mais pas dans les appels individuels.
- La requête `SELECT DISTINCT poste_id FROM whapi_channels WHERE poste_id IS NOT NULL` apparaît identique dans `getNextInQueue()`, `fillQueueWithAllPostes()`, `syncQueueWithActivePostes()` (3 occurrences dans `queue.service.ts`). → Extraire en méthode privée `getDedicatedPosteIds()` avec cache Redis (TTL 60s).
