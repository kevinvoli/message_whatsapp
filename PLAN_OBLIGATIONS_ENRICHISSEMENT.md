# Plan — Enrichissement Système Obligations & Clients ERP

**Date :** 2026-05-11  
**Contexte :** Plusieurs lacunes identifiées dans le système d'obligations d'appels :
les appels vers des clients sans présence WhatsApp ne sont pas tous comptabilisés,
la catégorisation est parfois erronée, et les clients ERP historiques sont invisibles
dans la plateforme de messagerie, ce qui fausse les rapports.

---

## Diagnostic — État actuel

### Chemin d'un appel dans le système

```
DB2 call_log
  → OrderCallSyncService.ingestFromDb2()
      → resolveClientCategory(remoteNumber)   [requête DB2, pas de filtre date sur commandes]
      → tryMatchCallToTask(clientPhone, resolvedCategory, posteId)
          → si resolvedCategory null : resolveContactCategory(phone)  [requête DB1 uniquement]
          → cherche CallTask PENDING de la bonne catégorie
          → marque DONE, incrémente batch
```

### Définitions métier officielles des 3 catégories d'obligation

> ⚠️ Ces règles sont les définitions de référence validées — elles priment sur toute
> implémentation antérieure.

| Catégorie | Définition métier | Condition technique |
|---|---|---|
| **Sans commande** | Client n'ayant **jamais** passé de commande sur la plateforme, depuis toujours | Aucune commande valide en DB2 pour ce numéro |
| **Livré** | Client ayant **au moins une fois** reçu une livraison, même si c'était il y a des années | `orders.some(o => o.dateLivree != null && o.trueCancel !== 1)` |
| **Annulé** | Client ayant passé **au moins une commande** ET dont la **dernière commande est annulée** (et n'a jamais eu de livraison) | Aucune livraison historique + dernière commande `trueCancel = 1` ou statut retour |

**Priorité de résolution :**
```
1. Au moins UNE livraison (dateLivree non null, trueCancel ≠ 1) → LIVRÉ   (prime sur tout)
2. Aucune livraison + dernière commande annulée                 → ANNULÉ
3. Aucune livraison + aucune annulation de la dernière cmd      → SANS COMMANDE (commande en cours = traité comme sans commande)
4. Aucune commande jamais                                       → SANS COMMANDE
```

**Exemples de cas limites :**

| Historique client | Catégorie |
|---|---|
| Livraison en 2021, puis annulation en 2024 | **Livré** (la livraison historique prime) |
| Commande livrée + commande en cours | **Livré** |
| Commande annulée (seule commande) | **Annulé** |
| Plusieurs commandes, toutes annulées | **Annulé** (dernière = annulée) |
| Commande en cours non livrée, non annulée | **Sans commande** (pas encore livré) |
| Jamais commandé | **Sans commande** |

### Problème 1 — Catégorisation incomplète

`resolveClientCategory()` (`order-call-sync.service.ts` ~ligne 489) prend uniquement
**la commande la plus récente** du client. Cas non couverts avec les règles métier :

| État réel du client | Résultat actuel | Résultat attendu |
|---|---|---|
| Livraison 2021 + annulation 2024 | `COMMANDE_ANNULEA` (bug) | `COMMANDE_AVEC_LIVRAISON` |
| Livraison + commande en cours | `JAMAIS_COMMANDE` ou `AVEC_LIVRAISON` selon chance | `COMMANDE_AVEC_LIVRAISON` |
| Commande en cours (pas livrée, pas annulée) | `JAMAIS_COMMANDE` | `JAMAIS_COMMANDE` (OK selon règle métier) |
| N'est pas enregistré dans DB2 | `JAMAIS_COMMANDE` | idem (OK) |

**Règle correcte à implémenter :**
```typescript
// 1. Récupérer TOUTES les commandes valides du client
const orders = await getAll(clientIdDb2);
if (orders.length === 0) return JAMAIS_COMMANDE;

// 2. Livré en priorité absolue (même une seule livraison historique suffit)
const hasAnyDelivery = orders.some(o => o.dateLivree != null && o.trueCancel !== 1);
if (hasAnyDelivery) return COMMANDE_AVEC_LIVRAISON;

// 3. Pas de livraison → regarder la DERNIÈRE commande seulement
const lastOrder = orders.sort((a, b) => b.dateEnreg - a.dateEnreg)[0];
const isLastCancelled = lastOrder.trueCancel === 1 || isStatusRetour(lastOrder);
if (isLastCancelled) return COMMANDE_ANNULEA;

// 4. Commande en cours ou jamais commandé → sans commande
return JAMAIS_COMMANDE;
```

### Problème 2 — Clients sans compte WhatsApp exclus

- Si DB2 est indisponible lors du call sync, `resolveClientCategory()` retourne
  `JAMAIS_COMMANDE` par défaut → catégorie erronée.
- `resolveContactCategory()` (fallback dans `CallObligationService` ligne ~415) ne
  lit que `contact.client_category` en DB1. Les clients sans chat WhatsApp n'ont pas
  de `Contact` en DB1 → retourne `null` → appel classé `JAMAIS_COMMANDE` ou rejeté.
- Résultat : appels légitimes de clients ERP-only non comptabilisés dans les obligations.

### Problème 3 — Clients ERP historiques invisibles

DB2 contient des milliers de clients avec des commandes réelles qui n'ont jamais
utilisé WhatsApp. Ces clients :
- N'existent pas dans `contact` (DB1)
- Ne peuvent pas être retrouvés sans faire une requête DB2 à chaque appel reçu
- Ne peuvent pas être affichés dans `GicopReportPanel`
- Faussent les statistiques "nouveaux clients" vs "anciens clients"

### Problème 4 — Rapports non segmentés

Quand un contact ERP-only existera en DB1, les rapports GICOP et les stats admin
ne pourront pas distinguer :
- Un client actif sur WhatsApp (canal principal)
- Un client importé de l'ERP sans chat (historique/ERP-only)

---

## Architecture proposée — Meilleure méthode

### Principe directeur

> **DB2 = source de vérité** pour les clients et commandes.  
> **DB1 = cache métier** pour les décisions en temps réel.

L'approche actuelle (requête DB2 à chaque appel) est fragile : si DB2 est lent ou
indisponible, les catégories sont fausses. La meilleure architecture est un **sync
nocturne DB2 → DB1** qui pré-calcule les catégories et crée les contacts manquants.
Le matching d'obligations devient alors **100 % DB1** (rapide, sans dépendance DB2).

```
Sync nocturne (2h du matin)
  DB2 users + commandes
    → crée/met à jour Contact DB1 (avec contact_source, client_category)

Temps réel (appel entrant)
  call_event DB2 → OrderCallSyncService
    → normalise le numéro → cherche Contact DB1 par phone
    → catégorie lue dans Contact.client_category (DB1, déjà à jour)
    → tryMatchCallToTask() entièrement DB1
```

---

## Epics & User Stories

### Epic OE-1 — Fix catégorisation (P0, sans migration)

**US OE-1.1 — Logique exhaustive sur toutes les commandes**

Modifier `resolveClientCategory()` dans `order-call-sync.service.ts` :

```typescript
// 1. Récupérer TOUTES les commandes valides du client (sans filtre de date)
const orders = await cmdRepo
  .createQueryBuilder('c')
  .where('c.idClient = :clientIdDb2', { clientIdDb2 })
  .andWhere('c.valid = 1')
  .select(['c.id', 'c.trueCancel', 'c.dateLivree', 'c.dateEnreg'])
  .getMany();

if (orders.length === 0) return CallTaskCategory.JAMAIS_COMMANDE;

// 2. Livré = priorité absolue (même une seule livraison historique suffit)
const hasAnyDelivery = orders.some(o => o.dateLivree != null && o.trueCancel !== 1);
if (hasAnyDelivery) return CallTaskCategory.COMMANDE_AVEC_LIVRAISON;

// 3. Pas de livraison → vérifier si la DERNIÈRE commande est annulée
const lastOrder = [...orders].sort(
  (a, b) => new Date(b.dateEnreg).getTime() - new Date(a.dateEnreg).getTime()
)[0];
if (lastOrder.trueCancel === 1) return CallTaskCategory.COMMANDE_ANNULEA;

// 4. Vérifier le statut etat (retour) de la dernière commande
const lastStatusRepo = this.orderDb.getRepository(OrderCommandStatus);
const lastStatus = await lastStatusRepo
  .createQueryBuilder('s')
  .where('s.idCommande = :id', { id: lastOrder.id })
  .andWhere('s.valid = 1')
  .orderBy('s.dateEnreg', 'DESC')
  .limit(1)
  .select(['s.etat'])
  .getOne();
if (lastStatus && ORDER_COMMAND_STATUS_ETAT_RETOUR.includes(lastStatus.etat)) {
  return CallTaskCategory.COMMANDE_ANNULEA;
}

// 5. Commande en cours (non livrée, non annulée) → SANS COMMANDE (règle métier validée)
return CallTaskCategory.JAMAIS_COMMANDE;
```

**US OE-1.2 — Prise en compte du statut etat (retour) uniquement sur la dernière commande**

Le statut "retour" n'est vérifié que sur la **dernière commande** (cohérent avec la règle métier :
annulé = dernière commande annulée). Les statuts retour sur des commandes plus anciennes sont
ignorés si une livraison a eu lieu (la livraison prime).

---

### Epic OE-2 — Sync clients ERP → Contact DB1 (P1)

#### Migration OE-2-M1

```sql
ALTER TABLE contact ADD COLUMN contact_source ENUM('whatsapp', 'erp_import')
  NOT NULL DEFAULT 'whatsapp' AFTER phone;

ALTER TABLE contact ADD COLUMN erp_client_id INT NULL DEFAULT NULL
  COMMENT 'ID DB2 users.id — null si origin WhatsApp';

ALTER TABLE contact MODIFY COLUMN chat_id VARCHAR(100) NULL;
-- chat_id déjà nullable ? Vérifier — les contacts ERP n'auront pas de chat_id
```

#### Job nightly `ErpClientSyncJob` (nouveau module `src/erp-client-sync/`)

Exécuté chaque nuit à 02h00 (cron `0 2 * * *`).

**Logique :**
1. Récupérer tous les clients DB2 (`users` avec `type = CLIENT, valid = 1`) qui ont
   au moins une commande valide.
2. Pour chaque client DB2 :
   a. Normaliser le téléphone.
   b. Chercher un `Contact` en DB1 par `phone`.
   c. Si trouvé : mettre à jour `client_category` + `erp_client_id` si absent.
   d. Si absent : créer un `Contact` avec :
      - `phone` = numéro normalisé
      - `name` = nom DB2
      - `contact_source = 'erp_import'`
      - `erp_client_id` = id DB2
      - `chat_id = null` (pas de chat WhatsApp)
      - `client_category` = catégorie calculée depuis DB2
      - `commercial_id = null` (non assigné)
3. Logger le nombre de créations/mises à jour.

**Règle critique :** ne JAMAIS créer de `Conversation` pour ces contacts.
Ils doivent exister dans `contact` mais rester invisibles du chat commercial.

#### Mise à jour de `resolveClientCategory()`

Après avoir résolu la catégorie depuis DB2, **toujours** upsert le contact DB1 :

```typescript
// Après résolution de la catégorie
await this.contactRepo.upsert(
  {
    phone: normalizedPhone,
    client_category: resolvedCategory,
    contact_source: 'erp_import',   // ne remplace pas 'whatsapp' si déjà présent
    erp_client_id: clientIdDb2,
  },
  {
    conflictPaths: ['phone'],
    skipUpdateIfNoValuesChanged: true,
    // Ne pas écraser contact_source si déjà 'whatsapp'
  },
);
```

Cela garantit que même sans le job nocturne, les contacts ERP se créent à la
première occurrence d'un appel.

---

### Epic OE-3 — Obligation matching pour contacts sans chat (P1)

**US OE-3.1 — Vérification du chemin phone-only**

Confirmer que `tryMatchCallToTask()` fonctionne déjà pour les appels sans
`contact_id` en DB1 (test d'intégration avec un numéro inexistant dans `contact`).

**US OE-3.2 — Propagation catégorie dans `call_task`**

Ajouter un champ `client_phone_normalized` dans `call_task` pour permettre
l'audit (quel numéro a rempli quelle tâche) sans dépendance au contact_id.

**US OE-3.3 — Log explicite matching non-WA**

Dans `tryMatchCallToTask()`, quand `task.clientPhone` est un numéro sans
`Contact` en DB1, loguer `CALL_MATCHED_ERP_ONLY` pour suivi opérationnel.

---

### Epic OE-4 — Rapports segmentés (P2)

#### Migration OE-4-M1

Aucune migration supplémentaire si OE-2-M1 est appliquée (le champ
`contact_source` suffit pour le filtrage).

#### US OE-4.1 — GicopReportPanel — badge "Client ERP"

Dans `front/src/components/chat/GicopReportPanel.tsx`, si le contact a
`contact_source = 'erp_import'` (nouveau champ dans le dossier ou contact) :
- Afficher un badge "Client ERP" / "Ancien client sans chat"
- Pas de préfill chat_id (pas de conversation associée)

#### US OE-4.2 — Stats admin — filtre par source

Dans l'admin panel (`admin/`), ajouter un filtre dans les vues de rapport :
- "Tous les contacts"
- "Uniquement WhatsApp actifs"
- "Uniquement ERP importés"

#### US OE-4.3 — Call obligation stats — exclusion ERP-only des rapports

Le compte `reportsRequired` dans `getStatus()` ne doit pas inclure
les contacts ERP-only qui n'ont pas de conversation active.
(Ce point est déjà correct car `getActiveBlockConversations()` ne retourne
que des conversations existantes — les contacts sans chat n'ont pas de conv.)

---

### Epic OE-5 — Qualité & Résilience (P2)

**US OE-5.1 — Circuit breaker DB2**

Si DB2 est indisponible lors du sync appels, ne pas assigner `JAMAIS_COMMANDE`
par défaut. À la place :
- Mettre l'appel en queue "à re-catégoriser" (table `pending_category_resolution`)
- Job de rattrapage toutes les 15 min pour les appels non catégorisés

**US OE-5.2 — Refresh catégorie lors du sync nocturne**

Relire DB2 pour tous les contacts `erp_import` et `whatsapp` en DB1,
mettre à jour `client_category` si changement détecté.
Cela maintient les catégories à jour sans requête DB2 à chaque appel.

---

## Ordre d'implémentation recommandé

| Priorité | Epic | Effort | Impact |
|---|---|---|---|
| **P0** | OE-1.1 Fix catégorisation multi-commandes | S (2h) | Haut — corrige faux `JAMAIS_COMMANDE` |
| **P1** | OE-2 Migration + ErpClientSyncJob | M (1j) | Haut — crée clients ERP sans chat |
| **P1** | OE-2 Upsert contact dans resolveClientCategory | XS (30min) | Haut — rattrapage temps réel |
| **P2** | OE-4.1 Badge ERP dans GicopReportPanel | S (2h) | Moyen — clarté rapports |
| **P2** | OE-4.2 Filtre admin par source | M (4h) | Moyen — stats fiables |
| **P3** | OE-5.1 Circuit breaker DB2 | M (4h) | Moyen — résilience |
| **P3** | OE-5.2 Refresh catégorie nocturne | S (2h) | Bas — maintenance automatique |

---

## Règles métier validées (2026-05-11)

| Question | Règle validée |
|---|---|
| Client avec commande en cours (non livrée, non annulée) | → **Sans commande** (pas encore livré = pas de livraison historique) |
| Client avec livraison ancienne + annulation récente | → **Livré** (la livraison historique prime toujours) |
| Seuil temporel pour "livré" | **Aucun seuil** — une livraison d'il y a 5 ans compte |
| Seuil temporel pour "annulé" | Basé sur la **dernière commande** uniquement |
| "Sans commande" | **Jamais commandé** depuis toujours (pas de commande valide en DB2) |

## Questions métier restantes à trancher

1. **Seuil historique ERP** : faut-il importer TOUS les clients DB2 avec une
   commande (même vieille de 5 ans), ou seulement ceux avec une commande dans les
   N derniers mois ?

2. **Contacts ERP dans le chat commercial** : ces contacts importés sans chat
   doivent-ils apparaître dans la liste de conversations des commerciaux, ou
   uniquement dans les rapports/stats admin ?

3. **Attribution commerciale des contacts ERP** : qui est responsable d'un
   contact ERP importé ? Le commercial du poste qui l'a appelé ? Personne ?

---

*Plan rédigé le 2026-05-11. Règles catégories validées le 2026-05-11.*
*Questions 2-3 à trancher avant démarrage implémentation P1.*
