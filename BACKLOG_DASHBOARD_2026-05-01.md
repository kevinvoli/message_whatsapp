# Backlog d'implémentation — Dashboard Admin
> Date : 2026-05-01 | Branche : `production`

---

## Légende

| Symbole | Signification |
|---|---|
| `[ ]` | À faire |
| `[x]` | Terminé |
| `[-]` | Bloqué / en attente |
| **P0** | Critique (fondation) |
| **P1** | Haute priorité |
| **P2** | Priorité normale |

---

## SPRINT A — Backend fondations *(parallélisable)*

### EPIC 4 — ConnectionLog (heures de connexion)

---

#### TASK-4.1.1 `P0` — Créer l'entité `ConnectionLog`
- **Fichier :** `message_whatsapp/src/connection-log/entities/connection-log.entity.ts`
- **Statut :** `[ ]`
- **Détail :**
  - Champs : `id (uuid PK)`, `userId (string)`, `userType ('commercial'|'admin')`, `loginAt (timestamp NOT NULL)`, `logoutAt (timestamp NULLABLE)`, `createdAt`, `updatedAt`
  - Pas de FK (découplage commercial/admin)
  - Index composite sur `(userId, userType, loginAt)`
  - Table : `messaging_connection_log`

#### TASK-4.1.2 `P0` — Créer la migration `ConnectionLog1746057600007`
- **Fichier :** `message_whatsapp/src/database/migrations/ConnectionLog1746057600007.ts`
- **Statut :** `[ ]`
- **Détail :**
  - Crée la table `messaging_connection_log`
  - Vérifier qu'aucune migration existante n'utilise le timestamp `1746057600007`
- **Dépend de :** TASK-4.1.1

#### TASK-4.1.3 `P0` — Créer le module `ConnectionLogModule`
- **Fichier :** `message_whatsapp/src/connection-log/connection-log.module.ts`
- **Statut :** `[ ]`
- **Dépend de :** TASK-4.1.1

#### TASK-4.1.4 `P0` — Créer le service `ConnectionLogService`
- **Fichier :** `message_whatsapp/src/connection-log/connection-log.service.ts`
- **Statut :** `[ ]`
- **Détail — méthodes à implémenter :**
  - `logLogin(userId, userType)` → crée une entrée avec `logoutAt = null`
  - `logLogout(userId, userType)` → met à jour la dernière entrée ouverte
  - `getTotalConnectionMinutes(userId, userType, dateStart, dateEnd)` → `SUM(TIMESTAMPDIFF(MINUTE, loginAt, COALESCE(logoutAt, NOW())))`
  - `getBulkConnectionMinutes(userIds, userType, dateStart, dateEnd)` → même calcul pour une liste d'IDs
- **Dépend de :** TASK-4.1.3

---

### EPIC 2 — Métriques conversations nouveau/ancien client

---

#### TASK-2.1.1 `P0` — Ajouter `getMetriquesConversations()` dans `MetriquesService`
- **Fichier :** `message_whatsapp/src/metriques/metriques.service.ts`
- **Statut :** `[ ]`
- **Détail :**
  - `totalConversations` : COUNT chats créés dans la période
  - `conversationsNouveauxClients` : contacts dont `MIN(createdAt)` tombe dans la période (utiliser `GROUP BY + HAVING MIN(createdAt)` pour perf)
  - `conversationsAnciensClients` : `totalConversations - conversationsNouveauxClients`
  - Inclure l'appel dans le `Promise.all` de `getMetriquesGlobales()`

#### TASK-2.1.2 `P0` — Étendre `MetriquesGlobalesDto`
- **Fichier :** `message_whatsapp/src/metriques/dto/create-metrique.dto.ts`
- **Statut :** `[ ]`
- **Détail :** Ajouter `totalConversations`, `conversationsNouveauxClients`, `conversationsAnciensClients`
- **Dépend de :** TASK-2.1.1

---

### EPIC 3 — Métriques conversations lues

---

#### TASK-3.1.1 `P0` — Étendre `getMetriquesChats()` avec les compteurs "lues"
- **Fichier :** `message_whatsapp/src/metriques/metriques.service.ts`
- **Statut :** `[ ]`
- **Détail :**
  - Ajouter dans la requête agrégée : `SUM(CASE WHEN unread_count = 0 AND last_poste_message_at IS NULL THEN 1 ELSE 0 END) AS chatsLusSansReponse`
  - Ajouter : `SUM(CASE WHEN unread_count = 0 AND last_poste_message_at IS NOT NULL THEN 1 ELSE 0 END) AS chatsLusAvecReponse`

#### TASK-3.1.2 `P0` — Étendre `MetriquesGlobalesDto` (champs "lues")
- **Fichier :** `message_whatsapp/src/metriques/dto/create-metrique.dto.ts`
- **Statut :** `[ ]`
- **Détail :** Ajouter `chatsLusSansReponse` et `chatsLusAvecReponse`
- **Dépend de :** TASK-3.1.1

---

## SPRINT B — Backend hooks + enrichissement *(dépend Sprint A)*

### EPIC 4 — Hooks connexion

---

#### TASK-4.2.1 `P1` — Hooker login/logout commercial dans `auth.controller.ts`
- **Fichier :** `message_whatsapp/src/auth/auth.controller.ts`
- **Statut :** `[ ]`
- **Détail :**
  - Login réussi → `connectionLogService.logLogin(userId, 'commercial')`
  - Logout → `connectionLogService.logLogout(userId, 'commercial')`
- **Dépend de :** TASK-4.1.4

#### TASK-4.2.2 `P1` — Hooker login/logout admin dans `auth_admin.controller.ts`
- **Fichier :** `message_whatsapp/src/auth_admin/auth_admin.controller.ts`
- **Statut :** `[ ]`
- **Détail :**
  - Login réussi → `connectionLogService.logLogin(userId, 'admin')`
  - Logout → `connectionLogService.logLogout(userId, 'admin')`
- **Dépend de :** TASK-4.1.4

#### TASK-4.2.3 `P1` — Hooker le cron `disconnect-all`
- **Fichier :** à identifier (cron `disconnect-all` dans le backend)
- **Statut :** `[ ]`
- **Détail :** Pour chaque commercial déconnecté par le cron, appeler `connectionLogService.logLogout(userId, 'commercial')`
- **Dépend de :** TASK-4.1.4
- **Risque :** Le cron ne passe pas par le contrôleur d'auth — trouver son point d'entrée exact

#### TASK-4.3.1 `P1` — Enrichir `getPerformanceCommerciaux()` avec les minutes de connexion
- **Fichier :** `message_whatsapp/src/metriques/metriques.service.ts`
- **Statut :** `[ ]`
- **Détail :**
  - Appeler `connectionLogService.getBulkConnectionMinutes(commercialIds, 'commercial', dateStart, dateEnd)`
  - Injecter `totalConnectionMinutes` dans chaque `PerformanceCommercialDto`
- **Dépend de :** TASK-4.1.4

#### TASK-4.3.2 `P1` — Ajouter `totalConnectionMinutes` dans `PerformanceCommercialDto`
- **Fichier :** `message_whatsapp/src/metriques/dto/create-metrique.dto.ts`
- **Statut :** `[ ]`
- **Détail :** `totalConnectionMinutes?: number`
- **Dépend de :** TASK-4.3.1

#### TASK-4.3.3 `P1` — Importer `ConnectionLogModule` dans `MetriquesModule`
- **Fichier :** `message_whatsapp/src/metriques/metriques.module.ts`
- **Statut :** `[ ]`
- **Dépend de :** TASK-4.1.3

---

## SPRINT C — Frontend *(peut démarrer après Sprint A)*

### EPIC 1 — Filtre date custom

---

#### TASK-1.1.1 `P0` — Vérifier la propagation `dateFrom`/`dateTo` dans le contrôleur backend
- **Fichier :** `message_whatsapp/src/metriques/metriques.controller.ts`
- **Statut :** `[ ]`
- **Détail :** Confirmer que `getOverviewSection()` propage bien `dateFrom` et `dateTo` au service (vérification uniquement, pas de code à écrire a priori)

#### TASK-1.2.1 `P0` — Ajouter les states `dateFrom`/`dateTo` dans la page dashboard
- **Fichier :** `admin/src/app/dashboard/commercial/page.tsx`
- **Statut :** `[ ]`
- **Détail :**
  - Ajouter `const [dateFrom, setDateFrom] = useState<string>('')`
  - Ajouter `const [dateTo, setDateTo] = useState<string>('')`
  - Passer ces states + setters au `Header`, `OverviewView` et `CommerciauxView`

#### TASK-1.2.2 `P0` — Étendre `Header.tsx` avec le sélecteur de date custom
- **Fichier :** `admin/src/app/ui/Header.tsx`
- **Statut :** `[ ]`
- **Détail :**
  - Ajouter la valeur `custom` dans le `<select>` existant (libellé : "Période personnalisée")
  - Afficher deux `<input type="date">` (dateFrom, dateTo) uniquement quand `selectedPeriod === 'custom'`
  - Exposer les props `dateFrom?`, `dateTo?`, `onDateFromChange?`, `onDateToChange?`
  - Ne pas transmettre `custom` comme `periode` au backend — utiliser `dateFrom`/`dateTo` à la place
- **Dépend de :** TASK-1.2.1

#### TASK-1.3.1 `P0` — Modifier `api.ts` pour accepter `dateFrom`/`dateTo`
- **Fichier :** `admin/src/app/lib/api.ts`
- **Statut :** `[ ]`
- **Détail :**
  - `getOverviewSection(period, dateFrom?, dateTo?)` → ajouter les params à la query string
  - `getPerformanceCommerciaux(period, dateFrom?, dateTo?)` → idem
- **Dépend de :** TASK-1.2.1

#### TASK-1.3.2 `P0` — Propager `dateFrom`/`dateTo` dans `OverviewView.tsx`
- **Fichier :** `admin/src/app/ui/OverviewView.tsx`
- **Statut :** `[ ]`
- **Détail :** Recevoir `dateFrom?` et `dateTo?` en props et les passer aux appels `getOverviewSection()`
- **Dépend de :** TASK-1.3.1

#### TASK-1.3.3 `P0` — Propager `dateFrom`/`dateTo` dans `CommerciauxView.tsx`
- **Fichier :** `admin/src/app/ui/CommerciauxView.tsx`
- **Statut :** `[ ]`
- **Détail :** Recevoir `dateFrom?` et `dateTo?` en props et les passer à `getPerformanceCommerciaux()`
- **Dépend de :** TASK-1.3.1

---

### EPIC 2 — KPI card "Total Conversations"

---

#### TASK-2.2.1 `P1` — Étendre le type `MetriquesGlobales` côté frontend
- **Fichier :** `admin/src/app/lib/definitions.ts`
- **Statut :** `[ ]`
- **Détail :** Ajouter `totalConversations?: number`, `conversationsNouveauxClients?: number`, `conversationsAnciensClients?: number`
- **Dépend de :** TASK-2.1.2

#### TASK-2.2.2 `P1` — Ajouter le KPI card "Total Conversations" dans `OverviewView.tsx`
- **Fichier :** `admin/src/app/ui/OverviewView.tsx`
- **Statut :** `[ ]`
- **Détail :**
  - Ajouter un card dans la grille KPI principaux (ajuster `grid-cols-5` → `grid-cols-6`)
  - Titre : nombre `totalConversations`
  - Sous-titre : "Nouveaux clients : X" et "Anciens clients : Y"
- **Dépend de :** TASK-2.2.1, TASK-1.3.2

---

### EPIC 3 — KPI card "Conversations lues"

---

#### TASK-3.2.1 `P1` — Étendre le type `MetriquesGlobales` côté frontend (champs "lues")
- **Fichier :** `admin/src/app/lib/definitions.ts`
- **Statut :** `[ ]`
- **Détail :** Ajouter `chatsLusSansReponse?: number`, `chatsLusAvecReponse?: number`
- **Dépend de :** TASK-3.1.2

#### TASK-3.2.2 `P1` — Ajouter le KPI card "Conversations lues" dans `OverviewView.tsx`
- **Fichier :** `admin/src/app/ui/OverviewView.tsx`
- **Statut :** `[ ]`
- **Détail :**
  - Ajouter un card dans les stats secondaires (ajuster `grid-cols-6` si nécessaire)
  - Ligne 1 : "Lus sans réponse : X"
  - Ligne 2 : "Lus avec réponse : Y"
- **Dépend de :** TASK-3.2.1, TASK-1.3.2

---

### EPIC 4 — Colonne "Heures de connexion"

---

#### TASK-4.4.1 `P1` — Étendre le type `PerformanceCommercial` côté frontend
- **Fichier :** `admin/src/app/lib/definitions.ts`
- **Statut :** `[ ]`
- **Détail :** Ajouter `totalConnectionMinutes?: number`
- **Dépend de :** TASK-4.3.2

#### TASK-4.4.2 `P1` — Ajouter la colonne "Heures de connexion" dans `CommerciauxView.tsx`
- **Fichier :** `admin/src/app/ui/CommerciauxView.tsx`
- **Statut :** `[ ]`
- **Détail :**
  - Ajouter `<th>` "Heures de co." dans le `<thead>`
  - Ajouter `<td>` avec valeur formatée en `Xh Ymin` via `formatTemps()`
  - Passer le `colSpan` du skeleton de chargement de 9 à 10
- **Dépend de :** TASK-4.4.1, TASK-1.3.3

---

## Vue kanban par sprint

### Sprint A — Backend fondations
| ID | Tâche | Priorité | Statut |
|---|---|---|---|
| TASK-4.1.1 | Entité ConnectionLog | P0 | `[ ]` |
| TASK-4.1.2 | Migration ConnectionLog1746057600007 | P0 | `[ ]` |
| TASK-4.1.3 | Module ConnectionLogModule | P0 | `[ ]` |
| TASK-4.1.4 | Service ConnectionLogService | P0 | `[ ]` |
| TASK-2.1.1 | getMetriquesConversations() | P0 | `[ ]` |
| TASK-2.1.2 | DTO MetriquesGlobales (+3 champs convs) | P0 | `[ ]` |
| TASK-3.1.1 | getMetriquesChats() +2 compteurs lues | P0 | `[ ]` |
| TASK-3.1.2 | DTO MetriquesGlobales (+2 champs lues) | P0 | `[ ]` |

### Sprint B — Backend hooks + enrichissement
| ID | Tâche | Priorité | Statut |
|---|---|---|---|
| TASK-4.2.1 | Hook login/logout commercial | P1 | `[ ]` |
| TASK-4.2.2 | Hook login/logout admin | P1 | `[ ]` |
| TASK-4.2.3 | Hook cron disconnect-all | P1 | `[ ]` |
| TASK-4.3.1 | Enrichir getPerformanceCommerciaux() | P1 | `[ ]` |
| TASK-4.3.2 | DTO PerformanceCommercial (+totalConnectionMinutes) | P1 | `[ ]` |
| TASK-4.3.3 | Import ConnectionLogModule dans MetriquesModule | P1 | `[ ]` |

### Sprint C — Frontend
| ID | Tâche | Priorité | Statut |
|---|---|---|---|
| TASK-1.1.1 | Vérif propagation dateFrom/dateTo backend | P0 | `[ ]` |
| TASK-1.2.1 | States dateFrom/dateTo dans page.tsx | P0 | `[ ]` |
| TASK-1.2.2 | Sélecteur date custom dans Header.tsx | P0 | `[ ]` |
| TASK-1.3.1 | api.ts accepte dateFrom/dateTo | P0 | `[ ]` |
| TASK-1.3.2 | OverviewView reçoit dateFrom/dateTo | P0 | `[ ]` |
| TASK-1.3.3 | CommerciauxView reçoit dateFrom/dateTo | P0 | `[ ]` |
| TASK-2.2.1 | definitions.ts +3 champs MetriquesGlobales convs | P1 | `[ ]` |
| TASK-2.2.2 | KPI card "Total Conversations" dans OverviewView | P1 | `[ ]` |
| TASK-3.2.1 | definitions.ts +2 champs MetriquesGlobales lues | P1 | `[ ]` |
| TASK-3.2.2 | KPI card "Conversations lues" dans OverviewView | P1 | `[ ]` |
| TASK-4.4.1 | definitions.ts +totalConnectionMinutes | P1 | `[ ]` |
| TASK-4.4.2 | Colonne "Heures de connexion" CommerciauxView | P1 | `[ ]` |

---

## Graphe de dépendances

```
TASK-4.1.1
  └─► TASK-4.1.2
  └─► TASK-4.1.3
        └─► TASK-4.1.4
              └─► TASK-4.2.1
              └─► TASK-4.2.2
              └─► TASK-4.2.3
              └─► TASK-4.3.1
                    └─► TASK-4.3.2
              └─► TASK-4.3.3

TASK-2.1.1 ──► TASK-2.1.2 ──► (frontend) TASK-2.2.1 ──► TASK-2.2.2
TASK-3.1.1 ──► TASK-3.1.2 ──► (frontend) TASK-3.2.1 ──► TASK-3.2.2

TASK-1.2.1
  └─► TASK-1.2.2
  └─► TASK-1.3.1
        └─► TASK-1.3.2 ──► TASK-2.2.2
        └─► TASK-1.3.2 ──► TASK-3.2.2
        └─► TASK-1.3.3 ──► TASK-4.4.2

TASK-4.3.2 ──► TASK-4.4.1 ──► TASK-4.4.2
```

---

## Risques & points d'attention

| # | Risque | Impact | Mitigation |
|---|---|---|---|
| R1 | Cron `disconnect-all` ne passe pas par auth.controller | Connexions non fermées dans ConnectionLog | Identifier le point d'entrée du cron et y injecter ConnectionLogService |
| R2 | Sessions actives au moment du déploiement de la migration | `0 min` connexion le jour J pour les commerciaux déjà connectés | Comportement acceptable, documenter dans le RUNBOOK |
| R3 | Requête nouveau/ancien client trop lente sur gros volumes | Timeout API | Utiliser `GROUP BY + HAVING MIN(createdAt)` au lieu d'une sous-requête corrélée |
| R4 | Valeur `custom` transmise au backend comme `periode` | Backend ignore les dates custom | Ne jamais envoyer `periode=custom` — envoyer uniquement `dateFrom`/`dateTo` |
| R5 | Conflit de timestamp de migration | Erreur déploiement | Vérifier que `1746057600007` n'est pas déjà utilisé avant de créer la migration |
