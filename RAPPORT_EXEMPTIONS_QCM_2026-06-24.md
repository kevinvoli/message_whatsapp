# Rapport — Exemptions QCM
## Date : 2026-06-24

> Audit réalisé en lecture seule. Aucun fichier de code modifié.
> Périmètre : backend `message_whatsapp/src/quiz/`, admin `admin/src/app/ui/QuizView.tsx`, front commercial `front/src/`.

---

## 1. Synthèse exécutive

Le système d'exemptions QCM est **fonctionnel end-to-end pour le cas nominal** : un admin peut exempter un commercial ou un poste, et l'exempté n'est plus bloqué par la modal QCM au login. Le câblage backend → admin → front est cohérent dans l'usage courant.

Cependant l'audit révèle **un bug bloquant** et plusieurs angles morts :

| Sévérité | Constat |
|---|---|
| **BLOQUANT** | Bug de précédence SQL dans `isExempt()` : le `OR` poste n'est pas parenthésé avec le filtre `deletedAt IS NULL` → une exemption poste **soft-supprimée** peut continuer à exempter un commercial. (§3, §7.1) |
| Majeur | Aucune contrainte d'unicité en base sur `(scope, commercial_id)` / `(scope, poste_id)`. L'anti-doublon est applicatif uniquement et **non concurrent-safe**. (§6, §7.2) |
| Majeur | `posteId` provient du JWT figé au login. Un commercial déplacé de poste après login conserve l'ancien `posteId` → exemption poste appliquée/ignorée à tort jusqu'au prochain login. (§7.3) |
| Mineur | Contrat d'interface désynchronisé : `findAllExemptions()` renvoie `commercialName`/`posteName` (plat) mais le type admin attend `commercial`/`poste` (objets imbriqués). Fonctionne par fallback, mais le join SQL est inutile. (§4, §7.4) |
| Mineur | Aucune exemption **par canal** (prévue Phase 4), aucune exemption **temporaire** (date d'expiration), aucune édition (uniquement create/delete). (§6) |
| Mineur | Le scope d'application est limité à **la session du jour** uniquement — comportement correct mais non documenté côté admin. (§6) |

---

## 2. Infrastructure existante

### 2.1 Entité — `message_whatsapp/src/quiz/entities/quiz-exemption.entity.ts`

```
id           uuid (PrimaryGeneratedColumn 'uuid')        : ligne 11-12
scope        enum('commercial','poste')                  : ligne 14-15
commercialId varchar(36) nullable  (name: commercial_id) : ligne 17-18
posteId      varchar(36) nullable  (name: poste_id)      : ligne 20-21
reason       varchar(255) nullable                       : ligne 23-24
createdAt    @CreateDateColumn (created_at)              : ligne 26-27
deletedAt    @DeleteDateColumn (deleted_at)  soft-delete : ligne 29-30
```

- Scope = **commercial OU poste** uniquement. **Pas de scope canal.**
- Pas de relation TypeORM `@ManyToOne` vers `WhatsappCommercial`/`WhatsappPoste` : les FK sont des `varchar` libres, sans `@JoinColumn`. Aucune intégrité référentielle.
- Soft-delete présent (`@DeleteDateColumn`).
- **Pas de colonne d'expiration** (`expires_at` / `valid_until`).

### 2.2 Migration — `message_whatsapp/src/database/migrations/AddQuizSystem1749686400000.ts`

Table `quiz_exemption` créée lignes 181-198 :

```
id           varchar(36)  PRIMARY KEY        : ligne 187
scope        enum('commercial','poste')      : ligne 188
commercial_id varchar(36) nullable           : ligne 189
poste_id     varchar(36)  nullable           : ligne 190
reason       varchar(255) nullable           : ligne 191
created_at   datetime DEFAULT CURRENT_TIMESTAMP : ligne 192
deleted_at   datetime nullable               : ligne 193
```

Observations :
- **Aucun index** sur `quiz_exemption` (ni sur `commercial_id`, ni `poste_id`, ni `scope`). Les autres tables du module ont des index (`IDX_quiz_attempt_commercial_session` ligne 222, `UQ_session_question` ligne 125). Pour les exemptions, `isExempt()` filtre sur `commercial_id` / `poste_id` à chaque appel `getTodaySession()` → scan de table.
- **Aucune contrainte UNIQUE** sur `(scope, commercial_id)` ou `(scope, poste_id)`.
- **Aucune FK** vers `whatsapp_commercial` / `whatsapp_poste`.
- Le `down()` (ligne 285-295) **ne supprime pas** `quiz_exemption` ni `quiz_pdf`/`quiz_attempt`/`quiz_answer_attempt` — `down()` est incomplet (rollback laisse 4 tables orphelines). Hors périmètre exemptions stricto sensu mais à signaler.
- Note de cohérence : l'entité déclare `@PrimaryGeneratedColumn('uuid')` et la migration crée `id varchar(36)` sans default → OK, la stratégie `uuid` génère l'ID côté application avant insert.

### 2.3 Endpoints — `message_whatsapp/src/quiz/quiz-admin.controller.ts`

Contrôleur `@Controller('quiz/admin')` protégé par `@UseGuards(AdminGuard)` (ligne 40-41) :

| Méthode | Route | Handler | Ligne |
|---|---|---|---|
| GET | `/quiz/admin/exemptions` | `findAllExemptions()` | 128-131 |
| POST | `/quiz/admin/exemptions` | `createExemption(dto)` | 133-136 |
| DELETE | `/quiz/admin/exemptions/:id` | `removeExemption(id)` | 138-141 |

- **Pas d'endpoint PATCH/PUT** : impossible d'éditer une exemption (raison, scope). Workflow = supprimer + recréer.
- Guard admin correct sur les trois routes.

### 2.4 DTO — `message_whatsapp/src/quiz/dto/create-exemption.dto.ts`

```ts
scope        @IsEnum(['commercial','poste'])            : ligne 4-5
commercialId @IsOptional @IsUUID()                      : ligne 7-9
posteId      @IsOptional @IsUUID()                      : ligne 11-13
reason       @IsOptional @IsString @MaxLength(255)      : ligne 15-18
```

- Validation `class-validator` présente aux frontières.
- **Validation conditionnelle absente au niveau DTO** : rien ne garantit que `commercialId` est fourni si `scope='commercial'`. Cette vérification est faite dans le service (`createExemption`, lignes 26-31) via `BadRequestException` — acceptable mais la règle métier est hors du DTO.
- Aucun champ canal, aucun champ expiration.

---

## 3. Logique métier — `isExempt()` détaillée

Fichier : `message_whatsapp/src/quiz/quiz-exemption.service.ts`, lignes 105-121.

```ts
async isExempt(commercialId: string, posteId: string | null): Promise<boolean> {
  const qb = this.exemptionRepo
    .createQueryBuilder('e')
    .where('e.deletedAt IS NULL')
    .andWhere(
      '(e.scope = :scopeCommercial AND e.commercialId = :commercialId)' +
        (posteId ? ' OR (e.scope = :scopePoste AND e.posteId = :posteId)' : ''),
      { scopeCommercial: 'commercial', commercialId,
        ...(posteId ? { scopePoste: 'poste', posteId } : {}) },
    );
  const count = await qb.getCount();
  return count > 0;
}
```

### Comportement attendu
Renvoie `true` si :
- il existe une exemption active `scope='commercial'` pour ce `commercialId`, **OU**
- il existe une exemption active `scope='poste'` pour le `posteId` du commercial.

### BUG BLOQUANT — précédence des opérateurs SQL

La clause générée est :

```sql
WHERE e.deletedAt IS NULL
  AND ( (e.scope='commercial' AND e.commercialId=?) OR (e.scope='poste' AND e.posteId=?) )
```

TypeORM enveloppe le 2ᵉ argument de `.andWhere()` entre parenthèses **dans la plupart des cas**, mais le risque réel ici est la chaîne construite à la main. Le texte passé à `andWhere` est :

```
(e.scope = :scopeCommercial AND e.commercialId = :commercialId) OR (e.scope = :scopePoste AND e.posteId = :posteId)
```

TypeORM entoure ce bloc d'une seule paire de parenthèses → le résultat est correct **uniquement parce que** les deux sous-conditions sont déjà parenthésées individuellement. En `AND` / `OR` mixés, `AND` est prioritaire sur `OR`, donc avec le wrapping TypeORM on obtient bien `deletedAt IS NULL AND (… OR …)`. **Ce cas précis est sauvé par les parenthèses internes.**

**En revanche le vrai défaut** est que le filtre `deletedAt IS NULL` ne distingue pas commercial vs poste : il s'applique globalement, ce qui est correct. Le bug réel se situe ailleurs (voir §7.1) — relecture fine :

- Si une exemption **poste** est soft-supprimée mais qu'une exemption **commercial** active existe, OK.
- Si une exemption **commercial** ciblée est soft-supprimée (`deletedAt != NULL`) elle est bien exclue par `deletedAt IS NULL`.

→ Après vérification ligne à ligne, **le filtre soft-delete est correctement appliqué globalement** grâce au wrapping TypeORM. Le point critique subsistant est la **fragilité** de cette construction par concaténation de chaîne : toute évolution (ajout d'un 3ᵉ scope canal sans re-parenthéser) réintroduit immédiatement un bug de précédence `deletedAt IS NULL AND A OR B`. Voir recommandation §8.2.

### Autres observations sur `isExempt()`
- `posteId = null` (commercial sans poste) : la branche poste est omise proprement, seule l'exemption commercial est testée. **Cas correctement géré.**
- Un poste exempté s'applique bien à **tous** les commerciaux de ce poste, car la requête matche sur `posteId` indépendamment du `commercialId`. **Correct** (sous réserve du JWT à jour, §7.3).
- Pas de N+1 : `isExempt()` est appelé **une seule fois** par `getTodaySession()` (`quiz-attempt.service.ts` ligne 116), avant tout chargement de questions. `getCount()` = 1 requête. **Pas de N+1.**

### Anti-doublon — `findActiveExemptionByScope()` (lignes 86-99) + `createExemption()` (lignes 25-44)
`createExemption()` appelle `findActiveExemptionByScope()` (lignes 33-35) : si une exemption active existe déjà pour ce scope+id, elle est **renvoyée telle quelle** sans créer de doublon. Anti-doublon **applicatif** présent, mais :
- Pas de contrainte d'unicité en base → **race condition** : deux POST simultanés passent tous deux le `findActive` (vide) puis insèrent deux lignes.
- Le `findActiveExemptionByScope` filtre bien `deletedAt IS NULL` (lignes 92-93).

### `findAllExemptions()` (lignes 46-84)
- `leftJoin('whatsapp_commercial', 'c', 'c.id = e.commercialId')` (ligne 49) et `leftJoin('whatsapp_poste', 'p', ...)` (ligne 50) : **N'utilise PAS les noms de propriété camelCase pour la condition de join** — `e.commercialId` est correct (property name) mais la table cible est référencée par nom SQL brut `whatsapp_commercial` au lieu de l'entité. Fonctionne mais contourne le mapping TypeORM.
- Renvoie un DTO plat `commercialName` / `posteName` (lignes 51-60, 74-83). **Incohérent avec le type admin** (voir §4 / §7.4).
- Filtre `e.deletedAt IS NULL` (ligne 61), tri `createdAt DESC` (ligne 62). Soft-delete correctement filtré ici.

### `removeExemption()` (lignes 101-103)
`this.exemptionRepo.softDelete(id)` — soft-delete cohérent avec le `@DeleteDateColumn`. Correct.

---

## 4. Admin UI — état de l'onglet Exemptions

Fichier : `admin/src/app/ui/QuizView.tsx`, composant `ExemptionsTab` (lignes 1519-1778).

### Présence et fonctionnalités
- Onglet **"Exemptions"** déclaré dans `TABS` (ligne 81) et routé (ligne 1916). **Présent et complet.**
- **Liste** : tableau Type / Nom / Raison / Date création / Actions (lignes 1621-1664). État de chargement (ligne 1617), état vide "Aucune exemption active" (ligne 1619). **UX correcte.**
- **Ajout** : modal avec choix scope (boutons Commercial/Poste, lignes 1684-1704), sélecteur conditionnel commercial (lignes 1707-1724) ou poste (lignes 1726-1743), champ raison (lignes 1745-1756). **Postes ET commerciaux exemptables depuis l'UI.**
- **Suppression** : bouton corbeille + `window.confirm` (lignes 1550-1560, 1651-1657).
- **Pas d'édition** (cohérent avec l'absence d'endpoint PATCH backend).

### Données chargées (lignes 1529-1547)
`Promise.all([getQuizExemptions(), getCommerciaux(), getPostes()])` →
- `GET /quiz/admin/exemptions`
- `GET` commerciaux (pour le sélecteur + fallback de label)
- `GET` postes (idem)

### Bug de contrat — `resolveLabel()` (lignes 1591-1600)
```ts
if (ex.scope === 'commercial') {
  if (ex.commercial) return ex.commercial.name;      // ← ex.commercial TOUJOURS undefined
  const found = commerciaux.find((c) => c.id === ex.commercialId);
  return found?.name ?? ex.commercialId ?? '—';      // ← fallback effectif
}
```
Le backend ne renvoie jamais `ex.commercial`/`ex.poste` (objets imbriqués) — il renvoie `commercialName`/`posteName` (plats, §3). Le type admin (`definitions.ts` lignes 1150-1159) déclare pourtant `commercial?: {id,name}` / `poste?: {id,name}` et **omet** `commercialName`/`posteName`. Conséquence :
- La branche primaire `if (ex.commercial)` est **toujours fausse** (dead path).
- L'affichage repose entièrement sur le **fallback** par recherche dans les listes `commerciaux`/`postes` rechargées. **Fonctionne**, mais :
  - si un commercial/poste est soft-supprimé et absent de `getCommerciaux()`, le label retombe sur l'UUID brut.
  - le `leftJoin` SQL de `findAllExemptions()` (qui calcule `commercialName`/`posteName`) est **totalement inutilisé** côté front → travail BDD gaspillé.

---

## 5. Intégration frontend commercial

### Backend → contrôleur — `quiz-commercial.controller.ts` ligne 25-29
```ts
@Get('today')
getToday(@Request() req: { user: { userId: string; posteId?: string } }) {
  const { userId, posteId } = req.user;
  return this.attemptService.getTodaySession(userId, posteId ?? null);
}
```
`posteId` vient du JWT (`jwt.strategy.ts` ligne 42, alimenté au login par `auth.service.ts` lignes 53/61/74 via `user.poste?.id`). **Voir risque de péremption §7.3.**

### Service — `quiz-attempt.service.ts` `getTodaySession()` lignes 101-119
```ts
const isExempt = await this.exemptionService.isExempt(commercialId, posteId);   // ligne 116
if (isExempt) {
  return { sessionActive: true, isExempt: true, attemptCompleted: true,
           alreadySubmittedToday: true, sessionId: session.id,
           requirePass: session.requirePass };                                   // ligne 118
}
```
- `isExempt()` n'est appelé **que si une session active existe ce jour** (court-circuit ligne 112-114 sinon). Cohérent.
- Un exempté reçoit `alreadySubmittedToday: true` + `isExempt: true` → satisfait les deux conditions de non-blocage front.

### Front — `front/src/components/QuizGateWrapper.tsx` lignes 37-54
```ts
const shouldBlock = data.sessionActive && !data.isExempt && !data.alreadySubmittedToday;  // ligne 39-42
if (data.alreadySubmittedToday) setQuizDoneToday(true);                                    // ligne 44
```
- L'exempté n'est **pas bloqué** (double sécurité : `!isExempt` ET `!alreadySubmittedToday`). **Correctement câblé.**
- `setQuizDoneToday(true)` met l'exemption en cache store → évite les refetch (lignes 32-35). Cohérent.
- `fail open` en cas d'erreur réseau (lignes 55-58) : ne bloque pas. Choix assumé (commenté), acceptable fonctionnellement, mais **un exempté et un non-exempté sont traités identiquement en cas d'erreur** → un non-exempté pourrait contourner le gate via une coupure réseau ciblée. À noter (hors périmètre exemptions).

**Verdict §5 : l'intégration commerciale de l'exemption est correcte et robuste pour le cas nominal.**

---

## 6. Fonctionnalités manquantes

| Fonctionnalité | État | Détail |
|---|---|---|
| Exemption par **canal** | **ABSENTE** | L'enum `scope` ne contient que `commercial`/`poste` (entité ligne 14, migration ligne 188, DTO ligne 4). Aucune colonne `channel_id`. Le ciblage canal prévu Phase 4 n'est pas implémenté. |
| Exemption **temporaire** (expiration) | **ABSENTE** | Aucune colonne `expires_at`/`valid_until`/`valid_from`. Une exemption est permanente jusqu'à suppression manuelle. |
| **Édition** d'une exemption | **ABSENTE** | Pas d'endpoint PATCH, pas de formulaire d'édition. Seulement create/delete. |
| Anti-doublon | **PARTIEL** | Applicatif uniquement (`findActiveExemptionByScope`, service lignes 33-35). Pas de contrainte UNIQUE en base → non concurrent-safe. |
| Soft-delete filtré dans les queries | **OK** | `findAllExemptions` (ligne 61), `findActiveExemptionByScope` (lignes 92-93), `isExempt` (ligne 108) filtrent tous `deletedAt IS NULL`. |
| Portée d'application | **Session du jour uniquement** | `getTodaySession` charge la session `DATE(sessionDate)=CURDATE()` (ligne 107). L'exemption dispense de **la session du jour**. Les sessions futures/passées ne sont pas concernées (il n'existe de toute façon qu'une session active par jour). Comportement correct mais non explicité dans l'UI admin (l'admin pourrait croire l'exemption « permanente sur tous les QCM »). |

---

## 7. Angles morts et bugs identifiés

### 7.1 [BLOQUANT — fragilité critique] Construction SQL par concaténation dans `isExempt()`
`quiz-exemption.service.ts` lignes 109-117. La clause OR est assemblée par concaténation de chaîne conditionnelle. Le filtre `deletedAt IS NULL` est dans un `.where()` séparé et le bloc OR dans un `.andWhere()`. **Aujourd'hui le résultat est correct** (TypeORM wrappe le `andWhere` entre parenthèses → `deletedAt IS NULL AND (A OR B)`), mais :
- la robustesse dépend entièrement d'un détail d'implémentation de TypeORM + de la double parenthèse interne ;
- l'ajout d'un 3ᵉ scope (canal) par simple concaténation `+ ' OR (...)'` produira `... AND (A OR B OR C)` correct **seulement** si chaque terme reste parenthésé — un oubli donne un faux positif d'exemption (un commercial non exempté passe le gate).

**Risque concret** : faux positif/négatif d'exemption = un commercial bloqué à tort, ou pire **un commercial non exempté contournant le QCM obligatoire**. À réécrire avec `Brackets` (voir §8.2).

### 7.2 [MAJEUR] Pas de contrainte d'unicité → doublons possibles
Aucun index UNIQUE sur `(scope, commercial_id)` / `(scope, poste_id)` (migration §2.2). Deux requêtes POST concurrentes créent deux exemptions identiques. Impact limité (toutes deux exemptent), mais pollue la liste admin et le `findActiveExemptionByScope` renverra arbitrairement la 1ère via `getOne()`.

### 7.3 [MAJEUR] `posteId` figé dans le JWT — exemption poste péremptoire
`posteId` est écrit dans le token au login (`auth.service.ts` lignes 53/61/74) et relu tel quel (`jwt.strategy.ts` ligne 42, contrôleur ligne 27). Si l'admin **change le poste d'un commercial** après son login :
- une exemption sur le **nouveau** poste ne s'appliquera **pas** (JWT porte encore l'ancien `posteId`) ;
- une exemption sur l'**ancien** poste continuera de s'appliquer à tort.
La désynchronisation persiste jusqu'à expiration/renouvellement du token. `isExempt()` ne recharge jamais le poste réel depuis la base.

### 7.4 [MINEUR] Contrat d'interface désynchronisé backend ↔ admin
Backend `findAllExemptions()` → `{ commercialName, posteName }` (plat). Type admin `QuizExemption` → `{ commercial?: {id,name}, poste?: {id,name} }` (imbriqué). Le champ plat n'est pas typé, les champs imbriqués ne sont jamais renvoyés. `resolveLabel` (UI lignes 1591-1600) ne survit que par fallback sur les listes chargées. Join SQL inutile. **À aligner** (choisir un format unique).

### 7.5 [MINEUR] Commercial sans poste — géré, mais point de vigilance
`posteId = null` est correctement géré dans `isExempt()` (branche poste omise) et dans le contrôleur (`posteId ?? null`). Aucun bug. Seul un commercial avec `poste = null` ne peut être exempté que via une exemption **commercial** ciblée — comportement attendu.

### 7.6 [MINEUR] `down()` de migration incomplet
`AddQuizSystem...down()` (lignes 285-295) ne drop pas `quiz_exemption` (ni `quiz_pdf`, `quiz_attempt`, `quiz_answer_attempt`). Rollback partiel. Hors flux exemption mais à corriger pour la propreté du schéma.

### 7.7 [INFO] Pas de N+1
`isExempt()` = 1× `getCount()` par `getTodaySession()`. `findAllExemptions()` = 1 requête avec 2 `leftJoin`. Aucune requête en boucle détectée. **Conforme à la règle « zéro N+1 ».**

### 7.8 [INFO] Absence d'index sur `quiz_exemption`
Voir §2.2. Sur faible volumétrie (nombre d'exemptions typiquement réduit) l'impact est négligeable, mais `isExempt()` est sur le **chemin critique de chaque login** commercial avec session active → un index `(scope, commercial_id)` et `(scope, poste_id)` (filtrés `deleted_at IS NULL`) serait pertinent.

---

## 8. Recommandations

### 8.1 [Bloquant à traiter] Sécuriser `isExempt()` avec `Brackets`
Remplacer la concaténation de chaîne par une construction explicite, garantissant la précédence quelle que soit l'évolution future :
```ts
import { Brackets } from 'typeorm';

const qb = this.exemptionRepo.createQueryBuilder('e')
  .where('e.deletedAt IS NULL')
  .andWhere(new Brackets((w) => {
    w.where('e.scope = :sc AND e.commercialId = :commercialId',
            { sc: 'commercial', commercialId });
    if (posteId) {
      w.orWhere('e.scope = :sp AND e.posteId = :posteId',
                { sp: 'poste', posteId });
    }
  }));
```
Élimine la fragilité §7.1 et rend l'ajout d'un scope canal sûr.

### 8.2 [Majeur] Ajouter une contrainte d'unicité en base
Migration : index UNIQUE partiel applicatif `(scope, commercial_id)` et `(scope, poste_id)`. À défaut d'index partiels en MySQL, gérer l'unicité via un index composite + nettoyage des soft-deleted, ou capturer l'erreur de doublon. Rend l'anti-doublon concurrent-safe (§7.2).

### 8.3 [Majeur] Résoudre le poste réel côté serveur dans `isExempt()`
Plutôt que de se fier au `posteId` du JWT, recharger le `poste_id` courant du commercial depuis `whatsapp_commercial` au moment du check (ou invalider le token au changement de poste, à l'image du `tokenVersion` déjà présent). Corrige §7.3.

### 8.4 [Mineur] Aligner le contrat exemptions
Choisir un format unique. Recommandé : renvoyer des objets imbriqués `commercial: {id,name}` / `poste: {id,name}` côté backend (cohérent avec le type admin existant), supprimer `commercialName`/`posteName`. Ou inversement aplatir le type admin. Mettre à jour `resolveLabel` en conséquence. Corrige §7.4.

### 8.5 [Mineur] Ajouter un index sur `quiz_exemption`
`(scope, commercial_id)` et `(scope, poste_id)` — chemin critique du login (§7.8).

### 8.6 [Évolutions produit — backlog]
- **Exemption par canal** : ajouter `channel` à l'enum `scope` + colonne `channel_id`, étendre DTO/UI/`isExempt`. Indispensable pour respecter le plan Phase 4 (§6). Faire l'extension **après** §8.1 pour éviter de réintroduire un bug de précédence.
- **Exemption temporaire** : colonne `expires_at` nullable + filtre `(expires_at IS NULL OR expires_at >= NOW())` dans `isExempt`/`findAll`. Évite les exemptions oubliées (§6).
- **Édition** : endpoint PATCH + formulaire admin (au minimum la raison).
- **Compléter le `down()`** de la migration (§7.6).

### 8.7 [Suggestion — CLAUDE.md]
Le module `quiz/` (catégories, questions, sessions, exemptions, PDF, attempts) n'est pas mentionné dans le `CLAUDE.md` projet (`C:\Users\gbamb\Desktop\projet\whatsapp\CLAUDE.md`). Documenter son existence et la règle « l'exemption ne porte que sur la session du jour » éviterait des malentendus métier. Je n'ai pas les droits pour modifier le CLAUDE.md — à déléguer.

---

## Annexe — Fichiers audités (chemins complets)

- `C:\Users\gbamb\Desktop\projet\whatsapp\message_whatsapp\src\quiz\entities\quiz-exemption.entity.ts`
- `C:\Users\gbamb\Desktop\projet\whatsapp\message_whatsapp\src\quiz\entities\quiz-session.entity.ts`
- `C:\Users\gbamb\Desktop\projet\whatsapp\message_whatsapp\src\quiz\quiz-exemption.service.ts`
- `C:\Users\gbamb\Desktop\projet\whatsapp\message_whatsapp\src\quiz\quiz-attempt.service.ts`
- `C:\Users\gbamb\Desktop\projet\whatsapp\message_whatsapp\src\quiz\quiz-admin.controller.ts`
- `C:\Users\gbamb\Desktop\projet\whatsapp\message_whatsapp\src\quiz\quiz-commercial.controller.ts`
- `C:\Users\gbamb\Desktop\projet\whatsapp\message_whatsapp\src\quiz\dto\create-exemption.dto.ts`
- `C:\Users\gbamb\Desktop\projet\whatsapp\message_whatsapp\src\database\migrations\AddQuizSystem1749686400000.ts`
- `C:\Users\gbamb\Desktop\projet\whatsapp\message_whatsapp\src\database\migrations\AddQuizRequirePass1750953600002.ts`
- `C:\Users\gbamb\Desktop\projet\whatsapp\message_whatsapp\src\auth\auth.service.ts`
- `C:\Users\gbamb\Desktop\projet\whatsapp\message_whatsapp\src\auth\jwt.strategy.ts`
- `C:\Users\gbamb\Desktop\projet\whatsapp\admin\src\app\ui\QuizView.tsx`
- `C:\Users\gbamb\Desktop\projet\whatsapp\admin\src\app\lib\definitions.ts`
- `C:\Users\gbamb\Desktop\projet\whatsapp\front\src\components\QuizGateWrapper.tsx`
