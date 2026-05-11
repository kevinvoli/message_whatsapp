# Plan — Enrichissement Système Obligations & Clients ERP

**Date :** 2026-05-11 | **Dernière mise à jour :** 2026-05-11  
**Contexte :** Plusieurs lacunes identifiées dans le système d'obligations d'appels :
les appels vers des clients sans présence WhatsApp ne sont pas tous comptabilisés,
la catégorisation est parfois erronée, et les clients ERP historiques sont invisibles
dans la plateforme de messagerie, ce qui fausse les rapports.

---

## État d'avancement global

| Epic | Statut | Notes |
|---|---|---|
| OE-1 Fix catégorisation | ✅ LIVRÉ | Multi-commandes + statut retour |
| OE-2 Sync ERP → Contact | ✅ LIVRÉ | Job nocturne + upsert temps réel |
| OE-3 Matching phone-only | ✅ LIVRÉ | clientPhone existait déjà — OE-3.3 log ajouté |
| OE-4 Rapports segmentés | ✅ LIVRÉ | Badge ERP + filtre admin + métriques |
| OE-5 Résilience | ✅ LIVRÉ | Circuit breaker + retry + refresh catégories nocturne |
| BUG-1 Crash contact_id null | ✅ CORRIGÉ | PrioritePostePanel + type frontend |
| BUG-2 Attribution commerciaux | ✅ CORRIGÉ | Priorité device > phone + sans isConnected |

---

## Chemin d'un appel — Architecture actuelle (après corrections)

```
DB2 call_log
  → OrderCallSyncService.ingestFromDb2()
      │
      ├─ Attribution commercial (pré-résolution)
      │     Priorité 1 : deviceId → poste → commercial assigné au poste  [le plus précis]
      │     Priorité 2 : localNumber → phone du commercial                [fallback]
      │
      ├─ Si DB2 indisponible (circuit breaker) :
      │     → save call_event_unresolved (reason: 'db2_unavailable')
      │     → retryUnmatchedObligations() reprend automatiquement toutes les 5 min
      │
      ├─ resolveCategoryByClientId(clientIdDb2, orderDb)
      │     → TOUTES les commandes valides du client (sans filtre date)
      │     → Livraison historique = priorité absolue → COMMANDE_AVEC_LIVRAISON
      │     → Aucune livraison + dernière cmd annulée → COMMANDE_ANNULEA
      │     → Aucune livraison + cmd en cours       → JAMAIS_COMMANDE
      │     → Aucune commande jamais                → JAMAIS_COMMANDE
      │
      ├─ Upsert Contact DB1 (contact_source='erp_import', conversion_status='client')
      │     → Preserve contact_source='whatsapp' si contact WA déjà existant
      │
      └─ tryMatchCallToTask(clientPhone, resolvedCategory, posteId)
            → cherche CallTask PENDING de la bonne catégorie
            → marque DONE, incrémente batch

Sync nocturne 02h00 (ErpClientSyncJob)
  DB2 users + commandes valides
    → crée/met à jour Contact DB1
    → contact_source='erp_import', conversion_status='client'
    → jamais de Conversation ni WhatsappChat
```

---

## Définitions métier officielles des 3 catégories d'obligation

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
3. Aucune livraison + aucune annulation de la dernière cmd      → SANS COMMANDE
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

---

## Epics & User Stories — Détail

---

### Epic OE-1 — Fix catégorisation ✅ LIVRÉ

**US OE-1.1 ✅ — Logique exhaustive sur toutes les commandes**

Implémentée dans `resolveCategoryByClientId()` (`order-call-sync.service.ts`).
Charge toutes les commandes valides, applique la priorité livraison absolue.

**US OE-1.2 ✅ — Prise en compte du statut etat (retour) sur la dernière commande**

Statut retour vérifié uniquement sur la dernière commande (cohérent : annulé = dernière
commande annulée). Les commandes plus anciennes avec retour sont ignorées si une livraison
a eu lieu (la livraison prime).

---

### Epic OE-2 — Sync clients ERP → Contact DB1 ✅ LIVRÉ

#### Migrations livrées

| Fichier | Contenu |
|---|---|
| `20260511_add_contact_source.ts` (`AddContactSourceToContact1747009000001`) | `contact_source ENUM('whatsapp','erp_import') NOT NULL DEFAULT 'whatsapp'` |
| `20260511_nullable_contact_id_in_call_log.ts` (`NullableContactIdInCallLog1747008120001`) | `contact_id` nullable + colonne `client_phone VARCHAR(50) NULL` dans `call_log` |

#### Job nocturne `ErpClientSyncService` ✅

- Fichier : `src/erp-client-sync/erp-client-sync.service.ts`
- Cron : `0 2 * * *` (chaque nuit à 02h00)
- Jointure `INNER JOIN commandes c ON c.id_client = u.id AND c.valid = 1` — uniquement les clients avec au moins une commande valide
- Traitement par chunks de 100 pour éviter l'overflow mémoire
- Contact existant → met à jour `client_category` + `order_client_id`, préserve `contactSource`
- Contact absent → crée avec `contactSource = 'erp_import'`, `conversion_status = 'client'`, `call_status = 'À_APPeler'`
- Ne crée jamais de `Conversation` ni de `WhatsappChat`

#### Upsert temps réel dans `resolveClientCategory()` ✅

À chaque appel entrant, si un contact DB2 est identifié, un contact DB1 est créé/mis à jour
immédiatement (sans attendre le job nocturne). `conversion_status = 'client'` sur création.

---

### Epic OE-3 — Obligation matching pour contacts sans chat ⏳ PARTIEL

**US OE-3.1 ✅ — Chemin phone-only fonctionnel**

`tryMatchCallToTask()` accepte les appels sans `contact_id` (champ rendu nullable).
`client_phone` ajouté dans `call_log` pour tracer le numéro même sans contact WA.

**US OE-3.2 ✅ — Audit `clientPhone` dans `call_task`**

Le champ `clientPhone VARCHAR(50) NULL` existait déjà dans l'entité `CallTask` et
était déjà renseigné par `tryMatchCallToTask()`. Aucune migration nécessaire.

**US OE-3.3 ✅ — Log `CALL_MATCHED_ERP_ONLY`**

Helper privé `logIfErpOnly(phone, callEventId)` ajouté dans `OrderCallSyncService`.
Vérifie si le contact DB1 est absent ou de type `erp_import`. Log émis après chaque
match réussi dans `matchObligation()` et `retryUnmatchedObligations()`.

---

### Epic OE-4 — Rapports segmentés ✅ LIVRÉ

**US OE-4.1 ✅ — Badge "Client ERP" dans `GicopReportPanel`**

Fichier : `front/src/components/chat/GicopReportPanel.tsx`
Badge amber "Client ERP" affiché quand `contact.contact_source === 'erp_import'`.

**US OE-4.2 ✅ — Filtre par source dans l'admin**

Fichier : `admin/src/app/ui/ClientsView.tsx`
Sélecteur "Toutes les sources / WhatsApp / ERP importé" dans les onglets Annuaire et Portefeuille.
Badge amber "ERP" sur chaque ligne de contact importé.

**US OE-4.3 ✅ — Métriques : exclusion ERP des "nouveaux contacts"**

Fichier : `src/metriques/metriques.service.ts`
`nouveauxContactsAujourdhui` exclut les contacts `contactSource = 'erp_import'` via filtre
SQL dans le CASE WHEN. Les contacts ERP sont de vieux clients, pas de nouvelles acquisitions.

---

### Epic OE-5 — Qualité & Résilience ✅ LIVRÉ

**US OE-5.1 ✅ — Circuit breaker DB2**

Fichier : `src/order-call-sync/order-call-sync.service.ts`, méthode `matchObligation()`
Quand `!this.orderDb` :
- Sauvegarde l'appel dans `call_event_unresolved` (reason: `'db2_unavailable'`)
- Retourne `{ matched: false, reason: 'db2_unavailable' }`
- `retryUnmatchedObligations()` (cron toutes les 5 min) reprend automatiquement les appels en attente

**US OE-5.2 ✅ — Refresh catégorie lors du sync nocturne**

Second pass ajouté dans `ErpClientSyncService.syncErpClients()` via `refreshStaleCategories()`.
Après le batch principal, charge tous les contacts DB1 avec `order_client_id NOT NULL` absents
de la liste DB2 courante (situation changée — commandes invalidées). Recalcule la catégorie via
`resolveCategoryByClientId()` et met à jour si elle a changé. Résultat : `${refreshed} recatégorisés`.

---

## Bugs identifiés et corrigés

### BUG-1 ✅ — Crash frontend `contact_id.slice(-8)` (2026-05-11)

**Symptôme :** `TypeError: Cannot read properties of null (reading 'slice')` dans
`PrioritePostePanel.tsx` ligne 145.

**Cause :** `contact_id` dans `MissedCall` rendu nullable côté backend mais le frontend
appelait `.slice(-8)` sans garde.

**Fichiers corrigés :**
- `front/src/components/sidebar/PrioritePostePanel.tsx` — `call.client_phone ?? call.contact_id?.slice(-8) ?? '—'`
- `front/src/types/chat.ts` — `contact_id: string | null`, `client_phone?: string | null`
- `front/src/store/contactStore.ts` — guard `if (!log.contact_id) return;`

---

### BUG-2 ✅ — Tous les appels attribués au même commercial (2026-05-11)

**Symptôme :** 100 % des `call_log` créés en DB1 portent le même `commercial_id`,
peu importe quel commercial a effectivement passé l'appel.

**Cause racine (double) :**

1. **Ordre de priorité inversé** — `commercialByPhone` (basé sur `localNumber`) était
   vérifié en premier. Si `localNumber` est un numéro de trunk/ligne partagée du système
   GICOP, il matche toujours le même commercial dans DB1, et `commercialByDevice` n'est
   jamais consulté.

2. **Filtre `isConnected: true`** — La query qui cherche le commercial au poste filtrait
   sur `isConnected: true`. Un commercial peut avoir passé un appel sans être actuellement
   connecté à la messagerie, rendant `commercialByDevice` vide hors des heures de connexion.

**Fix appliqué dans `order-call-sync.service.ts` :**

```typescript
// AVANT (buggué)
const commercialIdDb1 =
  (normalizedLocal ? commercialByPhone.get(normalizedLocal) : undefined)
  ?? commercialByDevice.get(call.deviceId)
  ?? null;

// APRÈS (corrigé)
// Priorité 1 : device → poste → commercial (source physique, sans filtre isConnected)
// Priorité 2 : localNumber → phone commercial (fallback si device inconnu)
const commercialIdDb1 =
  commercialByDevice.get(call.deviceId)
  ?? (normalizedLocal ? commercialByPhone.get(normalizedLocal) : undefined)
  ?? null;
```

La query commercial-par-poste passe de `isConnected: true` à un simple `deletedAt: IsNull()`.

---

## Travaux restants (backlog)

Toutes les épics du plan sont livrées. Aucun item en attente.

---

## Règles métier validées (2026-05-11)

| Question | Règle validée |
|---|---|
| Client avec commande en cours (non livrée, non annulée) | → **Sans commande** (pas encore livré = pas de livraison historique) |
| Client avec livraison ancienne + annulation récente | → **Livré** (la livraison historique prime toujours) |
| Seuil temporel pour "livré" | **Aucun seuil** — une livraison d'il y a 5 ans compte |
| Seuil temporel pour "annulé" | Basé sur la **dernière commande** uniquement |
| "Sans commande" | **Jamais commandé** depuis toujours (pas de commande valide en DB2) |
| Contacts ERP dans métriques "nouveaux" | **Exclus** — ce sont de vieux clients ERP, pas des acquisitions |
| Attribution commerciale d'un appel | **Device → poste → commercial** en priorité ; phone commercial en fallback |

## Questions métier restantes à trancher

1. **Seuil historique ERP** : faut-il importer TOUS les clients DB2 avec une
   commande (même vieille de 5 ans), ou seulement ceux avec une commande dans les
   N derniers mois ? *(Actuellement : tous, sans filtre de date)*

2. **Contacts ERP dans le chat commercial** : ces contacts importés sans chat
   doivent-ils apparaître dans la liste de conversations des commerciaux, ou
   uniquement dans les rapports/stats admin ? *(Actuellement : invisibles du chat)*

3. **Attribution commerciale des contacts ERP** : qui est responsable d'un
   contact ERP importé ? Le commercial du poste qui l'a appelé ? Personne ?
   *(Actuellement : `commercial_id = null` jusqu'au premier appel)*

---

*Plan rédigé le 2026-05-11. Mis à jour le 2026-05-11.*  
*Règles catégories validées le 2026-05-11.*  
*BUG-1 et BUG-2 corrigés le 2026-05-11.*
