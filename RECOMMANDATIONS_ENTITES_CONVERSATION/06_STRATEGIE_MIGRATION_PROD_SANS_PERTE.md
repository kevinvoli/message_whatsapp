# Strategie de migration production sans perte de donnees

Date : 2026-06-22

## Objectif

Structurer toutes les futures ameliorations autour de `WhatsappMessage`, `WhatsappChat`, `ChatSession`, `Contact`, `ConversationReport` et entites liees sans provoquer de perte de donnees en production.

Cette strategie part du principe que la production tourne deja et que la base contient des donnees metier critiques : messages, conversations, rapports, contacts, sessions, follow-ups, appels et synchronisations externes.

## Regle principale

Aucune modification destructive directe en production.

Cela signifie :

- pas de `DROP TABLE` immediat ;
- pas de `DROP COLUMN` immediat ;
- pas de renommage de colonne sans phase de compatibilite ;
- pas de changement de type risquant de tronquer des donnees ;
- pas de migration massive sans backup, dry-run et verification ;
- pas de suppression de tables legacy sans periode d'observation.

## Strategie generale

Toutes les ameliorations doivent suivre une approche en plusieurs phases :

1. Observer
2. Sauvegarder
3. Ajouter sans casser
4. Backfiller
5. Lire en double
6. Ecrire en double si necessaire
7. Basculer progressivement
8. Verifier
9. Geler l'ancien chemin
10. Supprimer seulement plus tard

## Phase 0 - Inventaire avant action

Avant toute migration :

- exporter la liste des tables ;
- exporter la liste des colonnes ;
- compter les lignes des tables concernees ;
- identifier les colonnes nulles/non nulles ;
- identifier les doublons ;
- verifier les index existants ;
- verifier les contraintes existantes ;
- rechercher les usages dans le code avec `rg`.

Tables prioritaires a inventorier :

- `whatsapp_message`
- `whatsapp_chat`
- `chat_session`
- `contact`
- `contact_phone`
- `client_dossier`
- `conversation_report`
- `conversation_validation`
- `closure_attempt_log`
- `follow_up`
- `integration_outbox`
- `integration_sync_log`
- `messaging_client_dossier_mirror`
- `webhook_event_log`

## Phase 1 - Backup obligatoire

Avant chaque lot de migration :

- faire un dump complet de la base ;
- faire un dump cible des tables modifiees ;
- conserver le dump hors du serveur applicatif ;
- noter l'heure exacte du backup ;
- noter le hash ou la taille du fichier ;
- tester au moins une restauration sur une base secondaire quand la migration est importante.

Commande type :

```bash
mysqldump --single-transaction --routines --triggers --events whatsappflow > backup_whatsappflow_YYYYMMDD_HHMM.sql
```

Pour les tables critiques :

```bash
mysqldump --single-transaction whatsappflow whatsapp_message whatsapp_chat chat_session contact conversation_report > backup_core_conversation_YYYYMMDD_HHMM.sql
```

## Phase 2 - Migrations additives uniquement

Les premieres migrations doivent seulement ajouter :

- nouvelles colonnes nullable ;
- nouvelles tables ;
- nouveaux index ;
- nouvelles contraintes non bloquantes si possible ;
- nouveaux champs de cache ;
- nouvelles tables d'audit.

Exemples acceptables :

- ajouter `tenant_id` nullable a `chat_session` ;
- ajouter `whatsapp_chat_id` nullable a `conversation_report` ;
- ajouter `contact_id` nullable a `conversation_report` ;
- creer `message_delivery_event` ;
- creer `message_read_receipt` ;
- creer `conversation_status_event` ;
- ajouter un index sur `chat_session(whatsapp_chat_id, ended_at)`.

Exemples interdits en premiere phase :

- supprimer `message_id` ;
- supprimer `external_id` ;
- rendre `tenant_id` obligatoire immediatement ;
- renommer `chat_id` ;
- remplacer directement `conversation_report.chat_id` par `whatsapp_chat_id` ;
- supprimer les tables `_legacy_*`.

## Phase 3 - Backfill controle

Apres ajout des colonnes ou tables, remplir progressivement.

### Regles de backfill

- travailler par batch ;
- journaliser le nombre de lignes traitees ;
- pouvoir relancer sans creer de doublons ;
- ne jamais bloquer longtemps les tables critiques ;
- eviter les transactions geantes ;
- verifier avant et apres chaque batch.

### Exemple : backfill `conversation_report.whatsapp_chat_id`

Principe :

```sql
UPDATE conversation_report r
JOIN whatsapp_chat c ON c.chat_id = r.chat_id
SET r.whatsapp_chat_id = c.id
WHERE r.whatsapp_chat_id IS NULL;
```

Avant execution :

```sql
SELECT COUNT(*) FROM conversation_report WHERE whatsapp_chat_id IS NULL;
SELECT COUNT(*) FROM conversation_report r LEFT JOIN whatsapp_chat c ON c.chat_id = r.chat_id WHERE c.id IS NULL;
```

Apres execution :

```sql
SELECT COUNT(*) FROM conversation_report WHERE whatsapp_chat_id IS NULL;
```

## Phase 4 - Compatibilite applicative

Pendant une periode transitoire, le code doit supporter l'ancien et le nouveau modele.

Exemple pour `ConversationReport` :

- lire par `whatsapp_chat_id` si present ;
- sinon fallback sur `chat_id`.

Exemple pour `WhatsappMessage` :

- dedupliquer d'abord par `provider + provider_message_id + direction` ;
- fallback sur `message_id` ou `external_id` pour l'historique.

Exemple pour `ChatSession` :

- utiliser `active_session_id` si coherent ;
- sinon rechercher une session active par `whatsapp_chat_id` et `ended_at IS NULL`.

## Phase 5 - Double ecriture temporaire

Quand une nouvelle colonne remplace progressivement une ancienne, ecrire les deux pendant une periode.

Exemples :

- `conversation_report.chat_id` et `conversation_report.whatsapp_chat_id` ;
- `conversation_report.contact_id` et les champs snapshot client ;
- `ChatSession.autoCloseAt` et `WhatsappChat.windowExpiresAt` ;
- `message_delivery_event.status` et `WhatsappMessage.status`.

Objectif : permettre rollback applicatif sans perdre les donnees produites pendant la transition.

## Phase 6 - Verifications de coherence

Chaque migration doit avoir des requetes de verification.

### Messages

```sql
SELECT provider, provider_message_id, direction, COUNT(*)
FROM whatsapp_message
WHERE provider_message_id IS NOT NULL
GROUP BY provider, provider_message_id, direction
HAVING COUNT(*) > 1;
```

### Chats sans session coherente

```sql
SELECT c.id, c.chat_id, c.active_session_id
FROM whatsapp_chat c
LEFT JOIN chat_session s ON s.id = c.active_session_id
WHERE c.active_session_id IS NOT NULL
  AND (s.id IS NULL OR s.ended_at IS NOT NULL);
```

### Sessions actives multiples

```sql
SELECT whatsapp_chat_id, COUNT(*)
FROM chat_session
WHERE ended_at IS NULL
GROUP BY whatsapp_chat_id
HAVING COUNT(*) > 1;
```

### Reports sans chat

```sql
SELECT r.id, r.chat_id
FROM conversation_report r
LEFT JOIN whatsapp_chat c ON c.chat_id = r.chat_id
WHERE c.id IS NULL;
```

### Contacts potentiellement dupliques

```sql
SELECT contact, COUNT(*)
FROM contact
WHERE deletedAt IS NULL
GROUP BY contact
HAVING COUNT(*) > 1;
```

## Phase 7 - Rollback

Chaque lot doit avoir un rollback realiste.

### Rollback applicatif

Possible si :

- les anciennes colonnes existent encore ;
- le code ecrit encore les anciennes colonnes ;
- aucune suppression n'a ete faite.

### Rollback base de donnees

Pour une migration additive :

- il est souvent possible de laisser les nouvelles colonnes/tables inutilisees ;
- eviter de dropper en urgence ;
- rollback applicatif d'abord, nettoyage plus tard.

### Rollback impossible ou difficile

Les operations suivantes doivent etre evitees tant que le modele n'est pas stable :

- suppression de colonnes ;
- changement de type restrictif ;
- fusion irreversible de tables ;
- suppression de donnees legacy ;
- update massif sans table d'audit ou backup.

## Phase 8 - Suppression differee

Une suppression ne doit arriver qu'apres :

1. code deploye sans usage de l'ancien champ ;
2. observation en production ;
3. confirmation par logs ;
4. backup final ;
5. export des donnees concernees ;
6. validation manuelle.

Ordre recommande :

- d'abord arreter l'ecriture ;
- puis arreter la lecture ;
- puis observer ;
- puis renommer en `_legacy_*` si applicable ;
- puis supprimer dans une release ulterieure.

## Plan recommande par lots

### Lot 1 - Securisation sans changement fonctionnel

Objectif : aucune rupture.

- ajouter les index manquants ;
- ajouter les colonnes nullable necessaires ;
- creer les tables d'evenements si besoin ;
- ajouter les requetes de verification ;
- ajouter un job de reconciliation en mode lecture seule.

### Lot 2 - Backfill et reconciliation

Objectif : remplir les nouvelles colonnes.

- backfill `conversation_report.whatsapp_chat_id` ;
- backfill `conversation_report.contact_id` si possible ;
- backfill `chat_session.tenant_id` si ajoute ;
- reconciliation `active_session_id` ;
- reconciliation `window_expires_at` ;
- reconciliation `unread_count`.

### Lot 3 - Compatibilite applicative

Objectif : lire nouveau modele avec fallback ancien.

- modifier les services pour lire les nouvelles colonnes ;
- garder fallback legacy ;
- ajouter logs de fallback ;
- surveiller le volume de fallback.

### Lot 4 - Double ecriture

Objectif : permettre rollback.

- ecrire ancien + nouveau ;
- verifier que les deux restent coherents ;
- corriger les divergences.

### Lot 5 - Bascule progressive

Objectif : utiliser le nouveau modele par defaut.

- lecture principale sur les nouvelles colonnes ;
- fallback seulement si donnees anciennes ;
- dashboard de coherence ;
- alertes sur divergence.

### Lot 6 - Nettoyage differe

Objectif : supprimer uniquement ce qui est prouve inutile.

- supprimer ou archiver les tables legacy ;
- retirer les colonnes legacy seulement apres plusieurs releases ;
- conserver les exports.

## Tables candidates pour migrations additives

### `conversation_report`

Ajouter progressivement :

- `tenant_id` nullable ;
- `whatsapp_chat_id` nullable ;
- `contact_id` nullable ;
- `chat_session_id` nullable.

Ne pas supprimer :

- `chat_id`
- champs snapshot client

avant stabilisation complete.

### `chat_session`

Ajouter progressivement :

- `tenant_id` nullable ;
- `close_reason` nullable ;
- `closed_by` nullable ;
- `created_at` ;
- `updated_at`.

Ne pas rendre `tenant_id` obligatoire avant backfill complet.

### `whatsapp_message`

Ajouter plutot des tables autour :

- `message_delivery_event`
- `message_read_receipt`
- `message_analysis`

Ne pas supprimer :

- `message_id`
- `external_id`

avant que tous les providers et status updates utilisent `provider_message_id`.

### `whatsapp_chat`

Ne pas supprimer les caches.

Ajouter plutot :

- reconciliation ;
- audit de transition ;
- contraintes/index progressifs.

## Checklist avant chaque migration production

- [ ] Backup complet effectue.
- [ ] Backup des tables critiques effectue.
- [ ] Migration testee sur une copie de prod ou staging.
- [ ] Requetes de verification preparees.
- [ ] Rollback applicatif possible.
- [ ] Aucune suppression destructive.
- [ ] Migration additive ou reversible.
- [ ] Backfill idempotent.
- [ ] Logs de migration prevus.
- [ ] Fenetre de deploiement validee.
- [ ] Monitoring pret apres deploiement.

## Checklist apres migration

- [ ] Nombre de lignes avant/apres coherent.
- [ ] Pas de doublons critiques.
- [ ] Pas de session active incoherente.
- [ ] Pas de reports orphelins supplementaires.
- [ ] Pas d'augmentation d'erreurs webhook.
- [ ] Pas d'augmentation d'erreurs socket.
- [ ] Pas d'erreurs dans `integration_outbox`.
- [ ] Les jobs critiques continuent de tourner.
- [ ] Les commerciaux peuvent lire/repondre aux conversations.
- [ ] Les rapports peuvent etre soumis.

## Conclusion

La bonne strategie n'est pas de refondre directement la production. Il faut faire evoluer le modele par couches compatibles.

Les donnees existantes doivent rester lisibles pendant toute la transition. Les nouvelles structures doivent etre ajoutees a cote, remplies, comparees, puis seulement adoptees.

La suppression est la derniere etape, jamais la premiere.
