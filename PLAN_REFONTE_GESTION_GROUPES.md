# Plan d'implémentation — Refonte Gestion des Groupes

## Analyse de l'état actuel

### Structure des onglets (`PlanningTabsView.tsx:29-39`)
9 onglets en ligne horizontale : Plannings de travail, Présence du jour, Absences & remplacements, Calendrier mensuel, Bilan absences, Historique, Heures de travail, Sous-groupes & pauses, Supervision pauses.

---

## US-1 — Onglet "Plannings de travail" : Filtre groupes + Légende inline

### Problèmes identifiés
- `GroupsCalendarView.tsx:168-190` : Les groupes sont affichés comme des boutons-pills dans un bloc séparé au-dessus du calendrier. Sur de nombreux groupes, cela prend beaucoup d'espace.
- `GroupsCalendarView.tsx:278-299` : La légende est en dessous du calendrier dans un troisième bloc indépendant.

### Solution
**Filtre groupes** : Remplacer les boutons-pills par un dropdown multi-select avec cases à cocher (`<details>` ou composant custom). Le trigger affiche "X groupe(s) sélectionné(s)" et la liste déroulante contient une checkbox par groupe avec son point coloré. Boutons "Tous" / "Aucun" conservés dans le dropdown.

**Légende** : Passer le bloc calendrier + légende en layout `flex` côte à côte — le calendrier prend `flex-1`, la légende prend une colonne fixe de ~180px à droite avec les items en colonne verticale. Sur écran étroit (< 768px) : légende repasse en dessous (`flex-col`).

**Fichiers** : `admin/src/app/ui/groups/GroupsCalendarView.tsx` uniquement — aucun backend.

---

## US-2 — Onglet "Présence du jour" : Base sur première connexion + Historique

### Problèmes identifiés
- `PresenceView.tsx` : La présence est basée sur `CommercialPresenceItem.isWorkingToday` (champ booléen sur `WhatsappCommercial`) togglé manuellement. Aucune traçabilité, aucun historique.
- `whatsapp_commercial/entities/user.entity.ts` : `isWorkingToday` + `workingTodaySince` sont des champs volatils — ils disparaissent si le serveur redémarre ou si le cron les réinitialise.

### Solution

**Backend — nouvelle logique de présence** :
La première connexion d'un commercial dans la journée (premier `ConnectionLog.loginAt` pour ce `userId` à la date donnée) constitue sa présence effective. `ConnectionLog` (`messaging_connection_log`) contient déjà `loginAt`, `logoutAt`, `userId`.

**Attention** : `isWorkingToday` reste inchangé car le dispatcher (`dispatcher.service.ts`) et le `CommercialPlanningService.applyTodayEffect()` en dépendent. On ne modifie pas la logique métier — on change uniquement **la source d'affichage** dans la vue admin.

**Nouvel endpoint** dans `commercial-group.controller.ts` :
```
GET /commercial-groups/presence-history?date=YYYY-MM-DD
```
Retourne pour chaque commercial (tous, pas seulement les connectés) :
```ts
{
  commercialId, commercialName,
  firstLoginAt: string | null,       // première connexion du jour (ConnectionLog)
  lastLogoutAt: string | null,       // dernier logout du jour
  sessionCount: number,              // nombre de sessions dans la journée
  totalConnectedMinutes: number,     // via ConnectionLogService.getBulkConnectionMinutes() ← réutiliser
  planningStatus: 'normal' | 'absent' | 'exceptional' | null,  // depuis CommercialPlanningService
  groupIsWorkDay: boolean | null,    // depuis GroupScheduleDay
  group: { id, name } | null,
}
```

**Frontend — tableau croisé deux sources** :
- `PresenceView.tsx` : sélecteur de date (today par défaut), navigation jours passés.
- Colonnes : Commercial | Groupe | 1ère connexion | Sessions | Temps connecté | Statut planning | Présence effective
- "Présence effective" = combinaison des deux :
  - `firstLoginAt IS NOT NULL` → "Connecté à HH:MM"
  - `planningStatus = 'absent'` → badge "Absent déclaré"
  - Les deux simultanément → afficher les deux (connexion + badge absent)
- Le toggle "Marquer présent/absent" (modification manuelle `isWorkingToday`) subsiste, labellisé "Correction manuelle" — avec une note indiquant l'impact sur le dispatcher.

**Migrations** : aucune — on exploite `ConnectionLog` existant.

**Nouveau service** : `CommercialPresenceHistoryService` dans `commercial-group/` qui interroge `ConnectionLog` par date et croise avec `CommercialPlanningService` + `GroupScheduleService`.

**Fichiers** :
- Backend : `commercial-group.controller.ts` (nouvelle route), nouveau `commercial-presence-history.service.ts`
- Frontend : `admin/src/app/ui/PresenceView.tsx`

---

## US-3 — Onglet "Heures de travail" (Sessions) : Implémenter

### Problèmes identifiés
- `SessionsView.tsx:1-8` : Placeholder vide — "En cours d'implémentation".

### Ce qu'une session représente
Chaque entrée `ConnectionLog` (loginAt → logoutAt) pour un commercial = une session. Une session en cours a `logoutAt = NULL`. `ConnectionLogService.logLogin()` ferme automatiquement toute session ouverte avant d'en créer une nouvelle (`closeOpenSessions`), garantissant l'intégrité des données.

### Solution

**Endpoint backend** :
```
GET /commercial-groups/sessions?date=YYYY-MM-DD&commercialId=&status=active|closed|all&page=1
```
Retourne :
```ts
{
  sessions: [{
    id, commercialId, commercialName,
    loginAt, logoutAt,
    durationMinutes: number,   // TIMESTAMPDIFF calculé côté SQL
    status: 'active' | 'closed'
  }],
  total: number,
  kpis: {
    activeSessions: number,
    avgDurationMinutes: number,
    totalConnectedMinutes: number   // via ConnectionLogService.getBulkConnectionMinutes() ← réutiliser
  }
}
```

**Important** : Injecter `ConnectionLogService` dans le service appelant et appeler `getBulkConnectionMinutes()` pour les KPIs de durée totale (`connection-log.service.ts:103`) — ne pas réécrire la même query SQL.

**Frontend** :
- Filtres : sélecteur de date, filtre par commercial (optionnel), filtre statut
- Tableau : Commercial | Heure connexion | Heure déconnexion | Durée | Statut (badge vert "Active" / gris "Fermée")
- KPIs en-tête : sessions actives, durée moyenne, total heures connectées
- Pagination

**Fichiers** :
- Backend : `commercial-group.controller.ts` (nouvelle route), `commercial-group.service.ts` (méthode `getSessions()`)
- Frontend : `admin/src/app/ui/SessionsView.tsx` (réécriture complète)

---

## US-4 — Onglet "Sous-groupes & pauses" : Sous-onglets Membres + Plages de pause

### Problèmes identifiés
- `SubGroupsManager.tsx:359-363` : Bouton "Membres" qui expand inline la liste dans la même colonne du sous-groupe.
- `SubGroupsManager.tsx:365-371` : Icône horloge qui ouvre une modale `BreakScheduleForm` — les plages ne sont visibles qu'à l'ouverture de la modale.
- `SubGroupsManager.tsx:373-379` : Icône `ShieldOff` → modale `BreakExclusionsPanel` séparée.
- `CommercialGroupsView.tsx:337-343` : Bouton "Sous-groupes" par groupe qui ouvre `SubGroupsManager` en overlay `z-40`. Ce point d'entrée doit aussi être revu pour rester cohérent avec le nouveau layout.

### Solution

**Layout deux niveaux** dans `SubGroupsGroupSelector.tsx` :
```
[Sélecteur groupe dropdown]
  → Liste des sous-groupes (cards cliquables)
    → Panneau latéral ou section en-dessous du sous-groupe sélectionné
      → Sous-onglets : [Membres] [Plages de pause] [Exclusions]
```

**Chargement des membres** : `getSubGroups(groupId)` peut retourner `members = undefined` (guard présent dans `SubGroupMemberSection` à la ligne 167). Au clic sur un sous-groupe, déclencher un appel `getSubGroup(subGroupId)` (endpoint détail) pour charger `members[]` — ne pas supposer qu'ils sont inclus dans `getSubGroups()`.

**Sous-onglet "Membres"** : contenu de `SubGroupMemberSection` — liste membres + ajout depuis les membres du groupe parent.

**Sous-onglet "Plages de pause"** : contenu de `BreakScheduleForm` rendu inline (prop `inline?: boolean`). Liste des plages configurées toujours visible + formulaire d'ajout en-dessous.

**Sous-onglet "Exclusions"** : contenu de `BreakExclusionsPanel` rendu inline (prop `inline?: boolean`).

**CommercialGroupsView** : Le bouton "Sous-groupes" (`CommercialGroupsView.tsx:337-343`) qui ouvre `SubGroupsManager` en modale doit être supprimé ou remplacé par un lien vers l'onglet "Sous-groupes & pauses" — pour éviter d'avoir deux interfaces distinctes pour la même fonctionnalité.

**Fichiers modifiés** :
- `admin/src/app/ui/SubGroupsGroupSelector.tsx` — refonte layout complet
- `admin/src/app/ui/SubGroupsManager.tsx` — suppression des modales internes, exposer les panels en mode inline
- `admin/src/app/ui/BreakScheduleForm.tsx` — prop `inline?: boolean`
- `admin/src/app/ui/BreakExclusionsPanel.tsx` — prop `inline?: boolean`
- `admin/src/app/ui/CommercialGroupsView.tsx` — supprimer/remplacer le bouton "Sous-groupes"

---

## US-5 — Audio popup : Deux méthodes avec lecteur

### Problèmes identifiés
- `BreakScheduleForm.tsx:216-224` : Champ texte libre pour saisir manuellement l'UUID de l'asset audio. Aucun lecteur, aucun upload, aucune sélection depuis la médiathèque.

### Prérequis à vérifier avant implémentation
- **Côté admin** : `MediaAsset.publicUrl` (string, champ `definitions.ts:828`) est l'URL à utiliser pour la lecture — il n'y a pas de champ `localUrl`. Le filtre type se fait sur `mediaType === 'audio'` (`definitions.ts:822`).
- **Côté front commercial** : `BreakScheduleEngine` envoie `popupAudioAssetId` via Socket.io (`BREAK_EVENTS.BREAK_PROMPT`). Vérifier dans `front/src/` que le composant récepteur résout cet ID en `publicUrl` (appel `GET /media-assets/:id` ou URL incluse dans le payload). **Investiguer avant d'implémenter** pour ne pas livrer un admin qui configure l'audio sans que le front commercial puisse le jouer.

### Solution

**Méthode 1 — Upload direct** :
- Zone `<input type="file" accept="audio/*">` avec drag & drop
- Après sélection : lecteur `<audio src={blobUrl}>` pour écouter avant d'ajouter
- Bouton "Ajouter à la médiathèque et utiliser" → appelle `uploadMediaAsset()` (`api.ts:1304`), récupère l'asset créé, stocke son `id` dans `popupAudioAssetId`
- L'asset devient disponible dans la médiathèque

**Méthode 2 — Sélection depuis médiathèque** :
- Dropdown alimenté par `getMediaAssets()` filtré `mediaType === 'audio'` (`api.ts:1286`)
- Chaque option affiche le nom de l'asset
- Lecteur `<audio src={asset.publicUrl}>` ← **`publicUrl`, pas `localUrl`** — s'active à la sélection
- Sélection → remplit `popupAudioAssetId`

**UI** : Toggle "Upload un fichier" | "Choisir dans la médiathèque". Lecteur audio commun visible dès qu'un audio est sélectionné dans les deux modes. Affichage du nom de l'audio actuellement configuré si `popupAudioAssetId` est déjà défini (chargement du nom depuis la médiathèque).

**Fichiers modifiés** :
- `admin/src/app/ui/BreakScheduleForm.tsx` — section audio entièrement revue

---

## US-6 — Onglet "Supervision pauses" : Deux sous-onglets

### Problèmes identifiés
- `PlanningTabsView.tsx:45-85` (`SupervisionTab`) : Tout dans un seul bloc.
- `DisconnectAlertsBanner.tsx` : Uniquement les alertes actives, aucun historique.
- `disconnect-monitor.job.ts:39-45` (`getActiveAlerts`) : Détecte les sessions `logoutAt IS NULL AND loginAt < cutoff`.

### Clarification sémantique importante
Le `DisconnectMonitorJob` ne détecte **pas** des "déconnexions" au sens propre. Il détecte des **sessions fantômes** : sessions ouvertes (`logoutAt IS NULL`) dont le `loginAt` dépasse le seuil (commercial déconnecté sans logout propre — crash navigateur, coupure réseau). Ce sont des anomalies de session, pas des absences volontaires.

Une vraie "déconnexion longue" (commercial parti sans se reconnecter) se lirait différemment : gap entre `logoutAt[session N]` et `loginAt[session N+1]` dépassant un seuil.

Le sous-onglet A expose les **deux concepts** distincts :
- **Sessions fantômes** (`alertedAt IS NOT NULL`) : session jamais fermée proprement
- **Gaps de reconnexion** (optionnel v2) : écart > seuil entre logoutAt et loginAt suivant

### Solution

#### Sous-onglet A — Sessions anormales & déconnexions

**Backend** :

1. **Endpoint historique global** :
```
GET /commercial-groups/disconnect-history?from=YYYY-MM-DD&to=YYYY-MM-DD
```
Retourne les `ConnectionLog` avec `alertedAt IS NOT NULL`, ordonnés par `alertedAt DESC`. Pour chaque entrée : `loginAt` (début session), `logoutAt` (fermeture — NULL si toujours fantôme), durée = `(logoutAt ?? NOW) - loginAt`, `disconnectReason`.

2. **Endpoint historique par commercial** :
```
GET /commercial-groups/disconnect-history/:commercialId?page=1
```
Même logique, filtrée sur `userId`, paginée.

3. **Champ `disconnectReason`** : Ajouter colonne `disconnect_reason` (varchar 255, nullable) sur `messaging_connection_log`. Migration dédiée.
```
PATCH /commercial-groups/disconnect-history/:logId/reason
Body: { reason: string }
```
Permet à un admin d'ajouter la raison a posteriori (ex: "Coupure réseau signalée", "Départ non déclaré").

**Frontend** :
- Tableau : Commercial | Début session | Fin session | Durée | Type (fantôme/gap) | Raison | Actions
- Bouton "Voir historique" par commercial → modale paginée avec toutes ses anomalies passées
- Raison éditable inline (click → input → save) avec bouton "Ajouter raison" si vide
- KPIs : total anomalies du jour, commercial le plus fréquent, durée moyenne des sessions fantômes

**Fichiers backend** :
- `message_whatsapp/src/connection-log/entities/connection-log.entity.ts` — colonne `disconnectReason`
- `message_whatsapp/src/database/migrations/AddDisconnectReasonToConnectionLog{ts}.ts`
- `message_whatsapp/src/commercial-group/commercial-group.controller.ts` — 3 nouvelles routes
- `message_whatsapp/src/commercial-group/commercial-group.service.ts` — méthode `getDisconnectHistory()`

**Fichiers frontend** :
- `admin/src/app/ui/DisconnectAlertsView.tsx` — nouveau composant (remplace `DisconnectAlertsBanner`)
- `admin/src/app/lib/api/commercial-groups.api.ts` — `getDisconnectHistory()`, `patchDisconnectReason()`
- `admin/src/app/lib/definitions.ts` — type `DisconnectHistoryEntry`

#### Sous-onglet B — Tableau de supervision pauses

Contenu actuel de `BreakSupervisionTable` déplacé ici + refresh automatique toutes les 60s. Aucun changement fonctionnel.

**Fichiers** : `admin/src/app/ui/PlanningTabsView.tsx` — `SupervisionTab` refactorisé avec sous-onglets internes.

---

## Récapitulatif des fichiers touchés

| US | Fichiers backend | Fichiers frontend |
|---|---|---|
| US-1 | aucun | `GroupsCalendarView.tsx` |
| US-2 | `commercial-group.controller.ts`, nouveau `commercial-presence-history.service.ts` | `PresenceView.tsx` |
| US-3 | `commercial-group.controller.ts`, `commercial-group.service.ts` | `SessionsView.tsx` (réécriture) |
| US-4 | aucun | `SubGroupsGroupSelector.tsx`, `SubGroupsManager.tsx`, `BreakScheduleForm.tsx`, `BreakExclusionsPanel.tsx`, **`CommercialGroupsView.tsx`** |
| US-5 | aucun | `BreakScheduleForm.tsx` (section audio) — **investiguer `front/` avant** |
| US-6 | `connection-log.entity.ts`, `commercial-group.controller.ts`, `commercial-group.service.ts`, migration | `PlanningTabsView.tsx`, `DisconnectAlertsView.tsx` (nouveau), `commercial-groups.api.ts`, `definitions.ts` |

---

## Points de vigilance transversaux

| # | Point | US | Risque |
|---|---|---|---|
| 1 | `isWorkingToday` reste la source de vérité pour le dispatcher — ne pas le remplacer | US-2 | Rupture dispatch si modifié |
| 2 | `MediaAsset.publicUrl` (pas `localUrl`) pour la lecture audio | US-5 | Lecteur silencieux |
| 3 | `getSubGroups()` peut retourner `members = undefined` → appel détail séparé au clic | US-4 | Sous-onglet membres vide |
| 4 | `CommercialGroupsView.tsx` bouton "Sous-groupes" → à supprimer/rediriger | US-4 | Double interface incohérente |
| 5 | Sessions fantômes ≠ déconnexions volontaires — distinction à exposer dans l'UI | US-6 | Confusion admin |
| 6 | `ConnectionLogService.getBulkConnectionMinutes()` existant → réutiliser | US-3 | Duplication SQL |
| 7 | Vérifier `front/` reçoit et joue l'audio via `popupAudioAssetId` avant d'implémenter US-5 | US-5 | Feature admin inutile si front commercial ne joue pas l'audio |

---

## Ordre d'implémentation suggéré

### Sprint 1 — Frontend pur, zéro migration
- **US-1** : Filtre groupes dropdown + légende à droite
- **US-4** : Sous-onglets membres / plages de pause / exclusions + nettoyage CommercialGroupsView
- **US-5** : Audio popup (après investigation `front/`)

### Sprint 2 — Backend léger (exploite ConnectionLog existant)
- **US-3** : Sessions — endpoint + vue complète (réutilise `getBulkConnectionMinutes`)
- **US-2** : Présence basée sur première connexion + historique croisé planning

### Sprint 3 — Migration + nouvelles fonctions
- **US-6** : Migration `disconnect_reason` + endpoints historique + frontend complet (sous-onglets supervision)
