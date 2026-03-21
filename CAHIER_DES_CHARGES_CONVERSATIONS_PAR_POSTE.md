# Cahier des charges — Vue des conversations par poste et par commercial (Admin Panel)

**Date :** 2026-03-21
**Projet :** Application de démutualisation et dispatching de conversations
**Stack :** NestJS (backend) · Next.js (admin)
**Scope :** Permettre à l'admin de consulter les conversations filtrées par poste ou par commercial

---

## 1. Contexte et état actuel

### 1.1 Architecture existante

L'application dispose des entités suivantes :

| Entité | Table | Champs clés |
|---|---|---|
| `WhatsappChat` | `whatsapp_chat` | `id`, `chat_id`, `poste_id`, `name`, `status`, `unread_count`, `last_activity_at` |
| `WhatsappPoste` | `whatsapp_poste` | `id`, `name`, `code`, `is_active`, `is_queue_enabled` |
| `WhatsappCommercial` | `whatsapp_commercial` | `id`, `name`, `email`, `poste_id`, `isConnected`, `lastConnectionAt` |
| `WhatsappMessage` | `whatsapp_message` | `id`, `chat_id`, `text`, `direction`, `status`, `timestamp`, `poste_id`, `commercial_id` |

Relations :
- Un **poste** a plusieurs **conversations** (`WhatsappChat.poste_id → WhatsappPoste.id`)
- Un **poste** a plusieurs **commerciaux** (`WhatsappCommercial.poste_id → WhatsappPoste.id`)
- Un **commercial** est rattaché à **un seul poste**
- Un **message** est associé à un commercial (`commercial_id`, nullable)

### 1.2 État du panel admin

Le panel admin dispose d'une vue `conversations` (`ConversationsView.tsx`) qui :
- Affiche **toutes les conversations** sans filtre de poste ou de commercial
- Permet de rechercher par nom, numéro ou contenu de message
- Permet d'afficher les messages d'une conversation et d'y répondre
- Propose un polling toutes les 3 secondes pour les nouveaux messages

**Ce qui manque :**
- Filtrage des conversations par poste
- Filtrage des conversations par commercial
- Vue "conversation d'un poste" accessible depuis la page Postes
- Vue "conversations d'un commercial" accessible depuis la page Commerciaux
- Statistiques de charge par poste/commercial dans la vue conversations

### 1.3 État du backend

Le endpoint `GET /chats` accepte aujourd'hui :
- `chat_id` (filtre optionnel)
- `limit` (défaut 50)
- `offset` (défaut 0)
- `periode` (`today`, `week`, `month`, etc.)

**Ce qui manque :**
- Filtre `poste_id` sur `GET /chats`
- Filtre `commercial_id` sur `GET /chats`
- Compteurs agrégés par poste et par commercial

---

## 2. Objectifs

1. **Filtre poste** : L'admin peut sélectionner un poste et voir uniquement les conversations assignées à ce poste
2. **Filtre commercial** : L'admin peut sélectionner un commercial et voir les conversations dont les messages sortants ont été envoyés par ce commercial
3. **Accès contextuel** : Depuis la page Postes, un lien "Voir les conversations" ouvre la vue filtrée sur ce poste. Idem depuis la page Commerciaux.
4. **Statistiques de contexte** : Quand un filtre est actif, afficher des compteurs rapides (total, actifs, en attente, fermés, non lus)
5. **Navigation fluide** : Conserver l'interface existante de `ConversationsView` et ajouter les filtres sans casser le comportement actuel

---

## 3. Spécifications — Backend

### 3.1 Mise à jour de `GET /chats`

**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.controller.ts`
**Fichier :** `message_whatsapp/src/whatsapp_chat/whatsapp_chat.service.ts`

Ajouter deux paramètres optionnels à la query :

| Paramètre | Type | Description |
|---|---|---|
| `poste_id` | `string` (UUID) | Filtre sur `whatsapp_chat.poste_id` |
| `commercial_id` | `string` (UUID) | Filtre sur les chats ayant au moins un message `direction=OUT` avec ce `commercial_id` |

**Comportement de `commercial_id` :**
Un commercial peut avoir envoyé des messages dans plusieurs conversations. Le filtre retourne les `WhatsappChat` distincts dans lesquels ce commercial a au moins un `WhatsappMessage` avec `direction = 'OUT'` et `commercial_id = :id`.

**Implémentation recommandée (QueryBuilder) :**
```typescript
// Cas poste_id simple
query.andWhere('chat.poste_id = :posteId', { posteId });

// Cas commercial_id : sous-requête EXISTS
query.andWhere(
  `EXISTS (
    SELECT 1 FROM whatsapp_message m
    WHERE m.chat_id = chat.id
      AND m.commercial_id = :commercialId
      AND m.direction = 'OUT'
  )`,
  { commercialId },
);
```

**Réponse :** même format qu'actuellement : `{ data: WhatsappChat[], total: number }`

### 3.2 Nouveau endpoint : compteurs par poste

```
GET /chats/stats/by-poste
```

**Guard :** `AdminGuard`

**Réponse :**
```json
[
  {
    "poste_id": "uuid",
    "poste_name": "Service Client",
    "poste_code": "SC",
    "total": 42,
    "actif": 18,
    "en_attente": 5,
    "ferme": 19,
    "unread_total": 7
  }
]
```

Implémenté via un `QueryBuilder` avec `GROUP BY chat.poste_id` + `JOIN whatsapp_poste`.

### 3.3 Nouveau endpoint : compteurs par commercial

```
GET /chats/stats/by-commercial
```

**Guard :** `AdminGuard`

**Réponse :**
```json
[
  {
    "commercial_id": "uuid",
    "commercial_name": "Jean Dupont",
    "commercial_email": "jean@example.com",
    "poste_id": "uuid",
    "poste_name": "Service Client",
    "conversations_count": 12,
    "messages_sent": 45,
    "isConnected": true
  }
]
```

Implémenté via un `QueryBuilder` joinant `WhatsappMessage` + `WhatsappCommercial` + `WhatsappPoste`, groupé par `commercial_id`.

> Ces deux endpoints sont utilisés pour l'affichage des compteurs de contexte dans le panel admin.

---

## 4. Spécifications — Panel Admin (Frontend)

### 4.1 Mise à jour du type `WhatsappChat` (`definitions.ts`)

S'assurer que les champs suivants sont présents dans le type TypeScript :

```typescript
export type WhatsappChat = {
  // ... champs existants ...
  poste_id?: string | null;
  poste?: Poste | null;          // relation chargée avec la conversation
  channel_id?: string | null;
  status?: 'actif' | 'en attente' | 'fermé';
  unread_count: number;
  last_activity_at?: string | null;
  assigned_at?: string | null;
};
```

### 4.2 Mise à jour de `getChats()` (`api.ts`)

Ajouter les paramètres de filtre optionnels :

```typescript
export async function getChats(
  limit = 50,
  offset = 0,
  periode = 'today',
  posteId?: string,
  commercialId?: string,
): Promise<{ data: WhatsappChat[]; total: number }>
```

La fonction construit l'URL avec les paramètres présents :
```typescript
const params = new URLSearchParams({ limit, offset, periode });
if (posteId) params.set('poste_id', posteId);
if (commercialId) params.set('commercial_id', commercialId);
```

Ajouter aussi les fonctions des nouveaux endpoints :
```typescript
export async function getChatStatsByPoste(): Promise<PosteStats[]>
export async function getChatStatsByCommercial(): Promise<CommercialStats[]>
```

### 4.3 Mise à jour de `ConversationsView.tsx`

#### 4.3.1 Props supplémentaires

Ajouter deux props optionnelles pour le filtrage contextuel :

```typescript
interface ConversationsViewProps {
  initialPosteId?: string;       // Pré-filtre poste (depuis la page Postes)
  initialCommercialId?: string;  // Pré-filtre commercial (depuis la page Commerciaux)
}
```

#### 4.3.2 Barre de filtres

Ajouter une barre de filtres AU-DESSUS de la liste des conversations (panneau gauche), composée de :

**Sélecteur de poste**
- Dropdown : "Tous les postes" + liste des postes actifs
- Affiche le nom et le code du poste (ex : "Service Client (SC)")
- Si `initialPosteId` est fourni : pré-sélectionné et non modifiable (lecture seule + badge)

**Sélecteur de commercial** (affiché seulement quand un poste est sélectionné)
- Dropdown : "Tous les commerciaux" + liste des commerciaux du poste sélectionné
- Affiche le nom + un point coloré (vert si connecté, gris sinon)
- Si `initialCommercialId` est fourni : pré-sélectionné et non modifiable (lecture seule + badge)

**Compteurs de contexte** (sous les sélecteurs, visibles uniquement si un filtre est actif)

```
[ 42 Total ]  [ 18 Actifs ]  [ 5 En attente ]  [ 7 Non lus ]
```

Affichage sous forme de badges colorés :
- Total → gris neutre
- Actifs → vert
- En attente → orange
- Non lus → rouge (si > 0)

**Bouton "Réinitialiser les filtres"** (apparaît si un filtre est actif)

#### 4.3.3 Comportement des filtres

- Changer le filtre **poste** → recharge la liste de conversations + réinitialise le filtre commercial
- Changer le filtre **commercial** → recharge la liste de conversations
- Les filtres sont combinables avec la **recherche textuelle** existante
- Les filtres sont **conservés** lors du polling des 3 secondes
- Les filtres **ne persistent pas** entre les sessions (état local React uniquement)

#### 4.3.4 Indicateur de filtre actif dans le header de la vue

Quand un filtre poste ou commercial est actif, afficher un titre contextuel au-dessus de la liste :

```
Conversations — Service Client (SC)
Conversations — Jean Dupont · Service Client
```

### 4.4 Accès contextuel depuis la vue Postes (`PostesView.tsx`)

Dans le tableau des postes, ajouter une colonne **Actions** (ou enrichir les actions existantes) avec un bouton :

```
[ Voir les conversations ]
```

Au clic → naviguer vers la vue `conversations` avec `initialPosteId` pré-rempli :
```typescript
setView('conversations');
setConversationFilterPosteId(poste.id);
```

Cela nécessite de remonter l'état du filtre au niveau du composant parent `AdminDashboard` (ou via une URL query param selon l'architecture existante).

### 4.5 Accès contextuel depuis la vue Commerciaux (`CommerciauxView.tsx`)

Dans le tableau des commerciaux, ajouter un bouton :

```
[ Voir les conversations ]
```

Au clic → naviguer vers la vue `conversations` avec `initialCommercialId` (et `initialPosteId` du poste du commercial) pré-remplis.

---

## 5. Maquettes fonctionnelles

### 5.1 Vue conversations avec filtres actifs

```
┌─────────────────────────────────────────────────────────────────┐
│  Conversations — Service Client (SC)                             │
├──────────────────────┬──────────────────────────────────────────┤
│ Filtre poste:        │                                          │
│ [ Service Client ▾ ] │                                          │
│                      │   (panneau de conversation)              │
│ Filtre commercial:   │                                          │
│ [ Jean Dupont ▾ ]    │                                          │
│                      │                                          │
│ 42 Total  18 Actifs  │                                          │
│ 5 Attente  7 Non lus │                                          │
│                      │                                          │
│ 🔍 Rechercher...     │                                          │
│──────────────────────│                                          │
│ 📞 Client A          │                                          │
│    Dernier msg…      │                                          │
│──────────────────────│                                          │
│ 📞 Client B          │                                          │
│    Dernier msg…      │                                          │
└──────────────────────┴──────────────────────────────────────────┘
```

### 5.2 Bouton dans la vue Postes

```
┌──────────────────┬──────┬────────────┬─────────────────────────┐
│ Nom              │ Code │ Statut     │ Actions                 │
├──────────────────┼──────┼────────────┼─────────────────────────┤
│ Service Client   │ SC   │ ● Actif    │ [Éditer] [Conversations]│
│ Commercial       │ COM  │ ● Actif    │ [Éditer] [Conversations]│
│ Technique        │ TECH │ ○ Inactif  │ [Éditer] [Conversations]│
└──────────────────┴──────┴────────────┴─────────────────────────┘
```

### 5.3 Bouton dans la vue Commerciaux

```
┌──────────────────┬───────────────────┬────────────┬────────────────────┐
│ Nom              │ Email             │ Connexion  │ Actions            │
├──────────────────┼───────────────────┼────────────┼────────────────────┤
│ Jean Dupont      │ jean@example.com  │ ● En ligne │ [Éditer] [Convs]   │
│ Marie Martin     │ marie@example.com │ ○ Hors     │ [Éditer] [Convs]   │
└──────────────────┴───────────────────┴────────────┴────────────────────┘
```

---

## 6. Spécifications techniques détaillées

### 6.1 Gestion de l'état des filtres dans `AdminDashboard`

L'état des filtres de la vue conversations doit être **géré au niveau du parent** `AdminDashboard` pour permettre la navigation depuis Postes/Commerciaux :

```typescript
// Dans AdminDashboard
const [conversationFilter, setConversationFilter] = useState<{
  posteId?: string;
  commercialId?: string;
}>({});

// Quand on clique "Voir conversations" dans PostesView :
const handleViewPosteConversations = (posteId: string) => {
  setConversationFilter({ posteId });
  setView('conversations');
};

// Quand on clique "Voir conversations" dans CommerciauxView :
const handleViewCommercialConversations = (commercialId: string, posteId: string) => {
  setConversationFilter({ posteId, commercialId });
  setView('conversations');
};

// Réinitialiser le filtre quand on quitte la vue conversations
const handleViewChange = (newView: ViewMode) => {
  if (newView !== 'conversations') {
    setConversationFilter({});
  }
  setView(newView);
};
```

### 6.2 Chargement des listes de postes et commerciaux

Dans `ConversationsView`, charger au montage :
- `GET /postes` → liste des postes pour le sélecteur
- Quand un poste est sélectionné → `GET /commerciaux?poste_id=:id` → liste des commerciaux du poste

Ces données doivent être chargées **une seule fois** au montage (pas à chaque poll).

### 6.3 Polling avec filtres

Le polling silencieux des 3 secondes (déjà existant) doit **conserver les filtres actifs** lors de son appel à `getChats()`. Les paramètres `poste_id` et `commercial_id` actifs sont inclus dans chaque appel de poll.

---

## 7. Priorité et ordre d'implémentation

### Phase 1 — Backend : filtres sur `GET /chats`
- [ ] Ajouter `poste_id` comme query param optionnel dans le controller
- [ ] Ajouter `commercial_id` comme query param optionnel (filtre via sous-requête EXISTS)
- [ ] Mettre à jour le service `WhatsappChatService.findAll()` avec les nouveaux filtres
- [ ] Tester les deux filtres indépendamment et combinés

### Phase 2 — Backend : endpoints de statistiques
- [ ] Créer `GET /chats/stats/by-poste` avec agrégation par poste
- [ ] Créer `GET /chats/stats/by-commercial` avec agrégation par commercial
- [ ] S'assurer que les routes ne rentrent pas en conflit avec `GET /chats/:chat_id`

### Phase 3 — Frontend : mise à jour de l'API layer
- [ ] Ajouter `posteId?` et `commercialId?` à `getChats()` dans `api.ts`
- [ ] Ajouter `getChatStatsByPoste()` dans `api.ts`
- [ ] Ajouter `getChatStatsByCommercial()` dans `api.ts`
- [ ] Ajouter les types `PosteStats` et `CommercialStats` dans `definitions.ts`

### Phase 4 — Frontend : barre de filtres dans `ConversationsView`
- [ ] Ajouter les props `initialPosteId?` et `initialCommercialId?`
- [ ] Créer les états locaux `selectedPosteId`, `selectedCommercialId`
- [ ] Charger la liste des postes au montage
- [ ] Charger la liste des commerciaux quand un poste est sélectionné
- [ ] Intégrer les filtres dans `getChats()` (y compris le poll)
- [ ] Afficher les compteurs de contexte
- [ ] Afficher le titre contextuel quand un filtre est actif
- [ ] Bouton "Réinitialiser les filtres"

### Phase 5 — Frontend : boutons d'accès contextuel
- [ ] Ajouter bouton "Voir les conversations" dans `PostesView.tsx`
- [ ] Ajouter bouton "Voir les conversations" dans `CommerciauxView.tsx`
- [ ] Gérer l'état `conversationFilter` dans `AdminDashboard`
- [ ] Passer `initialPosteId` / `initialCommercialId` à `ConversationsView` via les props

---

## 8. Critères d'acceptation

### Backend
- [ ] `GET /chats?poste_id=:id` retourne uniquement les conversations du poste donné
- [ ] `GET /chats?commercial_id=:id` retourne uniquement les conversations où ce commercial a envoyé au moins un message
- [ ] `GET /chats?poste_id=:id&commercial_id=:id` combine les deux filtres
- [ ] `GET /chats/stats/by-poste` retourne un tableau avec les compteurs par poste
- [ ] `GET /chats/stats/by-commercial` retourne un tableau avec le nombre de conversations et messages par commercial
- [ ] Les filtres sont compatibles avec les paramètres existants (`limit`, `offset`, `periode`)

### Panel Admin
- [ ] Un admin peut sélectionner un poste dans la vue conversations et voir uniquement ses conversations
- [ ] Un admin peut ensuite affiner par commercial au sein du poste sélectionné
- [ ] Les compteurs (total, actifs, en attente, non lus) s'actualisent selon le filtre actif
- [ ] Le filtre est conservé lors des polls de 3 secondes
- [ ] Depuis la page Postes, cliquer "Voir les conversations" ouvre la vue filtrée sur ce poste
- [ ] Depuis la page Commerciaux, cliquer "Voir les conversations" ouvre la vue filtrée sur ce commercial
- [ ] Le titre de la vue indique clairement le filtre actif
- [ ] Le bouton "Réinitialiser" efface tous les filtres et revient à la vue globale
- [ ] La recherche textuelle fonctionne toujours en combinaison avec les filtres de poste/commercial

---

## 9. Hors scope

Les éléments suivants sont **hors scope** de ce cahier des charges :

- Vue conversations en temps réel via WebSocket (le polling existant suffit pour cette feature)
- Statistiques avancées / analytics de performance par commercial (c'est le rôle de la vue `performance`)
- Export CSV/Excel des conversations filtrées
- Historique d'activité d'un commercial (hors conversations WhatsApp)
- Modification des attributions de conversation depuis cette vue (géré par le dispatcher)
- Vue conversations dans le front chat commercial (uniquement dans l'admin)
