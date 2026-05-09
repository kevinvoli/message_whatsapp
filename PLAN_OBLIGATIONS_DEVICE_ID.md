# Plan d'implémentation — Obligations d'appel via device_id

Basé sur : `RAPPORT_OBLIGATIONS_APPEL_DEVICE_ID.md`
Date : 2026-05-09

---

## État des lieux

| Élément | Statut |
|---------|--------|
| Transport `device_id` vers `call_event` | ✅ fait |
| Normalisation `call_type` → minuscules | ✅ fait |
| `existsAnyForEntity` — évite les doublons pending | ✅ fait |
| `initAllBatches` au bootstrap | ✅ fait |
| Panel diagnostic admin (entonnoir retry) | ✅ fait |
| Fix `isEligibleForObligation` (localNumber ∥ deviceId) | ✅ fait |
| Durées nulles dans `call_event` — cause exacte inconnue | 🔲 à investiguer |
| Tests unitaires cas device | 🔲 à faire |
| Attribution source tracée | 🔲 à faire |
| Résolution temporelle par session | 🔲 à faire |

---

## Sprint 1 — Déblocage immédiat (P0)

### T1 — Vérifier et corriger les durées dans `call_event`

**Contexte** : `retried: 0` malgré des appels outgoing avec `device_id`. La cause probable est `duration_seconds = 0` pour tous les appels historiques, ce qui les exclut du filtre `>= 90s`.

**Investigation** :
Charger le panel Diagnostics admin → section "Entonnoir retry" :
- Si `withStatus > 0` et `withDuration = 0` : les durées sont nulles ou < 90s dans `call_event`
- Vérifier en DB2 via la requête SQL du rapport (section 7.1) :

```sql
SELECT COUNT(*) AS total,
  SUM(CASE WHEN duration = 0 THEN 1 ELSE 0 END) AS zero_duration,
  SUM(CASE WHEN duration >= 90 THEN 1 ELSE 0 END) AS ok_duration
FROM call_logs WHERE LOWER(call_type) = 'outgoing';
```

**Actions selon résultat** :

- **Si DB2 a des durées > 0 mais `call_event.duration_seconds = 0`** : le champ `duration` n'est pas mappé correctement dans l'entité. Vérifier `OrderCallLog.duration` et relancer un backfill via l'endpoint `POST /admin/order-sync/sync-calls`.
- **Si DB2 stocke la durée en millisecondes** : corriger dans `ingestFromDb2` : `durationSeconds: Math.round(call.duration / 1000)`.
- **Si DB2 a vraiment duration = 0** : les appels ne peuvent pas être comptabilisés (durée insuffisante). Vérifier avec l'équipe si DB2 enregistre la durée après raccroché ou au moment de l'appel.

**Fichier** : `src/order-call-sync/order-call-sync.service.ts:171`
**Critère de validation** : `retrySteps.withDuration > 0` dans le diagnostic admin.

---

### T2 — Backfill des appels historiques après correction

**Contexte** : Les 135+ appels ignorés par l'ancien `isEligibleForObligation` sont dans `call_event` mais sans entrée `success` dans `integration_sync_log`. Une fois T1 résolu, il faut les faire passer dans le matching.

**Actions** :
1. Cliquer sur **"Retry obligations"** dans Supervision GICOP.
2. Vérifier que `retried > 0` et `matched > 0`.
3. Si `retried > 0` mais `matched = 0` : regarder les raisons dans `integration_sync_log.last_error`.

**Critère de validation** : Les compteurs d'obligations sur le front commercial passent de 0 à une valeur > 0.

---

## Sprint 2 — Tests unitaires (P1/qualité)

### T3 — Cas de test `isEligibleForObligation` avec device_id

**Contexte** : Le test existant utilise `localNumber: '0700000001'`, ce qui ne couvre pas le cas réel (localNumber null + deviceId présent).

**Fichier cible** : `src/order-call-sync/__tests__/order-call-sync.service.spec.ts`

**7 cas à implémenter** (rapport section 6, correction P2) :

```
1. outgoing + localNumber présent              → éligible
2. outgoing + localNumber null + deviceId      → éligible
3. outgoing + localNumber null + deviceId null → non éligible, raison : poste_introuvable
4. missed + deviceId présent                   → non éligible (callType check)
5. outgoing + deviceId présent + durée < 90s   → rejeté : duree_insuffisante
6. outgoing + deviceId présent + aucun batch   → rejeté : aucun_batch_actif
7. outgoing + deviceId présent + device sans poste → rejeté : poste_introuvable
```

**Critère de validation** : `npm test -- order-call-sync.service.spec` passe en vert.

---

### T4 — Cas de test `retryUnmatchedObligations` via device_id

**Contexte** : Le retry est le mécanisme principal pour les appels sans `local_number`. Il n'est pas testé pour la résolution `device_id → call_device → poste`.

**Fichier cible** : `src/order-call-sync/__tests__/order-call-sync.service.spec.ts`

**Cas à implémenter** :
```
1. call_event avec device_id associé à un poste avec batch actif → matched: 1
2. call_event avec device_id sans poste associé → retried: 1, matched: 0
3. call_event sans device_id ET sans commercial_id → retried: 0 (ignoré)
4. call_event déjà en succès → non retryé (idempotence)
```

**Critère de validation** : les 4 cas passent.

---

## Sprint 3 — Attribution et traçabilité (P1)

### T5 — Tracer la source d'attribution dans `call_event`

**Contexte** : Aujourd'hui, on ne sait pas si `commercial_id` a été résolu par téléphone, par device/poste, ou s'il est absent. Difficile à auditer.

**Implémentation** :
1. Ajouter colonne `attribution_source VARCHAR(50) NULL` sur `call_event` :
   - `'phone'` : résolu via `local_number → commercial.phone`
   - `'device_poste'` : résolu via `device_id → call_device → commercial connecté`
   - `NULL` : non résolu

2. Migration : `AddAttributionSourceCallEvent<timestamp>`

3. Modifier `syncNewCalls()` pour renseigner la source :
   ```typescript
   const source = normalizedLocal && commercialByPhone.has(normalizedLocal)
     ? 'phone'
     : commercialByDevice.has(call.deviceId) ? 'device_poste' : null;
   ```

4. Passer `attributionSource` à `ingestFromDb2()`.

**Fichiers** :
- `src/window/entities/call-event.entity.ts`
- `src/window/services/call-event.service.ts`
- `src/order-call-sync/order-call-sync.service.ts`
- `src/database/migrations/`

**Critère de validation** : colonne visible dans la vue diagnostics, `device_poste` tracé pour les appels sans `local_number`.

---

### T6 — Ajouter la métrique DB2 "sans local_number" dans les diagnostics admin

**Contexte** : Le rapport section 6 (P2) recommande une métrique spécifique pour rendre le problème immédiatement visible.

**Implémentation** :
La métrique DB2 (`outgoingTotal`, `withoutLocalNumber`, `withDeviceId`) est déjà retournée par `getDiagnostics()`. Il faut l'afficher dans la vue admin.

**Fichier** : `admin/src/app/ui/GicopSupervisionView.tsx`

**UI à ajouter** dans le panel Diagnostics :
```
DB2 — appels sortants
  Total outgoing            : 569
  Sans local_number         : 569  ⚠ (rouge si > 0)
  Avec device_id            : 569  ✅
```

**Critère de validation** : la section s'affiche après clic "Charger".

---

## Sprint 4 — Résolution temporelle robuste (P1, conditionnel)

### T7 — Attribution par session de connexion commerciale

**Contexte** : Aujourd'hui, le commercial attribué à un poste est celui actuellement connecté (`isConnected = true`). Si une reconnexion ou un changement exceptionnel arrive, un appel de 9h peut être attribué au commercial connecté à 15h.

**Pré-requis** : existence d'une table de sessions avec `commercial_id`, `poste_id`, `connected_at`, `disconnected_at`.

**Implémentation** (si sessions disponibles) :
```typescript
// Résolution préférentielle : commercial dont la session couvre call_timestamp
const session = await sessionRepo.findOne({
  where: {
    posteId,
    connectedAt:    LessThanOrEqual(call.callTimestamp),
    disconnectedAt: MoreThanOrEqual(call.callTimestamp),
  }
});
const commercialId = session?.commercialId ?? fallbackConnectedCommercial;
```

**Note** : Si aucune table de sessions n'existe, ce ticket est bloqué. À discuter avec l'équipe avant de planifier.

**Critère de validation** : les tests d'attribution avec changement de commercial en cours de journée passent correctement.

---

## Résumé et ordre d'exécution

```
Sprint 1 (maintenant)
  T1 — Investiguer durées → corriger si nécessaire
  T2 — Backfill historique (après T1)

Sprint 2 (semaine suivante)
  T3 — Tests isEligibleForObligation
  T4 — Tests retryUnmatchedObligations

Sprint 3 (semaine suivante)
  T5 — Attribution source (migration + code)
  T6 — Affichage métrique DB2 admin

Sprint 4 (conditionnel — décision métier d'abord)
  T7 — Sessions temporelles
```

## Risques résiduels

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Durées = 0 dans DB2 (appels non enregistrés) | Moyenne | Élevé | Vérifier avec l'équipe si DB2 enregistre la durée en temps réel |
| Double attribution si deux commerciaux au même poste | Faible | Moyen | Appliquer T7 ou règle opérationnelle de déconnexion fin de journée |
| Device non associé à un poste | Faible | Élevé | Procédure ops : tout nouveau device détecté doit être associé sous 24h |
| FF_CALL_OBLIGATIONS_ENABLED désactivé | Faible | Élevé | Vérifier dans system_config avant tout déploiement |
