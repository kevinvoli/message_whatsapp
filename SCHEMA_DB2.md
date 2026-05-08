# Schéma DB2 — Tables gérées par la plateforme messagerie

**Date :** 2026-05-08  
**Base cible :** `gicop_db` (ORDER_DB)  
**Contact technique :** équipe plateforme messagerie  
**Règle absolue :** la plateforme messagerie ne fait jamais de `DELETE` sur ces tables.

---

## Instructions pour l'équipe DB2

1. Exécuter le DDL ci-dessous **une seule fois** dans la base `gicop_db`
2. Accorder les droits `SELECT`, `INSERT`, `UPDATE` à l'utilisateur applicatif (voir section droits)
3. Confirmer la création par la requête de vérification fournie en bas de ce document
4. **Ne pas modifier** la structure des colonnes sans coordination avec l'équipe messagerie

---

## Table : `messaging_client_dossier_mirror`

Table miroir contenant le résumé du dossier client tel que vu par la plateforme de messagerie.  
Elle est alimentée automatiquement à chaque clôture de conversation commerciale.

**Clé primaire :** `messaging_chat_id` — identifiant interne de la conversation (DB1)  
**Upsert idempotent :** un double envoi ne crée pas de doublon (`ON DUPLICATE KEY UPDATE`)

### DDL

```sql
CREATE TABLE IF NOT EXISTS `messaging_client_dossier_mirror` (
  -- Clé primaire : identifiant de la conversation côté plateforme messagerie
  `messaging_chat_id`        VARCHAR(100)                      NOT NULL,

  -- Liens vers les entités DB2 (résolus via mapping téléphonique)
  `id_client`                INT                               DEFAULT NULL,
  `id_commercial`            INT                               DEFAULT NULL,

  -- Identifiant de contact messaging (numéro WhatsApp, nom Messenger, handle Telegram/Instagram)
  `client_messaging_contact` VARCHAR(200)                      DEFAULT NULL,

  -- Téléphones associés au client — JSON : [{"phone":"...","label":"...","isPrimary":true}]
  `client_phones`            TEXT                              DEFAULT NULL,

  -- Données nominatives
  `client_name`              VARCHAR(200)                      DEFAULT NULL,
  `commercial_name`          VARCHAR(200)                      DEFAULT NULL,
  `commercial_phone`         VARCHAR(30)                       DEFAULT NULL,
  `commercial_email`         VARCHAR(200)                      DEFAULT NULL,

  -- Localisation
  `ville`                    VARCHAR(100)                      DEFAULT NULL,
  `commune`                  VARCHAR(100)                      DEFAULT NULL,
  `quartier`                 VARCHAR(100)                      DEFAULT NULL,

  -- Données de la conversation commerciale
  `product_category`         VARCHAR(200)                      DEFAULT NULL,
  `client_need`              TEXT                              DEFAULT NULL,
  `interest_score`           TINYINT                           DEFAULT NULL,
  `next_action`              VARCHAR(50)                       DEFAULT NULL,
  `follow_up_at`             DATETIME                          DEFAULT NULL,
  `notes`                    TEXT                              DEFAULT NULL,

  -- Résultat de la conversation
  `conversation_result`      VARCHAR(50)                       DEFAULT NULL,
  `closed_at`                DATETIME                          DEFAULT NULL,

  -- Statut de synchronisation (géré par la plateforme messagerie)
  `sync_status`              ENUM('pending','synced','error')  DEFAULT 'pending',
  `sync_error`               TEXT                              DEFAULT NULL,
  `submitted_at`             DATETIME                          DEFAULT NULL,

  -- Horodatage de mise à jour automatique
  `updated_at`               DATETIME                          DEFAULT CURRENT_TIMESTAMP
                                                               ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`messaging_chat_id`),
  KEY `IDX_mirror_id_client`     (`id_client`),
  KEY `IDX_mirror_id_commercial` (`id_commercial`)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Droits requis

```sql
-- Remplacer 'messagerie_user'@'%' par l'utilisateur applicatif réel
GRANT SELECT, INSERT, UPDATE
  ON gicop_db.messaging_client_dossier_mirror
  TO 'messagerie_user'@'%';

FLUSH PRIVILEGES;
```

> **Pas de `DELETE`** — les dossiers sont archivés indéfiniment. La plateforme messagerie
> n'émet jamais d'ordre de suppression sur cette table.

### Requête de vérification après création

```sql
-- Vérifier que la table existe et est accessible
SELECT COUNT(*) AS nb_rows FROM messaging_client_dossier_mirror;

-- Vérifier les index
SHOW INDEX FROM messaging_client_dossier_mirror;

-- Vérifier les droits de l'utilisateur applicatif
SHOW GRANTS FOR 'messagerie_user'@'%';
```

### Procédure de test end-to-end

Une fois la table créée et les droits accordés :

1. Soumettre un rapport de conversation depuis l'interface admin (bouton "Soumettre le rapport GICOP")
2. Vérifier en DB1 : `SELECT submission_status FROM conversation_report WHERE chat_id = '<id>'`  
   → doit passer de `pending` à `sent` dans la minute
3. Vérifier en DB2 : `SELECT * FROM messaging_client_dossier_mirror WHERE messaging_chat_id = '<id>'`  
   → doit contenir une ligne avec `sync_status = 'synced'`

---

## Résumé des colonnes

| Colonne | Type | Nullable | Description |
|---------|------|----------|-------------|
| `messaging_chat_id` | VARCHAR(100) | NON | PK — ID conversation DB1 |
| `id_client` | INT | OUI | FK vers `users.id` DB2 (résolu par téléphone) |
| `id_commercial` | INT | OUI | FK vers `users.id` DB2 (résolu par téléphone) |
| `client_messaging_contact` | VARCHAR(200) | OUI | Numéro WA / nom Messenger / handle |
| `client_phones` | TEXT | OUI | JSON array des téléphones |
| `client_name` | VARCHAR(200) | OUI | Nom du client |
| `commercial_name` | VARCHAR(200) | OUI | Nom du commercial |
| `commercial_phone` | VARCHAR(30) | OUI | Téléphone du commercial |
| `commercial_email` | VARCHAR(200) | OUI | Email du commercial |
| `ville` | VARCHAR(100) | OUI | Ville du client |
| `commune` | VARCHAR(100) | OUI | Commune |
| `quartier` | VARCHAR(100) | OUI | Quartier |
| `product_category` | VARCHAR(200) | OUI | Catégorie produit discutée |
| `client_need` | TEXT | OUI | Besoin exprimé par le client |
| `interest_score` | TINYINT | OUI | Score intérêt 0–10 |
| `next_action` | VARCHAR(50) | OUI | Prochaine action prévue |
| `follow_up_at` | DATETIME | OUI | Date de relance prévue |
| `notes` | TEXT | OUI | Notes libres du commercial |
| `conversation_result` | VARCHAR(50) | OUI | Résultat : `vente`, `relance`, `sans_suite`… |
| `closed_at` | DATETIME | OUI | Date de clôture de la conversation |
| `sync_status` | ENUM | NON | `pending` / `synced` / `error` |
| `sync_error` | TEXT | OUI | Message d'erreur de synchronisation |
| `submitted_at` | DATETIME | OUI | Date du dernier envoi |
| `updated_at` | DATETIME | NON | Mise à jour automatique |

---

*Document généré le 2026-05-08 — à transmettre à l'équipe DB2 avant mise en production*
