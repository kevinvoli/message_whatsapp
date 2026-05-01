# Plan d'implémentation — Dashboard Admin (nouvelles fonctionnalités)
> Date : 2026-05-01 | Branche : `production`

---

## Analyse de l'existant

### Ce qui existe déjà

**Backend :**
- `GET /api/metriques/overview` — supporte déjà `dateFrom` et `dateTo` comme query params (présents dans le contrôleur mais non exposés côté frontend)
- `MetriquesService` — méthodes `getMetriquesGlobales`, `getPerformanceCommerciaux`, etc. reçoivent déjà `dateFrom?` et `dateTo?`
- La logique `dateRange(periode, dateFrom, dateTo)` est déjà opérationnelle dans le service
- `WhatsappCommercial.isConnected` + `lastConnectionAt` existent mais il n'y a **aucune entité de log de connexion**
- Deux flux d'auth distincts : `POST /auth/login` (commercial, cookie `Authentication`) et `POST /auth/admin/login` (admin, cookie `AuthenticationAdmin`)
- `WhatsappChat` a les champs `unread_count`, `status` et `last_poste_message_at` qui permettent de calculer "lues avec/sans réponse"

**Frontend :**
- `Header.tsx` — le filtre période est un `<select>` avec 4 valeurs fixes (`today`, `week`, `month`, `year`). Pas de sélecteur de date custom.
- `OverviewView.tsx` — reçoit `selectedPeriod` via props mais ne passe pas `dateFrom`/`dateTo`
- `CommerciauxView.tsx` — tableau existant avec 8 colonnes, pas de colonne "heures de connexion"
- `api.ts` — `getOverviewSection()` passe uniquement `period`, pas les dates custom
- Les KPI cards `MetriquesGlobales` ne contiennent pas de données sur les nouveaux/anciens clients ni sur les conversations lues

### Ce qui manque

1. Frontend : sélecteur de date custom dans le `Header`
2. Frontend + Backend : KPI "Total Conversations" avec décomposition nouveau/ancien client
3. Frontend + Backend : KPI "Conversations lues" avec/sans réponse
4. Backend : entité `ConnectionLog`, hooks login/logout pour la tracer
5. Backend : endpoint pour le total d'heures de connexion par commercial (filtré par période)
6. Frontend : colonne "Heures de connexion" dans `CommerciauxView`

---

## EPIC 1 — Filtre date custom (fondation de tout le reste)

**Complexité : Moyenne** | Dépendances : aucune

### US 1.1 — Backend : valider le support dateFrom/dateTo existant

Le backend supporte déjà `dateFrom` et `dateTo`. Il faut uniquement s'assurer que `getOverviewSection()` dans le contrôleur les propage correctement. **Vérification uniquement, rien à créer.**

### US 1.2 — Frontend : étendre le Header avec un sélecteur de date

**Fichier à modifier :** `admin/src/app/ui/Header.tsx`

- Ajouter deux champs `<input type="date">` qui apparaissent quand on sélectionne "Période personnalisée" dans le `<select>`
- Ajouter la valeur `custom` dans le `<select>` existant
- Exposer deux nouvelles props : `dateFrom?: string` et `dateTo?: string` + leurs setters

**Fichier à modifier :** `admin/src/app/dashboard/commercial/page.tsx`

- Ajouter les states `dateFrom` / `dateTo` au niveau du dashboard
- Les passer au `Header` et à tous les views concernés (`OverviewView`, `CommerciauxView`, etc.)

### US 1.3 — Frontend : propager les dates aux appels API

**Fichier à modifier :** `admin/src/app/lib/api.ts`
- Modifier `getOverviewSection()` pour accepter et transmettre `dateFrom?` et `dateTo?`
- Modifier `getPerformanceCommerciaux()` de même

**Fichier à modifier :** `admin/src/app/ui/OverviewView.tsx`
- Recevoir `dateFrom?` et `dateTo?` en props
- Passer ces paramètres aux appels `getOverviewSection()`

**Fichier à modifier :** `admin/src/app/ui/CommerciauxView.tsx`
- Recevoir `dateFrom?` et `dateTo?` en props
- Les transmettre à `getPerformanceCommerciaux()`

---

## EPIC 2 — KPI "Total Conversations" avec décomposition nouveau/ancien client

**Complexité : Moyenne** | Dépendances : EPIC 1

### US 2.1 — Backend : calculer les métriques nouveau/ancien client

**Logique métier :**
- Un **nouveau client** pour une période donnée = contact dont la première conversation (`MIN(createdAt)` sur `whatsapp_chat`) tombe dans la période filtrée
- Un **ancien client** = contact qui a écrit dans la période mais dont la première conversation est antérieure à la période

**Fichier à modifier :** `message_whatsapp/src/metriques/metriques.service.ts`

Ajouter une méthode privée `getMetriquesConversations(dateStart, dateEnd)` qui calcule :
- `totalConversations` : COUNT de chats créés dans la période
- `nouvellesConversationsNouveauxClients` : COUNT de chats dont le `contact_client` n'apparaît dans aucun chat créé **avant** `dateStart`
- `nouvellesConversationsAnciensClients` : `totalConversations - nouvellesConversationsNouveauxClients`

> Note optimisation : utiliser `GROUP BY + HAVING MIN(createdAt)` plutôt qu'une sous-requête corrélée pour les gros volumes.

**Fichier à modifier :** `message_whatsapp/src/metriques/dto/create-metrique.dto.ts`
- Ajouter les 3 champs dans `MetriquesGlobalesDto`

**Fichier à modifier :** `message_whatsapp/src/metriques/metriques.service.ts` dans `getMetriquesGlobales()`
- Inclure l'appel à `getMetriquesConversations()` dans le `Promise.all`

### US 2.2 — Frontend : afficher le KPI card "Total Conversations"

**Fichier à modifier :** `admin/src/app/lib/definitions.ts`
- Ajouter `totalConversations`, `conversationsNouveauxClients`, `conversationsAnciensClients` dans le type `MetriquesGlobales`

**Fichier à modifier :** `admin/src/app/ui/OverviewView.tsx`
- Ajouter un card dans la grille des KPI principaux (actuellement `grid-cols-5`)
- Le card affiche `totalConversations` en titre, et en bas deux lignes : "Nouveaux clients : X" et "Anciens clients : Y"

---

## EPIC 3 — KPI "Conversations lues"

**Complexité : Faible** | Dépendances : EPIC 1

### US 3.1 — Backend : calculer les conversations lues avec/sans réponse

**Logique :** Une conversation "lue" = `unread_count = 0`. Parmi elles :
- **Lue sans réponse** = `unread_count = 0` ET `last_poste_message_at IS NULL`
- **Lue avec réponse** = `unread_count = 0` ET `last_poste_message_at IS NOT NULL`

**Fichier à modifier :** `message_whatsapp/src/metriques/metriques.service.ts`
- Étendre `getMetriquesChats()` pour ajouter deux compteurs via `SUM(CASE WHEN ...)` dans la requête agrégée existante

**Fichier à modifier :** `message_whatsapp/src/metriques/dto/create-metrique.dto.ts`
- Ajouter `chatsLusSansReponse` et `chatsLusAvecReponse` dans `MetriquesGlobalesDto`

### US 3.2 — Frontend : afficher le KPI card "Conversations lues"

**Fichier à modifier :** `admin/src/app/lib/definitions.ts`
- Ajouter `chatsLusSansReponse` et `chatsLusAvecReponse` dans `MetriquesGlobales`

**Fichier à modifier :** `admin/src/app/ui/OverviewView.tsx`
- Ajouter un card dans les stats secondaires (grille `grid-cols-6`)
- Le card affiche deux lignes : "Lus sans réponse : X" et "Lus avec réponse : Y"

---

## EPIC 4 — Heures de connexion des commerciaux

**Complexité : Élevée** | Dépendances : aucune (peut démarrer en parallèle de EPIC 1-3)

### US 4.1 — Backend : créer l'entité ConnectionLog et la migration

**Fichier à créer :** `message_whatsapp/src/connection-log/entities/connection-log.entity.ts`

```typescript
ConnectionLog {
  id: uuid PK
  userId: string           // commercial_id ou admin_id
  userType: 'commercial' | 'admin'
  loginAt: timestamp NOT NULL
  logoutAt: timestamp NULLABLE
  createdAt: timestamp
  updatedAt: timestamp
}
```

- Pas de FK vers `whatsapp_commercial` ou `admin` pour rester découplé et supporter les deux types
- Index composite sur `(userId, userType, loginAt)` pour les requêtes de calcul de durée
- Table nommée `messaging_connection_log` (convention préfixe `messaging_`)

**Fichier à créer :** `message_whatsapp/src/database/migrations/ConnectionLog1746057600007.ts`
- Crée la table `messaging_connection_log`

**Fichier à créer :** `message_whatsapp/src/connection-log/connection-log.module.ts`

**Fichier à créer :** `message_whatsapp/src/connection-log/connection-log.service.ts`

Méthodes :
- `logLogin(userId, userType)` — crée une nouvelle entrée avec `logoutAt = null`
- `logLogout(userId, userType)` — met à jour la dernière entrée sans `logoutAt`
- `getTotalConnectionMinutes(userId, userType, dateStart, dateEnd)` — calcule `SUM(TIMESTAMPDIFF(MINUTE, loginAt, COALESCE(logoutAt, NOW())))`
- `getBulkConnectionMinutes(userIds, userType, dateStart, dateEnd)` — même calcul pour une liste d'IDs

### US 4.2 — Backend : hooker login/logout commercial et admin

**Fichier à modifier :** `message_whatsapp/src/auth/auth.controller.ts`
- Appeler `connectionLogService.logLogin(userId, 'commercial')` à la connexion réussie
- Appeler `connectionLogService.logLogout(userId, 'commercial')` à la déconnexion

**Fichier à modifier :** `message_whatsapp/src/auth_admin/auth_admin.controller.ts`
- Même chose avec `userType: 'admin'`

> Point d'attention : le cron `disconnect-all` déconnecte les commerciaux sans passer par le contrôleur d'auth. Il faudra y ajouter les appels `logLogout` pour chaque commercial déconnecté.

### US 4.3 — Backend : exposer les heures de connexion dans le endpoint métriques

**Fichier à modifier :** `message_whatsapp/src/metriques/metriques.service.ts`
- Dans `getPerformanceCommerciaux()`, appeler `connectionLogService.getBulkConnectionMinutes()` pour la période et enrichir chaque `PerformanceCommercialDto` avec `totalConnectionMinutes: number`

**Fichier à modifier :** `message_whatsapp/src/metriques/dto/create-metrique.dto.ts`
- Ajouter `totalConnectionMinutes?: number` dans `PerformanceCommercialDto`

**Fichier à modifier :** `message_whatsapp/src/metriques/metriques.module.ts`
- Importer `ConnectionLogModule`

### US 4.4 — Frontend : afficher la colonne "Heures de connexion"

**Fichier à modifier :** `admin/src/app/lib/definitions.ts`
- Ajouter `totalConnectionMinutes?: number` dans `PerformanceCommercial`

**Fichier à modifier :** `admin/src/app/ui/CommerciauxView.tsx`
- Ajouter un `<th>` "Heures de co." dans le `<thead>`
- Ajouter le `<td>` correspondant qui affiche la valeur formatée (ex: `2h30min`) via `formatTemps()`
- Le `colSpan` du skeleton de chargement passe de 9 à 10

---

## Ordre d'exécution

```
Sprint A — Backend fondations (parallélisable) :
  ├─ US 4.1 : ConnectionLog entity + migration
  ├─ US 2.1 : métriques conversations nouveau/ancien client
  └─ US 3.1 : métriques conversations lues avec/sans réponse

Sprint B — Backend hooks + enrichissement (dépend de Sprint A) :
  ├─ US 4.2 : hooks login/logout commercial + admin
  └─ US 4.3 : enrichissement getPerformanceCommerciaux

Sprint C — Frontend (peut démarrer après Sprint A) :
  ├─ US 1.2 + 1.3 : filtre date dans Header + propagation
  ├─ US 2.2 : KPI card Total Conversations
  ├─ US 3.2 : KPI card Conversations lues
  └─ US 4.4 : colonne Heures de connexion
```

---

## Récapitulatif des fichiers

### Fichiers à créer (backend)

| Fichier | Rôle |
|---|---|
| `src/connection-log/entities/connection-log.entity.ts` | Entité TypeORM ConnectionLog |
| `src/connection-log/connection-log.service.ts` | logLogin, logLogout, getBulkConnectionMinutes |
| `src/connection-log/connection-log.module.ts` | Module NestJS |
| `src/database/migrations/ConnectionLog1746057600007.ts` | Migration table messaging_connection_log |

### Fichiers à modifier (backend)

| Fichier | Changement |
|---|---|
| `src/metriques/metriques.service.ts` | +getMetriquesConversations(), étendre getMetriquesChats(), enrichir getPerformanceCommerciaux() |
| `src/metriques/dto/create-metrique.dto.ts` | +totalConversations, +conversationsNouveauxClients, +conversationsAnciensClients, +chatsLusSansReponse, +chatsLusAvecReponse, +totalConnectionMinutes |
| `src/metriques/metriques.module.ts` | Import ConnectionLogModule |
| `src/auth/auth.controller.ts` | Hook logLogin/logLogout commercial |
| `src/auth_admin/auth_admin.controller.ts` | Hook logLogin/logLogout admin |

### Fichiers à modifier (frontend admin)

| Fichier | Changement |
|---|---|
| `admin/src/app/ui/Header.tsx` | Ajout input date custom + props dateFrom/dateTo |
| `admin/src/app/dashboard/commercial/page.tsx` | States dateFrom/dateTo, transmission aux views |
| `admin/src/app/lib/api.ts` | getOverviewSection() + getPerformanceCommerciaux() acceptent dateFrom/dateTo |
| `admin/src/app/lib/definitions.ts` | +3 champs MetriquesGlobales, +2 champs MetriquesGlobales, +1 champ PerformanceCommercial |
| `admin/src/app/ui/OverviewView.tsx` | Props dateFrom/dateTo, 2 nouveaux KPI cards |
| `admin/src/app/ui/CommerciauxView.tsx` | Props dateFrom/dateTo, colonne Heures de connexion |

---

## Points d'attention / Risques

1. **Cron disconnect-all** : déconnecte les commerciaux sans passer par le contrôleur d'auth — il faudra y ajouter les appels `logLogout`.

2. **Sessions actives à la migration** : les commerciaux déjà connectés au moment du déploiement n'auront pas d'entrée `ConnectionLog` ouverte → `0 min` pour la journée de déploiement. Comportement acceptable.

3. **Calcul nouveau/ancien client** : la requête implique une sous-requête corrélée. Utiliser `GROUP BY + HAVING MIN(createdAt)` pour les performances sur gros volumes.

4. **Invalidation des snapshots analytics** : pas d'impact — le contrôleur ignore les snapshots quand `dateFrom`/`dateTo` sont présents (`isStandard = false`).

5. **Valeur `custom` dans le `<select>` de période** : ne pas transmettre `custom` comme `periode` au backend — transmettre uniquement `dateFrom`/`dateTo` et laisser le backend ignorer `periode` quand ces paramètres sont présents.

6. **Convention nommage migration** : `ConnectionLog1746057600007` — vérifier qu'aucune migration existante n'utilise ce timestamp (les deux dernières connues sont `1746000000001` et `1746000000002`).
