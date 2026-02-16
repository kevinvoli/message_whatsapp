# Bilan Admin Dashboard & Plan de Reorganisation

## 1. ETAT ACTUEL

### Stack technique
- **Framework** : Next.js 16.1.6 (React 19, TypeScript 5.9, App Router)
- **UI** : Tailwind CSS 4, Lucide React (icones), Geist fonts
- **State** : React Context (ToastProvider), hooks custom (useCrudResource)
- **HTTP** : Fetch API avec credentials HTTP-only cookies
- **Temps réel** : socket.io-client 4.8.1 installé mais **non utilisé**

### Navigation actuelle (14 vues)

```
AdminPro Dashboard
├── Vue d'ensemble      → OverviewView.tsx         ✅ Fonctionnel
├── Équipe              → CommerciauxView.tsx       ✅ Fonctionnel
├── Postes              → PostesView.tsx            ✅ Fonctionnel
├── Queue               → QueueView.tsx             ✅ Fonctionnel
├── Dispatch            → DispatchView.tsx          ✅ Fonctionnel
├── Canaux              → ChannelsView.tsx          ✅ Fonctionnel
├── Messages auto       → MessageAutoView.tsx       ✅ Fonctionnel
├── Conversations       → ConversationsView.tsx     ✅ Fonctionnel
├── Performance         → PerformanceView.tsx       ❌ Stub vide
├── Analytics           → AnalyticsView.tsx         ❌ Stub vide
├── Messages            → MessagesView.tsx          ✅ Fonctionnel
├── Clients             → ClientsView.tsx           ✅ Fonctionnel
├── Rapports            → RapportsView.tsx          ❌ Stub vide
├── Observabilité       → ObservabiliteView.tsx     ✅ Fonctionnel
└── GO/NO-GO            → GoNoGoView.tsx            ✅ Fonctionnel
```

### Composants réutilisables
| Composant | Role |
|-----------|------|
| Navigation | Sidebar collapsible, menu, profil, logout |
| Header | Barre titre, sélecteur période, notifications, export |
| EntityTable | Table générique CRUD |
| EntityFormModal | Modal formulaire create/edit |
| Spinner | Indicateur chargement |
| ToastProvider | Notifications toast (success/error/info) |
| UnderDevelopmentView | Placeholder pages stubs |

### Hook custom
- **useCrudResource** : gestion état CRUD pour n'importe quelle entité (items, loading, error, create/update/remove, byId map)

### Endpoints API consommés (30+)

| Domaine | Endpoints |
|---------|-----------|
| Auth | `POST /auth/admin/login`, `GET /auth/admin/profile`, `POST /auth/admin/logout` |
| Commerciaux | `GET /users`, `PATCH /users/{id}` |
| Métriques | `GET /api/metriques/overview`, `/globales`, `/commerciaux`, `/channels`, `/performance-temporelle` |
| Postes | `GET/POST/PATCH/DELETE /poste` |
| Queue | `GET /queue`, `POST /queue/reset`, `POST /queue/block/{id}`, `POST /queue/unblock/{id}` |
| Dispatch | `GET/POST /queue/dispatch/settings`, `POST .../reset`, `GET .../audit` |
| Channels | `GET/POST/PATCH/DELETE /channel` |
| Messages auto | `GET/POST/PATCH/DELETE /message-auto` |
| Conversations | `GET /chats`, `GET/POST /messages`, `GET /messages/{chat_id}` |
| Contacts | `GET/POST/PATCH/DELETE /contact` |
| Webhook | `GET /metrics/webhook` |
| Stats | `GET /stats` |

---

## 2. DONNEES BACKEND NON EXPLOITEES

### Données disponibles côté serveur mais absentes du dashboard

| Donnée backend | Service source | Statut frontend |
|---------------|----------------|-----------------|
| **Circuit breaker** (ouvert/fermé/dégradé par provider) | WebhookTrafficHealthService | ❌ Aucun affichage |
| **Performance temporelle** (courbes 7j) | MetriquesService.getPerformanceTemporelle() | ⚠️ Données fetchées mais jamais affichées en graphique |
| **Charge par poste** (répartition workload) | MetriquesService.getChargeParPoste() | ⚠️ Données dans MetriquesGlobales mais pas de vue dédiée |
| **Queue metrics** (taille, âge moyen, churn) | MetriquesService.getQueueMetrics() | ⚠️ Partiel : taille affichée, pas age/churn |
| **Médias messages** (images, vidéos, documents) | WhatsappMediaService | ❌ Aucun preview ni liste de médias |
| **Tenant mapping** (association channel→tenant) | ChannelService, ProviderChannel entity | ❌ Non visualisé |
| **Conditions auto-messages** | MessageAutoService (champ conditions) | ❌ Non éditable dans l'UI |
| **Suivi appels** (logs, outcomes, notes) | ContactService.updateCallStatus() | ⚠️ Champs existent mais pas de vue dédiée |
| **Dashboard productivité commercial** | WhatsappCommercialService.getCommercialsDashboard() | ⚠️ Métriques basiques affichées, pas de deep dive par agent |
| **Historique statuts messages** (delivered→read→failed) | WhatsappMessageService.updateByStatus() | ⚠️ Statut actuel affiché, pas l'historique de transitions |
| **SLA violations** (first response timeout) | DispatcherService.jobRunnertcheque() | ❌ Pas de rapport SLA |
| **Conversations read_only** | WhatsappChatService.lockConversation() | ⚠️ Flag stocké mais pas affiché proéminemment |
| **Export données** | N/A | ❌ Bouton existe mais non implémenté |
| **Notifications temps réel** | WhatsappMessageGateway (Socket.IO) | ❌ socket.io installé mais non connecté |
| **Paramètres admin** | N/A | ❌ Bouton Settings existe mais non implémenté |

---

## 3. PLAN DE REORGANISATION PAR DOMAINE FONCTIONNEL

### Principe

Réorganiser les 14 vues actuelles (liste plate) en **6 domaines fonctionnels** avec sous-menus. Chaque domaine regroupe les vues existantes + les nouvelles vues pour couvrir les données manquantes.

### Nouvelle structure de navigation

```
📊 TABLEAU DE BORD
│   └── Vue d'ensemble (OverviewView - existant, enrichi)
│
👥 EQUIPE & POSTES
│   ├── Commerciaux (CommerciauxView - existant)
│   ├── Fiche commercial (NOUVEAU - deep dive par agent)
│   ├── Postes (PostesView - existant)
│   └── Performance équipe (PerformanceView - à implémenter)
│
💬 CONVERSATIONS & MESSAGES
│   ├── Conversations (ConversationsView - existant, enrichi médias)
│   ├── Messages (MessagesView - existant)
│   ├── Messages auto (MessageAutoView - existant, enrichi conditions)
│   └── Médias (NOUVEAU - galerie médias partagés)
│
📋 DISPATCH & QUEUE
│   ├── Queue (QueueView - existant, enrichi temps réel)
│   ├── Dispatch config (DispatchView - existant)
│   └── SLA & Violations (NOUVEAU - rapport SLA)
│
🌍 INFRASTRUCTURE
│   ├── Canaux (ChannelsView - existant, enrichi tenant mapping)
│   ├── Observabilité (ObservabiliteView - existant, enrichi circuit breaker)
│   └── GO/NO-GO (GoNoGoView - existant)
│
📈 ANALYTICS & RAPPORTS
│   ├── Analytics (AnalyticsView - à implémenter)
│   ├── Rapports (RapportsView - à implémenter)
│   └── Clients (ClientsView - existant, enrichi suivi appels)
```

---

## 4. DETAIL DES NOUVELLES VUES ET ENRICHISSEMENTS

### 4.1 Vue d'ensemble enrichie

**Ajouts :**
- Graphique courbe `PerformanceTemporelle` (messages/jour sur 7j)
- Widget circuit breaker par provider (vert/orange/rouge)
- Diagramme répartition charge par poste (camembert ou barres)
- Queue age moyen + churn rate

**Endpoints à consommer :**
- `GET /api/metriques/performance-temporelle?jours=7` (déjà fetché, ajouter chart)
- `GET /api/metriques/queue` (nouveau endpoint à appeler)
- Nouveau endpoint nécessaire : `GET /api/webhooks/health` (circuit breaker status)

---

### 4.2 Fiche commercial (NOUVEAU)

**Contenu :**
- Profil agent (nom, email, poste, statut connexion)
- Métriques individuelles : messages envoyés/reçus, taux réponse, temps moyen
- Conversations actives assignées
- Historique SLA (violations first response)
- Courbe activité sur 7j

**Endpoints à consommer :**
- `GET /users/{id}` (existant)
- `GET /api/metriques/commerciaux` (filtrer par id)
- `GET /chats?poste_id={posteId}` (conversations assignées)

---

### 4.3 Conversations enrichies (médias)

**Ajouts :**
- Preview inline des médias (images miniatures, icônes vidéo/audio/document)
- Téléchargement des fichiers
- Indicateur visuel `read_only` sur les conversations verrouillées
- Badge statut message (sent → delivered → read → failed) avec couleurs

**Endpoints à consommer :**
- `GET /messages/{chat_id}` (existant, exploiter champs media)
- Afficher `media_type`, `url`, `caption` depuis les relations WhatsappMedia

---

### 4.4 Messages auto enrichis (conditions)

**Ajouts :**
- Editeur de conditions (quand déclencher l'auto-message)
- Preview avec placeholders résolus (#name#, #numero#)
- Statistiques d'utilisation par template

---

### 4.5 Galerie médias (NOUVEAU)

**Contenu :**
- Liste paginée de tous les médias partagés
- Filtres : type (image/video/audio/document), date, conversation
- Preview et téléchargement

**Endpoint nécessaire :**
- Nouveau : `GET /media?type=&chat_id=&from=&to=` (à créer côté backend)

---

### 4.6 Queue temps réel

**Ajouts :**
- Connexion Socket.IO pour mise à jour live de la queue
- Event `queue:updated` déjà émis par le backend
- Animation transitions entrée/sortie agents
- Indicateur temps d'attente par conversation en attente

---

### 4.7 SLA & Violations (NOUVEAU)

**Contenu :**
- Tableau des violations SLA (conversations sans première réponse > 5min)
- Taux de conformité SLA par agent et par jour
- Historique réinjections (conversations réassignées pour timeout)
- Alertes en cours

**Endpoints nécessaires :**
- Nouveau : `GET /api/metriques/sla` (à créer côté backend)
- `GET /queue/dispatch/settings/audit` (réutiliser l'audit existant)

---

### 4.8 Canaux enrichis (tenant mapping)

**Ajouts :**
- Colonne tenant_id visible
- Table ProviderChannel associée (provider, external_id, tenant_id)
- Statut santé par channel (via circuit breaker)

**Endpoints à consommer :**
- `GET /channel` (existant, enrichir la réponse avec ProviderChannel)

---

### 4.9 Observabilité enrichie (circuit breaker)

**Ajouts :**
- Widget circuit breaker par provider : CLOSED (vert) / OPEN (rouge) / DEGRADED (orange)
- Historique ouverture/fermeture circuit breaker
- Seuils configurables visuellement

**Endpoint nécessaire :**
- Nouveau : `GET /api/webhooks/health` → `{ whapi: { status: 'closed', errorRate: 0.2, p95: 120 }, meta: { ... } }`

---

### 4.10 Analytics (à implémenter)

**Contenu :**
- Graphiques performance temporelle (line chart 7/30/90j)
- Répartition messages par provider (pie chart)
- Volume conversations par heure/jour (heatmap)
- Top clients par nombre de messages
- Taux conversion contacts (si tracking activé)

**Endpoints à consommer :**
- `GET /api/metriques/performance-temporelle?jours=30`
- `GET /api/metriques/globales`
- Nouveau : `GET /api/metriques/top-clients`

---

### 4.11 Rapports (à implémenter)

**Contenu :**
- Génération rapports PDF/CSV
- Rapport journalier : résumé activité (messages, conversations, agents)
- Rapport hebdomadaire : performance équipe
- Rapport mensuel : tendances, SLA, charge

**Fonctionnalités :**
- Sélection période
- Choix métriques à inclure
- Export PDF / CSV / Excel
- Planification envoi par email (futur)

---

### 4.12 Clients enrichis (suivi appels)

**Ajouts :**
- Onglet "Suivi appels" avec historique par client
- Champs : call_status, call_notes, call_count, last_call_date, next_call_date
- Pipeline conversion : prospect → contacté → qualifié → converti
- Filtres par statut appel et priorité

**Endpoints à consommer :**
- `PATCH /contact/{id}` (existant, champs call_status déjà supportés)
- Afficher les champs déjà dans le type Contact côté frontend

---

## 5. ENDPOINTS BACKEND A CREER

| Endpoint | Méthode | Données retournées | Vue cible |
|----------|---------|-------------------|-----------|
| `GET /api/webhooks/health` | GET | Circuit breaker status par provider | Observabilité, Vue d'ensemble |
| `GET /api/metriques/sla` | GET | Violations SLA, taux conformité par agent | SLA & Violations |
| `GET /api/metriques/top-clients` | GET | Top N clients par volume messages | Analytics |
| `GET /media` | GET | Liste paginée médias avec filtres | Galerie médias |
| `GET /api/metriques/queue` | GET | Queue age, churn, waiting time moyen | Vue d'ensemble |

---

## 6. FONCTIONNALITES TRANSVERSALES MANQUANTES

| Fonctionnalité | Priorité | Description |
|----------------|----------|-------------|
| **Socket.IO temps réel** | Haute | Connecter le frontend au gateway pour queue, messages, typing |
| **Export CSV/PDF** | Moyenne | Bouton export déjà en UI, implémenter la logique |
| **Notifications** | Moyenne | Icône cloche existe, connecter aux événements Socket.IO |
| **Paramètres admin** | Basse | Page settings (thème, langue, préférences) |
| **Graphiques/Charts** | Haute | Ajouter une lib chart (recharts ou chart.js) pour performance temporelle et analytics |
| **Recherche globale** | Basse | Barre de recherche unifiée (conversations, contacts, messages) |

---

## 7. RESUME PRIORITES

### Phase 1 - Données existantes non affichées (quick wins)
1. Ajouter graphique PerformanceTemporelle dans Vue d'ensemble
2. Ajouter widget circuit breaker dans Observabilité
3. Afficher charge par poste dans Vue d'ensemble
4. Afficher preview médias dans Conversations
5. Afficher read_only sur les conversations

### Phase 2 - Temps réel et interactivité
6. Connecter Socket.IO pour queue et messages
7. Implémenter notifications temps réel
8. Ajouter deep dive par commercial (fiche agent)

### Phase 3 - Nouvelles vues
9. Implémenter Analytics (graphiques, tendances)
10. Implémenter SLA & Violations
11. Implémenter Galerie médias
12. Enrichir Clients avec suivi appels

### Phase 4 - Fonctionnalités avancées
13. Implémenter Rapports (export PDF/CSV)
14. Implémenter Export global
15. Implémenter Paramètres admin
16. Recherche globale

---

*Généré le 16/02/2026*
