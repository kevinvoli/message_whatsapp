# Plan Feature — Lecture Messages & Inactivité Commerciaux

> **Date :** 2026-05-21  
> **Branche cible :** `production`  
> **Statut :** PLANIFICATION

---

## Vue d'ensemble

Quatre fonctionnalités liées au suivi d'activité des commerciaux :

| # | Fonctionnalité | Priorité |
|---|----------------|----------|
| F1 | Tracking messages lus par commercial | P0 |
| F2 | Onglet détails & stats commercial (front + admin) | P0 |
| F3 | Rate limit lectures par minute (paramétrable admin) | P1 |
| F4 | Déconnexion automatique sur inactivité (paramétrable admin) | P1 |

---

## F1 — Tracking messages lus par commercial

### Comportement attendu

Quand un commercial clique sur une conversation qui contient N messages non lus :
1. Le frontend émet un événement avec l'ID de la conversation
2. Le backend récupère tous les messages `direction = IN` ayant `read_by_commercial_id IS NULL` sur cette conversation
3. Pour chaque message non lu → met à jour `read_by_commercial_id` et `read_by_commercial_at` directement sur `whatsapp_message`
4. Décrémente `unread_count` de la conversation
5. Incrémente le compteur `messages_read_count` du commercial

### Nouveaux champs sur `whatsapp_message`

Pas de nouvelle entité — deux colonnes ajoutées directement sur la table existante :

| Colonne | Type | Défaut | Description |
|---------|------|--------|-------------|
| `read_by_commercial_id` | uuid nullable | NULL | ID du commercial qui a lu ce message entrant (direction=IN) |
| `read_by_commercial_at` | datetime nullable | NULL | Timestamp de la lecture |

**Règle :** ces champs ne concernent que les messages `direction = IN`. Pour les messages `direction = OUT`, `commercial_id` (déjà existant) identifie l'expéditeur.

**Requêtes de comptage résultantes :**
```sql
-- Messages reçus (lus) par un commercial
SELECT COUNT(*) FROM whatsapp_message
WHERE read_by_commercial_id = :commercialId AND direction = 'IN';

-- Messages traités (répondus) par un commercial
SELECT COUNT(*) FROM whatsapp_message
WHERE commercial_id = :commercialId AND direction = 'OUT';
```

**Fichier entité :** `src/whatsapp_message/entities/whatsapp_message.entity.ts` — ajouter les deux colonnes + relation ManyToOne vers `WhatsappCommercial`.

### Colonnes à ajouter sur `whatsapp_commercial`

| Colonne | Type | Défaut | Description |
|---------|------|--------|-------------|
| `messages_read_count` | int | 0 | Total messages lus (reçus) depuis la création |
| `messages_handled_count` | int | 0 | Total messages traités (répondus) depuis la création |
| `last_activity_at` | datetime | NULL | Dernière interaction détectée (lecture, réponse, connexion) |

### Nouveau service — `MessageReadService`

**Fichier :** `message_whatsapp/src/whatsapp_message/message-read.service.ts`

```
markConversationAsRead(commercialId: string, chatId: string): Promise<{ markedCount: number }>
  1. Vérifier rate limit (F3) → lancer RateLimitExceededException si dépassé
  2. Récupérer les messages non lus de la conversation (is_read = false)
  3. Créer les MessageReadReceipt (INSERT IGNORE sur contrainte UNIQUE)
  4. Mettre à jour whatsapp_message.is_read = true pour ces messages
  5. Décrémenter whatsapp_chat.unread_count du nombre de messages marqués
  6. Incrémenter whatsapp_commercial.messages_read_count += markedCount
  7. Mettre à jour whatsapp_commercial.last_activity_at = NOW()
  8. Retourner { markedCount }
```

### Déclencheur WebSocket (frontend → backend)

**Événement émis par le frontend :** `conversation:read`  
**Payload :** `{ chatId: string }`  
**Handler backend :** dans `MessageGateway` ou gateway existant → appelle `MessageReadService.markConversationAsRead()`

### Migration

**Fichier :** `AddMessageReadTracking<timestamp>.ts`
- Ajoute `read_by_commercial_id`, `read_by_commercial_at` sur `whatsapp_message`
- Ajoute `messages_read_count`, `messages_handled_count`, `last_activity_at` sur `whatsapp_commercial`

---

## F2 — Onglet détails & stats commercial

### Stats exposées

| Métrique | Source |
|----------|--------|
| Messages reçus (lus) | `COUNT(*) WHERE read_by_commercial_id = :id AND direction = 'IN'` sur `whatsapp_message` |
| Messages traités (répondus) | `messages_handled_count` sur `whatsapp_commercial` |
| Conversations actives actuelles | `COUNT(whatsapp_chat)` où `poste_id = commercial.poste.id` et `status = ACTIF` |
| Dernière activité | `last_activity_at` |
| Taux de réponse | `messages_handled_count / messages_read_count * 100` |

> **Note :** `messages_handled_count` est incrémenté dans le service existant d'envoi de message quand un commercial envoie une réponse.

### Backend — Endpoint stats

**Route :** `GET /commercials/:id/stats`  
**Guard :** `AdminGuard`  
**Fichier :** `message_whatsapp/src/whatsapp_commercial/commercial-stats.service.ts`

```typescript
getStats(commercialId: string, from?: Date, to?: Date): Promise<CommercialStatsDto>
```

**Réponse `CommercialStatsDto` :**
```typescript
{
  commercialId: string;
  name: string;
  messagesRead: number;       // total messages lus
  messagesHandled: number;    // total messages répondus
  activeConversations: number;
  responseRate: number;       // pourcentage
  lastActivityAt: Date | null;
  isOnline: boolean;
  // Détail par jour (optionnel, si from/to fournis)
  dailyBreakdown?: { date: string; read: number; handled: number }[];
}
```

### Frontend — Nouvel onglet dans le menu commercial

**Fichier :** `front/src/components/CommercialPanel/` (nouveau composant `CommercialDetails.tsx`)

**Onglets du panel commercial :**
1. `Conversations` (existant)
2. `Détails & Activité` (nouveau) ← affiche les stats ci-dessus

**Contenu de l'onglet :**
- Compteur "Messages reçus" avec icône
- Compteur "Messages traités" avec icône
- Barre de progression "Taux de réponse"
- Indicateur "Dernière activité" (formaté en temps relatif)
- Statut en ligne / hors ligne

### Admin — Vue stats dans le panel admin

**Fichier :** `admin/src/app/commercials/[id]/stats/page.tsx` (nouvelle page)

- Accessible depuis la liste des commerciaux
- Affiche toutes les métriques + graphique activité par jour
- Filtres par période (aujourd'hui / 7 jours / 30 jours)

---

## F3 — Rate limit lectures par minute (paramétrable admin)

### Comportement

Chaque commercial ne peut marquer que N messages comme lus par minute (fenêtre glissante de 60s).  
Si le seuil est dépassé, les lectures en excès sont **différées** (pas bloquées) : elles s'exécutent dès que la fenêtre s'ouvre.

**Défaut :** 1 message/minute  
**Paramétrable :** depuis l'admin dans les settings de dispatch

### Implémentation — Compteur en mémoire

**Fichier :** `message_whatsapp/src/whatsapp_message/message-read-rate-limiter.service.ts`

```
Structure : Map<commercialId, { count: number; windowStart: number }>

checkAndIncrement(commercialId: string, count: number): boolean
  - Si windowStart < now - 60s → reset la fenêtre
  - Si count actuel + count demandé <= maxPerMinute → incrémenter et retourner true
  - Sinon → retourner false (rate limit atteint)
```

### Config admin

Nouvelle colonne sur `dispatch_settings` :

| Colonne | Type | Défaut |
|---------|------|--------|
| `max_read_messages_per_minute` | int | 1 |

**Route admin :** `PATCH /dispatch-settings` (existant) avec le nouveau champ.

---

## F4 — Déconnexion automatique sur inactivité

### Comportement

Un commercial sans aucune interaction depuis X minutes est automatiquement déconnecté :
1. Retiré de la queue de dispatch
2. Son statut passe à `is_active = false`
3. Ses conversations actives passent en `EN_ATTENTE` (le SLA checker les redistribuera)
4. Un événement WebSocket `commercial:disconnected` est émis vers le front

**"Interaction" = tout événement qui met à jour `last_activity_at` :**
- Ouverture d'une conversation (lecture)
- Envoi d'un message
- Connexion WebSocket (login)
- Ping de présence explicite du frontend

### Nouveau cron — `idle-disconnect`

**Fichier :** `message_whatsapp/src/jorbs/idle-disconnect.job.ts`

**Config cron (`cron_config`) :**

| Paramètre | Valeur par défaut |
|-----------|-------------------|
| `key` | `idle-disconnect` |
| `label` | `Déconnexion automatique — commerciaux inactifs` |
| `scheduleType` | `interval` |
| `intervalMinutes` | 5 (vérification toutes les 5 min) |
| `enabled` | `true` |
| `ttlDays` | 15 (seuil inactivité en minutes — réutilise ce champ) |

**Logique du job :**
```
1. Lire le seuil d'inactivité depuis dispatch_settings.idle_disconnect_minutes (défaut 15)
2. Requête : SELECT commerciaux WHERE is_active = true AND last_activity_at < now - seuil
3. Pour chaque commercial inactif trouvé :
   a. queueService.removeFromQueue(commercial.poste.id)
   b. commercial.is_active = false → save
   c. messageGateway.disconnectCommercial(commercial.id) → émet 'commercial:force-disconnect'
   d. Logger l'événement
4. Retourner un rapport : "N commercial(aux) déconnecté(s) pour inactivité"
```

### Config admin

Nouvelles colonnes sur `dispatch_settings` :

| Colonne | Type | Défaut | Description |
|---------|------|--------|-------------|
| `idle_disconnect_enabled` | boolean | true | Active/désactive la fonctionnalité |
| `idle_disconnect_minutes` | int | 15 | Seuil inactivité en minutes |

**Route admin :** `PATCH /dispatch-settings` (existant) avec les nouveaux champs.

### Mise à jour de `last_activity_at`

Tous les points d'interaction existants doivent appeler :
```typescript
commercialRepository.update(commercialId, { last_activity_at: new Date() });
```

Points à instrumenter :
- `MessageGateway` : handler `handleConnection` (connexion WebSocket)
- `MessageReadService` : `markConversationAsRead()` (F1 — déjà prévu)
- Service d'envoi de message : quand un commercial envoie une réponse
- `MessageGateway` : nouveau handler `handlePresencePing` pour les pings frontend

---

## Plan de migration BDD

### Migration 1 — `AddMessageReadTracking<timestamp>`

```sql
-- Colonnes sur whatsapp_message (tracking lecture commerciaux)
ALTER TABLE whatsapp_message
  ADD COLUMN read_by_commercial_id CHAR(36) NULL DEFAULT NULL,
  ADD COLUMN read_by_commercial_at DATETIME NULL DEFAULT NULL,
  ADD INDEX IDX_msg_read_by_commercial (read_by_commercial_id),
  ADD CONSTRAINT FK_msg_read_by_commercial
    FOREIGN KEY (read_by_commercial_id)
    REFERENCES whatsapp_commercial(id) ON DELETE SET NULL;

-- Colonnes sur whatsapp_commercial
ALTER TABLE whatsapp_commercial
  ADD COLUMN messages_read_count INT NOT NULL DEFAULT 0,
  ADD COLUMN messages_handled_count INT NOT NULL DEFAULT 0,
  ADD COLUMN last_activity_at DATETIME NULL;
```

### Migration 2 — `AddIdleDisconnectSettings<timestamp>`

```sql
ALTER TABLE dispatch_settings
  ADD COLUMN max_read_messages_per_minute INT NOT NULL DEFAULT 1,
  ADD COLUMN idle_disconnect_enabled TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN idle_disconnect_minutes INT NOT NULL DEFAULT 15;
```

---

## Fichiers à créer / modifier

### Fichiers à créer

| Fichier | Description |
|---------|-------------|
| `src/whatsapp_message/message-read.service.ts` | Service lecture + comptabilisation |
| `src/whatsapp_message/message-read-rate-limiter.service.ts` | Rate limiter en mémoire |
| `src/whatsapp_commercial/commercial-stats.service.ts` | Agrégation stats |
| `src/jorbs/idle-disconnect.job.ts` | Job déconnexion inactivité |
| `src/database/migrations/AddMessageReadTracking<ts>.ts` | Migration 1 |
| `src/database/migrations/AddIdleDisconnectSettings<ts>.ts` | Migration 2 |
| `front/src/components/CommercialPanel/CommercialDetails.tsx` | Onglet détails front |
| `admin/src/app/commercials/[id]/stats/page.tsx` | Page stats admin |

### Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `src/whatsapp_message/whatsapp_message.module.ts` | Déclarer les nouveaux services |
| `src/whatsapp_message/entities/whatsapp_message.entity.ts` | Ajouter `read_by_commercial_id`, `read_by_commercial_at` + relation |
| `src/whatsapp_commercial/entities/user.entity.ts` | Ajouter 3 colonnes |
| `src/dispatcher/entities/dispatch-settings.entity.ts` | Ajouter 3 colonnes |
| `src/dispatcher/services/dispatch-settings.service.ts` | Mettre à jour DEFAULTS |
| `src/gateway/message.gateway.ts` | Handler `conversation:read` + `handlePresencePing` + `disconnectCommercial()` |
| `src/jorbs/cron-config.service.ts` | Ajouter défaut `idle-disconnect` dans CRON_DEFAULTS |
| `src/whatsapp_message/whatsapp_message.service.ts` | Incrémenter `messages_handled_count` à l'envoi |
| `admin/src/app/lib/api.ts` | Endpoint stats commercial |
| `admin/src/app/lib/definitions.ts` | Type `CommercialStatsDto` |

---

## Ordre d'implémentation recommandé

```
Sprint A (backend)
  1. Migration 1 (entité + colonnes commercial)
  2. MessageReadReceipt entity
  3. MessageReadRateLimiterService
  4. MessageReadService (markConversationAsRead)
  5. Handler WebSocket conversation:read dans gateway
  6. CommercialStatsService + endpoint GET /commercials/:id/stats
  7. Incrément messages_handled_count dans le service d'envoi

Sprint B (backend inactivité)
  8. Migration 2 (colonnes dispatch_settings)
  9. dispatch-settings.entity.ts + service DEFAULTS
  10. IdleDisconnectJob + enregistrement dans CronConfigService
  11. Instrumentation last_activity_at dans gateway et services

Sprint C (frontend)
  12. Événement conversation:read émis quand commercial ouvre une conv
  13. Composant CommercialDetails.tsx (onglet stats)
  14. Intégration dans CommercialPanel

Sprint D (admin)
  15. Page stats admin /commercials/[id]/stats
  16. Paramètres rate limit + idle disconnect dans settings admin
```

---

*Plan généré le 2026-05-21*
