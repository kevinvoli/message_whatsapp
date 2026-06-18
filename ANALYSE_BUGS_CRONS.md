# Analyse bugs crons — 2026-06-18

## Bug 1 — `offline-reinject` : `Property "lastOpenedAt" was not found in "WhatsappChat"`

### Cause racine

`dispatcher.service.ts` utilise `{ lastOpenedAt: new Date() }` dans 7 appels `chatRepository.update()`. Cette propriété **n'existe pas** dans l'entité `WhatsappChat` (ni dans la table SQL, ni dans la migration). TypeORM lève une `EntityPropertyNotFoundError` avant même d'envoyer la requête SQL.

Localisation des 7 occurrences (toutes dans `dispatcher.service.ts`) :
| Ligne | Méthode | Condition |
|-------|---------|-----------|
| 495 | `reinjectConversation()` | `nextPoste.is_active` |
| 544 | `dispatchOrphanConversation()` – poste dédié | `dedicatedPoste.is_active` |
| 574 | `dispatchOrphanConversation()` – read-lock | `readerPoste.is_active` |
| 602 | `dispatchOrphanConversation()` – queue | `nextPoste.is_active` |
| 648 | `dispatchExistingConversation()` | `nextPoste.is_active` |
| 907 | `jobRunnerAllPostes()` – boucle redistribution | `destPoste.is_active` |
| 967 | `redispatchWaiting()` | `nextAgent.is_active` |

Note : `last_opened_at` (snake_case) n'existe que dans `metriques.service.ts` ligne 1428 comme **alias SQL calculé** (`started_at` de `chat_session`) — c'est différent et correct. La confusion vient probablement de là.

### Impact

- **`offline-reinject`** : `offlineReinject()` appelle `reinjectConversation()` → l'erreur n'est pas attrapée dans la boucle → première conversation avec un poste actif suivant → exception propagée → le cron avorte complètement (attrapé par `CronConfigService.runHandler()`).
- **`dispatchOrphanConversation()`** : les assignations orphelin → poste actif via QB `.execute()` échouent car `lastOpenedAt` est dans le `.set({})`. Toutes les conversations orphelines dont le prochain poste est actif ne sont pas assignées.
- **`jobRunnerAllPostes()`** : les mises à jour sont dans un try-catch (ligne 896-916), l'erreur est silencieuse. Aucune conversation n'est rééquilibrée vers un poste actif.
- **`redispatchWaiting()`** : même problème que `dispatchOrphanConversation`, erreur non attrapée.

### Fix

Supprimer les 7 lignes `...(xxx.is_active ? { lastOpenedAt: new Date() } : {})` dans `dispatcher.service.ts`.

```typescript
// Avant
await this.chatRepository.update(chat.id, {
  poste_id: nextPoste.id,
  assigned_at: new Date(),
  first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
  ...(nextPoste.is_active ? { lastOpenedAt: new Date() } : {}),  // ← SUPPRIMER
});

// Après
await this.chatRepository.update(chat.id, {
  poste_id: nextPoste.id,
  assigned_at: new Date(),
  first_response_deadline_at: new Date(Date.now() + 30 * 60 * 1000),
});
```

Aucune migration nécessaire (la colonne n'a jamais existé).

---

## Bug 2 — `sla-checker` : toujours `"Ignore — cycle précédent encore en cours"`

### Cause racine

`DispatcherService` utilise un flag en mémoire `isSlaRunning: boolean` pour éviter les exécutions concurrentes de `jobRunnerAllPostes()`. Ce flag est correctement réinitialisé dans un bloc `finally`. Il ne peut être bloqué à `true` indéfiniment que si **la fonction est encore en cours d'exécution** — i.e., en attente d'une Promise qui ne résout pas.

Deux facteurs combinés expliquent le blocage persistant :

#### Facteur A — Requêtes lentes (cause principale)

`jobRunnerAllPostes()` effectue N+3 requêtes sur `whatsapp_chat` sans index exploitable sur les colonnes de filtrage :

- Filtre `unread_count > 0` → pas d'index sur `unread_count`
- Filtre `last_client_message_at < :threshold` → pas d'index sur `last_client_message_at`
- Filtre `deletedAt IS NULL` → pas d'index couvrant

De plus, la boucle interne exécute **une requête `getMany()` par poste surchargé** (pattern N+1 au niveau poste). Si on a 10 postes surchargés et que chaque scan complet prend 2 minutes, la fonction tourne 20+ minutes.

La durée d'exécution dépasse l'intervalle de 15 minutes → le déclencheur suivant (automatique ou manuel) trouve `isSlaRunning = true`.

#### Facteur B — `lastOpenedAt` rend le rééquilibrage inopérant (cause aggravante)

Dans la boucle de redistribution :
```typescript
try {
  await this.chatRepository.update(chat.id, {
    ...
    ...(destPoste.is_active ? { lastOpenedAt: new Date() } : {}),
  });
  // Ces lignes ne s'exécutent JAMAIS pour les postes actifs :
  countMap.set(destPoste.id, count + 1);
  dispatched++;
} catch (err) {
  this.logger.warn(...)  // erreur silencieuse
}
```

Comme `countMap` n'est jamais mis à jour et `dispatched` reste à 0 :
- `batchSize - dispatched = 300` reste constant → `.take(300)` à chaque itération
- `underIdx` ne progresse pas (le `while` de filtrage ne s'avance pas car `countMap < target` reste vrai)
- Toutes les conversations du poste surchargé tentent d'aller vers le même premier poste actif → 300 erreurs successives → le cron ne redistribue rien

### Fix

#### Fix 1 (obligatoire) — supprimer `lastOpenedAt` (cf. Bug 1)

Corrige les erreurs silencieuses dans la boucle, permettant aux mises à jour de réussir et à `countMap` + `dispatched` d'être correctement maintenus.

#### Fix 2 (obligatoire) — garde anti-blocage sur `isSlaRunning`

Ajouter un timestamp de démarrage et un timeout de sécurité pour forcer le reset si le job reste bloqué plus de 30 minutes :

```typescript
// Dans DispatcherService :
private isSlaRunning = false;
private slaRunningStartedAt: Date | null = null;
private readonly SLA_STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

async jobRunnerAllPostes(thresholdMinutes = 20, batchSize = 300): Promise<string> {
  if (this.isSlaRunning) {
    const elapsed = this.slaRunningStartedAt
      ? Date.now() - this.slaRunningStartedAt.getTime()
      : 0;
    if (elapsed < this.SLA_STALE_TIMEOUT_MS) {
      this.logger.warn('SLA checker deja en cours — cycle ignore');
      return 'Ignore — cycle precedent encore en cours';
    }
    this.logger.warn(`SLA checker — reset forcé (bloqué depuis ${Math.round(elapsed / 60000)} min)`);
  }
  this.isSlaRunning = true;
  this.slaRunningStartedAt = new Date();
  try {
    // ... logique existante inchangée
  } finally {
    this.isSlaRunning = false;
    this.slaRunningStartedAt = null;
  }
}
```

#### Fix 3 (recommandé) — indexes SQL manquants

Ajouter une migration avec les index suivants sur `whatsapp_chat` pour accélérer les requêtes du sla-checker :

```sql
-- Index couvrant pour le filtre principal du sla-checker
CREATE INDEX IDX_chat_sla_eligibility
  ON whatsapp_chat (unread_count, last_client_message_at, deletedAt);

-- Index pour la requête par poste dans la boucle
CREATE INDEX IDX_chat_sla_poste_eligible
  ON whatsapp_chat (poste_id, unread_count, last_client_message_at, deletedAt);
```

---

## Résumé des actions

| Priorité | Action | Fichier | Impact |
|----------|--------|---------|--------|
| P0 | Supprimer les 7 `lastOpenedAt` | `dispatcher.service.ts` | Corrige offline-reinject + débloque redistribution sla-checker |
| P0 | Ajouter garde anti-blocage `isSlaRunning` | `dispatcher.service.ts` | Garantit que sla-checker se débloque même si la requête pend |
| P1 | Ajouter indexes SQL | Migration | Réduit les temps d'exécution du sla-checker < 15 min |
