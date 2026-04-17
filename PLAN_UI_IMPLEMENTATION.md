# Plan d'implémentation UI — CRM Multi-canal

## Vue d'ensemble

**Périmètre :** Fonctionnalités backend existantes (Phase 3-6) sans interface UI  
**Date de création :** 2026-04-17  
**Statut global :** 🔴 Non démarré  
**Règle :** chaque phase est livrable et testable indépendamment

---

## Suivi des phases

| Phase | Titre | Cible | Statut |
|-------|-------|-------|--------|
| 1 | Outils quotidiens agent | `front/` | 🔴 À faire |
| 2 | Inbox avancée | `front/` | 🔴 À faire |
| 3 | Analytics réels | `admin/` | 🔴 À faire |
| 4 | Gouvernance | `admin/` | 🔴 À faire |
| 5 | Broadcasts & Templates | `admin/` | 🔴 À faire |
| 6 | FlowBot builder | `admin/` | 🔴 À faire |
| 7 | Contact & CRM | `front/` + `admin/` | 🔴 À faire |
| 8 | Polish & qualité | `front/` + `admin/` | 🔴 À faire |

---

## Phase 1 — Outils quotidiens agent `front/`
*Impact immédiat sur la productivité des agents*

### 1.1 Canned Responses (réponses rapides)
- Bouton `/` ou `#` dans `ChatInput` ouvre un menu de suggestions
- Filtrage par mot-clé en temps réel
- Sélection insère le texte dans l'input
- API : `GET /canned-responses`

### 1.2 Transfert de conversation
- Bouton dans `ChatHeader` → modal avec liste des postes/agents disponibles
- Confirmation + note optionnelle
- Mise à jour temps réel via WebSocket (`CONVERSATION_UPDATED`)
- API : `POST /chats/:id/transfer`

### 1.3 Labels / Tags
- Chip de labels dans `ChatHeader` et `ConversationList`
- Dropdown pour ajouter/retirer un label existant
- Couleur par label
- API : `GET /labels`, `POST /chats/:id/labels`, `DELETE /chats/:id/labels/:labelId`

### 1.4 Notifications desktop
- `Notification API` browser (permission déjà demandée au login)
- Déclenché sur `NEW_MESSAGE` si onglet non actif
- Toast discret + son configurable

---

## Phase 2 — Inbox avancée `front/`
*Ce qui rend une inbox professionnelle*

### 2.1 Recherche globale
- Barre de recherche en haut de sidebar (déjà partiellement wired)
- Résultats : conversations + messages + contacts
- Debounce 300ms
- API : `GET /search?q=&type=conversations|messages|contacts`

### 2.2 Actions en masse
- Checkbox sur chaque conversation dans la liste
- Barre d'actions contextuelle : fermer, transférer, labelliser, assigner
- API : `PATCH /chats/bulk`

### 2.3 Fusion de conversations
- Bouton dans le menu conversation → modal de sélection de la cible
- `conversation-merge.service.ts` existe côté front, UI absente
- API : `POST /chats/:id/merge`

### 2.4 Création de conversation outbound
- Bouton `+` dans la sidebar
- Formulaire : numéro, canal, message initial
- API : `POST /chats/outbound`

---

## Phase 3 — Analytics réels `admin/`
*Remplacer les données factices par les vraies*

### 3.1 Dashboard Overview — vraies métriques
- Brancher `metrics.api.ts` sur `OverviewView.tsx`
- KPIs : messages/jour, chats actifs, taux résolution, temps réponse moyen
- Graphique 7j/30j rechargeable

### 3.2 Performance agents — vraies données
- Tableau par agent : conversations traitées, temps réponse moyen, satisfaction
- Brancher `GET /stats/by-commercial` sur `PerformanceView.tsx`

### 3.3 SLA Monitoring temps réel
- `SlaView.tsx` existe (Phase 5) — ajouter badge d'alerte sur les conversations en breach
- Indicateur rouge dans `ConversationList` si SLA dépassé
- API : `GET /sla-rules/breaches`

### 3.4 Export CSV/PDF
- `exportService.ts` existe mais vide
- Bouton export sur : Conversations, Messages, Clients, Audit logs
- CSV côté client (Papa Parse) ou endpoint dédié `GET /export/:resource`

---

## Phase 4 — Gouvernance `admin/`
*Ce que les superviseurs et admins utilisent*

### 4.1 RBAC enforcement UI
- Masquer/désactiver les vues selon les permissions du rôle connecté
- `RolesView.tsx` existe — ajouter matrix permission visuelle (tableau rôle × permission)
- Bloquer accès aux routes admin selon `role.permissions[]`

### 4.2 Audit logs — filtres avancés
- `AuditView.tsx` existe — ajouter filtres : acteur, action, entité, plage de dates
- Pagination cursor-based
- Export CSV

### 4.3 Webhooks sortants — gestion retry
- `WebhooksView.tsx` existe — ajouter vue des logs d'envoi
- Bouton retry manuel sur les échecs
- API : `GET /outbound-webhooks/:id/logs`, `POST /outbound-webhooks/logs/:id/retry`

---

## Phase 5 — Broadcasts & Templates `admin/`
*Canaux de communication sortants*

### 5.1 Templates HSM — preview live
- `TemplatesView.tsx` existe — ajouter prévisualisation rendue du template
- Indicateur statut approbation Meta (PENDING / APPROVED / REJECTED)
- Formulaire de soumission vers Meta API

### 5.2 Broadcasts — monitoring campagne
- `BroadcastsView.tsx` existe — ajouter barre de progression temps réel
- Statistiques : envoyés / livrés / lus / erreurs
- Pause / reprise / annulation inline
- API : `GET /admin/broadcasts/:id/stats` (polling 5s)

---

## Phase 6 — FlowBot builder `admin/`
*Compléter ce qui est partiellement implémenté*

### 6.1 Save / versioning du canvas
- `FlowBuilderView.tsx` — brancher bouton Save sur `PATCH /flowbot/:id`
- Sauvegarde automatique (debounce 2s après modification)
- Indicateur "modifications non sauvegardées"

### 6.2 Nœuds manquants
- `DELAY` — champ durée (minutes/heures)
- `HTTP_REQUEST` — URL, headers, body, variable de réponse
- `SEND_TEMPLATE` — sélecteur template HSM
- `ASSIGN_LABEL` — sélecteur label

### 6.3 Analytics FlowBot
- Taux de complétion par nœud
- Nombre d'utilisateurs par chemin
- API : `GET /flowbot/:id/analytics`

---

## Phase 7 — Contact & CRM `front/` + `admin/`
*La partie CRM du produit*

### 7.1 Profil contact enrichi `front/`
- Dans `ContactDetails` : afficher les champs CRM custom
- Édition inline des valeurs
- Historique complet toutes conversations confondues

### 7.2 Liaison conversation ↔ contact `front/`
- Dans `ChatHeader` : clic sur le nom ouvre le profil contact complet
- Depuis les contacts : bouton "Voir conversation" fonctionnel

### 7.3 CRM custom fields — validation `admin/`
- `CrmView.tsx` existe — ajouter validation des valeurs (regex pour text, min/max pour number)
- Types : `select` → gérer les options

---

## Phase 8 — Polish & qualité
*Ce qui fait la différence avec les concurrents*

### 8.1 Indicateurs de statut en temps réel `front/`
- Badge "En ligne / Hors ligne" par agent dans la liste
- Indicateur de charge : nombre de conversations actives par poste

### 8.2 Raccourcis clavier `front/`
- `Ctrl+K` → recherche globale
- `Ctrl+Enter` → envoyer message
- `Ctrl+/` → canned responses
- `Escape` → fermer modal

### 8.3 Mode sombre `front/` + `admin/`
- Variable CSS + toggle en header

### 8.4 PWA `front/`
- `manifest.json` + service worker
- Notifications push même app fermée
- Installation sur mobile

---

## Ordre de démarrage recommandé

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8
```

Les phases 1 et 2 donnent de la valeur immédiate aux agents.  
Les phases 3 et 4 donnent de la visibilité aux managers.  
Les phases 5, 6, 7 complètent le produit.  
La phase 8 peaufine l'expérience.
