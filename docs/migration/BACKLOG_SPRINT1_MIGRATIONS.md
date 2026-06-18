# Backlog Sprint 1 — Axe A : Migrations DB à porter dans master
> Branche cible : `feature/convergence-production`  
> Priorité : **P0 — Bloquant avant tout dry-run**  
> Principe : toutes ces migrations existent dans `production` mais sont absentes de `master`. Sans elles, `npm run migration:run` laissera des tables/colonnes manquantes et les modules backend correspondants crasheront au démarrage.

---

## Règle d'exécution

TypeORM exécute les migrations dans l'ordre **lexicographique du timestamp** (13 chiffres). Respecter l'ordre ci-dessous pour éviter les conflits de dépendances.

---

## Groupe 1 — Infrastructure socle (à porter en premier)
> Ces migrations créent les tables de base requises par toutes les autres.

| # | Fichier migration | Action | Criticité |
|---|---|---|---|
| A-01 | `OutboundHsm1746000000001.ts` | Crée `whatsapp_template` (schéma V1 production) | **Critique** — doit précéder `FixWhatsappTemplateSchema1746620000001` (master) |
| A-02 | `OutboundHsmV2_1746000000002.ts` | Ajoute `rejection_reason` à `whatsapp_template` | **Critique** — après A-01 |
| A-03 | `ConnectionLog1746057600007.ts` | Crée `messaging_connection_log` (IF NOT EXISTS — idempotente) | **Critique** |
| A-04 | `ReadOnlyConfig1746144000008.ts` | Ajoute `read_only_after_messages` (whapi_channels), `poste_message_count_since_last_client` (whatsapp_chat), `read_only_max_messages` (dispatch_settings) | **Critique** |

**Point de vigilance A-01 :** cette migration doit s'exécuter avant `FixWhatsappTemplateSchema1746620000001` (master, timestamp 1746620000001). L'ordre est garanti par les timestamps (1746000000001 < 1746620000001) — ne pas modifier le timestamp.

---

## Groupe 2 — Tracking lectures et statistiques
> Colonnes de suivi des lectures et KPIs commerciaux.

| # | Fichier migration | Action | Criticité |
|---|---|---|---|
| A-05 | `ConversationRestrictionAccess1748649600001.ts` | Crée `commercial_conversation_access` — suivi accès/réponses | **Critique** — module restriction inopérant sans |
| A-06 | `AddMessageReadTracking1748822400001.ts` | Ajoute `read_by_commercial_id`, `read_by_commercial_at` (whatsapp_message) + `messages_read_count`, `messages_handled_count`, `last_activity_at` (whatsapp_commercial) | **Critique** |
| A-07 | `AddIdleDisconnectSettings1748822400002.ts` | Ajoute `max_read_messages_per_minute`, `idle_disconnect_enabled`, `idle_disconnect_minutes` à `dispatch_settings` | **Critique** |
| A-08 | `AddConversationTurnTracking1748908800001.ts` | Ajoute `is_first_reply` (TINYINT) à `whatsapp_message` | **Moyen** |
| A-09 | `AddCooldownAndWarningSettings1748908800002.ts` | Ajoute `read_cooldown_seconds`, `idle_warning_seconds` à `dispatch_settings` | **Critique** |

---

## Groupe 3 — Performance et trafic
> Index couvrants pour les vues de trafic et KPIs.

| # | Fichier migration | Action | Criticité |
|---|---|---|---|
| A-10 | `AddTrafficGroupingIndexes1748995200001.ts` | Ajoute colonnes virtuelles `hour_of_day`, `day_of_week_n` sur `whatsapp_message` + 3 index covering trafic | **Moyen** — vues trafic lentes sans |

**Note :** cette migration peut être longue sur une DB volumineuse (`whatsapp_message`). Mesurer la durée lors du dry-run.

---

## Groupe 4 — Données correctives (backfills)
> Migrations de correction de données existantes.

| # | Fichier migration | Action | Criticité |
|---|---|---|---|
| A-11 | `FixUnreadCountBatch1748995200002.ts` | Recalcule `unread_count` : fermé → 0, actif → recompte réel depuis `whatsapp_message` | **Critique** — badges non-lus incohérents sans |
| A-12 | `CleanupStaleConnectionLogs1749081600001.ts` | Supprime les logs connexion corrompus antérieurs au déploiement | **Moyen** — après A-03 |
| A-13 | `RestoreOrphanedSessions1749254400001.ts` | Ferme les sessions fantômes `messaging_connection_log`, reconstitue sessions actives | **Moyen** — après A-03 |

---

## Groupe 5 — Médias et médiathèque

| # | Fichier migration | Action | Criticité |
|---|---|---|---|
| A-14 | `AddMediaToAutoMessage1749168000001.ts` | Ajoute `media_asset_id` (FK → `media_asset`) à `messages_predefinis` | **Critique** — après `ConvergenceProductionToMasterV2_1748995200099` (master, qui crée `media_asset`) |
| A-15 | `AddLocalMediaStorage1749427200001.ts` | Ajoute `local_url`, `local_path`, `provider_url_expired`, `downloaded_at` à `whatsapp_media` | **Critique** — stockage local médias inopérant sans |
| A-16 | `AddMediaPanelToPoste1749513600001.ts` | Ajoute `media_panel_enabled`, `media_panel_types` à `whatsapp_poste` | **Moyen** — panneau médias commercial inopérant sans |

---

## Groupe 6 — Système QCM

| # | Fichier migration | Action | Criticité |
|---|---|---|---|
| A-17 | `AddQuizSystem1749686400000.ts` | Crée **9 tables** : `quiz_category`, `quiz_question`, `quiz_answer`, `quiz_session`, `quiz_session_question`, `quiz_attempt`, `quiz_answer_attempt`, `quiz_pdf`, `quiz_exemption` | **Critique** — module quiz inopérant sans |

**Note :** vérifier la durée de création des 9 tables + FK lors du dry-run.

---

## Groupe 7 — Photos de profil

| # | Fichier migration | Action | Criticité |
|---|---|---|---|
| A-18 | `AddProfilePicFetchedAt1750041600001.ts` | Étend `chat_pic`/`chat_pic_full` → VARCHAR(255), ajoute `profile_pic_fetched_at` TIMESTAMP à `whatsapp_chat` | **Moyen** — photos profil tronquées sans |

---

## Groupe 8 — Meta Ad Referral (CTWA) — dépendances en cascade

> **Ordre strict obligatoire** : A-19 → A-20 → A-21 → A-22 → A-23

| # | Fichier migration | Action | Criticité |
|---|---|---|---|
| A-19 | `AddMetaAdReferral1780272000001.ts` | Crée `meta_ad_referral` + ajoute `is_ctwa` (TINYINT) et `active_session_id` (CHAR(36)) à `whatsapp_chat` | **Critique** — module CTWA inopérant sans |
| A-20 | `AddMetaAdKpiIndex1780272000002.ts` | Ajoute index `IDX_msg_ctwa_kpi` sur `whatsapp_message` | **Moyen** — KPIs CTWA lents sans |
| A-21 | `FixMetaAdReferralDefaults1780358400001.ts` | Ajoute `DEFAULT ''` sur `source_type` et `source_id` dans `meta_ad_referral` | **Faible** |
| A-22 | `AddChatSessionEntity1780531200000.ts` | Crée `chat_session` + ajoute `active_session_id` sur `whatsapp_chat` (idempotent avec A-19) | **Critique** — logique fenêtre 24h/72h inopérante sans |
| A-23 | `FixActiveSessionIdCollation1780704000000.ts` | Corrige la collation de `whatsapp_chat.active_session_id` → `utf8mb4_unicode_ci` | **Critique** — requêtes JOIN échouent (ER_CANT_AGGREGATE_2COLLATIONS) |

---

## Groupe 9 — Window Reminder et fenêtre glissante — dépendances en cascade

> **Ordre strict obligatoire** : A-22 → A-24 → A-25 → A-26 → A-27

| # | Fichier migration | Action | Criticité |
|---|---|---|---|
| A-24 | `AddWindowReminderSection1780531200001.ts` | Étend ENUM `trigger_type` avec `'window_reminder'`, ajoute `last_window_reminder_sent_at` à `whatsapp_chat` | **Moyen** — cron Window Reminder inopérant sans |
| A-25 | `AddWindowReminderCronFields1780531200002.ts` | Ajoute 6 colonnes à `cron_config` : plages horaires window_reminder normal/CTWA, min_replies, ttl_days_ctwa | **Moyen** — config window reminder non persistée sans |
| A-26 | `AddWindowExpiresAtToChat1781522555000.ts` | Ajoute `window_expires_at` TIMESTAMP à `whatsapp_chat` + backfill depuis chat_session active | **Critique** — frontend bloque champ saisie si absente |
| A-27 | `BackfillWindowExpiresAt1781654400001.ts` | Backfille `window_expires_at = last_client_message_at + 24h` pour les conversations actives/en_attente sans session | **Critique** — correctif Bug #1 champ saisie bloqué |

---

## Groupe 10 — Correctifs Instagram

| # | Fichier migration | Action | Criticité |
|---|---|---|---|
| A-28 | `FixInstagramMessageIdLength1780876800001.ts` | Étend `message_id`, `external_id`, `provider_message_id` → VARCHAR(512) sur `whatsapp_message` (IDs Instagram trop longs) | **Critique** — IDs Instagram tronqués et doublons sans |

---

## Point de vigilance critique — conflit `AddWindowReminderSection` + `remove_auto_message_legacy`

La migration `AddWindowReminderSection1780531200001` modifie l'ENUM `trigger_type` de `messages_predefinis`.  
La migration master `20260414_remove_auto_message_legacy` **renomme** cette table en `_legacy_messages_predefinis`.

**Vérifier lors du dry-run :** si `remove_auto_message_legacy` s'exécute en premier (timestamp plus ancien), `AddWindowReminderSection` cherchera une table `messages_predefinis` qui n'existe plus et échouera.

**Résolution si conflit :** adapter le nom de table dans `AddWindowReminderSection` pour cibler `_legacy_messages_predefinis`.

---

## Migrations de convergence (déjà dans master — vérifier qu'elles ne dupliquent pas les colonnes portées ci-dessus)

| Fichier | Rôle | Action requise |
|---|---|---|
| `ConvergenceProductionToMasterV2_1748995200099.ts` | Convergence schéma production → master (idempotente) | Vérifier que toutes les colonnes utilisent `hasColumn()` — déjà le cas selon le plan |
| `TransformTemplateData_1748995200100.ts` | Transform données `whatsapp_template` V1 → V2 | Inspecter `SELECT id, components FROM whatsapp_template LIMIT 20` avant go-live pour valider les chemins JSON |

---

## Checklist de portage (à cocher pour chaque migration)

- [ ] Fichier `.ts` copié de `production` vers `feature/convergence-production`
- [ ] Timestamp du fichier vérifié (ordre lexicographique respecté)
- [ ] `hasColumn()` / `hasTable()` utilisés pour toute colonne/table potentiellement déjà présente
- [ ] `down()` présente et cohérente (ou commentaire explicatif si irréversible)
- [ ] Aucune concaténation de chaîne dans les clauses SQL (paramètres liés uniquement)
- [ ] Zéro `any` TypeScript
- [ ] `npm run build` sans erreur après chaque portage

---

## Volume total

- **29 migrations distinctes** à porter (sections 6.2 + 6.3 du plan, chevauchements exclus)
- **Durées à mesurer en dry-run** : `AddTrafficGroupingIndexes` (index covering), `AddQuizSystem` (9 tables), `BackfillWindowExpiresAt` (UPDATE sur toutes les conversations actives)
