# Plan — Métriques Messages V2 : Logique par Tour de Conversation

> **Date :** 2026-05-22
> **Branche cible :** `production`
> **Statut :** PLANIFICATION

---

## Problème avec la V1

Dans la V1, les compteurs mesuraient des messages individuels :
- **Messages reçus** = nb de messages IN lus par le commercial
- **Messages traités** = nb de messages OUT envoyés par le commercial

**Résultat incohérent :** un commercial qui répond 10 fois à un seul message client affiche
`traités = 10, reçus = 1` → taux de réponse = 1000%.

---

## Nouvelle définition : le Tour de Conversation

Un **tour client** = une séquence de un ou plusieurs messages consécutifs envoyés par le client,
sans réponse intermédiaire du commercial.

Un **tour commercial** = la première réponse du commercial qui fait suite à un tour client.

### Règles

| Situation | Messages reçus | Messages traités |
|-----------|---------------|-----------------|
| Client envoie 1 message → commercial répond 1 fois | +1 | +1 |
| Client envoie 1 message → commercial répond 10 fois | +1 | +1 |
| Client envoie 3 messages d'affilée → commercial répond 1 fois | +3 | +1 |
| Client envoie 3 messages d'affilée → commercial répond 5 fois | +3 | +1 |
| Client envoie 1 message → pas de réponse commerciale | +1 | 0 |

**Règle résumée :**
- 1 message client entrant = 1 message reçu (comptage individuel, incrémenté à l'ouverture de la conversation)
- 1 premier message commercial après un tour client = 1 message traité (peu importe combien de réponses suivent)
- Les messages commerciaux supplémentaires dans le même tour ne comptent PAS comme traité supplémentaire

### Exemple concret

```
Timeline conversation :
  [IN]  "Bonjour"            ← debut tour client #1          → +1 reçu (total reçus: 1)
  [IN]  "Vous êtes là ?"     ← suite tour client #1          → +1 reçu (total reçus: 2)
  [OUT] "Oui bonjour !"      ← is_first_reply = true         → +1 traité (total traités: 1)
  [OUT] "Comment puis-je vous aider ?" ← is_first_reply = false  → (rien)
  [OUT] "Je suis disponible" ← is_first_reply = false        → (rien)
  [IN]  "J'ai un problème"   ← nouveau tour client #2        → +1 reçu (total reçus: 3)
  [OUT] "Je vous écoute"     ← is_first_reply = true         → +1 traité (total traités: 2)

Total : 3 messages reçus, 2 messages traités
Taux  : 2 tours répondus / 2 tours clients = 100%
```

---

## Taux de réponse

```
taux = messages_traités / messages_reçus × 100
```

Le taux se calcule sur les **messages individuels reçus** comme dénominateur et les **messages traités
(premiers tours de réponse)** comme numérateur.

Cela permet de voir exactement combien de messages clients sont restés sans réponse dédiée.

### Par commercial

```
taux_commercial = (messages_traités_par_commercial / messages_reçus_par_commercial) × 100
```

**Exemples :**

| Scénario | Messages reçus | Messages traités | Taux | Interprétation |
|----------|---------------|-----------------|------|----------------|
| Client envoie 1 msg → commercial répond | 1 | 1 | **100%** | Tout répondu |
| Client envoie 3 msgs d'affilée → commercial répond 1 fois | 3 | 1 | **33%** | 2 messages sans réponse dédiée |
| Client envoie 3 msgs d'affilée → commercial répond 1 fois + client envoie 1 msg → commercial répond | 4 | 2 | **50%** | 2 messages sans réponse dédiée |
| Client envoie 2 msgs → commercial répond → client envoie 2 msgs → commercial répond | 4 | 2 | **50%** | équilibré |

### Plateforme globale

```
taux_plateforme = (total_messages_traités / total_messages_reçus) × 100
```

- `total_messages_traités` = `COUNT(is_first_reply = 1)` sur toutes les conversations
- `total_messages_reçus`   = `COUNT(direction = 'IN')` sur toutes les conversations

---

## Implémentation technique

### 1. Nouveau champ sur `whatsapp_message`

| Colonne | Type | Nullable | Description |
|---------|------|----------|-------------|
| `is_first_reply` | `TINYINT(1)` | YES | `1` si ce message OUT est la première réponse après un tour client. `NULL` pour les messages IN. |

Une seule colonne suffit :
- `is_first_reply = 1` → le message compte comme **1 message traité**
- Les messages reçus restent comptés individuellement via `read_by_commercial_id` (existant)

### 2. Logique de détection au moment de l'enregistrement

#### Détection `is_first_reply` (messages OUT)

Lors de l'envoi d'un message commercial (`direction = OUT`) :
```
Récupérer le dernier message de la conversation (par timestamp DESC, limit 1)
Si le dernier message était direction = IN  → is_first_reply = true
Si le dernier message était direction = OUT → is_first_reply = false (même tour commercial)
Si aucun message précédent                  → is_first_reply = false (commercial parle en premier)
```

### 3. Compteurs mis à jour

#### `messages_read_count` sur `whatsapp_commercial`

Incrémenté du nombre de messages IN non lus (`read_by_commercial_id IS NULL`) quand le commercial
ouvre la conversation — comportement inchangé, comptage individuel message par message.

#### `messages_handled_count` sur `whatsapp_commercial`

Supprimé comme compteur cumulatif — calculé à la volée depuis `is_first_reply`.

### 4. Requêtes stats

```sql
-- Messages reçus par un commercial (messages IN individuels lus)
SELECT COUNT(*) FROM whatsapp_message
WHERE read_by_commercial_id = :commercialId
  AND direction = 'IN';

-- Messages traités par un commercial (première réponse par tour client)
SELECT COUNT(*) FROM whatsapp_message
WHERE is_first_reply = 1
  AND commercial_id = :commercialId
  AND direction = 'OUT';

-- Taux de réponse commercial : messages_traités / messages_reçus
SELECT
  COUNT(CASE WHEN is_first_reply = 1 AND commercial_id = :id THEN 1 END) AS messages_traites,
  COUNT(CASE WHEN read_by_commercial_id = :id AND direction = 'IN' THEN 1 END) AS messages_recus
FROM whatsapp_message;
-- taux = messages_traites / messages_recus * 100  (plafonné à 100%)

-- Taux de réponse global plateforme
SELECT
  COUNT(CASE WHEN is_first_reply = 1 THEN 1 END) AS total_traites,
  COUNT(CASE WHEN direction = 'IN' THEN 1 END)   AS total_recus
FROM whatsapp_message;
-- taux_global = total_traites / total_recus * 100
```

---

## Plan de migration BDD

### Migration : `AddConversationTurnTracking<timestamp>`

```sql
ALTER TABLE whatsapp_message
  ADD COLUMN is_first_reply TINYINT(1) NULL DEFAULT NULL
    COMMENT 'OUT uniquement : 1 si première réponse après un tour client',
  ADD INDEX IDX_msg_first_reply (is_first_reply);
```

### Backfill optionnel (données historiques)

Un script de backfill peut recalculer `is_first_reply` sur les messages existants en parcourant
l'historique conversation par conversation.

---

---

## F5 — Cooldown de sélection de conversation (frontend)

### Comportement

Un commercial ne peut ouvrir qu'**une seule conversation non lue toutes les 2 minutes**.
Si il tente d'en ouvrir une autre avant l'expiration du cooldown, un popup bloquant s'affiche.

> Le cooldown s'applique uniquement aux conversations **non lues** (unreadCount > 0).
> Cliquer sur une conversation déjà lue ne déclenche pas et ne réinitialise pas le cooldown.

### Popup de blocage

```
┌─────────────────────────────────────────────────────┐
│  ⏳  Veuillez patienter                              │
│                                                     │
│  Vous ne pouvez pas ouvrir plusieurs messages       │
│  non lus en même temps.                             │
│                                                     │
│  Vous devez patienter avant de cliquer sur un       │
│  autre message non lu.                              │
│                                                     │
│  Temps restant : 1 min 43 s                         │
│                              [ OK ]                 │
└─────────────────────────────────────────────────────┘
```

- Le temps restant se met à jour en temps réel (décompte seconde par seconde)
- Le bouton "OK" ferme le popup mais ne débloque pas le cooldown
- Le popup se ferme automatiquement quand le cooldown expire

### Paramétrage admin

Nouvelle valeur dans `dispatch_settings` :

| Colonne | Type | Défaut | Description |
|---------|------|--------|-------------|
| `read_cooldown_seconds` | int | 120 | Durée du cooldown entre deux ouvertures de conv non lues (secondes) |

### Implémentation frontend

**State à ajouter dans `chatStore.ts` :**
```typescript
lastUnreadOpenedAt: number | null;   // timestamp ms de la dernière ouverture d'une conv non lue
readCooldownSeconds: number;         // chargé depuis GET /dispatch-settings
```

**Logique dans `selectConversation()` :**
```
Si conversation.unreadCount > 0 :
  Si lastUnreadOpenedAt !== null ET now - lastUnreadOpenedAt < cooldown_ms :
    → bloquer la navigation, afficher le popup avec le temps restant
    → NE PAS émettre conversation:read ni messages:get
  Sinon :
    → mettre à jour lastUnreadOpenedAt = now
    → procéder normalement
```

**Nouveau composant :** `front/src/components/ReadCooldownModal.tsx`
- Reçoit `remainingMs` en prop
- Affiche le popup avec décompte live via `setInterval` toutes les 1s
- Se ferme automatiquement quand `remainingMs <= 0`

### Implémentation backend

**Migration :** ajouter `read_cooldown_seconds INT NOT NULL DEFAULT 120` sur `dispatch_settings`

**Endpoint :** `GET /dispatch-settings` (existant) — expose déjà le contenu de `dispatch_settings`,
ajouter le nouveau champ dans le DTO de retour.

**Admin UI (`DispatchView.tsx`) :** ajouter un champ numérique "Cooldown entre lectures (secondes)".

---

## F6 — Popup de déconnexion automatique avec décompte (frontend)

### Comportement

Quand un commercial n'effectue **aucune action** depuis `(seuil - 10 secondes)`, un popup
de avertissement s'affiche avec un décompte en temps réel. Si le commercial n'interagit pas
avant la fin du décompte, il est déconnecté.

### Popup d'avertissement

```
┌─────────────────────────────────────────────────────┐
│  ⚠️  Inactivité détectée                             │
│                                                     │
│  Vous n'avez effectué aucune action depuis          │
│  14 min 54 s.                                       │
│                                                     │
│  Vous serez déconnecté dans :                       │
│                                                     │
│              4… 3… 2… 1…                            │
│                                                     │
│          [ Je suis toujours là ]                    │
└─────────────────────────────────────────────────────┘
```

- Le temps d'inactivité (`14 min 54 s`) se met à jour chaque seconde
- Le décompte (`4, 3, 2, 1`) se met à jour chaque seconde
- Le bouton **"Je suis toujours là"** réinitialise `lastActivityAt` et ferme le popup
- À 0 → déconnexion immédiate : `window.location.replace('/login?reason=idle')`

### Paramètres

Utilise les valeurs existantes de `dispatch_settings` :

| Paramètre | Valeur | Rôle |
|-----------|--------|------|
| `idle_disconnect_minutes` | 15 (défaut) | Seuil total d'inactivité avant déconnexion |
| `idle_warning_seconds` | **10** (nouveau, défaut) | Combien de secondes avant le seuil afficher le popup |

> Nouveau champ à ajouter : `idle_warning_seconds INT NOT NULL DEFAULT 10`

### Déclenchement

```
popup s'affiche quand :
  now - lastActivityAt >= (idle_disconnect_minutes * 60 - idle_warning_seconds) secondes

déconnexion quand :
  now - lastActivityAt >= idle_disconnect_minutes * 60 secondes
```

### Actions qui réinitialisent `lastActivityAt` (côté frontend)

- Clic sur une conversation
- Envoi d'un message
- Tout événement `mousemove` ou `keydown` dans la fenêtre (optionnel, à définir)
- Clic sur "Je suis toujours là" dans le popup

### Implémentation frontend

**Nouveau hook :** `front/src/hooks/useIdleTimer.ts`

```typescript
useIdleTimer(idleMinutes: number, warningSeconds: number): {
  showWarning: boolean;      // afficher le popup
  idleSeconds: number;       // nb de secondes d'inactivité actuelle
  remainingSeconds: number;  // nb de secondes avant déconnexion
  resetActivity: () => void; // appelé quand l'utilisateur agit
}
```

**Implémentation interne :**
- `lastActivityAt` stocké en ref (reset sur chaque action)
- `setInterval` toutes les 1s : calcule `idleSeconds` et `remainingSeconds`
- Quand `remainingSeconds <= 0` → `window.location.replace('/login?reason=idle')`
- Expose `showWarning = idleSeconds >= (idleMinutes * 60 - warningSeconds)`

**Nouveau composant :** `front/src/components/IdleWarningModal.tsx`
- Reçoit `idleSeconds`, `remainingSeconds`, `onStillHere` en props
- Formate `idleSeconds` en `MM min SS s`
- Affiche le décompte `remainingSeconds`

**Intégration dans le layout principal** (ex. `front/src/app/layout.tsx` ou composant racine) :
```tsx
const { showWarning, idleSeconds, remainingSeconds, resetActivity } = useIdleTimer(
  settings.idleDisconnectMinutes,
  settings.idleWarningSeconds,
);

// Écoute les actions utilisateur
useEffect(() => {
  window.addEventListener('mousemove', resetActivity);
  window.addEventListener('keydown', resetActivity);
  return () => { ... };
}, [resetActivity]);

{showWarning && (
  <IdleWarningModal
    idleSeconds={idleSeconds}
    remainingSeconds={remainingSeconds}
    onStillHere={resetActivity}
  />
)}
```

### Lien avec le backend (idle-disconnect job)

Le job backend `idle-disconnect` tourne toutes les 5 min et déconnecte les commerciaux côté serveur.
La F6 est une **couche frontend** qui prévient le commercial AVANT que le backend agisse.
Les deux mécanismes coexistent :
- Frontend : avertissement + auto-redirect à l'expiration côté client
- Backend : sécurité serveur si le frontend était fermé ou non réactif (onglet en arrière-plan)

### Implémentation backend

**Migration :** ajouter `idle_warning_seconds INT NOT NULL DEFAULT 10` sur `dispatch_settings`

**`GET /dispatch-settings`** : exposer `idleWarningSeconds` dans le DTO de retour.

**Admin UI (`DispatchView.tsx`) :** ajouter un champ "Secondes d'avertissement avant déconnexion".

---

## Fichiers à créer / modifier

### Backend

| Fichier | Modification |
|---------|-------------|
| `src/database/migrations/AddConversationTurnTracking<ts>.ts` | `is_first_reply` sur whatsapp_message |
| `src/database/migrations/AddCooldownAndWarningSettings<ts>.ts` | `read_cooldown_seconds` + `idle_warning_seconds` sur dispatch_settings |
| `src/whatsapp_message/entities/whatsapp_message.entity.ts` | Ajouter `isFirstReply` |
| `src/whatsapp_message/whatsapp_message.service.ts` | Setter `isFirstReply` à chaque `create()` |
| `src/whatsapp_commercial/commercial-stats.service.ts` | Réécrire `getStats()` avec les nouvelles requêtes |
| `src/metriques/metriques.service.ts` | Mettre à jour le taux de réponse global |
| `src/dispatcher/entities/dispatch-settings.entity.ts` | Ajouter `readCooldownSeconds`, `idleWarningSeconds` |
| `src/dispatcher/services/dispatch-settings.service.ts` | Ajouter dans DEFAULTS |
| `src/dispatcher/dto/update-dispatch-settings.dto.ts` | Ajouter les deux champs optionnels |

### Frontend

| Fichier | Description |
|---------|-------------|
| `front/src/hooks/useIdleTimer.ts` | Hook de détection inactivité + décompte |
| `front/src/components/IdleWarningModal.tsx` | Popup déconnexion avec décompte |
| `front/src/components/ReadCooldownModal.tsx` | Popup blocage sélection conv non lue |
| `front/src/store/chatStore.ts` | Ajouter `lastUnreadOpenedAt`, `readCooldownSeconds` ; logique cooldown dans `selectConversation()` |

### Admin

| Fichier | Modification |
|---------|-------------|
| `admin/src/app/ui/DispatchView.tsx` | Ajouter champs "Cooldown lecture" et "Secondes avertissement" |
| `admin/src/app/lib/definitions.ts` | Mettre à jour `DispatchSettings` |

---

## Ordre d'implémentation

```
Étape 1 — Migration BDD (is_first_reply + read_cooldown_seconds + idle_warning_seconds)

Étape 2 — Entité & DTO backend
  - whatsapp_message.entity.ts : isFirstReply
  - dispatch-settings.entity.ts : readCooldownSeconds, idleWarningSeconds
  - dispatch-settings.service.ts : DEFAULTS
  - update-dispatch-settings.dto.ts : nouveaux champs

Étape 3 — Logique métier backend
  - whatsapp_message.service.ts : setter isFirstReply à create()
  - commercial-stats.service.ts : requêtes V2
  - metriques.service.ts : taux global V2

Étape 4 — Frontend cooldown (F5)
  - ReadCooldownModal.tsx
  - chatStore.ts : cooldown dans selectConversation()

Étape 5 — Frontend idle warning (F6)
  - useIdleTimer.ts
  - IdleWarningModal.tsx
  - Intégration dans le layout principal

Étape 6 — Admin UI
  - DispatchView.tsx : nouveaux champs

Étape 7 — Backfill is_first_reply (optionnel)
  Script one-shot sur l'historique existant
```

---

*Plan généré le 2026-05-22 — mis à jour le 2026-05-22*
