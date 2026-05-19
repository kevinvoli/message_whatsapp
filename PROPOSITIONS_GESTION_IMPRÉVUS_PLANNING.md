# Propositions — Gestion des imprévus de planning

> Analyse basée sur l'architecture existante au 2026-05-19  
> Contexte : groupes commerciaux avec cycles travail/repos générés dans `group_schedule_day`,  
> champ `is_working_today` mis à jour chaque nuit par `DailyResetJob` (cron `0 0 * * *`)  
> **Contrainte métier : 1 poste = 1 téléphone = 1 numéro d'appel entrant**

---

## État actuel du système

```
DailyResetJob (minuit)
  └─ getTodayWorkingGroupIds()   ← lit group_schedule_day pour la date du jour
       ↓
  SET is_working_today = true   WHERE group_id IN (groupes en service)
  SET is_working_today = false  WHERE group_id NOT IN (...) OR group_id IS NULL
       ↓
  getActiveGroupIds()           ← consommé par le dispatch des appels
  └─ dispatch : appels routés vers commercial.poste_id
```

**Contrainte "1 téléphone par poste"** : le dispatch achemine chaque appel entrant
vers le commercial associé au poste qui possède ce numéro. À un instant T, un poste
ne peut être tenu que par **un seul commercial**. Cette contrainte est déjà garantie
par l'unicité `(group_id, poste_id)` lors de l'ajout d'un membre au groupe.

**Limites actuelles** : le cron est binaire — il ne connaît pas les absences individuelles,
les jours exceptionnels, ni les remplacements.

---

## Table unifiée : `commercial_planning`

Une seule table couvre les trois scénarios (absence, jour exceptionnel, remplacement)
grâce à un champ `type`, un champ `linked_commercial_id` pour lier deux commerciaux
lors d'un remplacement, et un champ **`override_poste_id`** essentiel pour respecter
la contrainte "1 téléphone par poste".

### Structure BDD

```sql
CREATE TABLE commercial_planning (
  id                   CHAR(36)                     NOT NULL DEFAULT (UUID()),
  commercial_id        CHAR(36)                     NOT NULL,
  type                 ENUM('absence','exceptional') NOT NULL,
  date                 DATE                         NOT NULL,
  linked_commercial_id CHAR(36)                     NULL,
  override_poste_id    CHAR(36)                     NULL,
  reason               VARCHAR(255)                 NULL,
  declared_by          VARCHAR(100)                 NULL,
  created_at           DATETIME                     NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id),
  UNIQUE KEY UQ_commercial_planning_date (commercial_id, date),
  INDEX IDX_commercial_planning_date (date),
  INDEX IDX_commercial_planning_type_date (type, date)
);
```

### Sémantique des types

| `type`        | Effet sur `is_working_today`              | Usage                                       |
|---------------|-------------------------------------------|---------------------------------------------|
| `absence`     | Force à `false` (même si groupe actif)    | Absence maladie, congé non planifié         |
| `exceptional` | Force à `true` (même si groupe en repos)  | Travail exceptionnel, renfort, remplacement |

### Rôle de `override_poste_id` — contrainte 1 téléphone par poste

**Sans remplacement** (absence simple ou exceptionnel simple) : `override_poste_id = NULL`,
le commercial travaille sur son poste habituel ou n'est pas actif.

**Avec remplacement** (C1 absent, remplacé par C2) :

```
C1 : poste P1 (téléphone T1)   — absent
C2 : poste P2 (téléphone T2)   — remplaçant de C1
```

Puisqu'il y a **1 téléphone par poste**, les appels entrants sur T1 doivent aller à C2.
C2 prend donc le poste P1 pour la journée et **son propre poste P2 reste sans commercial**.

```
Ligne 1 → commercial_id = C1, type = 'absence',     linked = C2, override_poste_id = NULL
Ligne 2 → commercial_id = C2, type = 'exceptional', linked = C1, override_poste_id = P1
```

**Résultat** :
- C1 : `is_working_today = false` → hors dispatch
- C2 : `is_working_today = true`, `poste effectif = P1` (override) → reçoit les appels de T1
- P2 de C2 : sans commercial pour la journée (T2 non dispatché)

### Contrainte UNIQUE

`(commercial_id, date)` — un commercial ne peut avoir qu'un seul planning override
par jour, ce qui empêche les contradictions (absence ET exceptionnel le même jour).

---

## Impact sur le dispatch des appels

Le dispatch doit utiliser le **poste effectif** du commercial, pas forcément son `poste_id`
habituel. La requête de résolution du poste actif devient :

```sql
SELECT
  c.id                                                       AS commercial_id,
  COALESCE(cp.override_poste_id, c.poste_id)                AS effective_poste_id
FROM whatsapp_commercial c
LEFT JOIN commercial_planning cp
  ON  cp.commercial_id = c.id
  AND cp.date          = CURDATE()
  AND cp.type          = 'exceptional'
  AND cp.override_poste_id IS NOT NULL
WHERE c.is_working_today = true
  AND c.deleted_at IS NULL
```

> Cette requête remplace le simple `commercial.poste_id` dans `getActiveGroupIds()` /
> la logique de dispatch existante.

**Garantie d'unicité** : il ne peut pas y avoir deux commerciaux avec le même
`effective_poste_id` actif le même jour, car :
- La contrainte de groupe `(group_id, poste_id)` interdit déjà d'avoir deux commerciaux
  sur le même poste dans le même groupe
- Lors de la création d'un remplacement, le service vérifie qu'aucun autre commercial
  n'a déjà un `override_poste_id = P1` pour cette date

---

## Attribution du compteur d'appels lors d'un remplacement

### Question : à qui est attribué l'appel quand C2 remplace C1 ?

**Réponse : C2 doit recevoir le compteur** — c'est lui qui a décroché physiquement.

### Problème découvert dans le code actuel

La résolution du commercial dans `OrderCallSyncService.resolveCommercialForDevice()` (ligne 446)
construit son pool depuis `commercial.poste.id` — le **poste permanent** du commercial :

```typescript
// src/order-call-sync/order-call-sync.service.ts — Pré-résolution 2
const commercialsAtPoste = await this.commercialRepo.find({
  where: { poste: { id: In(posteIds) }, deletedAt: IsNull() },
  relations: ['poste'],
});
// → Map<posteId, WhatsappCommercial[]> — UNIQUEMENT les postes permanents
```

Avec le remplacement, **C2 est assigné en permanence au poste P2** — pas à P1.
Même si `override_poste_id = P1` est défini dans `commercial_planning` pour la journée,
C2 n'apparaîtra **pas** dans le pool de l'appareil de P1.

**Conséquence sans correction** :
- Pool de P1 = `[C1]` seulement
- C1 a `is_working_today = false` (absent), mais reste le seul candidat
- L'appel est attribué à C1 → **comportement incorrect** (C1 n'a pas décroché)

### Solution : enrichir le pool avec les remplaçants du jour

Avant d'appeler `resolveCommercialForDevice()`, interroger `commercial_planning` pour
trouver les commerciaux ayant un `override_poste_id` actif ce jour, et les injecter
dans le pool du poste correspondant :

```typescript
// Dans syncNewCalls(), après la construction de poolByPosteId (ligne ~168)

// Enrichissement du pool avec les remplaçants du jour (commercial_planning)
const todayStr = new Intl.DateTimeFormat('fr-CA', {
  timeZone: process.env['TZ'] ?? 'Africa/Abidjan',
}).format(new Date());

const replacements = await this.planningRepo.find({
  where: { type: 'exceptional', date: todayStr },
  // overridePosteId IS NOT NULL — chargé dans l'entité
});

for (const r of replacements) {
  if (!r.overridePosteId) continue;
  // Trouver le commercial remplaçant dans la liste déjà chargée
  const replacer = commercialsAtPoste.find((c) => c.id === r.commercialId)
    ?? await this.commercialRepo.findOne({
      where: { id: r.commercialId, deletedAt: IsNull() },
      relations: ['poste'],
      select: { id: true, phone: true, lastConnectionAt: true, isWorkingToday: true, groupId: true, poste: { id: true } },
    });
  if (!replacer) continue;

  // Injecter C2 dans le pool de P1 (poste de la personne remplacée)
  const pool = poolByPosteId.get(r.overridePosteId) ?? [];
  if (!pool.find((c) => c.id === replacer.id)) {
    pool.push(replacer);
    poolByPosteId.set(r.overridePosteId, pool);
  }
}
```

**Résultat après correction** :
- Pool de P1 = `[C1 (isWorkingToday=false), C2 (isWorkingToday=true)]`
- Cascade step 2 dans `resolveCommercialForDevice()` : filtre `isWorkingToday=true` → `[C2]`
- L'appel est attribué à **C2** ✅

### Récapitulatif attribution

| Scénario | Commercial dans le pool P1 | `isWorkingToday` | Attribué à |
|----------|---------------------------|------------------|------------|
| Jour normal (C1 en service) | C1 | true | C1 ✅ |
| C1 absent, pas de remplaçant | C1 | false | C1 ⚠️ (seul candidat) |
| C1 absent, remplacé par C2 | C1 (false) + C2 (true) | C1=false, C2=true | **C2** ✅ |

> Le cas "C1 absent sans remplaçant" peut être amélioré ultérieurement en excluant
> les commerciaux ayant un override `absence` du pool — mais c'est hors scope ici.

### Implication comptabilité GICOP

L'appel est créé dans `call_log` avec `commercial_id = C2` et `poste_id = P1`.
L'obligation GICOP du batch P1 sera donc validée **au nom de C2**, ce qui est
cohérent : c'est C2 qui a effectué l'appel. La performance individuelle de C2
reflète son travail de remplacement.

---

## Modification de `DailyResetJob`

```
Étape 1 — Groupes en service
  getTodayWorkingGroupIds()

Étape 2 — Activation groupe
  SET is_working_today = true, working_today_since = NOW()
  WHERE group_id IN (groupes en service) AND deleted_at IS NULL

Étape 3 — Désactivation groupe
  SET is_working_today = false, working_today_since = NULL
  WHERE (group_id NOT IN (...) OR group_id IS NULL) AND deleted_at IS NULL

Étape 4 — Absences  ← NOUVEAU
  SET is_working_today = false, working_today_since = NULL
  WHERE id IN (
    SELECT commercial_id FROM commercial_planning
    WHERE date = CURDATE() AND type = 'absence'
  )

Étape 5 — Exceptionnels / Remplaçants  ← NOUVEAU
  SET is_working_today = true, working_today_since = NOW()
  WHERE id IN (
    SELECT commercial_id FROM commercial_planning
    WHERE date = CURDATE() AND type = 'exceptional'
  )
```

> `override_poste_id` n'intervient pas dans le cron — il est lu dynamiquement
> par le dispatch à chaque attribution d'appel.

---

## API backend

```
POST   /commercial-groups/planning
       Body: { commercialId, type, date, reason }
       → Absence simple ou exceptionnel simple

POST   /commercial-groups/planning/replacement
       Body: { replacedId, replacerId, date, reason }
       → Crée les 2 lignes liées en transaction (avec override_poste_id = poste de C1)

DELETE /commercial-groups/planning/:id
       → Supprime 1 ligne (si remplacement : supprime aussi la ligne liée)

GET    /commercial-groups/planning?date=YYYY-MM-DD
       → Retourne tous les overrides du jour avec les infos commerciaux et postes
```

### Création d'un remplacement (transaction)

```typescript
async createReplacement(replacedId: string, replacerId: string, date: string, reason?: string) {
  const replaced = await this.commercialRepo.findOne({
    where: { id: replacedId },
    relations: ['poste'],
  });
  if (!replaced?.poste) throw new BadRequestException('Le commercial remplacé n\'a pas de poste.');

  // Vérifier qu'aucun autre commercial n'a déjà override_poste_id = replaced.poste.id pour cette date
  const conflict = await this.planningRepo.findOne({
    where: { override_poste_id: replaced.poste.id, date },
  });
  if (conflict) throw new ConflictException('Ce poste a déjà un remplaçant désigné pour cette date.');

  return this.dataSource.transaction(async (em) => {
    await em.insert(CommercialPlanning, {
      commercialId: replacedId, type: 'absence',
      date, linkedCommercialId: replacerId, reason,
    });
    await em.insert(CommercialPlanning, {
      commercialId: replacerId, type: 'exceptional',
      date, linkedCommercialId: replacedId,
      overridePosteId: replaced.poste.id,   // C2 prend le téléphone de C1
      reason,
    });
  });
}
```

---

## UI admin — Vue présence enrichie

| Groupe | Commercial | Poste effectif | Statut         | Action                            |
|--------|------------|----------------|----------------|-----------------------------------|
| A      | Alice      | Poste A (T1)   | En service     | [Déclarer absente]                |
| A      | Bob        | Poste B (T2)   | Remplacé ⚠️    | *Par Charlie sur Poste B* [×]     |
| B      | Charlie    | **Poste B (T2)**| Remplaçant 🔄 | *Remplace Bob — répond sur T2*    |
| B      | David      | Poste D (T4)   | Repos          | [Activer aujourd'hui]             |

> La colonne "Poste effectif" affiche `override_poste_id` quand il est défini,
> sinon le `poste_id` habituel. Cela permet à l'admin de voir immédiatement
> quel téléphone chaque commercial gère aujourd'hui.

**Badges**

| Badge        | Couleur | Condition                                                          |
|--------------|---------|--------------------------------------------------------------------|
| En service   | Vert    | `is_working_today = true`, pas d'override                          |
| Absent       | Orange  | Override `absence` sans `linked_commercial_id`                     |
| Remplacé     | Orange  | Override `absence` avec `linked_commercial_id`                     |
| Remplaçant   | Violet  | Override `exceptional` avec `linked_commercial_id` + `override_poste_id` |
| Exceptionnel | Bleu    | Override `exceptional` sans `linked_commercial_id`                 |
| Repos        | Gris    | `is_working_today = false`, pas d'override                         |

---

## Scénario 4 — Impact des absences et remplacements sur la connexion

### Cas 1 — Commercial absent

Le `DailyResetJob` (étape 4) positionne `is_working_today = false` pour tout commercial
ayant un override `absence` du jour. Il est donc traité exactement comme un commercial
hors planning — deux approches possibles :

**Approche A — Blocage doux**
```tsx
{/* Dans le layout front/ */}
{!user.isWorkingToday && (
  <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-700">
    {user.absentToday
      ? 'Vous êtes déclaré absent aujourd\'hui. Aucun appel ne vous sera attribué.'
      : 'Vous n\'êtes pas en service aujourd\'hui. Aucun appel ne vous sera attribué.'
    }
  </div>
)}
```

Le payload JWT distingue la cause grâce au champ `absentToday` (voir section JWT ci-dessous).

**Approche B — Blocage fort**
Le `WorkingDayGuard` bloque la connexion si `is_working_today = false`,
quelle que soit la raison (absence ou hors planning). Un même guard couvre les deux cas.

---

### Cas 2 — Commercial remplaçant : quelles conversations afficher ?

**Décision : C2 voit les conversations du poste de C1 (P1), pas les siennes (P2).**

| Option | Description | Verdict |
|--------|-------------|---------|
| **A — Conversations de C1 (P1)** | C2 répond au téléphone T1 → voit les clients de T1 | ✅ Retenu |
| B — Conversations de C2 (P2) | C2 décroche T1 mais voit P2 à l'écran | ❌ Incohérence opérationnelle |
| C — Les deux postes | Double vue P1 + P2 | ❌ Trop complexe, confus |

**Justification de l'option A :**
- Puisqu'il y a **1 téléphone par poste**, C2 décroche physiquement T1. Chaque appel
  entrant sur T1 crée ou rouvre une conversation liée à P1. C2 a besoin du contexte
  client de P1 pour répondre correctement.
- Les conversations P2 de C2 sont **en attente** jusqu'à son retour à son poste normal,
  exactement comme lors d'un jour de repos.
- Quand C1 revient, il retrouve son historique P1 intact avec les actions effectuées
  par C2 visibles dans le fil de chaque conversation.
- **C'est le comportement naturel du mécanisme `override_poste_id`** : le JWT de C2
  retourne `posteId = P1` → le front charge P1 sans aucune modification supplémentaire.

Le remplaçant C2 est actif (`is_working_today = true`) et doit voir et recevoir
les conversations du poste P1 (celui de C1 absent), **pas de son poste habituel P2**.

Le JWT est émis au moment du login avec le `posteId` de P2 (poste normal de C2).
Si on ne corrige pas cela, le front affiche à C2 ses conversations habituelles (P2)
alors qu'il doit traiter celles de P1.

**Solution : résoudre le poste effectif dans `JwtStrategy.validate()`**

```typescript
// jwt.strategy.ts
async validate(payload: any) {
  const today = new Intl.DateTimeFormat('fr-CA', {
    timeZone: process.env['TZ'] ?? 'Africa/Abidjan',
  }).format(new Date());

  const [commercial, planning] = await Promise.all([
    this.commercialRepo.findOne({
      where:  { id: payload.sub },
      select: ['id', 'isWorkingToday'],
    }),
    this.planningRepo.findOne({
      where: { commercialId: payload.sub, date: today },
    }),
  ]);

  // Pour un remplaçant : utiliser le poste de la personne remplacée
  // Pour tous les autres : conserver le poste habituel du JWT
  const effectivePosteId =
    planning?.type === 'exceptional' && planning.overridePosteId
      ? planning.overridePosteId
      : payload.posteId;

  return {
    userId:         payload.sub,
    email:          payload.email,
    posteId:        effectivePosteId,        // ← poste P1 si remplaçant, P2 sinon
    isWorkingToday: commercial?.isWorkingToday ?? false,
    absentToday:    planning?.type === 'absence',   // ← pour le message front
    isReplacing:    planning?.type === 'exceptional' && !!planning.overridePosteId,
  };
}
```

**Résultat pour C2 remplaçant C1 :**
- `posteId = P1` dans toutes les requêtes → le front charge les conversations de P1
- `isWorkingToday = true` → aucune bannière de non-service
- `isReplacing = true` → le front peut afficher un indicateur "Vous remplacez [C1] aujourd'hui"

**Résultat pour C1 absent :**
- `is_working_today = false` → bannière ou blocage selon approche
- `absentToday = true` → message spécifique "Vous êtes déclaré absent"
- `posteId = P1` (inchangé, mais C1 n'est pas actif → sans effet sur le dispatch)

---

### Synthèse de l'impact connexion par statut

| Statut commercial | `is_working_today` | `posteId` dans JWT | Bannière front | Dispatch |
|---|---|---|---|---|
| En service (normal) | `true` | Son poste habituel | Aucune | Actif |
| Repos (hors planning) | `false` | Son poste habituel | "Pas en service" | Inactif |
| Absent | `false` | Son poste habituel | "Déclaré absent" | Inactif |
| Exceptionnel (sans remplacement) | `true` | Son poste habituel | Aucune | Actif |
| Remplaçant de C1 | `true` | **Poste de C1** (override) | "Vous remplacez C1" | Actif sur poste C1 |

---

### Approche B — Blocage fort (configurable via SystemConfig)

Clé : `RESTRICT_LOGIN_TO_WORKING_DAYS` (valeur `"true"` / `"false"`, défaut `false`)

```typescript
@Injectable()
export class WorkingDayGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const restrict = await this.systemConfigService.getBoolean(
      'RESTRICT_LOGIN_TO_WORKING_DAYS', false,
    );
    if (!restrict) return true;

    const req = ctx.switchToHttp().getRequest();
    const commercial = await this.commercialRepo.findOne({
      where:  { id: req.user.userId },
      select: ['isWorkingToday'],
    });

    if (!commercial?.isWorkingToday) {
      throw new ForbiddenException(
        "Connexion non autorisée : ce n'est pas votre jour de travail.",
      );
    }
    return true;
  }
}
```

### Recommandation

| Phase | Action |
|---|---|
| **Court terme** | Modifier `JwtStrategy.validate()` + approche A (bannière front contextuelle) |
| **Moyen terme** | Approche B déployée mais désactivée par défaut |
| **Condition d'activation B** | Après stabilisation des overrides en production |

---

## Récapitulatif — Ce qu'il faut implémenter

| # | Composant | Effort estimé |
|---|-----------|---------------|
| 1 | Migration `commercial_planning` (avec `override_poste_id`) | Faible |
| 2 | Entité TypeORM `CommercialPlanning` | Faible |
| 3 | Service + endpoints API (absence, exceptionnel, remplacement) | Moyen |
| 4 | Modification `DailyResetJob` (étapes 4 et 5) | Faible |
| 5 | Modification `JwtStrategy.validate()` — poste effectif + `absentToday` + `isReplacing` | Moyen |
| 6 | Modification dispatch — utiliser `effective_poste_id` | Moyen |
| 7 | **Enrichissement pool `OrderCallSyncService`** — injecter les remplaçants dans le pool du poste | Moyen |
| 8 | UI admin — vue présence avec poste effectif + actions | Moyen |
| 9 | Bannière front contextuelle (absent / remplaçant / hors planning) | Faible |
| 10 | `WorkingDayGuard` + flag SystemConfig (approche B) | Moyen |

## Ordre d'implémentation conseillé

1. **Migration + entité + `DailyResetJob`** — socle technique, pas d'UI requise
2. **`JwtStrategy.validate()`** — résolution poste effectif + flags connexion (critique)
3. **API absence + exceptionnel simples** — cas les plus fréquents
4. **Modification dispatch** (`effective_poste_id`) — critique pour les remplacements
5. **API remplacement** (transaction 2 lignes avec vérification conflit poste)
6. **Enrichissement pool `OrderCallSyncService`** — correctif attribution compteur d'appels C2
7. **UI admin** (vue présence enrichie avec colonne poste effectif)
8. **Bannière front contextuelle** (distingue absent / remplaçant / hors planning)
9. **WorkingDayGuard** (approche B, uniquement si décision métier validée)
