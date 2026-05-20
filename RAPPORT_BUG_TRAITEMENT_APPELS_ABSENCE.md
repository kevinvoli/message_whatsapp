# Rapport d'analyse — Traitement des appels en absence

**Date :** 2026-05-20  
**Statut :** Bugs actifs — corrections requises  

---

## 1. Flux général du traitement

```
DB2 (GICOP)
    │
    ▼  cron sync (~1 min)
order-call-sync.service.ts  ──→  call_log (MySQL)
    │                              (1 ligne par appel)
    │
    ▼  GET /call-logs/mine/missed
PrioritePostePanel.tsx
    │
    ▼  PATCH /call-logs/:id/treat
call_log.service.ts::markTreated()
    │
    ▼  UPDATE call_log SET treated = 1 WHERE ...
```

---

## 2. Bugs identifiés

---

### BUG-1 — N entrées par client, traitement unitaire (cause racine)

**Fichier :** `call_log.service.ts`

**Description :**  
Le sync DB2 crée **une ligne `call_log` par appel manqué**. Si un client appelle 10 fois sans être joint, il y a 10 lignes `treated = 0` pour ce numéro. L'ancienne logique `markTreated(id)` ne traitait qu'**une seule ligne par clic**. Les 9 autres persistaient en base et réapparaissaient au prochain chargement.

**Impact :** L'utilisateur clique "Traité", l'item disparaît. À l'actualisation : les autres lignes du même numéro réapparaissent.

**Correction appliquée :**  
```ts
// markTreated — bulk-treat par téléphone
if (phone) {
  await this.repo.createQueryBuilder()
    .update(CallLog)
    .set({ treated: true })
    .where('commercial_id = :cid AND client_phone = :phone AND treated = 0 AND outcome = :outcome', ...)
    .execute();
}
```
**Problème résiduel :** voir BUG-2, BUG-3, BUG-4.

---

### BUG-2 — `client_phone = ''` bloque le bulk-treat

**Fichier :** `order-call-sync.service.ts`

**Description :**  
Avant le correctif, la ligne était :
```ts
client_phone: normalizePhone(call.remoteNumber ?? ''),
```
`normalizePhone('')` retourne `''` (chaîne vide). Les entrées sans numéro distant ou avec numéro vide avaient donc `client_phone = ''` en base, **pas `null`**.

Dans `markTreated` :
```ts
const phone = log.client_phone?.trim() || null;
if (phone) { // '' est falsy → false → bulk-treat ignoré !
```
Pour ces entrées, le code tombe dans le cas de repli : traitement d'un seul `id`. Les autres entrées en double pour le même numéro ne sont pas traitées.

**Correction appliquée :**
```ts
client_phone: normalizePhone(call.remoteNumber ?? '') || null,  // ✅
```
**Problème résiduel :** toutes les entrées créées AVANT ce correctif ont déjà `client_phone = ''` en base. Elles ne sont pas couvertes par le bulk-treat (voir BUG-5 — données historiques).

---

### BUG-3 — Frontend : `handleTreat` ne recharge pas la liste

**Fichier :** `front/src/components/sidebar/PrioritePostePanel.tsx`

**Description :**  
Après un clic "Traité", le backend bulk-traite **toutes** les entrées du même téléphone (ex : 10 lignes). Mais le frontend ne retire que l'item cliqué :
```ts
if (res.ok) setMissedCalls((prev) => prev.filter((c) => c.id !== callId));
//                                       ↑ seulement l'id cliqué
```
Les 9 autres entrées du même numéro restent **visibles dans le state React** jusqu'à un rechargement manuel. L'utilisateur voit encore 9 fois le numéro affiché, ce qui donne l'impression que "Traité" n'a pas fonctionné.

**Correction requise :**  
Remplacer la mise à jour locale par un rechargement depuis l'API :
```ts
const handleTreat = async (callId: string) => {
  setTreating((prev) => ({ ...prev, [callId]: true }));
  try {
    const res = await fetch(`${API_URL}/call-logs/${callId}/treat`, {
      method: 'PATCH',
      credentials: 'include',
    });
    if (res.ok) await load();  // ← recharge depuis DB (reflète le bulk-treat)
  } catch { /* silencieux */ }
  finally { setTreating((prev) => { const n = { ...prev }; delete n[callId]; return n; }); }
};
```

---

### BUG-4 — QueryBuilder `.update(Entity)` sur `SelectQueryBuilder` — comportement incertain

**Fichier :** `call_log.service.ts`

**Description :**  
Le code utilise :
```ts
await this.repo
  .createQueryBuilder()   // → SelectQueryBuilder<CallLog>
  .update(CallLog)        // ← transition vers UpdateQueryBuilder
  .set({ treated: true })
  .where(...)
  .execute();
```
`repo.createQueryBuilder()` retourne un `SelectQueryBuilder`. Appeler `.update(Entity)` dessus crée un `UpdateQueryBuilder` en **clonant** le builder existant. Selon la version de TypeORM (ici 0.3.28), le `FROM` clause hérité du `SelectQueryBuilder` peut entrer en conflit avec la cible de l'UPDATE, produisant un SQL invalide ou ignoré silencieusement.

**SQL attendu :**
```sql
UPDATE `call_log` SET `treated` = 1 WHERE ...
```

**SQL potentiellement généré (erroné) :**
```sql
UPDATE `call_log` `CallLog` SET `treated` = 1 WHERE ...
-- ou pire : UPDATE  SET `treated` = 1 WHERE ... (table manquante)
```

**Correction recommandée :**  
Utiliser `this.repo.manager.createQueryBuilder()` (EntityManager), qui gère correctement la transition vers UpdateQueryBuilder :
```ts
await this.repo.manager
  .createQueryBuilder()
  .update(CallLog)
  .set({ treated: true })
  .where('commercial_id = :cid AND ...', { cid, ... })
  .execute();
```
**OU** utiliser du SQL brut paramétré (le plus fiable) :
```ts
await this.repo.query(
  'UPDATE call_log SET treated = 1 WHERE commercial_id = ? AND client_phone = ? AND treated = 0 AND outcome = ?',
  [commercial_id, phone, CallOutcome.PasDeRéponse]
);
```

---

### BUG-5 — Données historiques : `client_phone = ''` en base

**Description :**  
Toutes les lignes `call_log` créées avant le correctif BUG-2 ont `client_phone = ''`. Cela représente potentiellement des dizaines ou centaines d'entrées. Pour ces entrées :
- Le bulk-treat par téléphone ne s'applique pas
- Le bouton "Traité" traite un seul ID à la fois
- Les entrées restantes continuent de réapparaître

**Correction requise :**  
Exécuter une migration SQL de nettoyage one-shot :
```sql
UPDATE call_log SET client_phone = NULL WHERE client_phone = '';
```

**À implémenter comme migration TypeORM :**
```ts
// migration : 20260520_fix_call_log_empty_phone.ts
async up(qr: QueryRunner): Promise<void> {
  await qr.query(`UPDATE call_log SET client_phone = NULL WHERE client_phone = ''`);
}
```

---

### BUG-6 — La liste affiche les doublons (même numéro N fois)

**Fichier :** `call_log.service.ts::findMissedByCommercial`

**Description :**  
Si le client `0701234567` a appelé 8 fois sans être joint, la liste affiche 8 lignes avec le même numéro. C'est à la fois confus pour l'utilisateur et révélateur du volume de doublons accumulés.

**Correction recommandée :**  
Dédupliquer par `client_phone` dans la query (garder seulement le plus récent par numéro) :
```ts
findMissedByCommercial(commercial_id: string, limit = 30): Promise<CallLog[]> {
  return this.repo
    .createQueryBuilder('cl')
    .where('cl.commercial_id = :cid', { cid: commercial_id })
    .andWhere('cl.outcome = :outcome', { outcome: CallOutcome.PasDeRéponse })
    .andWhere('cl.treated = 0')
    .andWhere('cl.client_phone IS NOT NULL')
    // Un seul appel par numéro = le plus récent
    .andWhere(qb => {
      const sub = qb.subQuery()
        .select('MAX(cl2.called_at)')
        .from(CallLog, 'cl2')
        .where('cl2.commercial_id = :cid2')
        .andWhere('cl2.client_phone = cl.client_phone')
        .andWhere('cl2.treated = 0')
        .getQuery();
      return `cl.called_at = (${sub})`;
    }, { cid2: commercial_id })
    .orderBy('cl.called_at', 'DESC')
    .take(limit)
    .getMany();
}
```
*Note : cette déduplication n'est valide qu'APRÈS le nettoyage des `client_phone = ''` (BUG-5), sinon les entrées sans numéro ne seraient plus affichées.*

---

## 3. Récapitulatif des corrections par priorité

| Priorité | Bug    | Fichier(s)                              | Type          | Statut     |
|----------|--------|-----------------------------------------|---------------|------------|
| P0       | BUG-3  | `PrioritePostePanel.tsx`                | Frontend      | À faire    |
| P0       | BUG-4  | `call_log.service.ts`                   | Backend       | À faire    |
| P0       | BUG-5  | Migration SQL one-shot                  | Base de données | À faire  |
| P1       | BUG-1  | `call_log.service.ts`                   | Backend       | Partiel ✓  |
| P1       | BUG-2  | `order-call-sync.service.ts`            | Backend       | Corrigé ✓  |
| P2       | BUG-6  | `call_log.service.ts`                   | Backend UX    | À faire    |

---

## 4. Ordre d'application recommandé

```
1. Migration SQL BUG-5 : net toyage client_phone = '' → NULL
   (déployer en premier pour que BUG-2 ne soit plus masqué)

2. Backend BUG-4 : remplacer repo.createQueryBuilder().update()
   par repo.manager.createQueryBuilder().update() dans markTreated + treatAllMine

3. Frontend BUG-3 : remplacer la mise à jour locale par await load()
   dans handleTreat

4. (Optionnel) Backend BUG-6 : déduplication par téléphone dans findMissedByCommercial
```

---

## 5. SQL de diagnostic (vérification en production)

```sql
-- Combien d'entrées avec client_phone vide ?
SELECT COUNT(*) FROM call_log WHERE client_phone = '' AND treated = 0;

-- Distribution des doublons par numéro
SELECT client_phone, commercial_id, COUNT(*) as nb_doublons
FROM call_log
WHERE treated = 0 AND outcome = 'pas_de_réponse'
GROUP BY client_phone, commercial_id
HAVING nb_doublons > 1
ORDER BY nb_doublons DESC
LIMIT 20;

-- Vérifier que l'UPDATE traite bien plusieurs lignes
SELECT id, client_phone, treated, called_at
FROM call_log
WHERE commercial_id = '<uuid_commercial>'
  AND outcome = 'pas_de_réponse'
ORDER BY client_phone, called_at DESC;
```
