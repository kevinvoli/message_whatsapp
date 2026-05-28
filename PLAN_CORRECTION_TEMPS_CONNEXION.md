# Plan de correction — Temps de connexion commercial à 0

**Date** : 2026-05-28  
**Branche** : `production`  
**Priorité** : P0 — donnée métier critique  
**Révision** : v3 — comportement socket clarifié

---

## 1. Comportement attendu (référentiel)

### Règle métier fondamentale

> **Socket connecté → ouvrir une session dans les logs. Socket déconnecté → fermer la session dans les logs. Rien d'autre ne change : pas de nouveau token, pas de re-login, pas de changement côté frontend.**

Le JWT cookie et la reconnexion automatique restent exactement comme ils sont. La seule chose qui change : deux appels DB supplémentaires dans le gateway (insert à la connexion, update à la déconnexion).

### Exemple concret

| événement | heure | action dans `messaging_connection_log` |
|-----------|-------|----------------------------------------|
| Socket connecté | 09h00 | INSERT S1 (login_at=09h00, logout_at=NULL) |
| Réseau coupé | 09h30 | UPDATE S1 → logout_at=09h30 **(30 min)** |
| Socket reconnecté automatiquement | 09h35 | INSERT S2 (login_at=09h35, logout_at=NULL) |
| Session en cours à 10h35 | — | S2 ouverte depuis 60 min |
| **Total affiché** | — | **30 + 60 = 90 min** ✓ |

### Calcul (inchangé)

```sql
SUM(TIMESTAMPDIFF(MINUTE,
  GREATEST(login_at, :dateStart),
  LEAST(CASE WHEN logout_at IS NULL THEN :now ELSE logout_at END, :dateEnd)
))
```

La formule est correcte et gère tous les cas : sessions fermées, sessions en cours, sessions qui franchissent minuit.

---

## 2. État actuel vs comportement attendu

### Ce qui se passe aujourd'hui

```
09h00  POST /auth/login        → logLogin()   → S1 créée  ✓
09h00  Socket connect           → handleConnection() → updateStatus(true)
                                  ← PAS d'appel à ensureOpenSession()

09h30  Coupure réseau
09h30  handleDisconnect()       → void logLogout()   ← FIRE-AND-FORGET sans await
                                  si DB fail → S1 reste ouverte indéfiniment (fantôme)
                                  si OK → S1 fermée (09h30) ✓

09h35  Socket reconnecte (JWT cookie, pas de re-login)
09h35  handleConnection()       → updateStatus(true)
                                  ← PAS de nouvelle session créée  ✗

10h35  getTotalConnectionMinutes("today")
       → S1 = 30 min
       → aucune session ouverte depuis 09h35
       → retourne 30 min  ✗  (devrait être 90)
```

### Ce qui doit se passer

```
09h00  Socket connecté          → ensureOpenSession()   → S1 créée (09h00, NULL)  ✓
                                   [JWT inchangé, aucun token généré]

09h30  Coupure réseau
09h30  handleDisconnect()       → await logLogout()     → S1 fermée (09h30) [30 min]  ✓

09h35  Socket reconnecté automatiquement (aucun re-login)
09h35  handleConnection()       → ensureOpenSession()   → S2 créée (09h35, NULL)  ✓
                                   [JWT inchangé, aucun token généré]

10h35  getTotalConnectionMinutes("today")
       → S1 = 30 min
       → S2 = 60 min (en cours)
       → retourne 90 min  ✓
```

---

## 3. Bugs identifiés

| # | Bug | Fichier | Conséquence |
|---|-----|---------|-------------|
| A | Migration a supprimé les sessions ouvertes | `CleanupStaleConnectionLogs` | Commerciaux connectés depuis hier → 0 affiché immédiatement |
| B | `handleConnection` ne crée pas de session | `whatsapp_message.gateway.ts` | Temps de reconnexion jamais compté |
| C | `void logLogout` dans `handleDisconnect` | `whatsapp_message.gateway.ts` | Si DB fail → session fantôme permanente |
| D | Ghost socket purge sans logLogout | `whatsapp_message.gateway.ts` | Session peut rester ouverte sur refresh rapide |

---

## 4. Corrections

---

### Correction 1 — Migration : restaurer les sessions orphelines *(Bug A)*

**Fichier** : `src/database/migrations/RestoreOrphanedSessions1749254400001.ts`

```typescript
async up(queryRunner: QueryRunner): Promise<void> {
  // Étape 1 : fermer les sessions ouvertes pour les commerciaux déjà déconnectés
  // (isConnected = false mais logout_at IS NULL)
  await queryRunner.query(`
    UPDATE messaging_connection_log l
    INNER JOIN whatsapp_commercial c ON c.id = l.user_id
    SET l.logout_at = l.login_at
    WHERE l.user_type = 'commercial'
      AND l.logout_at IS NULL
      AND c.is_connected = 0
      AND c.deleted_at IS NULL
  `);

  // Étape 2 : créer une session pour les commerciaux connectés sans session ouverte
  await queryRunner.query(`
    INSERT INTO messaging_connection_log
      (id, user_id, user_type, login_at, logout_at, created_at, updated_at)
    SELECT
      UUID(),
      c.id,
      'commercial',
      CASE
        WHEN c.last_connection_at >= CURDATE() THEN c.last_connection_at
        ELSE CURDATE()
      END,
      NULL,
      NOW(),
      NOW()
    FROM whatsapp_commercial c
    WHERE c.is_connected = 1
      AND c.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM messaging_connection_log l
        WHERE l.user_id = c.id
          AND l.user_type = 'commercial'
          AND l.logout_at IS NULL
      )
  `);
}

async down(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    DELETE FROM messaging_connection_log
    WHERE user_type = 'commercial'
      AND created_at >= CURDATE()
      AND login_at = CURDATE()
  `);
}
```

---

### Correction 2 — `ConnectionLogService` : nouvelle méthode `ensureOpenSession` *(Bug B)*

**Fichier** : `src/connection-log/connection-log.service.ts`

```typescript
/**
 * Garantit qu'une session ouverte existe pour cet utilisateur.
 * - Si une session est déjà ouverte → rien (cas login HTTP suivi du connect socket).
 * - Si aucune session ouverte → crée une nouvelle (cas reconnexion socket automatique).
 * Aucun token JWT n'est généré ou modifié.
 */
async ensureOpenSession(
  userId: string,
  userType: ConnectionUserType,
): Promise<void> {
  const existing = await this.repo.findOne({
    where: { userId, userType, logoutAt: IsNull() },
    order: { loginAt: 'DESC' },
  });
  if (!existing) {
    await this.repo.save(
      this.repo.create({ userId, userType, loginAt: new Date(), logoutAt: null }),
    );
  }
}
```

---

### Correction 3 — `handleConnection` : appeler `ensureOpenSession` *(Bug B)*

**Fichier** : `src/whatsapp_message/whatsapp_message.gateway.ts`

Ajouter juste après `await this.commercialService.updateStatus(commercialId, true)` :

```typescript
// Un seul appel DB supplémentaire : ouvrir une session dans les logs.
// Aucun token JWT n'est généré. La reconnexion socket reste automatique.
await this.connectionLogService.ensureOpenSession(commercialId, 'commercial');
```

---

### Correction 4 — `handleDisconnect` : `await` + try/catch sur `logLogout` *(Bug C)*

**Fichier** : `src/whatsapp_message/whatsapp_message.gateway.ts` ligne 299

```typescript
// Avant :
void this.connectionLogService.logLogout(agent.commercialId, 'commercial');

// Après :
try {
  await this.connectionLogService.logLogout(agent.commercialId, 'commercial');
} catch (err) {
  this.logger.error(
    `logLogout failed for commercial=${agent.commercialId}: ${String(err)}`,
    WhatsappMessageGateway.name,
  );
}
```

---

### Correction 5 — Ghost socket : `logLogout` avant purge *(Bug D)*

**Fichier** : `src/whatsapp_message/whatsapp_message.gateway.ts` lignes 147-154

Quand un ghost socket est purgé, fermer sa session proprement avant de le retirer de la map :

```typescript
// Avant :
for (const [ghostClientId, ghostAgent] of this.connectedAgents.entries()) {
  if (ghostAgent.commercialId === commercialId) {
    this.connectedAgents.delete(ghostClientId);
  }
}

// Après :
for (const [ghostClientId, ghostAgent] of this.connectedAgents.entries()) {
  if (ghostAgent.commercialId === commercialId) {
    this.connectedAgents.delete(ghostClientId);
    // Fermer la session du ghost socket avant qu'handleDisconnect ne trouve plus l'agent
    try {
      await this.connectionLogService.logLogout(ghostAgent.commercialId, 'commercial');
    } catch (err) {
      this.logger.error(
        `Ghost logLogout failed for commercial=${ghostAgent.commercialId}: ${String(err)}`,
        WhatsappMessageGateway.name,
      );
    }
  }
}
// ensureOpenSession() plus bas dans handleConnection créera la nouvelle session
```

---

## 5. Règle pour les futures migrations de nettoyage

Toute migration touchant `messaging_connection_log` **doit** suivre ce pattern :

```sql
-- 1. Fermer proprement les sessions ouvertes avant de supprimer
UPDATE messaging_connection_log
SET logout_at = NOW()
WHERE user_type = 'commercial'
  AND login_at < :date_limite
  AND logout_at IS NULL;

-- 2. Supprimer uniquement les sessions fermées
DELETE FROM messaging_connection_log
WHERE user_type = 'commercial'
  AND login_at < :date_limite
  AND logout_at IS NOT NULL;
```

---

## 6. Ordre de livraison

| Priorité | Correction | Fichier | Bug corrigé |
|----------|-----------|---------|-------------|
| P0 immédiat | 1 — Migration restore | nouveau fichier | A |
| P0 | 2+3 — `ensureOpenSession` + `handleConnection` | service + gateway | B |
| P0 | 4 — `await logLogout` dans `handleDisconnect` | gateway | C |
| P0 | 5 — Ghost socket logLogout | gateway | D |
| Règle | Pattern migration | documentation | Prévention |

---

## 7. Fichiers impactés

| Fichier | Modification |
|---------|-------------|
| `src/database/migrations/RestoreOrphanedSessions1749254400001.ts` | **Nouveau** |
| `src/connection-log/connection-log.service.ts` | Ajout `ensureOpenSession()` |
| `src/whatsapp_message/whatsapp_message.gateway.ts` | `handleConnection` + `handleDisconnect` + ghost purge |

**Total : 3 fichiers (2 modifiés, 1 nouveau)**

---

## 8. Vérifications post-déploiement

```sql
-- 1. Aucun commercial connecté sans session ouverte
SELECT COUNT(*) AS orphelins
FROM whatsapp_commercial c
WHERE c.is_connected = 1
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM messaging_connection_log l
    WHERE l.user_id = c.id
      AND l.user_type = 'commercial'
      AND l.logout_at IS NULL
  );
-- Attendu : 0

-- 2. Aucune session ouverte pour un commercial déconnecté
SELECT COUNT(*) AS incoherences
FROM messaging_connection_log l
INNER JOIN whatsapp_commercial c ON c.id = l.user_id
WHERE l.user_type = 'commercial'
  AND l.logout_at IS NULL
  AND c.is_connected = 0
  AND c.deleted_at IS NULL;
-- Attendu : 0

-- 3. Vérifier que les reconnexions créent bien des nouvelles sessions
-- (au moins 2 sessions aujourd'hui pour un commercial qui s'est reconnecté)
SELECT user_id, COUNT(*) AS nb_sessions
FROM messaging_connection_log
WHERE user_type = 'commercial'
  AND login_at >= CURDATE()
GROUP BY user_id
HAVING COUNT(*) > 1;
-- Attendu : présent si un commercial s'est déconnecté/reconnecté dans la journée
```
