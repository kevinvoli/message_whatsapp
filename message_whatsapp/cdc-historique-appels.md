# Cahier des charges — Historique des appels par contact

## Objectif
Permettre à chaque fiche contact d'afficher l'intégralité de l'historique des appels : qui a appelé, quand, combien de temps, quel résultat, avec les notes associées. Chaque mise à jour du statut d'appel doit créer une entrée dans cet historique.

---

## Modèle de données cible

```
Contact (1) ──< CallLog (N) >── Commercial (1)
```

### Entité `CallLog`
| Champ           | Type             | Description                                      |
|-----------------|------------------|--------------------------------------------------|
| id              | uuid (PK)        |                                                  |
| contact_id      | uuid (FK)        | Référence vers `Contact`                         |
| commercial_id   | uuid (FK)        | Référence vers `WhatsappPoste` (commercial)      |
| commercial_name | varchar          | Dénormalisé pour éviter les joins lourds         |
| called_at       | datetime         | Date et heure de l'appel                         |
| call_status     | enum             | `appelé` `rappeler` `non_joignable` `à_appeler`  |
| outcome         | enum (nullable)  | `répondu` `messagerie` `pas_de_réponse` `occupé` |
| duration_sec    | int (nullable)   | Durée de l'appel en secondes                     |
| notes           | text (nullable)  | Notes saisies par le commercial                  |
| created_at      | datetime         |                                                  |
| updated_at      | datetime         |                                                  |

---

## Découpage en tickets

---

### 🎫 TICKET B-01 — Entité `CallLog` (Backend)
**Type :** Backend · NestJS · TypeORM
**Priorité :** Critique (bloquant pour tout le reste)

**Description :**
Créer le module NestJS complet pour l'entité `CallLog`.

**Tâches :**
- [ ] Créer `message_whatsapp/src/call-log/entities/call_log.entity.ts`
  - Décorateurs TypeORM : `@Entity`, `@PrimaryGeneratedColumn('uuid')`, `@ManyToOne` vers `Contact` et `WhatsappPoste`
  - `@CreateDateColumn`, `@UpdateDateColumn`
  - Enum `CallStatus` réutilisé depuis les types existants
- [ ] Créer `call_log.module.ts`, `call_log.service.ts`, `call_log.controller.ts`
- [ ] Enregistrer le module dans `app.module.ts`
- [ ] Migration TypeORM : table `call_log`

**Critère d'acceptation :**
La table `call_log` est créée en base. `CallLogModule` importable sans erreur.

---

### 🎫 TICKET B-02 — Service `CallLogService` (Backend)
**Type :** Backend · NestJS
**Dépend de :** B-01

**Description :**
Implémenter la logique métier du service.

**Méthodes à créer :**

```typescript
// Créer une entrée d'historique
create(dto: CreateCallLogDto): Promise<CallLog>

// Lister tous les appels d'un contact (triés par date DESC)
findByContactId(contact_id: string): Promise<CallLog[]>

// Lister les appels d'un commercial
findByCommercialId(commercial_id: string): Promise<CallLog[]>
```

**DTO `CreateCallLogDto` :**
```typescript
{
  contact_id:     string
  commercial_id:  string
  commercial_name: string
  call_status:    CallStatus
  outcome?:       string
  duration_sec?:  number
  notes?:         string
  called_at?:     Date  // défaut: NOW()
}
```

**Critère d'acceptation :**
Tests unitaires des méthodes `create` et `findByContactId`.

---

### 🎫 TICKET B-03 — Endpoints REST `CallLog` (Backend)
**Type :** Backend · NestJS · REST
**Dépend de :** B-02

**Description :**
Exposer les routes HTTP nécessaires au frontend.

**Routes :**

| Méthode | URL                          | Description                          |
|---------|------------------------------|--------------------------------------|
| GET     | `/contact/:id/call-logs`     | Historique complet d'un contact      |
| POST    | `/contact/:id/call-logs`     | Créer manuellement une entrée        |
| GET     | `/call-logs/commercial/:id`  | Tous les appels d'un commercial      |

**Critère d'acceptation :**
Routes testables via Postman/Thunder. Auth guard en place.

---

### 🎫 TICKET B-04 — Hook dans `updateContactCallStatus` (Backend)
**Type :** Backend · NestJS
**Dépend de :** B-02

**Description :**
Chaque fois qu'un commercial met à jour le statut d'appel d'un contact (via `PATCH /contact/:id/call-status`), créer automatiquement une entrée `CallLog`.

**Modifications dans `ContactService` (ou controller existant) :**
```typescript
// Après la mise à jour du statut :
await this.callLogService.create({
  contact_id:     contactId,
  commercial_id:  currentUser.id,
  commercial_name: currentUser.name,
  call_status:    dto.call_status,
  notes:          dto.call_notes,
  called_at:      new Date(),
});
```

**Critère d'acceptation :**
Appeler `PATCH /contact/:id/call-status` crée une ligne dans `call_log`. Vérifiable en base.

---

### 🎫 TICKET B-05 — Emission WebSocket `call_log:new` (Backend)
**Type :** Backend · WebSocket
**Dépend de :** B-04

**Description :**
Après création d'un `CallLog`, émettre un événement WebSocket pour que le frontend mette à jour la fiche en temps réel sans rechargement.

**Payload :**
```typescript
socket.emit('call_log:new', {
  contact_id: string,
  call_log: CallLog,   // entrée complète sérialisée
})
```

**Critère d'acceptation :**
Ouvrir deux onglets sur la même fiche contact, mettre à jour le statut dans l'un → l'historique se met à jour dans l'autre sans reload.

---

### 🎫 TICKET F-01 — Type `CallLog` côté frontend
**Type :** Frontend · TypeScript
**Dépend de :** B-01

**Description :**
Ajouter l'interface et le transformer dans `front/src/types/chat.ts`.

```typescript
export interface CallLog {
  id: string
  contact_id: string
  commercial_id: string
  commercial_name: string
  called_at: Date
  call_status: CallStatus
  outcome?: string
  duration_sec?: number
  notes?: string
  createdAt: Date
}

// Transformer raw → CallLog
export const transformToCallLog = (raw: RawCallLogData): CallLog => { ... }
```

**Critère d'acceptation :**
Aucune erreur TypeScript sur les usages du type.

---

### 🎫 TICKET F-02 — Chargement des `CallLog` dans le store contact
**Type :** Frontend · Zustand
**Dépend de :** B-03, F-01

**Description :**
Étendre `useContactStore` pour stocker et charger l'historique d'appels.

**Modifications dans `contactStore.ts` :**
```typescript
// Nouvel état
callLogs: Record<string, CallLog[]>   // clé = contact_id

// Nouvelles actions
loadCallLogs: (contact_id: string) => void   // émet socket 'call_logs:get'
addCallLog: (log: CallLog) => void           // ajout temps réel

// Dans selectContact : déclencher loadCallLogs(contact_id)
```

**Nouvel événement socket :**
- Emit : `call_logs:get` → `{ contact_id }`
- Listen : `call_logs:list` → `{ contact_id, call_logs: CallLog[] }`
- Listen : `call_log:new` → `{ contact_id, call_log: CallLog }`

**Critère d'acceptation :**
Sélectionner un contact charge automatiquement son historique d'appels dans le store.

---

### 🎫 TICKET F-03 — Composant `CallLogHistory` (Frontend)
**Type :** Frontend · React
**Dépend de :** F-02

**Description :**
Créer `front/src/components/contacts/CallLogHistory.tsx` qui remplace/complète la section "Historique" dans `ContactDetailView`.

**Affichage par entrée :**
```
┌─────────────────────────────────────────────────────────┐
│ 🟢 Appelé          Jean Dupont          Il y a 2h       │
│    Durée : 3min 42s · Notes : Rappeler vendredi         │
└─────────────────────────────────────────────────────────┘
```

**Champs affichés :**
- Icône colorée selon `call_status`
- `commercial_name`
- `called_at` (relatif + absolu au survol)
- `outcome` si renseigné
- `duration_sec` formaté (ex. "3min 42s")
- `notes` si renseignées

**États :** loading skeleton · empty state · liste paginée (10 par page)

**Critère d'acceptation :**
La section s'affiche dans la fiche contact avec les vraies données backend.

---

### 🎫 TICKET F-04 — Formulaire "Marquer l'appel" enrichi (Frontend)
**Type :** Frontend · React
**Dépend de :** F-03

**Description :**
Enrichir la modale `EditModal` dans `ContactDetailView` pour collecter tous les champs du `CallLog`.

**Champs supplémentaires :**
- `outcome` : radio buttons (Répondu / Messagerie / Pas de réponse / Occupé)
- `duration_sec` : input numérique optionnel (minutes + secondes)
- `called_at` : datetime picker (défaut = maintenant)

**Critère d'acceptation :**
Confirmer l'appel → entrée visible immédiatement dans `CallLogHistory` (via WebSocket ou mise à jour optimiste).

---

## Ordre d'implémentation recommandé

```
B-01 → B-02 → B-03 → B-04 → B-05
                ↓
         F-01 → F-02 → F-03 → F-04
```

**Durée estimée :** 4 à 6 sessions de développement.

---

## Questions ouvertes
1. Le `commercial_id` dans le JWT est-il le `poste_id` ou l'`id` de `Commercial` ?
2. Faut-il une pagination côté backend pour les contacts très actifs (>100 appels) ?
3. Les appels peuvent-ils être modifiés/supprimés après création, ou sont-ils immuables ?
