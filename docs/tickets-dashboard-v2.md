# Tickets Implementation Dashboard V2

## Phase 1 - Quick Wins (donnees existantes non affichees)

### T1 - Reorganiser la navigation en domaines fonctionnels
**Statut** : FAIT
**Fichiers** : `admin-data.ts`, `definitions.ts`, `Navigation.tsx`
**Description** : Remplacer la liste plate de 14 items par 6 groupes avec sous-menus collapsibles :
- Tableau de bord (overview)
- Equipe & Postes (commerciaux, postes, performance)
- Conversations & Messages (conversations, messages, automessages)
- Dispatch & Queue (queue, dispatch)
- Infrastructure (canaux, observabilite, go_no_go)
- Analytics & Rapports (analytics, rapports, clients)

### T2 - Graphique PerformanceTemporelle dans Vue d'ensemble
**Statut** : FAIT
**Fichiers** : `OverviewView.tsx`, `package.json`
**Description** : Les donnees `performanceTemporelle` sont deja fetchees via `getOverviewMetriques()` mais jamais affichees. Installer `recharts` et ajouter un line chart messages/jour sur 7j dans OverviewView.

### T3 - Implementer PerformanceView (stub vide)
**Statut** : FAIT
**Fichiers** : `PerformanceView.tsx`
**Description** : Remplacer le stub `UnderDevelopmentView` par une vue reelle : tableau classement commerciaux, metriques par agent (messages, taux reponse, temps moyen), graphique comparatif.

### T4 - Afficher badge read_only sur les conversations
**Statut** : FAIT
**Fichiers** : `ConversationsView.tsx`
**Description** : Le champ `read_only` existe deja dans WhatsappChat. Ajouter un badge visuel (cadenas) sur les conversations verrouillees.

### T5 - Afficher preview medias dans Conversations + indicateur statut messages
**Statut** : FAIT
**Fichiers** : `ConversationsView.tsx`
**Description** : Le type `WhatsappMessage.medias` existe deja. Afficher des miniatures/icones pour les messages contenant des medias (image, video, audio, document, location). Ajouter indicateur statut message (sent/delivered/read/failed).

---

## Phase 2 - Temps reel et interactivite

### T6 - Connecter Socket.IO pour queue et messages temps reel
**Statut** : A FAIRE
**Fichiers** : Nouveau `hooks/useSocket.ts`, `QueueView.tsx`, `ConversationsView.tsx`
**Description** : socket.io-client est installe mais non utilise. Creer un hook useSocket qui connecte au gateway et ecoute les events : `queue:updated`, `new_message`, `status_update`, `typing`.

### T7 - Implementer notifications temps reel
**Statut** : A FAIRE
**Fichiers** : `Header.tsx`, nouveau `hooks/useNotifications.ts`
**Description** : L'icone cloche existe dans le Header. Connecter aux events Socket.IO pour afficher les notifications en temps reel (nouveau message, SLA violation, agent deconnecte).

### T8 - Fiche commercial (deep dive par agent)
**Statut** : A FAIRE
**Fichiers** : Nouveau `CommercialDetailView.tsx`
**Description** : Vue detaillee par agent : profil, metriques individuelles, conversations actives assignees, courbe activite 7j. Accessible depuis CommerciauxView en cliquant sur un agent.

---

## Phase 3 - Nouvelles vues

### T9 - Implementer AnalyticsView
**Statut** : A FAIRE
**Fichiers** : `AnalyticsView.tsx`
**Description** : Remplacer le stub par une vue analytics : graphiques performance temporelle (line chart 7/30/90j), repartition messages par type (pie chart), volume conversations par jour, top clients.

### T10 - Implementer RapportsView
**Statut** : A FAIRE
**Fichiers** : `RapportsView.tsx`
**Description** : Vue rapports : selection periode, choix metriques, generation et export CSV. Resume activite (messages, conversations, agents) par periode.

### T11 - Enrichir ClientsView avec suivi appels
**Statut** : A FAIRE
**Fichiers** : `ClientsView.tsx`
**Description** : Ajouter onglet suivi appels : historique par client (call_status, call_notes, call_count, last_call_date, next_call_date). Pipeline conversion : prospect > contacte > qualifie > converti.

---

## Phase 4 - Fonctionnalites avancees

### T12 - Implementer export CSV/PDF
**Statut** : A FAIRE
**Fichiers** : Nouveau `lib/export.ts`, `Header.tsx`
**Description** : Le bouton export existe dans le Header mais ne fait rien. Implementer export CSV pour chaque vue (conversations, messages, contacts, metriques).

### T13 - Implementer page Parametres admin
**Statut** : A FAIRE
**Fichiers** : Nouveau `SettingsView.tsx`, `admin-data.ts`
**Description** : Le bouton Parametres existe dans Navigation mais ne fait rien. Page settings : preferences affichage, configuration alertes.

---

*Genere le 16/02/2026*
