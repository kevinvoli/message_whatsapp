# Rapport complet — Tâches planifiées (Crons)

**Projet** : WhatsApp Message
**Date** : 2026-04-01
**Backend** : NestJS + TypeORM (MySQL)

---

## Vue d'ensemble

Le projet dispose de **9 tâches planifiées** réparties en trois catégories :

| Catégorie | Nombre | Géré par |
|-----------|--------|----------|
| Crons configurables en DB (`cron_config`) | 5 | `CronConfigService` |
| Crons fixes via `@Cron()` NestJS | 2 | `AnalyticsCronService` |
| Tâches event-driven (setTimeout par conversation) | 1 | `AutoMessageOrchestrator` |
| Timers internes (nettoyage mémoire) | 1 | `SocketThrottleGuard` |

---

## 1. SLA Checker — Réinjection premier message

| Champ | Valeur |
|-------|--------|
| **Clé DB** | `sla-checker` |
| **Fichier** | `src/jorbs/first-response-timeout.job.ts` |
| **Type** | `interval` |
| **Intervalle** | **5 minutes** (configurable) |
| **Activé par défaut** | Oui |
| **Configurable via admin** | Oui |

### Ce qu'il fait

Vérifie toutes les 5 minutes si des conversations ont dépassé leur deadline de première réponse (`first_response_deadline_at < NOW()`) sans qu'un agent ait répondu (`last_poste_message_at IS NULL`). Si c'est le cas, la conversation est réinjectée dans la queue de dispatch (statut → `EN_ATTENTE`, agent désassigné).

### Requêtes DB

- `SELECT` sur `whatsapp_chat` avec filtre sur `status`, `last_poste_message_at`, `first_response_deadline_at`
- `UPDATE` sur `whatsapp_chat` pour réinitialiser l'agent et le statut (une par conversation réinjectée)

### Impact ressources

| Ressource | Niveau | Détail |
|-----------|--------|--------|
| CPU | Faible | Boucle simple sur un résultat filtré |
| Base de données | **Moyen** | Scan de table sur `whatsapp_chat` — index `IDX_chat_poste_time` utilisé |
| Réseau | Aucun | Opération interne uniquement |
| Mémoire | Négligeable | |

**Fréquence d'exécution** : 288 fois/jour

---

## 2. Read-Only Enforcement — Inactivité client 24h

| Champ | Valeur |
|-------|--------|
| **Clé DB** | `read-only-enforcement` |
| **Fichier** | `src/jorbs/read-only-enforcement.job.ts` |
| **Type** | `interval` |
| **Intervalle** | **10 minutes** (configurable) |
| **Activé par défaut** | Oui |
| **TTL configurable** | Oui (`ttlDays`, défaut : 24h) |

### Ce qu'il fait

Toutes les 10 minutes, cherche les conversations ACTIVES dont le client n'a pas écrit depuis plus de 24h (`last_client_message_at < NOW() - 24h`) et dont `read_only = false`. Pour chacune, passe `read_only = true` et émet un événement WebSocket `CONVERSATION_READONLY` vers le frontend.

> **Note** : Depuis le 2026-04-01, la règle des 23h est aussi appliquée en temps réel lors de l'envoi (gateway `message:send`). Ce cron reste utile pour synchroniser les conversations déjà ouvertes.

### Requêtes DB

- `SELECT` sur `whatsapp_chat` avec filtre `read_only = false`, `status = ACTIF`, `last_client_message_at < seuil`
- `UPDATE` sur `whatsapp_chat` pour chaque conversation affectée

### Impact ressources

| Ressource | Niveau | Détail |
|-----------|--------|--------|
| CPU | Faible | |
| Base de données | **Moyen** | Scan de table — peut générer beaucoup de UPDATE en pic |
| Réseau | Interne WebSocket | Émission `CONVERSATION_READONLY` pour chaque commercial connecté |
| Mémoire | Négligeable | |

**Fréquence d'exécution** : 144 fois/jour

---

## 3. Offline Reinject — Réinjection agents hors ligne

| Champ | Valeur |
|-------|--------|
| **Clé DB** | `offline-reinject` |
| **Fichier** | `src/jorbs/offline-reinjection.job.ts` |
| **Type** | `cron` |
| **Expression** | `0 9 * * *` (chaque jour à 9h00) |
| **Activé par défaut** | Oui |

### Ce qu'il fait

Chaque matin à 9h, identifie les conversations ACTIVES assignées à des postes hors ligne (`poste.is_active = false`) sans réponse agent (`last_poste_message_at IS NULL`). Ces conversations sont réinjectées dans la queue de dispatch.

### Requêtes DB

- `SELECT` sur `whatsapp_chat` avec `JOIN whatsapp_poste` (1 requête)
- `UPDATE` via `dispatcher.reinjectConversation()` pour chaque conversation

### Impact ressources

| Ressource | Niveau | Détail |
|-----------|--------|--------|
| CPU | Faible | |
| Base de données | Faible–Moyen | Join unique + updates ciblés |
| Réseau | Aucun | |
| Mémoire | Négligeable | |

**Fréquence d'exécution** : 1 fois/jour

---

## 4. Webhook Purge — Nettoyage idempotency

| Champ | Valeur |
|-------|--------|
| **Clé DB** | `webhook-purge` |
| **Fichier** | `src/whapi/webhook-idempotency-purge.service.ts` |
| **Type** | `cron` |
| **Expression** | `0 3 * * *` (chaque jour à 3h00) |
| **Activé par défaut** | Oui |
| **TTL configurable** | Oui (`ttlDays`, défaut : 14 jours) |

### Ce qu'il fait

Supprime les entrées de la table `webhook_event_log` (table d'idempotency) plus vieilles que 14 jours. Empêche la table de grossir indéfiniment.

### Requêtes DB

- `DELETE FROM webhook_event_log WHERE created_at < NOW() - 14j` (1 seule requête)

### Impact ressources

| Ressource | Niveau | Détail |
|-----------|--------|--------|
| CPU | Faible | |
| Base de données | **Élevé ponctuellement** | DELETE massif pouvant générer un lock InnoDB temporaire — préférer à 3h pour minimiser l'impact |
| Réseau | Aucun | |
| Mémoire | Négligeable | |

**Fréquence d'exécution** : 1 fois/jour

---

## 5. Meta Token Refresh — Renouvellement tokens Facebook

| Champ | Valeur |
|-------|--------|
| **Clé DB** | `meta-token-refresh` |
| **Fichier** | `src/channel/meta-token-scheduler.service.ts` + `meta-token.service.ts` |
| **Type** | `cron` |
| **Expression** | `0 3 * * *` (chaque jour à 3h00) |
| **Activé par défaut** | Oui |
| **TTL configurable** | Oui (`ttlDays`, défaut : 7 jours) |

### Ce qu'il fait

Chaque nuit à 3h, récupère tous les channels Meta (WhatsApp Cloud, Messenger, Instagram) dont le token expire dans moins de 7 jours (`tokenExpiresAt < NOW() + 7j`). Pour chacun :
1. Appel HTTP à l'API Facebook Graph pour renouveler le token
2. Mise à jour du token + `tokenExpiresAt` en DB
3. Re-subscription webhook Meta pour éviter la suspension

### Requêtes DB

- `SELECT` sur `whapi_channel` avec filtre provider + date expiration
- `UPDATE` par channel renouvelé

### Appels externes

- `POST https://graph.facebook.com/{version}/{appId}/subscriptions` (1 appel par channel expirant)

### Impact ressources

| Ressource | Niveau | Détail |
|-----------|--------|--------|
| CPU | Faible–Moyen | Async, non-bloquant |
| Base de données | Faible | Requête unique + updates ciblés |
| Réseau externe | **Moyen** | 1 appel API Meta par channel expirant — peut être élevé si beaucoup de channels |
| Mémoire | Négligeable | |

**Fréquence d'exécution** : 1 fois/jour

---

## 6. Auto-Message — Messages automatiques (Event-driven)

| Champ | Valeur |
|-------|--------|
| **Clé DB** | `auto-message` |
| **Fichier** | `src/message-auto/auto-message-orchestrator.service.ts` |
| **Type** | `event` (déclenché par message entrant client) |
| **Délai** | 20–45 secondes aléatoires (configurable) |
| **Activé par défaut** | **Non** |
| **Max étapes** | 3 (configurable) |

### Ce qu'il fait

Déclenché lors de chaque message entrant d'un client (si la fonctionnalité est activée). Après un délai de 20–45 secondes (simulant une réponse humaine), envoie automatiquement un message de template à l'étape N de la séquence.

**Vérifications avant envoi** :
- Fenêtre de 23h non expirée (`last_client_message_at` récent)
- Aucun auto-message déjà envoyé après le dernier message client
- Nombre max d'étapes non atteint

**Sécurités** :
- Verrou mémoire (anti-doublons webhook)
- `read_only = true` pendant le délai (agent ne peut pas interrompre)
- Déverrouillage après envoi (ou en cas d'erreur)

### Requêtes DB (par séquence)

1. `UPDATE whatsapp_chat SET read_only = true`
2. `SELECT` template auto-message
3. `SELECT whatsapp_chat` (fraîcheur avant envoi)
4. `UPDATE whatsapp_chat SET auto_message_step++, last_auto_message_sent_at`

### Appels externes

- WhatsApp API (1 appel par auto-message envoyé)

### Impact ressources

| Ressource | Niveau | Détail |
|-----------|--------|--------|
| CPU | Faible | setTimeout non-bloquant |
| Base de données | Moyen | 4 requêtes par séquence d'envoi |
| Réseau externe | **Élevé** (si activé et volume élevé) | 1 appel WhatsApp par message |
| Mémoire | Faible | 1 pointer de timeout par conversation active |

**Point d'attention** : Le verrou mémoire est perdu en cas de redémarrage du container. Les séquences en cours ne reprennent pas.

---

## 7. Analytics Refresh Snapshots

| Champ | Valeur |
|-------|--------|
| **Fichier** | `src/metriques/analytics-cron.service.ts` |
| **Décorateur** | `@Cron('0 */10 * * * *')` |
| **Fréquence** | **Toutes les 10 minutes** |
| **Géré par admin** | Non (décorateur fixe, non dans `cron_config`) |
| **Activé par défaut** | Toujours actif |

### Ce qu'il fait

Recalcule les 4 snapshots analytiques (`today`, `week`, `month`, `year`) et les stocke en base. Les snapshots ont un TTL de 720 secondes — les endpoints `/api/metriques/*` les lisent en cache au lieu de requêter directement.

### Requêtes DB par exécution (`computeAll`)

Pour chaque période (×4) :

| Sous-requête | Nombre de requêtes |
|---|---|
| `getMetriquesMessages()` | 2 |
| `getMetriquesChats()` | 2 |
| `getMetriquesCommerciaux()` | 2 |
| `getMetriquesContacts()` | 1 |
| `getMetriquesPostes()` | 1 |
| `getMetriquesChannels()` | 1 |
| `getChargeParPoste()` | 1 |
| `getPerformanceCommerciaux()` | 2–3 |
| `getStatutChannels()` | 1 |
| `getPerformanceTemporelle()` | 2 |

**Total par période : ~15–16 requêtes**
**Total par exécution : ~60–64 requêtes DB** (exécutées en parallèle par période)

### Impact ressources

| Ressource | Niveau | Détail |
|-----------|--------|--------|
| CPU | **Élevé** | Agrégations complexes (SUM, AVG, COUNT, GROUP BY) sur tables volumineuses |
| Base de données | **Élevé** | ~60 requêtes toutes les 10 min = ~360 requêtes/heure consacrées aux analytics |
| Réseau | Aucun | |
| Mémoire | Faible | Résultats sérialisés en JSON dans `analytics_snapshot` |

**Fréquence d'exécution** : 144 fois/jour = ~8 640 requêtes DB/jour pour les analytics seules

> **Recommandation** : Ce cron est le contributeur principal à la charge DB. Si le CPU serveur est élevé, réduire la fréquence à toutes les 20–30 minutes via modification du décorateur.

---

## 8. Analytics Purge Snapshots

| Champ | Valeur |
|-------|--------|
| **Fichier** | `src/metriques/analytics-cron.service.ts` |
| **Décorateur** | `@Cron('0 0 * * * *')` |
| **Fréquence** | **Toutes les heures** |
| **Géré par admin** | Non |

### Ce qu'il fait

Supprime les snapshots analytiques dont `computed_at < NOW() - 1h`. Empêche l'accumulation dans la table `analytics_snapshot`.

### Requêtes DB

- `DELETE FROM analytics_snapshot WHERE computed_at < NOW() - 3600s` (1 requête)

### Impact ressources

| Ressource | Niveau | Détail |
|-----------|--------|--------|
| CPU | Négligeable | |
| Base de données | Faible | Suppression de quelques lignes |
| Réseau | Aucun | |

---

## 9. Socket Throttle Cleanup (Timer interne)

| Champ | Valeur |
|-------|--------|
| **Fichier** | `src/whatsapp_message/guards/socket-throttle.guard.ts` |
| **Type** | `setInterval()` interne |
| **Intervalle** | 60 secondes |
| **Géré par admin** | Non |

### Ce qu'il fait

Nettoie les buckets de rate-limiting des connexions WebSocket inactives depuis plus de 120 secondes. Évite les fuites mémoire si un client se déconnecte brutalement.

### Impact ressources

| Ressource | Niveau | Détail |
|-----------|--------|--------|
| CPU | Négligeable | Simple itération de Map en mémoire |
| Mémoire | Bénéfique | Libère les buckets inactifs |

---

## Tableau récapitulatif

| # | Nom | Fréquence | Activé | CPU | DB | Réseau ext. |
|---|-----|-----------|--------|-----|----|-------------|
| 1 | SLA Checker | Toutes les 5 min | Oui | Faible | Moyen | — |
| 2 | Read-Only Enforcement | Toutes les 10 min | Oui | Faible | Moyen | — |
| 3 | Offline Reinject | 1×/jour 9h | Oui | Faible | Faible | — |
| 4 | Webhook Purge | 1×/jour 3h | Oui | Faible | **Élevé** (ponctuel) | — |
| 5 | Meta Token Refresh | 1×/jour 3h | Oui | Faible | Faible | Moyen |
| 6 | Auto-Message | Par événement | **Non** | Faible | Moyen | **Élevé** |
| 7 | Analytics Refresh | Toutes les 10 min | Toujours | **Élevé** | **Élevé** | — |
| 8 | Analytics Purge | Toutes les heures | Toujours | Négligeable | Faible | — |
| 9 | Socket Throttle Cleanup | Toutes les 60 s | Toujours | Négligeable | — | — |

---

## Analyse de l'impact CPU serveur

### Charge hebdomadaire estimée (hors auto-message)

| Tâche | Exécutions/semaine | Requêtes DB/semaine |
|-------|--------------------|---------------------|
| SLA Checker | 2 016 | ~6 048 |
| Read-Only Enforcement | 1 008 | ~4 032 |
| Offline Reinject | 7 | ~21 |
| Webhook Purge | 7 | 7 |
| Meta Token Refresh | 7 | ~14 |
| **Analytics Refresh** | **1 008** | **~64 512** |
| Analytics Purge | 168 | 168 |
| **TOTAL** | **4 221** | **~74 802** |

### Pic de charge simultané

Les crons suivants s'exécutent à la **même minute** (minute 0 de chaque heure) :
- Analytics Refresh (toutes les 10 min, dont minute 0)
- SLA Checker peut coïncider (multiple de 5 et 10)
- Read-Only Enforcement peut coïncider

> **Risque** : Cumul de 60–70 requêtes DB en 1–2 secondes toutes les 10 minutes. Peut provoquer des pics CPU si les tables sont volumineuses.

### Cause principale du CPU élevé

**Le cron Analytics Refresh est le contributeur principal.** Il génère ~60 requêtes d'agrégation toutes les 10 minutes, incluant des `SUM`, `AVG`, `COUNT` et `GROUP BY` sur les tables `whatsapp_message` et `whatsapp_chat` qui peuvent contenir des centaines de milliers de lignes.

---

## Recommandations

### Priorité haute

1. **Réduire la fréquence d'Analytics Refresh** de 10 min à 20–30 min si le CPU reste élevé :
   ```typescript
   // analytics-cron.service.ts, ligne 20
   @Cron('0 */20 * * * *')  // au lieu de */10
   ```

2. **Créer l'index manquant** pour optimiser le Read-Only Enforcement et le SLA Checker :
   ```sql
   ALTER TABLE `whatsapp_chat`
     ADD INDEX `IDX_chat_poste_activity` (`poste_id`, `last_activity_at`);
   ```

### Priorité moyenne

3. **Décaler les crons nocturnes** pour éviter la concurrence à 3h00 (Webhook Purge + Meta Token Refresh s'exécutent simultanément) :
   - Webhook Purge → `0 3 * * *`
   - Meta Token Refresh → `0 4 * * *`

4. **Ajouter un index** sur `webhook_event_log(created_at)` si le DELETE nocturne est lent.

### Priorité basse

5. **Rendre les crons analytics configurables** en les déplaçant dans `CronConfigService` plutôt que de les laisser en décorateurs fixes.

6. **Persistance des auto-messages** en cours si le container redémarre (actuellement perdus — setTimeout en mémoire).

---

## Architecture du système de configuration

```
CronConfigService (src/jorbs/cron-config.service.ts)
├── Table DB : cron_config
├── Clés : sla-checker, read-only-enforcement, offline-reinject,
│          webhook-purge, meta-token-refresh, auto-message
├── Interface admin : GET/PATCH /cron-configs/:key
└── Scheduling :
    ├── interval → setInterval() via SchedulerRegistry
    └── cron     → CronJob() via SchedulerRegistry

AnalyticsCronService (src/metriques/analytics-cron.service.ts)
├── @Cron('0 */10 * * * *') → refreshSnapshots()
├── @Cron('0 0 * * * *')   → purgeSnapshots()
└── onModuleInit()         → warmup non-bloquant

AutoMessageOrchestrator (src/message-auto/auto-message-orchestrator.service.ts)
└── handleClientMessage() → setTimeout(executeAutoMessage, delayMs)
```

---

*Rapport généré le 2026-04-01*
