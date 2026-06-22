# Plan d'Implémentation — Optimisation des Requêtes BDD
> Basé sur `DB_OPTIMIZATION_REPORT.md` + analyse exhaustive des 28 crons/intervals — 2026-06-22

## Légende priorités
- 🔴 P0 — Critique (impact production immédiat, CPU/mémoire)
- 🟠 P1 — Important (dégradation progressive, requêtes inutiles fréquentes)
- 🟡 P2 — Optimisation (cache, refactoring, dette technique)

## Légende effort
- XS < 1h | S — demi-journée | M — 1 jour | L — 2-3 jours

---

## Sprint 1 — Corrections P0 critiques (~4 jours)

> Ces 6 corrections ont un impact direct sur le CPU et la latence en production. À déployer en priorité absolue.

---

### DB-1 — `MissedCallService.getMetrics()` : full table scan 🔴 P0
- **Fichier** : `src/missed-calls/missed-call.service.ts:60`
- **Problème** : `this.repo.find()` sans filtre charge TOUTES les lignes de `missed_call_event` en mémoire pour calculer des stats en JavaScript. Croît linéairement avec l'historique.
- **Effort** : S
- **Action** :
  1. Remplacer le `find()` par une agrégation SQL directe :
  ```typescript
  const stats = await this.repo
    .createQueryBuilder('mc')
    .select('mc.status', 'status')
    .addSelect('COUNT(*)', 'cnt')
    .groupBy('mc.status')
    .getRawMany<{ status: string; cnt: string }>();
  ```
  2. Construire l'objet de retour depuis ce résultat agrégé
  3. Si les stats de tendance nécessitent un filtre temporel, ajouter `.where('mc.createdAt > :from', { from: subDays(new Date(), 90) })`
- **Dépendances** : Index `IDX_missed_call_status` (DB-13)

---

### DB-2 — `SlaService.checkAllOpenChats()` : N+1 + règles rechargées 🔴 P0
- **Fichier** : `src/sla/sla.service.ts:241-246` et `:162-165`
- **Problème** : `evaluateChat()` refait un `findOne` sur `whatsapp_chat` pour chaque conversation déjà chargée. Les règles SLA sont rechargées à chaque appel au lieu d'utiliser le cache Redis.
- **Effort** : M
- **Action** :
  1. Dans `checkAllOpenChats()`, charger les règles UNE seule fois avant la boucle :
  ```typescript
  const rules = await this.getActiveRules(tenantId); // déjà cachée Redis TTL 300s
  for (const chat of openChats) {
    await this.evaluateChatWithData(chat, rules); // nouveau — pas de refetch
  }
  ```
  2. Créer `evaluateChatWithData(chat: WhatsappChat, rules: SlaRule[])` — copie de `evaluateChat` sans `findOne` interne
  3. Dans `evaluateChat` (appelé individuellement depuis l'extérieur), garder le `findOne` existant
  4. Dans `evaluateChat`, remplacer `this.ruleRepo.find(...)` par `this.getActiveRules(tenantId)` (cache Redis)
- **Dépendances** : Aucune

---

### DB-3 — `DispatchQueryService.findChatByChatId()` : chargement `messages` sur chemin critique 🔴 P0
- **Fichier** : `src/dispatcher/infrastructure/dispatch-query.service.ts:23-27`
- **Problème** : Charge `relations: ['messages']` (potentiellement centaines de lignes) sur le chemin critique du dispatch, déclenché à CHAQUE message WhatsApp entrant. La logique de dispatch n'utilise aucune donnée des messages.
- **Effort** : XS
- **Action** :
  ```typescript
  // Avant
  relations: ['messages', 'poste', 'channel'],

  // Après
  relations: ['poste', 'channel'],
  ```
  Vérifier qu'aucun appelant de `findChatByChatId()` ne consomme `chat.messages`.
- **Dépendances** : Aucune

---

### DB-4 — `WindowRotationService.autoCheckRotations()` : boucle séquentielle cron/minute 🔴 P0
- **Fichier** : `src/window/services/window-rotation.service.ts:425-435`
- **Problème** : Cron `@Cron(EVERY_MINUTE)` — appelle `checkAndTriggerRotation()` séquentiellement pour chaque poste. Chaque appel = 3-5 requêtes. Avec 10 postes = 30-50 requêtes/minute exécutées une par une.
- **Effort** : S
- **Action** :
  1. Remplacer la boucle `for...of` par `Promise.all()` (les postes sont indépendants) :
  ```typescript
  await Promise.all(
    slottedRows
      .filter((r) => r.posteId != null)
      .map((r) =>
        this.checkAndTriggerRotation(r.posteId!).catch((err) =>
          this.logger.error(`Rotation failed for poste ${r.posteId}`, err)
        )
      )
  );
  ```
  2. Pré-filtrer les postes qui nécessitent une vérification (ceux dont `submittedCount >= requiredCount`) avant le `Promise.all` pour éviter des appels inutiles
- **Dépendances** : Aucune

---

### DB-5 — `ValidationEngineService.autoValidateCallTimeout()` : N+1 cron 🔴 P0
- **Fichier** : `src/window/services/validation-engine.service.ts:273-289`
- **Problème** : Un `chatRepo.findOne({ where: { chat_id } })` par validation en attente dans une boucle.
- **Effort** : S
- **Action** :
  ```typescript
  // Avant la boucle — 1 seule requête
  const chatIds = pending.map((v) => v.chat_id);
  const chats = await this.chatRepo.find({
    where: { chat_id: In(chatIds), windowStatus: WindowStatus.ACTIVE },
    select: ['id', 'chat_id'],
  });
  const chatMap = new Map(chats.map((c) => [c.chat_id, c]));

  // Dans la boucle — 0 requête
  for (const v of pending) {
    const chat = chatMap.get(v.chat_id);
    if (!chat) continue;
    // logique existante...
  }
  ```
- **Dépendances** : Index `IDX_conv_validation_type_validated` (DB-13)

---

### DB-6 — `recomputeUnreadCount` : bug syntaxe PostgreSQL sur MySQL 🔴 P0
- **Fichier** : `src/whatsapp_chat/whatsapp_chat.service.ts:188-202`
- **Problème** : La requête brute utilise `$1` (syntaxe PostgreSQL) — sur MySQL, le paramètre est ignoré = la méthode retourne des résultats erronés ou une erreur silencieuse.
- **Effort** : XS
- **Action** : Remplacer chaque `$N` par `?` :
  ```typescript
  // Avant
  WHERE c.chat_id = $1
  // Après
  WHERE c.chat_id = ?
  ```
  Vérifier que tous les paramètres positionnels de la requête sont remplacés.
- **Dépendances** : Aucune

---

## Sprint 2 — Corrections P1 importantes (~4 jours)

---

### DB-7 — `CallObligationService.initAllBatches()` : N+1 sur postes 🟠 P1
- **Fichier** : `src/call-obligations/call-obligation.service.ts:376-388`
- **Problème** : Pour chaque poste, appelle `getActiveBatch(poste.id)` (1-2 requêtes). Avec 20 postes = 40 requêtes séquentielles.
- **Effort** : S
- **Action** :
  1. Charger tous les batchs PENDING en une seule requête avant la boucle :
  ```typescript
  const activeBatches = await this.batchRepo.find({
    where: { status: BatchStatus.PENDING },
    select: ['posteId'],
  });
  const coveredPosteIds = new Set(activeBatches.map((b) => b.posteId));
  ```
  2. Dans la boucle sur les postes, skip si `coveredPosteIds.has(poste.id)`
- **Dépendances** : Index `IDX_obligation_batch_poste_status` (DB-13)

---

### DB-8 — `DispatcherService.dispatchExistingConversation()` : update + refetch inutile 🟠 P1
- **Fichier** : `src/dispatcher/dispatcher.service.ts:117-122`
- **Problème** : Après `chatRepository.update()`, un `chatRepository.findOne()` recharge la conversation avec la relation `poste`. Deux aller-retours pour une donnée déjà connue.
- **Effort** : S
- **Action** : Construire l'objet `updatedChat` en mémoire depuis les données déjà connues (`nextPoste`, valeurs calculées) et supprimer le `findOne` post-update. `emitConversationReassigned` n'a besoin que de `chat_id`, `poste`, `poste_id`.
- **Dépendances** : Aucune

---

### DB-9 — `QueueService` : DELETE en boucle + SELECT DISTINCT répété 🟠 P1
- **Fichier** : `src/dispatcher/services/queue.service.ts:225-229, 462-480, 498-539`
- **Effort** : M
- **Actions** :
  1. **Cache `getDedicatedPosteIds()`** : extraire la requête `SELECT DISTINCT poste_id FROM whapi_channels WHERE poste_id IS NOT NULL` en méthode privée `getDedicatedPosteIds()` avec cache Redis TTL 60s. Invalider le cache lors de création/suppression de canaux dédiés.
  ```typescript
  private async getDedicatedPosteIds(): Promise<Set<string>> {
    const cached = await this.redis?.get('queue:dedicated_postes');
    if (cached) return new Set(JSON.parse(cached) as string[]);
    const rows = await this.channelRepo.query(...) as Array<{ poste_id: string }>;
    const ids = new Set(rows.map((r) => r.poste_id));
    await this.redis?.set('queue:dedicated_postes', JSON.stringify([...ids]), 'EX', 60);
    return ids;
  }
  ```
  2. **Batch DELETE** dans `purgeOfflinePostes()` : remplacer la boucle de suppressions par `DELETE FROM queue_positions WHERE poste_id IN (:...offlineIds)` via QueryBuilder.
- **Dépendances** : Redis disponible (déjà injecté dans le module)

---

### DB-10 — `ConversationReadQueryService.findAll()` : sous-requête EXISTS corrélée 🟠 P1
- **Fichier** : `src/conversations/infrastructure/conversation-read-query.service.ts:244-253`
- **Problème** : Sous-requête `EXISTS (SELECT 1 FROM whatsapp_message WHERE chat_id = ...)` évaluée pour CHAQUE ligne de `whatsapp_chat`. Sur 10 000 conversations = 10 000 scans de `whatsapp_message`.
- **Effort** : S
- **Action** : Utiliser la colonne dénormalisée `unread_count` déjà maintenue en BDD :
  ```sql
  -- Avant (sous-requête corrélée coûteuse)
  SUM(CASE WHEN EXISTS (SELECT 1 FROM whatsapp_message m WHERE ...) THEN 1 ELSE 0 END) AS totalUnread

  -- Après (lecture directe de la colonne)
  SUM(CASE WHEN chat.unread_count > 0 THEN 1 ELSE 0 END) AS totalUnread
  ```
- **Dépendances** : Aucune — `unread_count` déjà maintenu par `incrementUnreadCount()`

---

### DB-11 — `WhatsappMessageService.findAllByChatId()` : SELECT * sans LIMIT 🟠 P1
- **Fichier** : `src/whatsapp_message/whatsapp_message.service.ts:840-849`
- **Problème** : Charge TOUS les messages d'une conversation avec leurs relations (medias, poste, chat) sans pagination. Risque de timeout et surcharge mémoire sur conversations anciennes.
- **Effort** : S
- **Action** :
  1. Auditer les appelants de `findAllByChatId()` — identifier si une pagination est possible
  2. Ajouter un paramètre `limit = 500` par défaut :
  ```typescript
  async findAllByChatId(chatId: string, limit = 500): Promise<WhatsappMessage[]> {
    return this.repo.find({
      where: { chat_id: chatId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
  ```
  3. Si un appelant requiert vraiment tous les messages, documenter pourquoi
- **Dépendances** : Aucune

---

### DB-12 — `WindowRotationService.batchUpdateSlots()` : N UPDATEs parallèles → 1 UPDATE bulk 🟠 P1
- **Fichier** : `src/window/services/window-rotation.service.ts:197-207`
- **Problème** : `Promise.all()` de N `chatRepo.update()` = N aller-retours DB simultanés. Meilleur que séquentiel, mais reste sous-optimal sur grand volume.
- **Effort** : M
- **Action** : Remplacer par un `CASE WHEN` UPDATE en SQL brut ou via QueryBuilder :
  ```typescript
  // Un seul UPDATE avec CASE WHEN
  await this.chatRepo
    .createQueryBuilder()
    .update()
    .set({
      windowSlot: () => `CASE id ${slots.map((s) => `WHEN '${s.id}' THEN '${s.slot}'`).join(' ')} END`,
    })
    .where('id IN (:...ids)', { ids: slots.map((s) => s.id) })
    .execute();
  ```
- **Dépendances** : DB-4 (parallélisation cron doit être en place)

---

## Sprint 3 — Migrations index + optimisations P2 (~3 jours)

---

### DB-13 — Migration : 7 index manquants 🟠/🟡
- **Fichier à créer** : `src/database/migrations/AddMissingServiceIndexes1750780800001.ts`
- **Effort** : S
- **Index à créer** (tous avec `ALGORITHM=INPLACE, LOCK=NONE`) :

  | Table | Index | Colonnes | Justification |
  |---|---|---|---|
  | `conversation_report` | `IDX_conv_report_chat_submitted` | `chatId, is_submitted` | `getSubmittedMapBulk` — appelé 4-5×/rotation, cron/minute |
  | `whatsapp_chat` | `IDX_chat_window_slot_status` | `poste_id, window_slot, window_status` | Fenêtre glissante cron/minute |
  | `conversation_validation` | `IDX_conv_validation_type_validated` | `criterion_type, is_validated, created_at` | `autoValidateCallTimeout` cron |
  | `missed_call_event` | `IDX_missed_call_status` | `status` | `getMetrics()` agrégation (DB-1) |
  | `commercial_obligation_batch` | `IDX_obligation_batch_poste_status` | `posteId, status` | `getActiveBatch` hot-path |
  | `call_task` | `IDX_call_task_batch_cat_status` | `batchId, category, status` | `tryMatchCallToTask` hot-path |
  | `whatsapp_media` | `IDX_media_local_backfill` | `local_path, provider_url_expired, createdAt` | Cron backfill |

- **Dépendances** : Aucune (indépendant des corrections de code)

---

### DB-14 — `SlaService.evaluateChat()` : utiliser le cache Redis pour les règles 🟡 P2
- **Fichier** : `src/sla/sla.service.ts:162-165`
- **Problème** : `evaluateChat()` appelle `ruleRepo.find()` directement au lieu de `getActiveRules()` (qui utilise le cache Redis TTL 300s).
- **Effort** : XS
- **Action** : Remplacer `this.ruleRepo.find({ where: { tenantId, isActive: true } })` par `this.getActiveRules(tenantId)`.
- **Note** : DB-2 couvre déjà le cas principal. Ce fix concerne les appels directs à `evaluateChat`.
- **Dépendances** : DB-2

---

### DB-15 — `CommercialDailySnapshotService` : bulk upsert 🟡 P2
- **Fichier** : `src/targets/commercial-daily-snapshot.service.ts:32-44`
- **Problème** : N upserts individuels séquentiels (1 par commercial) dans un cron quotidien.
- **Effort** : S
- **Action** : Remplacer la boucle `for` par un `save([...entries])` bulk ou `upsert(entries, conflictPaths)` :
  ```typescript
  // Avant : N appels séquentiels
  for (const entry of entries) {
    await this.snapshotRepo.upsert(entry, ['commercialId', 'date']);
  }

  // Après : 1 seul appel
  await this.snapshotRepo.upsert(entries, ['commercialId', 'date']);
  ```
- **Dépendances** : Aucune

---

### DB-16 — `MediaBackfillService` : traitement séquentiel → par batches parallèles 🟡 P2
- **Fichier** : `src/media-storage/media-backfill.service.ts:46-51`
- **Problème** : 200 médias traités séquentiellement avec pause 500ms = jusqu'à 100s par run.
- **Effort** : S
- **Action** : Traiter par groupe de 5 en parallèle avec une pause entre les groupes :
  ```typescript
  const BATCH_SIZE = 5;
  for (let i = 0; i < medias.length; i += BATCH_SIZE) {
    const batch = medias.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((m) => this.downloadAndStore(m)));
    if (i + BATCH_SIZE < medias.length) await delay(500); // rate limit entre groupes
  }
  ```
- **Dépendances** : Aucune

---

### DB-17 — `FlowEngineService` : pré-charger les nœuds du flow en contexte 🟡 P2
- **Fichier** : `src/flowbot/services/flow-engine.service.ts:469, 877, 899`
- **Problème** : Chaque nœud est chargé individuellement (`nodeRepo.findOne({ id })`). Pour un flow de 10 nœuds = ~10 requêtes par message entrant dans le bot.
- **Effort** : M
- **Action** :
  1. Au début de `handleInbound()`, charger tous les nœuds et arêtes du flow en une seule requête :
  ```typescript
  const [nodes, edges] = await Promise.all([
    this.nodeRepo.find({ where: { flowId } }),
    this.edgeRepo.find({ where: { flowId } }),
  ]);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edgeMap = new Map(edges.map((e) => [e.id, e]));
  ```
  2. Passer `nodeMap` et `edgeMap` en paramètre dans les méthodes `executeCondition`, `followAlwaysEdge` au lieu de refaire des `findOne`
- **Dépendances** : Aucune

---

### DB-18 — `ConversationReadQueryService` : dénormaliser `last_message_id` 🟡 P2
- **Fichier** : `src/conversations/infrastructure/conversation-read-query.service.ts:212-235`
- **Problème** : La sous-requête `MAX + JOIN` pour le dernier message est complexe et exécutée à chaque chargement de la liste.
- **Effort** : L
- **Action** :
  1. Migration : ajouter `last_message_id VARCHAR(36) NULL` sur `whatsapp_chat`
  2. Dans `WhatsappMessageService` : mettre à jour `last_message_id` sur le chat lors de chaque insertion de message (déjà dans la même transaction)
  3. Dans `findAll()` : JOIN direct sur `whatsapp_message` via `last_message_id` au lieu de `MAX(created_at)`
- **Migration** : `AddLastMessageIdToChat1750780800002`
- **Dépendances** : Aucune, mais effort élevé — à faire en dernier

---

### DB-19 — `WhatsappMessageService` : migrer vers `countUnreadMessagesBulk` 🟡 P2
- **Fichier** : `src/whatsapp_message/whatsapp_message.service.ts:762`
- **Problème** : `countUnreadMessages(chat_id)` individuel redondant alors que `countUnreadMessagesBulk` optimisé existe.
- **Effort** : S
- **Action** : Auditer les appelants de `countUnreadMessages` et les migrer vers `countUnreadMessagesBulk` quand ils traitent plusieurs conversations.
- **Dépendances** : Aucune

---

## Sprint 4 — Crons : corrections issues de l'analyse exhaustive (~5 jours)

> Analyse de 28 crons/intervals révèle des problèmes supplémentaires non couverts par les sprints précédents.
> Hot spots crons : **WindowRotationService (1m)**, **OrderCallSyncJob (30s)**, **FollowUpReminderService (5m)**.

---

### DB-20 — `OrderCallSyncJob.run()` : dominant en fréquence (30s, 2880×/jour) 🔴 P0
- **Fichier** : `src/order-call-sync/order-call-sync.job.ts:38`
- **Fréquence** : Toutes les 30 secondes
- **Problème** : `_run()` enchaîne `syncCommercialMapping()` + `syncClientMapping()` + `syncNewCalls()` = 20-40 requêtes par déclenchement avec boucles séquentielles internes. Représente potentiellement **57 600–115 200 requêtes/jour** rien que pour ce job.
- **Effort** : L
- **Action** :
  1. Profiler les 3 méthodes pour identifier les sous-boucles les plus coûteuses
  2. Dans `syncNewCalls()` : charger les contacts/devices en bulk (`IN (ids)`) avant la boucle plutôt qu'un `findOne` par appel
  3. Dans `syncCommercialMapping()` : bulk upsert au lieu de N upserts individuels
  4. Envisager de réduire la fréquence à 60s si les données DB2 ne changent pas à 30s (à valider métier)
  5. Ajouter un flag `isRunning` pour éviter les exécutions concurrentes si le job dure plus de 30s
- **Dépendances** : Index `IDX_call_task_batch_cat_status` (DB-13)

---

### DB-21 — `FollowUpReminderService.sendReminders()` : N+1 dans `trySendTemplate()` 🔴 P0
- **Fichier** : `src/follow-up/follow_up_reminder.service.ts:46`
- **Fréquence** : Toutes les 5 minutes
- **Problème** : Pour chaque relance due, `trySendTemplate()` effectue 7-8 requêtes séquentielles (`mappingRepo.findOne`, `contactRepo.findOne`, `chatRepo.findOne` ×2, `channelService.getEffectiveMessageLimit`, `chatRepo.update`, `chatRepo.findOne`). Avec 10 relances = 70-80 requêtes.
- **Effort** : M
- **Action** :
  1. Avant la boucle, charger en bulk :
     - tous les mappings de templates nécessaires
     - tous les contacts concernés (`contactRepo.find({ where: { id: In(contactIds) } })`)
     - tous les chats concernés (`chatRepo.find({ where: { chat_id: In(chatIds) } })`)
  2. Construire des Maps pour accès O(1) dans la boucle
  3. Garder le `chatRepo.update()` individuel (nécessaire par relance)
- **Dépendances** : Aucune

---

### DB-22 — `FlowPollingJob.pollInactivity/pollQueueWait()` : index manquants sur `whatsapp_chat` 🟠 P1
- **Fichiers** : `src/flowbot/jobs/flow-polling.job.ts:133, 185`
- **Fréquence** : Toutes les 5 minutes (×2)
- **Problème** : Raw SQL filtre sur `whatsapp_chat` avec `status IN ('actif', 'en attente')` et `last_client_message_at` / `last_activity_at`. Sans index composite, ces requêtes font un scan de toute la table.
- **Effort** : XS (uniquement index — migration)
- **Action** : Ajouter dans la migration DB-13b (voir DB-13 étendu) :
  ```sql
  -- Déjà couvert partiellement par IDX_chat_analytics_status_time
  -- Vérifier si (status, last_activity_at) existe — sinon ajouter :
  ALTER TABLE `whatsapp_chat`
    ADD INDEX `IDX_chat_status_activity` (`status`, `last_activity_at`)
    ALGORITHM=INPLACE, LOCK=NONE;
  ```
- **Dépendances** : DB-13

---

### DB-23 — `OutboxProcessorService.processOutbox()` : boucle séquentielle de 20 entries 🟠 P1
- **Fichier** : `src/gicop-report/outbox-processor.service.ts:39`
- **Fréquence** : Toutes les minutes
- **Problème** : Traite 20 entries séquentiellement (4-5 requêtes par entry = 80-100 requêtes/déclenchement). Chaque entry est indépendante et pourrait être traitée en parallèle.
- **Effort** : S
- **Action** :
  ```typescript
  // Avant : séquentiel
  for (const entry of batch) {
    await this.processOne(entry);
  }

  // Après : parallèle (entries indépendantes)
  await Promise.allSettled(batch.map((entry) => this.processOne(entry)));
  ```
  Vérifier que `processOne` est safe en parallèle (pas de verrou partagé).
- **Dépendances** : Aucune

---

### DB-24 — `OrderCallSyncJob.syncClientCategories()` : 500-2000 UPDATEs séquentiels quotidiens 🟠 P1
- **Fichier** : `src/order-call-sync/order-call-sync.job.ts:89`
- **Fréquence** : Quotidien 02h00
- **Problème** : Boucle séquentielle d'UPDATE pour recalculer la catégorie de chaque client. Avec 1000 clients = 1000 requêtes UPDATE individuelles.
- **Effort** : M
- **Action** :
  1. Charger toutes les catégories DB2 en bulk au début
  2. Grouper les clients par catégorie cible
  3. Un seul UPDATE batch par catégorie :
  ```typescript
  // Par groupe de catégorie
  for (const [category, clientIds] of categoryGroups) {
    await this.contactRepo
      .createQueryBuilder()
      .update()
      .set({ category })
      .where('id IN (:...ids)', { ids: clientIds })
      .execute();
  }
  // N catégories distinctes ≪ N clients
  ```
- **Dépendances** : Aucune

---

### DB-25 — `FollowUpService.markOverdue()` : index manquant sur `(status, scheduled_at)` 🟠 P1
- **Fichier** : `src/follow-up/follow_up.service.ts:216`
- **Fréquence** : Toutes les 30 minutes
- **Problème** : UPDATE de masse `WHERE status = 'PLANIFIEE' AND scheduled_at < NOW()` sans index composite — potentiellement full scan de `follow_up`.
- **Effort** : XS (migration uniquement)
- **Action** : Ajouter dans DB-13 étendu :
  ```sql
  ALTER TABLE `follow_up`
    ADD INDEX `IDX_followup_status_scheduled` (`status`, `scheduled_at`)
    ALGORITHM=INPLACE, LOCK=NONE;
  ```
- **Dépendances** : DB-13

---

### DB-26 — `ValidationEngineService.handleExternalCriterionTimeout()` : N+1 chatRepo.findOne 🟡 P2
- **Fichier** : `src/window/services/validation-engine.service.ts:240`
- **Fréquence** : Toutes les heures
- **Problème** : Pour chaque validation `call_confirmed` non validée, un `chatRepo.findOne()` individuel. Similaire à DB-5 mais sur une méthode différente.
- **Effort** : S
- **Action** : Même pattern que DB-5 — bulk load des chats avec `In(chatIds)` avant la boucle.
- **Dépendances** : Index `IDX_conv_validation_type_validated` (DB-13)

---

### DB-27 — `ErpClientSyncService.syncErpClients()` : boucle séquentielle de recatégorisation 🟡 P2
- **Fichier** : `src/erp-client-sync/erp-client-sync.service.ts:38`
- **Fréquence** : Quotidien 02h00
- **Problème** : Second pass de recatégorisation effectue N UPDATE séquentiels.
- **Effort** : S
- **Action** : Grouper par catégorie cible + batch UPDATE (même pattern que DB-24).
- **Dépendances** : DB-24 (réutiliser le pattern)

---

### DB-28 — `ChannelHealthService.checkAllMetaChannels()` : N+1 appels HTTP séquentiels 🟡 P2
- **Fichier** : `src/channel/channel-health.service.ts:35`
- **Fréquence** : Toutes les heures
- **Problème** : Appels HTTP Meta Graph API séquentiels pour chaque canal Meta. Pas de parallélisation.
- **Effort** : XS
- **Action** :
  ```typescript
  // Avant : séquentiel
  for (const channel of metaChannels) {
    await this.checkChannel(channel);
  }

  // Après : parallèle avec limite de concurrence
  await Promise.all(metaChannels.map((c) => this.checkChannel(c)));
  ```
- **Dépendances** : Aucune (pas de requête BDD, seulement HTTP)

---

### DB-13 étendu — Migration index : 4 index supplémentaires issus de l'analyse crons 🟠 P1

> À ajouter dans la migration `AddMissingServiceIndexes1750780800001` (DB-13) ou dans une migration séparée.

```sql
-- 8. follow_up : status + scheduled_at (markOverdue cron 30m)
ALTER TABLE `follow_up`
  ADD INDEX IF NOT EXISTS `IDX_followup_status_scheduled` (`status`, `scheduled_at`)
  ALGORITHM=INPLACE, LOCK=NONE;

-- 9. whatsapp_chat : status + last_activity_at (pollInactivity cron 5m)
ALTER TABLE `whatsapp_chat`
  ADD INDEX IF NOT EXISTS `IDX_chat_status_activity` (`status`, `last_activity_at`)
  ALGORITHM=INPLACE, LOCK=NONE;

-- 10. flow_session : status + created_at (findExpiredWaitingDelay cron 30s)
ALTER TABLE `flow_session`
  ADD INDEX IF NOT EXISTS `IDX_flow_session_status_created` (`status`, `created_at`)
  ALGORITHM=INPLACE, LOCK=NONE;

-- 11. integration_sync_log : status + created_at (purgeOldSuccess)
ALTER TABLE `integration_sync_log`
  ADD INDEX IF NOT EXISTS `IDX_sync_log_status_created` (`status`, `created_at`)
  ALGORITHM=INPLACE, LOCK=NONE;
```

---

## Récapitulatif global par sprint

| Sprint | Tâches | Effort | Impact attendu |
|---|---|---|---|
| **Sprint 1 — P0 services** | DB-1, DB-2, DB-3, DB-4, DB-5, DB-6 | ~4 jours | Réduction CPU dispatch + SLA + window cron |
| **Sprint 2 — P1 services** | DB-7, DB-8, DB-9, DB-10, DB-11, DB-12 | ~4 jours | Réduction requêtes BDD chemins fréquents |
| **Sprint 3 — Index + P2** | DB-13 (11 index), DB-14, DB-15, DB-16, DB-17, DB-18, DB-19 | ~3 jours | Index manquants + optimisations mémoire |
| **Sprint 4 — Crons** | DB-20, DB-21, DB-22, DB-23, DB-24, DB-25, DB-26, DB-27, DB-28 | ~5 jours | Réduction charge crons haute fréquence |
| **Total** | **28 tâches** | **~16 jours** | |

---

## Ordre d'implémentation recommandé

```
Sprint 1 (P0 — dans l'ordre d'impact décroissant) :
  DB-3  [XS — 1 ligne, impact immédiat sur dispatch]
  DB-6  [XS — bug actif MySQL]
  DB-1  [S — full table scan missed calls]
  DB-4  [S — Promise.all window rotation cron/min]
  DB-5  [S — N+1 validation engine]
  DB-2  [M — SLA N+1 + cache règles]

Sprint 2 (P1 services) :
  DB-13 [S — migration 11 index, à faire en tout premier car prérequis DB-7, DB-25, DB-26]
  DB-10 [S] + DB-8 [S] + DB-7 [S]  en parallèle
  DB-11 [S] + DB-9 [M]              en parallèle
  DB-12 [M]

Sprint 3 (P2 + optimisations) :
  DB-14 [XS] + DB-15 [S] + DB-16 [S] + DB-19 [S]  en parallèle
  DB-17 [M]
  DB-18 [L — dénormalisation, risque élevé, à faire en dernier]

Sprint 4 (Crons) :
  DB-20 [L — OrderCallSync 30s, dominant]
  DB-21 [M — FollowUpReminder N+1]  en parallèle avec DB-20
  DB-23 [S — Outbox parallélisation]
  DB-24 [M] + DB-27 [S]  en parallèle
  DB-25 [XS] + DB-22 [XS] + DB-26 [S] + DB-28 [XS]  en parallèle
```

---

## Inventaire complet des crons — charge estimée

| Cron | Fréquence | Requêtes/déclench. | Impact | Tâche |
|---|---|---|---|---|
| `OrderCallSyncJob.run()` | 30s | 20-40 | 🔴 Critique | DB-20 |
| `WindowRotationService.autoCheckRotations()` | 1m | 20-100 | 🔴 Critique | DB-4 (Sprint 1) |
| `FlowPollingJob.pollInactivity()` | 5m | 2-100 | 🟠 Important | DB-22 |
| `FlowPollingJob.pollQueueWait()` | 5m | 2-50 | 🟠 Important | DB-22 |
| `FollowUpReminderService.sendReminders()` | 5m | 2-50 | 🟠 Important | DB-21 |
| `OutboxProcessorService.processOutbox()` | 1m | 81-101 | 🟠 Important | DB-23 |
| `AgentPresenceService.refreshAll()` | 25s | 0 (Redis) | ✅ OK | — |
| `FlowPollingJob.resumeExpiredWaiting()` | 30s | 1-20 | ✅ OK | — |
| `FlowPollingJob.checkNoResponseSessions()` | 1m | 1-10 | ✅ OK | — |
| `OutboxAlertService.checkOutboxHealth()` | 5m | 2 | ✅ OK | — |
| `FollowUpService.markOverdue()` | 30m | 1 | 🟠 Index manquant | DB-25 |
| `OrderCallSyncJob.retryObligations()` | 5m | 1-30 | 🟠 Important | DB-20 (partiel) |
| `OrderCallSyncJob.retryUnresolved()` | 15m | 1-20 | ✅ OK | — |
| `ChannelHealthService.checkAllMetaChannels()` | 1h | 1+N HTTP | 🟡 P2 | DB-28 |
| `FlowSessionCleanerJob.expireOrphanedSessions()` | 1h | 2-20 | ✅ OK | — |
| `ValidationEngineService.handleExternalCriterionTimeout()` | 1h | 2-20 | 🟡 P2 | DB-26 |
| `ErpClientSyncService.syncErpClients()` | 2h | 15-30 | 🟡 P2 | DB-27 |
| `OrderCallSyncJob.syncClientCategories()` | quotidien 2h | 500-2000 | 🟠 Important | DB-24 |
| `DailyResetJob.resetWorkingToday()` | quotidien 0h | 6-8 | ✅ OK | — |
| `OrderCallSyncJob.resetWorkingToday()` | quotidien 0h | 1 | ✅ OK | — |
| `MediaBackfillService.backfillMediaDownloads()` | quotidien 3h | 1 | ✅ OK | — |
| `MediaBackfillService.markExpiredMediaUrls()` | quotidien 4h | 1 | ✅ Index manquant | DB-13 |
| `CommercialDailySnapshotService.computeDailySnapshot()` | quotidien 23h55 | 50-200 | 🟡 P2 | DB-15 |
| `OrderCallSyncJob.cleanOrphans()` | dim. 3h | 10-20 | ✅ OK | — |
| `OrderCallSyncJob.purgeOldSyncLogs()` | dim. 4h | 2 | ✅ OK | — |
| `OrderCallSyncJob.cleanNonOutgoingUnresolved()` | dim. 5h | 1 | ✅ OK | — |
| `CalendarRegenJob.regenerateAll()` | mensuel 1h | 3-10 | ✅ OK | — |
| `MediaBackfillService.purgeOldLocalFiles()` | mensuel 5h | 1-200 | 🟡 Séquentiel | DB-16 |

---

## Gains estimés par correction

| Tâche | Requêtes économisées | Fréquence |
|---|---|---|
| DB-3 — supprimer `relations['messages']` | N messages → 0 | Chaque message entrant |
| DB-20 — OrderCallSync bulk | 20-40 → ~5 requêtes | Toutes les 30s |
| DB-4 — `Promise.all` window rotation | Séquentiel → parallèle | Chaque minute |
| DB-21 — FollowUp bulk load | 7-8/relance → 1 | Toutes les 5m |
| DB-1 — agrégation SQL missed calls | N lignes → 1 requête | Chaque vue dashboard |
| DB-2 — SLA N+1 | N+1 → 2 requêtes fixes | Chaque check SLA |
| DB-10 — EXISTS corrélé → unread_count | N sous-requêtes → 0 | Chaque liste admin |
| DB-24 — Batch UPDATE catégories | 500-2000 → ~10 UPDATE | Quotidien 2h |
| DB-13 — 11 index | Scans séquentiels → lookup | Tous les crons |
