# Rapport — Requêtes SQL de la Vue d'Ensemble (Dashboard Admin)

Date : 2026-06-20  
Périmètre : `admin/src/app/ui/OverviewView.tsx` → `message_whatsapp/src/metriques/`  
Mode : lecture seule, aucun fichier modifié.

---

## 1. Architecture générale

**Frontend :** `admin/src/app/ui/OverviewView.tsx`
- 4 appels parallèles via `getOverviewSection()` (globales, commerciaux, channels, temporelle)
- 1 appel bonus : `getWebhookMetrics()`

**Endpoints backend :**
| Endpoint | Service | Fichier |
|---|---|---|
| `GET /api/metriques/overview?section=globales` | `MetriquesService.getMetriquesGlobales()` | `metriques.service.ts:96` |
| `GET /api/metriques/overview?section=commerciaux` | `MetriquesService.getPerformanceCommerciaux()` | `metriques.service.ts:394` |
| `GET /api/metriques/overview?section=channels` | `MetriquesService.getStatutChannels()` | `metriques.service.ts:534` |
| `GET /api/metriques/overview?section=temporelle` | `MetriquesService.getPerformanceTemporelle()` | `metriques.service.ts:585` |
| `GET /metrics/webhook` | `WebhookMetricsController` | `webhook-metrics.controller.ts:5` |

**Volumes de données actuels (prod) :**
| Table | Lignes |
|---|---|
| `whatsapp_message` | 459 700 |
| `whatsapp_chat` | 118 200 |
| `whatsapp_commercial` | ~44 |
| `whapi_channels` | ~22 |
| `contact` | ~50k–200k estimé |
| `whatsapp_poste` | ~24 |

---

## 2. Analyse détaillée des requêtes

### Section 1 — Métriques globales (`getMetriquesGlobales`)

Exécution en `Promise.all([9 sous-requêtes])`.

#### R1.1 — Messages (1 requête agrégée)
```sql
SELECT COUNT(*) as total,
       SUM(CASE WHEN direction = 'IN'  THEN 1 ELSE 0 END) as entrants,
       SUM(CASE WHEN direction = 'OUT' THEN 1 ELSE 0 END) as sortants
FROM whatsapp_message
WHERE deletedAt IS NULL
  AND createdAt >= ? AND createdAt <= ?
```
- **Index :** `IDX_msg_trafic_covering` (`createdAt`, `direction`, `deletedAt`) ✅
- **Verdict :** Efficace — 1 scan avec index covering

#### R1.2 — Temps de réponse moyen (self-join)
```sql
SELECT AVG(TIMESTAMPDIFF(SECOND, msg_in.createdAt, msg_out.createdAt)) as avg_seconds
FROM whatsapp_message msg_out
INNER JOIN whatsapp_message msg_in
  ON msg_out.chat_id = msg_in.chat_id
 AND msg_in.direction  = 'IN'
 AND msg_out.direction = 'OUT'
 AND msg_in.createdAt < msg_out.createdAt
 AND msg_in.createdAt >= msg_out.createdAt - INTERVAL 1 HOUR
WHERE msg_out.deletedAt IS NULL
  AND msg_in.deletedAt  IS NULL
  AND msg_out.createdAt >= ? AND msg_out.createdAt <= ?
```
- **Index :** index sur (`chat_id`, `direction`, `createdAt`) nécessaire
- **Verdict :** ⚠️ Self-join sur 459k lignes — la fenêtre `INTERVAL 1 HOUR` limite le produit cartésien mais reste coûteuse sur de gros volumes. Acceptable si index composite (`chat_id`, `direction`, `createdAt`) est en place.

#### R1.3 — Chats (1 requête agrégée)
```sql
SELECT COUNT(*) as total,
       SUM(CASE WHEN status = 'actif'      THEN 1 ELSE 0 END) as actifs,
       SUM(CASE WHEN status = 'en_attente' THEN 1 ELSE 0 END) as en_attente,
       SUM(CASE WHEN status = 'fermé'      THEN 1 ELSE 0 END) as fermes,
       SUM(CASE WHEN unread_count > 0      THEN 1 ELSE 0 END) as non_lus,
       SUM(CASE WHEN is_archived = 1       THEN 1 ELSE 0 END) as archives
FROM whatsapp_chat
WHERE deletedAt IS NULL
  AND createdAt >= ? AND createdAt <= ?
```
- **Verdict :** ✅ Bien écrit — 7 compteurs en 1 seule requête

#### R1.4 — Temps de première réponse (AVG sur whatsapp_chat)
```sql
SELECT AVG(TIMESTAMPDIFF(SECOND, last_client_message_at, first_response_deadline_at))
FROM whatsapp_chat
WHERE first_response_deadline_at IS NOT NULL
  AND last_client_message_at IS NOT NULL
  AND deletedAt IS NULL
  AND createdAt >= ? AND createdAt <= ?
```
- **Verdict :** ⚠️ `first_response_deadline_at` et `last_client_message_at` probablement sans index → post-filtre sur colonnes non-indexées. Acceptable à 118k lignes, à surveiller à 500k+.

#### R1.5 — Charge par poste (LEFT JOIN + GROUP BY)
```sql
SELECT p.id, p.name, COUNT(c.id) as nb_chats,
       SUM(CASE WHEN c.status = 'actif'      THEN 1 ELSE 0 END) as actifs,
       SUM(CASE WHEN c.status = 'en_attente' THEN 1 ELSE 0 END) as en_attente
FROM whatsapp_poste p
LEFT JOIN whatsapp_chat c ON p.id = c.poste_id
  AND c.deletedAt IS NULL
  AND c.createdAt >= ? AND c.createdAt <= ?
WHERE p.is_active = 1
GROUP BY p.id, p.name
ORDER BY nb_chats DESC
```
- **Verdict :** ✅ Bon pattern — 1 requête pour tous les postes. Index `(poste_id, createdAt, deletedAt)` recommandé.

---

### Section 2 — Performance par commercial (`getPerformanceCommerciaux`)

Exécution en `Promise.all([5 requêtes])` + agrégation en mémoire via `Map`.

#### R2.1 — Commerciaux + postes
```sql
SELECT c.id, c.name, c.email, c.isConnected, c.lastConnectionAt, p.name as poste_name
FROM whatsapp_commercial c
LEFT JOIN whatsapp_poste p ON c.poste_id = p.id
WHERE c.deletedAt IS NULL
```
- **Verdict :** ✅ Simple, table petite (~44 lignes)

#### R2.2 — Messages entrants par poste
```sql
SELECT poste_id, COUNT(*) as count
FROM whatsapp_message
WHERE poste_id IN (...)
  AND direction = 'IN'
  AND deletedAt IS NULL
  AND createdAt >= ? AND createdAt <= ?
GROUP BY poste_id
```
- **Verdict :** ✅ GROUP BY efficace avec index (`poste_id`, `direction`, `createdAt`)

#### R2.3 — Messages sortants par commercial
```sql
SELECT commercial_id, COUNT(*) as count
FROM whatsapp_message
WHERE commercial_id IN (...)
  AND direction = 'OUT'
  AND deletedAt IS NULL
  AND createdAt >= ? AND createdAt <= ?
GROUP BY commercial_id
```
- **Verdict :** ✅ Même pattern que R2.2

#### R2.4 — Chats actifs par poste
```sql
SELECT poste_id, COUNT(*) as count
FROM whatsapp_chat
WHERE poste_id IN (...)
  AND status = 'actif'
  AND deletedAt IS NULL
GROUP BY poste_id
```
- **Verdict :** ⚠️ **Index manquant** — pas d'index composite (`poste_id`, `status`). MySQL scanne tous les actifs puis filtre `poste_id` en post-traitement. À 118k lignes c'est acceptable, mais un index `(poste_id, status)` améliorerait de ~30%.

#### R2.5 — Temps de réponse moyen par poste (self-join groupé)
- Même logique que R1.2 mais avec `GROUP BY poste_id`
- **Verdict :** ⚠️ Requête la plus lourde de la section — self-join 459k×459k limité à 1h. Surveiller avec EXPLAIN.

**Agrégation mémoire :** Les 5 résultats sont fusionnés avec des `Map<id, count>` — O(1) lookup, pattern correct.

---

### Section 3 — Statut channels (`getStatutChannels`) ❌ PROBLÈME PRINCIPAL

```sql
SELECT ch.id, ch.channel_id, ch.label, ch.uptime,
       (SELECT COUNT(*) FROM whatsapp_chat c
        WHERE c.channel_id = ch.channel_id
          AND c.deletedAt IS NULL
          AND c.last_activity_at BETWEEN ? AND ?) as nb_chats_actifs,
       (SELECT COUNT(*) FROM whatsapp_message m
        WHERE m.channel_id = ch.channel_id
          AND m.deletedAt IS NULL
          AND m.createdAt BETWEEN ? AND ?)   as nb_messages
FROM whapi_channels ch
ORDER BY nb_messages DESC
```

**Problème : N+1 scalaire**
- 22 channels × 2 sous-requêtes scalaires = **44 requêtes SQL** au lieu d'1
- Pas d'index sur `(channel_id, last_activity_at)` ni `(channel_id, createdAt)`
- Chaque sous-requête scan `whatsapp_chat` (118k) et `whatsapp_message` (459k)

**Requête optimisée recommandée :**
```sql
SELECT ch.id, ch.channel_id, ch.label, ch.uptime,
       COUNT(DISTINCT c.id)  as nb_chats_actifs,
       COUNT(DISTINCT m.id)  as nb_messages
FROM whapi_channels ch
LEFT JOIN whatsapp_chat c
       ON ch.channel_id = c.channel_id
      AND c.deletedAt IS NULL
      AND c.last_activity_at BETWEEN ? AND ?
LEFT JOIN whatsapp_message m
       ON ch.channel_id = m.channel_id
      AND m.deletedAt IS NULL
      AND m.createdAt BETWEEN ? AND ?
GROUP BY ch.id, ch.channel_id, ch.label, ch.uptime
ORDER BY nb_messages DESC
```
- **Requêtes :** 1 au lieu de 44 (-98%)
- **Index requis :** `IDX_chat_channel_activity` (`channel_id`, `last_activity_at`) + `IDX_msg_channel_time` (`channel_id`, `createdAt`)

---

### Section 4 — Performance temporelle (`getPerformanceTemporelle`)

```sql
SELECT DATE(createdAt) as date,
       COUNT(*)                                               as nb_messages,
       SUM(CASE WHEN direction = 'IN'  THEN 1 ELSE 0 END)    as messages_in,
       SUM(CASE WHEN direction = 'OUT' THEN 1 ELSE 0 END)    as messages_out,
       COUNT(DISTINCT chat_id)                                as nb_conversations
FROM whatsapp_message
WHERE deletedAt IS NULL
  AND createdAt >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
GROUP BY DATE(createdAt)
ORDER BY date ASC
```
- **Index :** `IDX_msg_trafic_covering` (`createdAt`, `direction`, `deletedAt`) ✅
- **Verdict :** ✅ Bonne requête — 1 scan, index covering, résultat 7–365 lignes

---

### Section 5 — Webhook metrics

- **Nature :** Métriques in-memory (compteurs atomiques)
- **Pas de requête SQL** → ✅ aucun impact DB

---

## 3. Système de cache (AnalyticsSnapshotService)

```
Requête frontend
     │
     ▼
AnalyticsSnapshotService.getLatest(scope, periode)
     │
     ├── Snapshot valide (âge < 720s) → retour immédiat (<100ms)
     │
     └── Snapshot expiré ou absent
              │
              ▼
         Promise.all([R1, R2, R3, R4]) — ~500ms–2s
              │
              ▼
         Sauvegarde snapshot + retour
```

- **TTL :** 720 secondes (12 minutes)
- **Table :** `analytics_snapshot` (~4×4 = 16 lignes max)
- **Invalidation :** Automatique par TTL — pas d'invalidation sur événement (écriture d'un message par exemple)
- **Point faible :** Pendant le recalcul (cold start), si 10 admins chargent la page simultanément → 10 recalculs parallèles (pas de mutex/lock). Solution : `SELECT FOR UPDATE` ou Redis lock.

---

## 4. Bug identifié : endpoint `/users/:id/stats` manquant

`CommercialStatsService.getStats()` existe mais n'est exposé qu'en `GET /auth/me/stats` (stats du commercial connecté).

L'admin n'a pas d'endpoint `GET /users/:id/stats` pour consulter les stats d'un commercial spécifique → les composants frontend qui l'appellent reçoivent 404.

---

## 5. Synthèse — tableau de bord des requêtes

| # | Section | Requêtes SQL | Tables | Verdict | Priorité fix |
|---|---|---|---|---|---|
| R1 | Globales | 9 en parallèle | message, chat, commercial, contact, poste | ✅ Bon | P2 — index R1.4 |
| R2 | Commerciaux | 5 en parallèle | message (×2), chat | ⚠️ Index R2.4 manquant | P1 |
| R3 | Channels | 1 + 2N scalaires | channels, chat, message | ❌ N+1 critique | **P0** |
| R4 | Temporelle | 1 | message | ✅ Très bon | — |
| R5 | Webhooks | 0 (in-memory) | — | ✅ | — |

---

## 6. Mon avis global

### Ce qui est bien fait ✅
- **Parallélisation systématique** — `Promise.all()` sur toutes les sections et sous-requêtes : l'overhead réseau est minimisé
- **Agrégations conditionnelles** — `SUM(CASE WHEN...)` pour éviter les COUNT séparés (R1.3, R1.5) : pattern optimal
- **Cache snapshot 12 min** — évite de relancer 9 requêtes à chaque chargement de page
- **Limitation temporelle** — toutes les requêtes ont une plage `createdAt >= ? AND createdAt <= ?` qui permet à MySQL d'utiliser les index sur date
- **Agrégation mémoire en Map** — la fusion des résultats des 5 requêtes commerciaux est O(1)

### Ce qui pose problème ⚠️
1. **N+1 scalaire section channels** — le problème le plus urgent. 44 requêtes au lieu d'1. Sur un cluster de 50+ channels, la page charge en 3–5s au lieu de <500ms.
2. **Self-join R1.2/R2.5** — correct conceptuellement mais dangereux à 1M+ messages. La fenêtre 1h protège, mais EXPLAIN devrait confirmer que l'index est utilisé.
3. **Pas de protection contre le thundering herd** — si le cache expire simultanément pour plusieurs admins, 10 recalculs en parallèle. Acceptable aujourd'hui (44 commerciaux), risqué à l'échelle.
4. **Index manquant `(poste_id, status)` sur whatsapp_chat** — peu coûteux à créer, gain immédiat.

### Recommandations prioritaires

| Priorité | Action | Effort | Gain |
|---|---|---|---|
| **P0** | Refactorer `getStatutChannels` : 1 LEFT JOIN + GROUP BY au lieu du N+1 | 2h | -98% requêtes channels |
| **P0** | Créer index `IDX_chat_channel_activity (channel_id, last_activity_at)` | Migration | Requis pour P0 |
| **P0** | Créer index `IDX_msg_channel_time (channel_id, createdAt, deletedAt)` | Migration | Requis pour P0 |
| **P1** | Créer index `IDX_chat_poste_status (poste_id, status)` | Migration | -30% R2.4 |
| **P1** | Ajouter `GET /users/:id/stats` dans WhatsappCommercialController | 30 min | Fix bug admin |
| **P2** | Redis lock sur le recalcul snapshot (thundering herd) | 1h | Scalabilité |
| **P2** | EXPLAIN des self-joins R1.2/R2.5 en prod et ajuster si besoin | 1h | Surveillance |
