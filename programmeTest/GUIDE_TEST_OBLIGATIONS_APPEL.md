# Guide — Validation des obligations d'appel (simulation DB2)

## Contexte

Le système lit les appels depuis la table `call_logs` de **DB2** (plateforme commandes) toutes les **5 minutes** via un cron. Pour chaque appel éligible, il détermine la catégorie du client en consultant la table `commandes` DB2, puis valide la tâche correspondante dans DB1.

---

## Conditions requises pour qu'un appel compte

### Conditions générales (valables pour les 3 catégories)

| Champ DB2 | Valeur requise | Raison |
|-----------|---------------|--------|
| `call_logs.call_type` | `'outgoing'` | Seuls les appels sortants comptent |
| `call_logs.duration` | `>= 90` secondes | Durée minimale obligatoire |
| `call_logs.id_commercial` | ID DB2 du commercial | Permet de retrouver le poste |
| `call_logs.call_timestamp` | > dernier timestamp du curseur | Sinon ignoré (déjà traité) |

### Ce qui détermine la catégorie (lu dans `commandes` DB2)

| Catégorie | Condition sur la table `commandes` |
|-----------|----------------------------------|
| `commande_annulee` | Client a une commande avec `true_cancel = 1` ET `valid = 1` |
| `commande_avec_livraison` | Client a une commande avec `date_livree IS NOT NULL` ET `true_cancel = 0` ET `valid = 1` |
| `jamais_commande` | Aucune commande `valid = 1` trouvée pour ce client |

> **Remarque** : si `id_client` est absent dans `call_logs`, le système cherche le client par `remote_number` dans la table `users` DB2. Si aucun client n'est trouvé, la catégorie par défaut est `jamais_commande`.

---

## Étape 1 — Récupérer les paramètres du commercial (sur DB1)

Avant d'exécuter les SQL sur DB2, récupère les identifiants du commercial concerné :

```sql
-- Sur DB1
SELECT
    c.name                AS commercial_name,
    c.phone               AS local_number_sim,
    m.external_id         AS id_commercial_db2,
    p.code                AS poste_code
FROM whatsapp_commercial c
JOIN commercial_identity_mapping m ON m.commercial_id = c.id
JOIN whatsapp_poste p ON p.id = c.poste_id
WHERE c.email = 'aminata.coulibaly@gicop.ci'; -- ← changer l'email
```

### Correspondance commerciaux (données de seed)

| Commercial | Email | `id_commercial_db2` |
|-----------|-------|-------------------|
| Aminata Coulibaly | aminata.coulibaly@gicop.ci | `101` |
| Fatou Diallo | fatou.diallo@gicop.ci | `102` |
| Mariame Traore | mariame.traore@gicop.ci | `103` |
| Binta Kone | binta.kone@gicop.ci | `104` |
| Adama Sangare | adama.sangare@gicop.ci | `105` |

---

## Étape 2 — Insérer les 3 appels dans DB2

Remplace les variables avant d'exécuter :

| Variable | Valeur à renseigner |
|----------|-------------------|
| `[ID_COMMERCIAL_DB2]` | `external_id` trouvé à l'étape 1 (ex : `101`) |
| `[LOCAL_NUMBER]` | Numéro SIM du commercial (ex : `+2250701234501`) |

---

### Appel 1 — Catégorie `commande_annulee`

> Le client appelé doit avoir une commande avec `true_cancel = 1`.

```sql
-- 1. Créer un client test dans DB2
INSERT INTO users (id, type, nom, prenoms, phone, statut, valid)
VALUES (99001, 1, 'Client', 'TestAnnule', '2250799001001', 1, 1);

-- 2. Créer une commande annulée pour ce client
INSERT INTO commandes (id, id_client, id_commercial, valid, true_cancel, statut, date_enreg)
VALUES (99001, 99001, [ID_COMMERCIAL_DB2], 1, 1, 0, NOW());

-- 3. Enregistrer l'appel sortant
INSERT INTO call_logs (
    id, id_commercial, id_client, device_id,
    call_type, local_number, remote_number,
    duration, call_timestamp, received_at
)
VALUES (
    UUID(), [ID_COMMERCIAL_DB2], 99001, 'device-test-01',
    'outgoing', '[LOCAL_NUMBER]', '2250799001001',
    120, NOW(), NOW()
);
```

---

### Appel 2 — Catégorie `commande_avec_livraison`

> Le client appelé doit avoir une commande avec `date_livree IS NOT NULL` et `true_cancel = 0`.

```sql
-- 1. Créer un client test dans DB2
INSERT INTO users (id, type, nom, prenoms, phone, statut, valid)
VALUES (99002, 1, 'Client', 'TestLivre', '2250799002002', 1, 1);

-- 2. Créer une commande livrée pour ce client
INSERT INTO commandes (id, id_client, id_commercial, valid, true_cancel, date_livree, statut, date_enreg)
VALUES (99002, 99002, [ID_COMMERCIAL_DB2], 1, 0, NOW(), 0, NOW());

-- 3. Enregistrer l'appel sortant
INSERT INTO call_logs (
    id, id_commercial, id_client, device_id,
    call_type, local_number, remote_number,
    duration, call_timestamp, received_at
)
VALUES (
    UUID(), [ID_COMMERCIAL_DB2], 99002, 'device-test-01',
    'outgoing', '[LOCAL_NUMBER]', '2250799002002',
    120, NOW(), NOW()
);
```

---

### Appel 3 — Catégorie `jamais_commande`

> Le client appelé ne doit avoir **aucune** commande valide dans DB2.

```sql
-- 1. Créer un client test sans commande dans DB2
INSERT INTO users (id, type, nom, prenoms, phone, statut, valid)
VALUES (99003, 1, 'Client', 'TestSansCommande', '2250799003003', 1, 1);

-- Pas de commande à créer : l'absence de commande = jamais_commande automatiquement

-- 2. Enregistrer l'appel sortant
INSERT INTO call_logs (
    id, id_commercial, id_client, device_id,
    call_type, local_number, remote_number,
    duration, call_timestamp, received_at
)
VALUES (
    UUID(), [ID_COMMERCIAL_DB2], 99003, 'device-test-01',
    'outgoing', '[LOCAL_NUMBER]', '2250799003003',
    120, NOW(), NOW()
);
```

---

## Étape 3 — Attendre le sync et vérifier

Le cron de synchronisation tourne **toutes les 5 minutes**. Après insertion, attends au maximum 5 minutes puis vérifie sur DB1 :

```sql
-- Vérifier les logs de sync (derniers appels traités)
SELECT source_id, status, error_message, created_at
FROM integration_sync_log
WHERE source_table = 'call_logs'
ORDER BY created_at DESC
LIMIT 10;
```

```sql
-- Vérifier les tâches du batch actif du commercial
SELECT category, status, client_phone, duration_seconds, completed_at
FROM call_task
WHERE batch_id = (
    SELECT id FROM commercial_obligation_batch
    WHERE poste_id = (
        SELECT poste_id FROM whatsapp_commercial
        WHERE email = 'aminata.coulibaly@gicop.ci' -- ← changer l'email
    )
    AND status = 'pending'
    ORDER BY batch_number DESC LIMIT 1
);
```

### Résultat attendu

| category | status |
|----------|--------|
| commande_annulee | `done` |
| commande_avec_livraison | `done` |
| jamais_commande | `done` |

Une fois les 3 tâches à `done`, **la rotation se déclenche automatiquement** à la prochaine minute du cron de rotation (toutes les minutes).

---

## Nettoyage après test

```sql
-- Sur DB2 — supprimer les données de test
DELETE FROM call_logs  WHERE id_client IN (99001, 99002, 99003);
DELETE FROM commandes  WHERE id_client IN (99001, 99002, 99003);
DELETE FROM users      WHERE id IN (99001, 99002, 99003);
```

---

## Causes possibles d'échec du sync

| Symptôme dans `integration_sync_log` | Cause | Solution |
|--------------------------------------|-------|---------|
| `status = 'failed'` / `duree_insuffisante` | `duration < 90` | Mettre `duration >= 90` |
| `status = 'failed'` / `poste_introuvable` | `id_commercial` absent ou non mappé | Vérifier `commercial_identity_mapping.external_id` en DB1 |
| `status = 'failed'` / `aucun_batch_actif` | Pas de batch `pending` pour ce poste | Créer un batch via le service d'obligations |
| `status = 'failed'` / `quota_categorie_atteint` | La catégorie est déjà complète (5/5) | Aucune action nécessaire — quota atteint |
| `status = 'failed'` / `appel_deja_traite` | L'`id` de l'appel est en doublon | Utiliser `UUID()` pour garantir l'unicité |
| Appel non trouvé dans le sync | `call_timestamp` antérieur au curseur | Utiliser `NOW()` comme timestamp |
