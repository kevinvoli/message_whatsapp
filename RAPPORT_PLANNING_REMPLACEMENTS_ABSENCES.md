# Rapport d'analyse — Planning : Remplacements & Absences

**Date :** 2026-05-20  
**Périmètre :** Gestion des absences, remplacements et rotation des commerciaux

---

## 1. Architecture en place

### Modèle de données

```
commercial_group          group_schedule_day        commercial_planning
─────────────────         ──────────────────────    ─────────────────────────
id                        id                        id
name                      groupId ──→ group.id      commercialId ──→ commercial.id
workDaysCount             date (YYYY-MM-DD)          type : 'absence' | 'exceptional'
firstWorkDay              isWorkDay (bool)           date (YYYY-MM-DD)
                                                    linkedCommercialId (nullable)
work_schedule                                       overridePosteId (nullable)
──────────────                                      reason
id                        whatsapp_commercial       declaredBy
commercialId (nullable)   ──────────────────────
groupId (nullable)        isWorkingToday (bool)
dayOfWeek                 workingTodaySince
startTime / endTime       groupId
breakSlots (JSON)
```

### Trois niveaux de pilotage

```
NIVEAU 1 — Rotation automatique (groupe)
  group.workDaysCount + group.firstWorkDay
  → group_schedule_day généré sur N mois
  → DailyResetJob (00:00) active/désactive isWorkingToday

NIVEAU 2 — Horaires de travail (créneaux)
  work_schedule par commercial OU par groupe
  → jours de la semaine, heure début/fin, pauses
  → WorkScheduleService.getActiveGroupIds() utilisé pour attribuer les appels

NIVEAU 3 — Overrides ponctuels (commercial_planning)
  type = 'absence'      → force isWorkingToday = false
  type = 'exceptional'  → force isWorkingToday = true
  Remplacement = absence + exceptional liées (transaction atomique)
```

---

## 2. Flux des processus clés

### 2.1 Initialisation quotidienne (00:00)

```
DailyResetJob.resetWorkingToday()
│
├─ GroupScheduleDay WHERE date=TODAY AND isWorkDay=true → working_groups[]
├─ UPDATE commercial SET isWorkingToday=true  WHERE groupId IN working_groups
├─ UPDATE commercial SET isWorkingToday=false WHERE groupId NOT IN working_groups
│
├─ CommercialPlanning WHERE type='absence' AND date=TODAY → absence_ids[]
│   └─ UPDATE commercial SET isWorkingToday=false WHERE id IN absence_ids
│
└─ CommercialPlanning WHERE type='exceptional' AND date=TODAY → exceptional_ids[]
    └─ UPDATE commercial SET isWorkingToday=true WHERE id IN exceptional_ids
```

**Ordre de priorité :** Absence/Exceptionnel > Rotation groupe > Défaut (false)

### 2.2 Création d'un remplacement

```
POST /commercial-groups/planning/replacement
  { replacedId, replacerId, date, reason }

Validations :
  ✓ replacedId a un poste assigné
  ✗ Conflict : override déjà existant sur (replacedId, date)
  ✗ Conflict : override déjà existant sur (replacerId, date)
  ✗ Conflict : poste déjà pris par un autre remplaçant ce jour

Transaction atomique :
  INSERT commercial_planning { commercialId=replacedId, type='absence',     linkedCommercialId=replacerId }
  INSERT commercial_planning { commercialId=replacerId, type='exceptional', overridePosteId=replaced.poste.id }

Si date = TODAY :
  isWorkingToday(replacedId) = false  (immédiat)
  isWorkingToday(replacerId) = true   (immédiat)
```

### 2.3 Attribution d'appels avec planning

```
OrderCallSyncService.syncNewCalls()

Pré-chargement :
  1. Tous les commerciaux par poste (poolByPosteId)
  2. Remplaçants du jour (commercial_planning WHERE type='exceptional' AND date=TODAY)
     → ajouter remplaçant dans pool du poste remplacé

Pour chaque appel DB2 :
  if call.deviceId → resolveCommercialForDevice(pool, scheduleCache)
    Étape 1 : groupe avec planning actif à l'heure de l'appel
    Étape 2 : is_working_today = true
    Étape 3 : tiebreaker phone
    Étape 4 : tiebreaker dernier connecté
  else → commercial par phone direct
```

---

## 3. Points forts

| Point | Détail |
|-------|--------|
| **Rotation automatique** | Cycle paramétrable (N jours travail / N jours repos), calendrier généré sur 3 mois |
| **Remplacement atomique** | Transaction garantit que l'absence et l'exceptionnel sont créés ensemble ou pas du tout |
| **Effet immédiat** | Si un remplacement est déclaré pour aujourd'hui, il s'applique sans attendre le cron de minuit |
| **Attribution appels** | Les remplaçants sont injectés dans le pool du poste remplacé → les appels leur sont attribués |
| **Priorité explicite** | Ordre clair : override > rotation > défaut |
| **Présence Redis** | TTL 45s + refresh 25s pour suivi temps réel |
| **WorkingDayGuard** | Option de blocage de connexion hors jours de travail |
| **Créneaux horaires** | Horaires individuel override groupe, gestion des pauses |

---

## 4. Points faibles / Limitations actuelles

### 4.1 Contrainte UNIQUE(commercialId, date) trop stricte

La table `commercial_planning` a une contrainte UNIQUE sur `(commercialId, date)`. Cela signifie qu'**un commercial ne peut avoir qu'un seul override par jour**. Si un commercial est absent matin et exceptionnel l'après-midi (demi-journées), c'est impossible.

### 4.2 Absence de gestion des demi-journées

Tout le système est binaire : `isWorkingToday = true/false`. Aucune notion de :
- Demi-journée (matin absent, après-midi présent)
- Créneau personnalisé pour le jour J (différent du planning habituel)
- Sortie anticipée

### 4.3 Le calendrier de rotation n'est pas auto-régénéré

`GroupScheduleService.generateForGroup()` doit être appelé manuellement (ou via admin). Il n'y a **pas de tâche cron** pour générer automatiquement les 3 prochains mois quand le calendrier arrive à expiration. Si personne ne le fait, le planning de rotation s'arrête et tous les commerciaux resteront avec `isWorkingToday=false`.

### 4.4 Absence de notifications

Quand un remplacement est créé, **aucune notification** n'est envoyée au remplaçant. Il doit le découvrir en se connectant ou être prévenu manuellement.

### 4.5 Pas d'historique des modifications

La table `commercial_planning` n'a pas de colonne `updatedAt` ni de table d'audit. Si un remplacement est supprimé, on ne sait pas qui l'a fait ni quand.

### 4.6 Pas de gestion des congés multi-jours

Pour poser 5 jours d'absence, il faut créer 5 entrées manuellement (une par jour). Il n'y a **pas de plage de dates** dans le DTO d'absence.

### 4.7 La suppression d'override restaure depuis la rotation groupe, pas l'état réel

```ts
// commercial-planning.service.ts : remove()
// Restaure isWorkingToday depuis le planning groupe UNIQUEMENT
// → Ne tient pas compte des horaires de travail (work_schedule)
// → Peut être inexact si le commercial a un planning individuel différent
```

### 4.8 Remplacement limité aux postes (pas poste-libre)

`CreateReplacementDto` exige que le commercial remplacé ait **un poste assigné**. Si un commercial sans poste doit être remplacé (commercial itinérant), le remplacement est impossible.

### 4.9 Pas de vue calendrier mensuelle

L'admin voit les plannings **du jour seulement** (`getPlanningByDate(date)`). Il n'y a pas de vue calendrier mensuelle permettant de voir toutes les absences du mois d'un coup.

---

## 5. Mon avis sur cette fonctionnalité

### Ce qui est bien conçu

L'architecture à trois niveaux (rotation automatique + horaires + overrides ponctuels) est **conceptuellement solide** et couvre bien le cas d'usage principal : une équipe de commerciaux en rotation qui doit être gérée avec des remplacements occasionnels.

La décision d'utiliser `isWorkingToday` comme **flag dénormalisé sur le commercial** est pragmatique : elle évite des jointures complexes dans tous les composants qui ont besoin de savoir si un commercial travaille aujourd'hui (attribution appels, dispatch messagerie, guard de connexion). C'est un choix de performance acceptable pour ce type d'application.

La **transaction atomique** pour les remplacements est le bon pattern : créer une absence sans l'exceptionnel correspondant laisserait les données dans un état incohérent.

### Ce qui pose problème

Le plus gros problème est l'**absence de vue d'ensemble temporelle**. En tant qu'admin, gérer les remplacements jour par jour sans pouvoir voir le planning du mois entier est fastidieux. Aucune app sérieuse de gestion RH ne fonctionne ainsi.

La **contrainte UNIQUE par jour** est une limitation métier sévère. En pratique, une absence peut commencer à midi, un commercial peut faire une demi-journée de remplacement, etc. Le modèle actuel ne le permet pas.

L'**absence de notifications** est un manque fonctionnel important. Dans un environnement où 30 commerciaux se remplacent mutuellement, ne pas être notifié qu'on est remplaçant aujourd'hui est une source d'erreurs opérationnelles.

Le fait que le **calendrier de rotation ne soit pas auto-régénéré** est un risque opérationnel. Si l'admin oublie de régénérer, le système plante silencieusement (tous les commerciaux paraissent absents).

---

## 6. Comparaison avec les solutions du marché

### 6.1 Salesforce / Field Service Lightning

| Fonctionnalité | Ce projet | Salesforce FSL |
|----------------|-----------|----------------|
| Rotation automatique | ✅ Cycle N/N jours | ✅ Shift templates avancés |
| Demi-journées | ❌ Non | ✅ Créneaux par heure |
| Absences multi-jours | ❌ 1 jour à la fois | ✅ Plage de dates |
| Remplacement automatique | ❌ Manuel | ✅ Suggestions automatiques basées sur compétences |
| Notifications | ❌ Non | ✅ Email, push, in-app |
| Vue calendrier | ❌ Vue jour uniquement | ✅ Vue jour/semaine/mois/an |
| Approbation | ❌ Non | ✅ Workflow d'approbation configurable |
| Disponibilité temps réel | ✅ Redis TTL | ✅ Presence API |

**Verdict :** Salesforce FSL est beaucoup plus riche, mais conçu pour des équipes de centaines d'agents. La complexité et le coût sont disproportionnés pour un usage de 30 commerciaux.

---

### 6.2 Google Workspace Calendar + Workday

| Fonctionnalité | Ce projet | Google/Workday |
|----------------|-----------|----------------|
| Congés multi-jours | ❌ Manuel (1/jour) | ✅ Plage de dates avec solde |
| Validation hiérarchique | ❌ Non | ✅ Workflow manager → RH |
| Intégration calendrier | ❌ Non | ✅ Native |
| Historique modifications | ❌ Non | ✅ Audit trail complet |
| Self-service employé | ❌ Non | ✅ L'employé pose sa demande lui-même |
| Types d'absence | 1 (absence générique) | ✅ RTT, maladie, congé payé, etc. |

**Verdict :** Ces outils sont des **systèmes RH complets** (paie, contrats, gestion des droits). Intégrer ce niveau de complexité dans une app de messagerie serait hors-sujet. Ce qui manque ici s'est surtout le **self-service** (le commercial ne peut pas lui-même déclarer une absence) et la **gestion multi-jours**.

---

### 6.3 Zendesk Workforce Management / NICE WFM

Ces outils sont dédiés aux centres de contacts (call centers), ce qui est plus proche du contexte de ce projet.

| Fonctionnalité | Ce projet | Zendesk WFM |
|----------------|-----------|-------------|
| Rotation configurable | ✅ Cycle simple | ✅ Rotations complexes multi-équipes |
| Forecasting charge | ❌ Non | ✅ Prévision de volume d'appels |
| Adherence tracking | ❌ Non | ✅ Suivi en temps réel du respect du planning |
| Échanges de shifts entre collègues | ❌ Non | ✅ Les agents peuvent s'échanger des créneaux |
| Alertes dépassement d'absence | ❌ Non | ✅ Alertes automatiques RH |
| Rapport hebdo/mensuel | ❌ Non | ✅ Tableaux de bord analytiques |

**Verdict :** Zendesk WFM est le concurrent le plus direct. Son fonctionnement est plus sophistiqué mais aussi beaucoup plus générique. Ce projet a un avantage clé : il est **intégré nativement avec les données métier GICOP** (commandes, appels DB2, obligations), ce qu'aucun WFM générique ne peut faire.

---

### 6.4 Synthèse comparative

```
Complexité ─────────────────────────────────────────────►
              Ce projet     Zendesk WFM    Salesforce FSL
                  │               │               │
Intégration       │               │               │
métier GICOP   NATIVE          AUCUNE          AUCUNE
                  │               │               │
Coût           GRATUIT         $$$/user        $$$/user
                  │               │               │
Demi-journées   NON              OUI             OUI
                  │               │               │
Multi-jours     NON              OUI             OUI
                  │               │               │
Notifs          NON              OUI             OUI
                  │               │               │
Calendrier      JOUR            MOIS             MOIS
```

---

## 7. Recommandations d'amélioration (par priorité)

### P0 — Risque opérationnel immédiat

| # | Amélioration | Effort | Impact |
|---|-------------|--------|--------|
| 1 | **Cron d'auto-régénération du calendrier de rotation** (tous les 1er du mois sur 3 mois) | Faible | Critique |
| 2 | **Alerte admin si groupe sans calendrier valide** à J+7 | Faible | Critique |

### P1 — Manques fonctionnels bloquants

| # | Amélioration | Effort | Impact |
|---|-------------|--------|--------|
| 3 | **Absences sur plage de dates** (date_start + date_end dans le DTO) | Moyen | Fort |
| 4 | **Notification WhatsApp au remplaçant** lors d'un remplacement | Faible | Fort |
| 5 | **Vue calendrier mensuelle admin** (list des absences du mois) | Moyen | Fort |

### P2 — Confort et fiabilité

| # | Amélioration | Effort | Impact |
|---|-------------|--------|--------|
| 6 | **Historique des modifications** (qui a créé/supprimé quel planning) | Faible | Moyen |
| 7 | **Demi-journées** (enum time_slot: 'full' | 'morning' | 'afternoon') | Moyen | Moyen |
| 8 | **Tableau de bord absences** : vue mensuelle avec total jours/commercial | Fort | Moyen |
| 9 | **Self-service commercial** : le commercial signale lui-même une absence (avec validation admin) | Fort | Moyen |

---

## 8. Conclusion

La fonctionnalité planning est **fonctionnelle pour le cas d'usage de base** : rotation 2/2 avec remplacements ponctuels déclarés par l'admin. C'est suffisant pour un démarrage.

Le **différenciateur fort** de cette implémentation est l'intégration directe avec l'attribution des appels DB2 : quand un remplaçant est déclaré, il reçoit automatiquement les appels du poste remplacé. Aucun WFM du marché ne fait ça nativement avec GICOP.

Les **lacunes prioritaires** à combler avant une montée en charge sont :
1. L'auto-régénération du calendrier (risque d'arrêt silencieux)
2. La gestion multi-jours des absences (actuellement très fastidieuse)
3. La notification du remplaçant (actuellement zéro visibilité)
