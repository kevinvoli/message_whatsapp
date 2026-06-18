# Backlog Sprint 1 — Axe B Backend : Modules + Correctifs à porter dans master
> Branche cible : `feature/convergence-production`  
> Priorité : **P0 — Bloquant avant go-live**  
> Semaine 1 (backend) + début semaine 2  
> Source : sections 10.2, 10.2b, 10.2c du plan de migration V2

---

## Domaine 1 — Médias et médiathèque

### B1-1 — `src/media-asset/` (backend)
- **Effort :** M
- **Statut production :** Livré
- **Ce qu'il faut porter :**
  - Entité `MediaAsset` (TypeORM, table `media_asset`)
  - `MediaAssetService` : CRUD, upload, compteur `usage_count`
  - `MediaAssetController` : endpoints `GET/POST/DELETE /api/media-asset`
  - Module `MediaAssetModule`
- **Dépendance migration :** `ConvergenceProductionToMasterV2_1748995200099` (crée la table `media_asset`)
- **Non-régression :** médiathèque admin et messages auto avec média doivent fonctionner

### B1-18 — `src/media-storage/` (backend)
- **Effort :** M
- **Ce qu'il faut porter :**
  - `MediaStorageService` : téléchargement asynchrone des médias (`setImmediate` dans `saveMedia()`)
  - `MediaDownloadService` : HTTP download + stockage local `uploads/media/`
  - `MediaBackfillService` : crons de backfill pour les médias existants
  - `ProfilePicStorageService` (B1-26) : téléchargement photos de profil Messenger → `uploads/profile-pics/`
  - `GalerieMediaService` (B1-25) + `GalerieMediaController` : endpoint `GET /api/galerie-media?channel_id=&poste_id=&direction=&media_type=`
- **Dépendance migration :** `AddLocalMediaStorage1749427200001`
- **Point d'attention :** `useStaticAssets` doit servir `/uploads/media/...` et `/uploads/profile-pics/...`
- **Non-régression :** vérifier que `setImmediate` ne bloque pas le webhook entrant

---

## Domaine 2 — Lien campagne

### B1-2 — `src/campaign-link/` (backend)
- **Effort :** M
- **Ce qu'il faut porter :**
  - Entité `CampaignLink` + `CampaignLinkClick`
  - `CampaignLinkService` : CRUD, génération `short_code`, compteur clics/conversions
  - `CampaignLinkController` : endpoints CRUD + redirect `GET /c/:shortCode`
  - Module `CampaignLinkModule`
- **Dépendance migration :** `ConvergenceProductionToMasterV2_1748995200099` (crée `campaign_link` + `campaign_link_click`)
- **Non-régression :** redirect short link → WhatsApp doit fonctionner, `click_count` incrémenté

---

## Domaine 3 — Connexions et sessions

### B1-3 — `src/connection-log/` (backend)
- **Effort :** S
- **Ce qu'il faut porter :**
  - Entité `MessagingConnectionLog`
  - `ConnectionLogService` : `login()`, `logout()`, calcul durée session
  - Injection dans `whatsapp_message.gateway.ts` : appel `login()` dans `handleConnection()`, `logout()` dans `handleDisconnect()`
- **Dépendance migration :** `ConnectionLog1746057600007`
- **Non-régression :** ne pas casser `handleConnection` existant dans master

### B1-15 — `src/chat-session/` (backend)
- **Effort :** L
- **Ce qu'il faut porter :**
  - Entité `ChatSession`
  - `ChatSessionService` : source de vérité session CTWA/normal, `openSession()`, `closeSession()`, `isSessionActive()`, calcul `window_expires_at`
  - Integration dans le dispatcher et webhook handler
- **Dépendances migrations :** `AddChatSessionEntity1780531200000` + `FixActiveSessionIdCollation1780704000000`
- **Non-régression :** la logique de fenêtre 24h existante sur master ne doit pas être cassée

---

## Domaine 4 — Restrictions et contrôle

### B1-4 — `message-read.service.ts` + rate-limiter lecture
- **Effort :** S
- **Ce qu'il faut porter :**
  - `MessageReadService` : `markAsRead()`, `recordReadActivity()`, rate-limit lecture (`max_read_messages_per_minute`)
  - Injection dans le gateway
- **Dépendance migration :** `AddMessageReadTracking1748822400001`

### B1-14 — `src/conversation-restriction/` (backend)
- **Effort :** M
- **Ce qu'il faut porter :**
  - Entité `ConversationRestrictionAccess`
  - `ConversationRestrictionService` : `checkRestriction()`, `recordAccess()`, filtre `poste_id !== null`
  - Module `ConversationRestrictionModule`
- **Dépendance migration :** `ConversationRestrictionAccess1748649600001`
- **Non-régression :** doit fonctionner de pair avec les correctifs C6, C7, C8 (voir Domaine 8)

### B1-23 — `src/message-restriction/` (backend)
- **Effort :** S
- **Statut production :** Livré (aucune migration SQL requise)
- **Ce qu'il faut porter :**
  - `MessageRestrictionService` : validation longueur mot (`MSG_RESTRICTION_MAX_WORD_LENGTH`), répétitions (`MSG_RESTRICTION_MAX_REPEATED_CHARS`), durée audio (`MSG_RESTRICTION_MIN_AUDIO_DURATION_SECONDS`)
  - Insertion des 4 clés dans `system_configs` via `onModuleInit` : `INSERT IGNORE INTO system_configs ...`
  - Guard dans le gateway avant envoi message
- **Non-régression :** restriction inactive par défaut (`MSG_RESTRICTION_ENABLED = "false"`) — ne pas bloquer l'envoi si la clé est absente

---

## Domaine 5 — Jobs et automatisations

### B1-6 — `idle-disconnect.job.ts` + `tasks.service.ts`
- **Effort :** M
- **Ce qu'il faut porter :**
  - Job `@Cron` idle-disconnect : déconnecte les commerciaux inactifs après `idle_disconnect_minutes`
  - Avertissement avant déconnexion (`idle_warning_seconds`)
  - Cooldown entre lectures : modal `ReadCooldownModal` côté front (voir sprint 2)
- **Dépendance migration :** `AddIdleDisconnectSettings1748822400002` + `AddCooldownAndWarningSettings1748908800002`
- **Non-régression :** postes à canal dédié sont exemptés (vérifier `channel.poste_id IS NOT NULL`)

### B1-20 — Module Window Reminder (cron J)
- **Effort :** M
- **Ce qu'il faut porter :**
  - Job cron `window-reminder.job.ts` : envoie message de rappel avant expiration fenêtre 24h/72h
  - Lecture config depuis `cron_config` : `window_reminder_normal_start_min`, `window_reminder_ctwa_start_min`, `window_reminder_min_replies`, `ttl_days_ctwa`
  - `ttl_days_ctwa` doit être lu depuis `cron_config` et non codé en dur (correctif D1)
- **Dépendance migration :** `AddWindowReminderSection1780531200001` + `AddWindowReminderCronFields1780531200002`

### B1-5 — `commercial-stats.service.ts` (backend)
- **Effort :** S
- **Ce qu'il faut porter :**
  - `CommercialStatsService` : endpoint `GET /api/metriques/commerciaux-stats`
  - Agrégation `messages_read_count`, `messages_handled_count`, `last_activity_at` + sessions depuis `messaging_connection_log`
- **Dépendance migration :** `AddMessageReadTracking1748822400001` + `ConnectionLog1746057600007`

---

## Domaine 6 — Meta Ad Referral (CTWA)

### B1-16 — `src/meta-ad-referral/` (backend)
- **Effort :** M
- **Ce qu'il faut porter :**
  - Entité `MetaAdReferral`
  - Handler webhook referral : extrait les données `click_to_whatsapp` des webhooks Meta
  - Logique fenêtre 72h CTWA : `is_ctwa = 1` → `ttl_days_ctwa` jours au lieu de 24h
  - Endpoint admin `GET /api/metriques/meta-ad-kpi` (B2-6, P1)
- **Dépendance migration :** `AddMetaAdReferral1780272000001`
- **Non-régression :** les webhooks Meta non-CTWA ne doivent pas être affectés

---

## Domaine 7 — QCM quotidien

### B1-17 — `src/quiz/` (backend)
- **Effort :** L
- **Ce qu'il faut porter :**
  - Entités : `QuizCategory`, `QuizQuestion`, `QuizAnswer`, `QuizSession`, `QuizSessionQuestion`, `QuizAttempt`, `QuizAnswerAttempt`, `QuizPdf`, `QuizExemption`
  - Services : `QuizService`, `QuizPdfService` (B1-27), `QuizExemptionService` (B1-27), `QuizAttemptService` (B1-27)
  - Controller : CRUD catégories/questions, sessions, résultats, PDFs
  - Middleware guard : bloque l'accès au chat si quiz du jour non complété (sauf exempté)
- **Dépendance migration :** `AddQuizSystem1749686400000`
- **Non-régression :** le guard quiz ne doit pas bloquer les commerciaux exemptés ni ceux sans session active

---

## Domaine 8 — Provider Instagram

### B1-24 — `src/communication_whapi/communication_instagram.service.ts`
- **Effort :** S
- **Statut production :** Livré (~90% implémenté)
- **Ce qu'il faut porter :**
  - Correctifs caption dans `sendMediaMessage()` (transmise correctement)
  - Correction format JSON payload selon l'API Instagram Graph
  - `provider = 'instagram'` reconnu dans `OutboundRouterService`
- **Dépendance migration :** `FixInstagramMessageIdLength1780876800001` (VARCHAR(512))
- **Non-régression :** les providers `whapi` et `meta` ne doivent pas être affectés

---

## Domaine 9 — Correctifs critiques production → master (C1..C10)

> **Dépendances obligatoires :** C8 avant C6, C5 avant C6 et C7, C9+C10 après C7

| # | Fichier | Changement | Nature | Après avoir porté |
|---|---|---|---|---|
| C8 | `src/conversation-restriction/conversation-restriction.service.ts` | Filtre poste : `chat.poste_id !== posteId` (supprimer `&& chat.poste_id !== null`) | Fix Bug #7 comptage incorrect | B1-14 |
| C5 | `src/whatsapp_message/whatsapp_message.gateway.ts` | Méthode `isRestrictionExemptPoste(agent)` — factorise détection poste dédié / config désactivée | Factorisation | B1-14 |
| C6 | `src/whatsapp_message/whatsapp_message.gateway.ts` | Guard `RESTRICTION_TRIGGERED` dans `handleSendMessage` — bloque si restriction active | Fix Bug #3 (guard backend) | C5 + C8 |
| C7 | `src/whatsapp_message/whatsapp_message.gateway.ts` | Nouveau handler `@SubscribeMessage('restriction:check')` — lecture seule du statut, sans `recordAccess()` | Fix Bug #3 (reconnect) | C5 |
| C4 | `src/whatsapp_message/whatsapp_message.gateway.ts` | Fermeture immédiate via `closeExpiredChatByWindowExpiry()` dans `handleSendMessage` quand `windowExpired = true` + injection `ChatSessionService` | Fix comportement fenêtre | B1-15 |
| C2 | `src/dispatcher/dispatcher.service.ts` | Méthode `reactivateWaitingConversationsForPoste(posteId)` — remet ACTIF les conversations EN_ATTENTE à la reconnexion | Fix Bug #5 | — |
| C3 | `src/whatsapp_message/whatsapp_message.gateway.ts` | Appel `reactivateWaitingConversationsForPoste(posteId)` dans `handleConnection()`, après `setActive()` | Fix Bug #5 | C2 |

**Vérification après portage C1..C10 :**
```bash
npm test -- --testPathPattern=conversation-restriction
npm test -- --testPathPattern=gateway
```

---

## Domaine 10 — Correctifs UX/qualité (D1..D5)

| # | Fichier | Changement | Nature |
|---|---|---|---|
| D1 | `src/jorbs/read-only-enforcement.job.ts` + `src/chat-session/chat-session.service.ts` | Lire `ttl_days_ctwa` depuis `cron_config` au lieu de la valeur codée en dur `72` | Fix cron fermeture CTWA |
| D3 | Backend `GET /chats?q=` | Ajouter paramètre recherche avec debounce — requête SQL réelle au lieu de filtre mémoire | Fix UX recherche (endpoint backend) |

---

## Checklist de non-régression backend

Après chaque module porté :

- [ ] `tsc --noEmit` dans `message_whatsapp/` : **0 erreur**
- [ ] `npm test` : 0 régression sur les tests existants
- [ ] Les modules existants (dispatcher, FlowBot, SLA, audit) démarrent sans erreur
- [ ] `handleConnection()` / `handleDisconnect()` du gateway fonctionnent (connexion commercial)
- [ ] Les webhooks Whapi et Meta sont toujours traités (idempotence préservée)
- [ ] `OutboundRouterService` route correctement `whapi`, `meta`, `messenger`, `instagram`
- [ ] Postes à canal dédié restent exemptés (rate-limit, cooldown, idle-disconnect)
- [ ] `INSERT IGNORE INTO system_configs` (message-restriction) ne double pas les clés existantes
