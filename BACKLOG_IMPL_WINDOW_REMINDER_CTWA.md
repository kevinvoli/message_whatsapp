# BACKLOG — Implémentation Window Reminder + Fermeture CTWA différenciée

> Source : `PLAN_WINDOW_REMINDER_CTWA.md`
> Date création : 2026-06-04 | Branche : `production`
> Points de vigilance P1-P6 intégrés comme tâches bloquantes

---

## Progression globale

| Sprint | Titre | Statut |
|---|---|---|
| Sprint 0 | Fondation ChatSession | ⬜ À faire |
| Sprint A | Migrations Section J + entités | ⬜ À faire |
| Sprint B | Job J backend | ⬜ À faire |
| Sprint C | Admin UI | ⬜ À faire |

---

## Sprint 0 — Fondation ChatSession

> **Prérequis de tout le reste.** Peut être livré et validé indépendamment.
> Les jobs existants (A, E, etc.) continuent de lire `WhatsappChat` — aucun changement sur eux.

---

### S0-0 — [BLOQUANT] Lire `read-only-enforcement.job.ts` actuel

**Pourquoi en premier :** Le plan copie le comportement `read_only: false` dans
`closeExpiredSessionAndChat()` avec la note "vérifier". Avant d'écrire une seule
ligne, confirmer la valeur réelle appliquée par le cron actuel pour ne pas inverser
l'état des chats fermés.

**Tâche :**
- Lire `message_whatsapp/src/jorbs/read-only-enforcement.job.ts`
- Relever la valeur de `read_only` dans le bloc de fermeture
- Corriger la valeur dans le plan si nécessaire

**Fichiers :** `jorbs/read-only-enforcement.job.ts` (lecture seule)
**Critère :** valeur `read_only` confirmée et notée avant S0-3

---

### S0-1 — [BLOQUANT] Résoudre la dépendance circulaire module (P1)

**Problème :** La Décision 6 du plan injecte `CronConfigService` (module `jorbs`)
dans `ChatSessionService` (module `chat-session`). Mais `jorbs` importe `chat-session`
→ dépendance circulaire NestJS = crash au démarrage.

**Solution retenue :** Passer les TTL (`ttlNormalHours`, `ttlCtwaHours`) en
**paramètres** de `openSession()` et `onClientMessage()` plutôt que de les lire
dans `ChatSessionService`. C'est le job appelant qui lit `CronConfigService` et
passe les valeurs — `ChatSessionService` reste pur, sans dépendance vers `jorbs`.

```typescript
// Signature mise à jour :
async openSession(
  whatsappChatId: string,
  isCtwa: boolean,
  ttlNormalHours: number,   // lu par l'appelant depuis CronConfigService
  ttlCtwaHours: number,
  referral?: ReferralData,
): Promise<ChatSession>

async onClientMessage(
  sessionId: string,
  whatsappChatId: string,
  ttlNormalHours: number,
  referral?: ReferralData,
): Promise<void>
```

**Fichiers :**
- `chat-session/chat-session.service.ts` (signatures à adapter)
- `inbound-message/inbound-message.service.ts` (appelant — lit la config)
**Critère :** aucun import circulaire dans le graphe de modules NestJS

---

### S0-2 — Migration `AddChatSessionEntity1780531200000`

**Contenu :**
1. `CREATE TABLE chat_session` avec tous les champs du plan
2. Index `IDX_chat_session_active (whatsapp_chat_id, ended_at)`
3. Index `IDX_chat_session_window (auto_close_at, last_window_reminder_sent_at)` — job J
4. **Index ajouté (P5) :** `IDX_chat_session_enforcement (ended_at, auto_close_at)` — cron fermeture
5. `ALTER TABLE whatsapp_chat ADD COLUMN active_session_id CHAR(36) NULL DEFAULT NULL`
6. Backfill INSERT sessions pour tous les chats `status != 'fermé'`
7. Backfill UPDATE `whatsapp_chat.active_session_id`

**Règles backfill :**
- `started_at = COALESCE(last_client_message_at, createdAt)` (colonne SQL `createdAt` sans underscore)
- `service_window_expires_at = started_at + 24h`
- `free_entry_expires_at = started_at + 72h` si `is_ctwa = 1`, sinon NULL
- `auto_close_at = GREATEST(service, free_entry)` si CTWA, sinon `service`

**Fichier :** `migrations/AddChatSessionEntity1780531200000.ts`
**Critère :** migration passe sans erreur ; `SELECT COUNT(*) FROM chat_session` = nombre de chats ouverts

---

### S0-3 — Vérification post-backfill obligatoire (P4)

**À exécuter après S0-2, avant tout déploiement de code :**

```sql
-- Doit retourner 0
SELECT COUNT(*) FROM whatsapp_chat
WHERE status != 'fermé' AND active_session_id IS NULL;

-- Contrôle cohérence : chaque session active pointe bien sur un chat ouvert
SELECT COUNT(*) FROM chat_session cs
LEFT JOIN whatsapp_chat wc ON wc.active_session_id = cs.id
WHERE cs.ended_at IS NULL AND wc.id IS NULL;
-- Doit retourner 0
```

Si > 0 sur la première requête : relancer le UPDATE du backfill sur les manquants
avant de continuer.

**Critère :** les deux requêtes retournent 0

---

### S0-4 — Entité `ChatSession` TypeORM

**Fichier à créer :** `message_whatsapp/src/chat-session/entities/chat-session.entity.ts`

Reprendre exactement l'entité du plan § "Entité ChatSession". Vérifier :
- Pas de `@BeforeInsert` / `@BeforeUpdate` (non déclenchés par QueryBuilder)
- FK `@ManyToOne(() => WhatsappChat)` avec `@JoinColumn({ name: 'whatsapp_chat_id', referencedColumnName: 'id' })`

**Fichier :** `chat-session/entities/chat-session.entity.ts`
**Critère :** `0 erreur TypeScript`

---

### S0-5 — Entité `WhatsappChat` : colonne `active_session_id`

Ajouter sur `WhatsappChat` :
```typescript
@Column({ name: 'active_session_id', type: 'char', length: 36, nullable: true, default: null })
activeSessionId: string | null;
```

**Fichier :** `whatsapp_chat/entities/whatsapp_chat.entity.ts`
**Critère :** `0 erreur TypeScript`

---

### S0-6 — `ChatSessionService` — toutes les méthodes

**Fichier à créer :** `message_whatsapp/src/chat-session/chat-session.service.ts`

Méthodes à implémenter (voir code complet dans le plan § "Patron de synchronisation") :

| Méthode | Description |
|---|---|
| `openSession(chatId, isCtwa, ttlNormalH, ttlCtwaH, referral?)` | Crée session + sync WhatsappChat. SELECT FOR UPDATE anti-doublon. |
| `onClientMessage(sessionId, chatId, ttlNormalH, referral?)` | Met à jour session + upgrade CTWA si referral. |
| `onPosteMessage(sessionId)` | Met à jour `lastPosteMessageAt` seulement. |
| `closeSession(sessionId, chatId)` | Ferme session uniquement (pas le chat). |
| `closeExpiredSessionAndChat(sessionId, chatId, chatBusinessId)` | Ferme session + chat (transactionnel). Valeur `read_only` confirmée en S0-0. |
| `markWindowReminderSent(sessionId, chatId)` | UPDATE atomique `IS NULL` → retourne false si déjà marqué. |
| `getActiveSession(chatId)` | Retourne la session active ou null. |

**Règles :**
- Toutes les écritures multi-tables dans `dataSource.transaction()`
- `markWindowReminderSent` : condition `.andWhere('last_window_reminder_sent_at IS NULL')` — pas de `OR < last_client_message_at`

**Fichier :** `chat-session/chat-session.service.ts`
**Critère :** `0 erreur TypeScript` ; méthodes couvertes par tests unitaires (mocks DataSource)

---

### S0-7 — `ChatSessionModule` NestJS

**Fichier à créer :** `message_whatsapp/src/chat-session/chat-session.module.ts`

```typescript
@Module({
  imports: [TypeOrmModule.forFeature([ChatSession, WhatsappChat])],
  providers: [ChatSessionService],
  exports: [ChatSessionService],
})
export class ChatSessionModule {}
```

Importer `ChatSessionModule` dans `InboundMessageModule` et dans `JorbsModule`
(ou le module qui contient `read-only-enforcement`).

**Critère :** application démarre sans erreur de module

---

### S0-8 — `inbound-message.service.ts` : intégration ChatSession (P3)

**Fichier :** `message_whatsapp/src/inbound-message/inbound-message.service.ts`

**Logique à ajouter sur chaque message client entrant :**

```typescript
// Lire les TTL depuis CronConfigService (l'appelant passe les valeurs à ChatSessionService)
const config = await this.cronConfigService.findByKey('read-only-enforcement');
const ttlNormal = config?.ttlDays ?? 24;
const ttlCtwa   = config?.ttlDaysCtwa ?? 72;

// Extraire referral Meta si présent dans le payload
const referral = extractReferral(messagePayload); // champ à identifier (voir plan § Décision 1)

try {
  if (chat.activeSessionId) {
    await this.chatSessionService.onClientMessage(
      chat.activeSessionId, chat.id, ttlNormal, referral,
    );
  } else {
    await this.chatSessionService.openSession(
      chat.id,
      !!referral?.sourceId,
      ttlNormal,
      ttlCtwa,
      referral,
    );
  }
} catch (err) {
  // P3 : échec ChatSession = non-bloquant, le message est traité normalement
  this.logger.error('ChatSession sync failed (non-blocking)', err);
}

// Pour les messages commerciaux (poste) :
try {
  if (chat.activeSessionId) {
    await this.chatSessionService.onPosteMessage(chat.activeSessionId);
  }
} catch (err) {
  this.logger.error('ChatSession poste sync failed (non-blocking)', err);
}
```

**Champ referral résolu (D-1) :** utiliser directement `message.metaReferral` — déjà
normalisé par `meta.adapter.ts` dans `UnifiedMessage`. Aucune extraction supplémentaire
nécessaire.

```typescript
// Lecture directe — pas de fonction extractReferral() à créer
const referral = message.metaReferral ?? undefined;
```

**Contrainte CTWA :** uniquement pour `provider === 'meta'`. Les canaux Whapi n'exposent
pas de referral dans leurs webhooks → `metaReferral` sera toujours `undefined` pour Whapi
→ `isCtwa` toujours `false` sur Whapi. Tester la recette CTWA exclusivement sur un canal Meta.

**Critère :** un message client entrant ne peut pas être bloqué par une erreur ChatSession

---

### S0-9 — `read-only-enforcement.job.ts` : migration vers ChatSession

**Fichier :** `message_whatsapp/src/jorbs/read-only-enforcement.job.ts`

Remplacer `findEligibleByClientInactivity()` par `findExpiredSessions()` selon le
plan § US 2.1, avec **correction P2** :

```typescript
// ✅ Correct (P2 : supprimer IS NULL — auto_close_at est toujours calculé)
.andWhere('s.auto_close_at < :now', { now: new Date() })

// ❌ À ne pas mettre :
// .andWhere('(s.auto_close_at IS NULL OR s.auto_close_at < :now)', ...)
```

Fermeture via `chatSessionService.closeExpiredSessionAndChat()` — valeur `read_only`
confirmée en S0-0.

**Dépendances :** S0-0 (valeur read_only), S0-6 (ChatSessionService), S0-7 (module)
**Critère :** les chats ouverts dont `auto_close_at` est dépassé sont bien fermés au prochain tick

---

## Sprint A — Migrations + Entités Section J

> Nécessite Sprint 0 terminé et validé.

---

### SA-1 — Migration `AddWindowReminderSection1780531200001`

**Contenu :**
1. ALTER `messages_predefinis` → ajouter `window_reminder` dans l'enum `trigger_type`
2. ALTER `messages_predefinis` → ajouter colonne `window_reminder_target ENUM('with_replies','no_replies') NULL`
3. ALTER `whatsapp_chat` → ajouter colonne `last_window_reminder_sent_at DATETIME NULL`
4. Index `IDX_chat_window_reminder ON whatsapp_chat (is_ctwa, last_client_message_at, last_window_reminder_sent_at)`

**Fichier :** `migrations/AddWindowReminderSection1780531200001.ts`
**Critère :** migration passe ; colonne visible dans les deux tables

---

### SA-2 — Migration `AddWindowReminderCronFields1780531200002`

**Contenu :**
1. ALTER `cron_config` → +6 colonnes (plages J + TTL CTWA) — voir plan § US 1.3
2. INSERT seed `window-reminder-auto-message` avec valeurs par défaut (10/120/10/240/1)
3. UPDATE `read-only-enforcement` → `ttl_days_ctwa = 72`

**Fichier :** `migrations/AddWindowReminderCronFields1780531200002.ts`
**Critère :** `SELECT * FROM cron_config WHERE key IN ('window-reminder-auto-message','read-only-enforcement')` retourne les deux lignes avec les bonnes valeurs

---

### SA-3 — Entité `MessageAuto` : enum + colonne

**Fichier :** `message_whatsapp/src/message-auto/entities/message-auto.entity.ts`

- Ajouter `WINDOW_REMINDER = 'window_reminder'` dans `AutoMessageTriggerType`
- Ajouter colonne `windowReminderTarget`

**Critère :** `0 erreur TypeScript`

---

### SA-4 — Entité `CronConfig` : 6 nouvelles colonnes

**Fichier :** `message_whatsapp/src/jorbs/entities/cron-config.entity.ts`

Ajouter les 6 colonnes du plan § US 1.3 :
`windowReminderNormalStartMin`, `windowReminderNormalEndMin`,
`windowReminderCtwaStartMin`, `windowReminderCtwaEndMin`,
`windowReminderMinReplies`, `ttlDaysCtwa`

**Critère :** `0 erreur TypeScript`

---

## Sprint B — Job J backend

> Nécessite Sprint A terminé.

---

### SB-1 — DTOs `create-message-auto` + `update-message-auto`

**Fichiers :**
- `message-auto/dto/create-message-auto.dto.ts`
- `message-auto/dto/update-message-auto.dto.ts`

Ajouter champ optionnel :
```typescript
@IsEnum(['with_replies', 'no_replies'])
@IsOptional()
windowReminderTarget?: 'with_replies' | 'no_replies' | null;
```

**Critère :** `0 erreur TypeScript` ; les endpoints create/update acceptent le nouveau champ

---

### SB-2 — `MessageAutoService` : nouvelles méthodes + extension existantes

**Fichier :** `message_whatsapp/src/message-auto/message-auto.service.ts`

1. **Étendre `getTemplateForTrigger`** : ajouter `windowReminderTarget` dans `options`,
   filtrer après `clientTypeTarget`
2. **Étendre `sendAutoMessageForTrigger`** : passer `windowReminderTarget` à `getTemplateForTrigger`
3. **Ajouter `hasWindowReminderTemplate(variant)`** : COUNT actif par variant
4. **Ajouter `sendWindowReminderWithTemplate(chatId, template)`** : envoie avec template
   déjà résolu (évite double-fetch)
5. **Extraire `sendResolvedTemplate(chat, template, triggerType)` privée** depuis
   `sendAutoMessageForTrigger` — ou accepter le double-fetch si extraction trop coûteuse

**Critère :** `0 erreur TypeScript` ; `hasWindowReminderTemplate` retourne false si aucun template actif

---

### SB-3 — `AutoMessageMasterJob` : méthode `runWindowReminder()`

**Fichier :** `message_whatsapp/src/jorbs/auto-message-master.job.ts`

**Injections à ajouter :**
```typescript
@InjectRepository(ChatSession)
private readonly sessionRepo: Repository<ChatSession>,
private readonly channelService: ChannelService,
private readonly chatSessionService: ChatSessionService,
```

**Enregistrement dans `run()` :**
```typescript
await this.safeRun('J-window-reminder', () => this.runWindowReminder());
```

**Logique `runWindowReminder()` :** voir plan § US 1.4 avec :
- Query source `ChatSession` (pas `WhatsappChat`)
- Filtre `c.active_session_id = s.id` (garde-fou session active)
- Filtre `s.ended_at IS NULL`
- Filtre `auto_close_at BETWEEN` selon `isCtwa`
- **Filtre `s.last_window_reminder_sent_at IS NULL`** (1 seul J par session)
- Pre-check `hasWindowReminderTemplate` avant la boucle (fast-exit si aucun template)
- Skip si `shouldSkipAutoClose(channelId)`
- Appel `markWindowReminderSent()` avant envoi (anti-concurrence)

**Critère :** `0 erreur TypeScript` ; un chat éligible reçoit exactement 1 message J par session

---

### SB-4 — Vérification comportement J : règle "1 par session"

**Test manuel à réaliser en recette :**

| Scénario | Résultat attendu |
|---|---|
| Chat dans la plage, `lastWindowReminderSentAt = null` | J envoyé, champ positionné |
| Même chat au tick suivant (champ non null) | J NON renvoyé |
| Client répond (fenêtre prolongée) → champ toujours non null | J NON renvoyé dans cette session |
| Chat fermé + client réécrit → nouvelle session (champ null) | J peut être envoyé |
| Canal `shouldSkipAutoClose = true` | J NON envoyé |
| Aucun template actif pour ce scope | J NON envoyé, session non marquée |

---

## Sprint C — Admin UI

> Nécessite Sprint B terminé.

---

### SC-1 — `definitions.ts` + `api.ts` admin

**Fichiers :**
- `admin/src/app/lib/definitions.ts` : +`WINDOW_REMINDER` dans l'enum trigger ; +`windowReminderTarget` sur le type `MessageAuto`
- `admin/src/app/lib/api.ts` : +`windowReminderTarget` dans les fonctions create/update

**Critère :** `0 erreur TypeScript` dans tout le projet admin

---

### SC-2 — Vue messages auto : variante J1/J2

**Fichier :** `admin/src/app/ui/MessageAutoView.tsx` (ou équivalent)

- Afficher badge "Réactivation avant expiration" pour `trigger_type = WINDOW_REMINDER`
- Afficher le variant `with_replies` (J1) / `no_replies` (J2)
- Dans le formulaire de création : si `trigger_type = WINDOW_REMINDER`, rendre
  `windowReminderTarget` **obligatoire** avec message d'erreur clair
- Aide contextuelle : "Le message doit inciter le client à répondre (question ou action
  courte). Un message sans call-to-action ne prolonge pas la fenêtre."

**Critère :** impossible de sauvegarder un template `WINDOW_REMINDER` sans variant

---

### SC-3 — Config cron : section J + TTL CTWA

**Fichier :** `admin/src/app/ui/GoNoGoView.tsx` (ou vue crons)

Pour `window-reminder-auto-message` :
- Toggle actif/inactif
- Plage normale : début (min) / fin (min)
- Plage CTWA : début (min) / fin (min)
- Min réponses J1 : champ `type="number" min="1" max="1"` (UI verrouillée à 1)

Pour `read-only-enforcement` :
- Champ "Délai fermeture clients Pub Meta (heures)" → `ttlDaysCtwa`, défaut 72

**Critère :** les valeurs se sauvegardent et sont lues correctement par le job au tick suivant

---

### SC-4 — (Bonus P2) Affichage campagne dans la vue conversation

Afficher `campaignName` + `campaignImageUrl` depuis la `ChatSession` active dans
l'en-tête ou le bandeau de la conversation, si disponibles.

**Dépendance :** endpoint à créer ou étendre pour exposer les données de session
**Critère :** visible en admin pour un chat CTWA avec référral campagne

---

## Checklist pré-déploiement Sprint 0

- [ ] S0-0 : valeur `read_only` confirmée dans le cron actuel
- [ ] S0-1 : dépendance circulaire résolue (TTL en paramètres)
- [ ] S0-2 : migration passée en staging
- [ ] S0-3 : vérification post-backfill `COUNT = 0`
- [ ] S0-9 : `auto_close_at IS NULL` absent de `findExpiredSessions()`
- [ ] Smoke test : envoyer un message client → vérifier `chat_session` créée + `active_session_id` mis à jour
- [ ] Smoke test : laisser `auto_close_at` expirer → vérifier fermeture automatique du chat

## Checklist pré-déploiement Sprint B

- [ ] Template J1 + J2 créés en admin avant activation du job
- [ ] `window-reminder-auto-message` enabled = false en production au déploiement (activer manuellement après validation)
- [ ] Vérifier SB-4 (tableau scénarios J) sur une conversation de test
- [ ] **Test D-2 réalisé** : résultat noté et décision prise avant activation CTWA

---

## Décisions en attente

### D-1 — Champ referral Meta : RÉSOLU

`message.metaReferral` dans `UnifiedMessage` — déjà normalisé par `meta.adapter.ts`.
Présent uniquement pour `provider === 'meta'`. Les canaux Whapi n'ont pas de CTWA.

**Champs disponibles :**
- `sourceId` → `ChatSession.ctwaReferralId`
- `headline` → `ChatSession.campaignName`
- `imageUrl` → `ChatSession.campaignImageUrl`
- `sourceType` (doit valoir `"ad"` pour un vrai CTWA — à vérifier dans la condition)

---

### D-2 — Messages libres après 24h en session CTWA : TEST REQUIS avant Sprint B CTWA

**Contexte :** Le cron actuel ferme tout après 24h. On n'a jamais envoyé de message
libre entre T+24h et T+72h en session CTWA. Comportement inconnu.

**Test à réaliser sur canal Meta :**
1. Créer une conversation CTWA (clic pub Meta réel)
2. Attendre T+25h (fenêtre service 24h expirée, CTWA 72h encore active)
3. Tenter `POST /messages` avec un message libre (non-template)
4. Observer la réponse HTTP

**Résultats possibles et impact :**

| Résultat | Impact sur le plan |
|---|---|
| `200 OK` | Plan V1 correct — activer J CTWA normalement |
| Erreur `4xx` de l'API Meta | J entre 24h-72h doit utiliser un template HSM. Modifier `runWindowReminder()` pour envoyer un template HSM si `session.isCtwa && now > session.serviceWindowExpiresAt` |
| Erreur `4xx` de Whapi avant Meta | Inapplicable : CTWA = Meta uniquement, pas Whapi |

**Décision provisoire :** activer J uniquement pour les sessions normales (isCtwa = false)
en V1. Activer J CTWA après confirmation du test.
