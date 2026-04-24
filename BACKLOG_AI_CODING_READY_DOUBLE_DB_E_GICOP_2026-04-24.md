# Backlog AI Coding Ready Double DB E-GICOP

Date: 2026-04-24

## But du document

Ce document est une version du backlog exploitable par une IA de codage.

Il est base sur:

- le code existant du depot
- le plan fonctionnel prioritaire messagerie
- le plan double base de donnees
- le plan de refactor et nettoyage du code obsolete

Il ne decrit pas seulement "quoi faire", mais aussi:

- ou intervenir dans le code existant
- quoi creer
- quoi refactorer
- quoi supprimer
- dans quel ordre
- comment verifier que c'est correct

## Regles d'execution pour une IA de codage

1. Ne pas ecrire dans les tables metier natives de la base commande.
2. Lire la base commande uniquement via une couche dediee.
3. Ecrire dans la base commande uniquement via des tables miroir dediees.
4. Conserver la base messagerie comme source de verite locale.
5. Supprimer progressivement les anciennes integrations HTTP/webhook une fois les nouveaux flux DB-to-DB en place.
6. Ne pas supprimer un module ancien avant d'avoir migre son usage reel.

## Etat actuel du code utile a connaitre

### Modules backend existants a conserver comme base

- `message_whatsapp/src/gicop-report`
- `message_whatsapp/src/client-dossier`
- `message_whatsapp/src/follow-up`
- `message_whatsapp/src/call-obligations`
- `message_whatsapp/src/window`
- `message_whatsapp/src/conversation-capacity`
- `message_whatsapp/src/integration` uniquement pour la partie mappings

### Modules backend existants candidats a suppression/refactor

- `message_whatsapp/src/inbound-integration`
- `message_whatsapp/src/gicop-webhook`
- partie HTTP de `message_whatsapp/src/integration/integration.service.ts`
- `message_whatsapp/src/gicop-report/order-platform-sync.service.ts`

### UI admin/front existante a refactorer

- `admin/src/app/ui/IntegrationView.tsx`
- `admin/src/app/ui/GicopSupervisionView.tsx`
- `admin/src/app/data/admin-data.ts`
- `front/src/components/chat/GicopReportPanel.tsx`
- `front/src/components/chat/FollowUpPanel.tsx`

## Resultat cible

Le systeme final doit faire ceci:

- lire les donnees commande directement depuis DB2
- stocker localement le rapport et la fermeture
- copier le dossier complet du client dans une table miroir DB2
- alimenter les validations d'appel a partir de `call_logs`
- construire les menus metier prospects / annulees / anciennes clientes depuis DB2
- supprimer les flux historiques webhook/HTTP devenus inutiles

## Table miroir principale cible

La table miroir principale cote base commande est:

- `messaging_client_dossier_mirror`

Son role:

- representer le dossier complet du client vu par la messagerie
- contenir les infos du rapport
- contenir l'identite de la commerciale
- contenir les infos client et metier utiles a la plateforme commande

## Ordre global d'execution

L'IA de codage doit executer les chantiers dans cet ordre:

1. introduire DB2 et la couche d'acces
2. creer la couche de lecture commande
3. creer la couche ecriture miroir DB2
4. basculer la soumission du rapport vers DB2
5. implementer la fermeture conversationnelle guidee
6. brancher la lecture des appels `call_logs`
7. construire les menus metier
8. implementer priorisation poste
9. nettoyer l'ancien code d'integration
10. nettoyer l'admin/front obsolete

## Epic A. Introduire la seconde connexion DB

Statut attendu: premier chantier

### Objectif concret

Ajouter une seconde connexion TypeORM vers la base commande sans casser la base actuelle.

### Fichiers cibles

- `message_whatsapp/src/app.module.ts`
- `message_whatsapp/src/database/*`
- nouveau module a creer sous `message_whatsapp/src/order-db`

### A creer

- `message_whatsapp/src/order-db/order-db.module.ts`
- `message_whatsapp/src/order-db/order-db.constants.ts`
- `message_whatsapp/src/order-db/order-db.providers.ts`

### Taches atomiques

1. Ajouter les variables d'environnement DB2:
   - `ORDER_DB_HOST`
   - `ORDER_DB_PORT`
   - `ORDER_DB_USER`
   - `ORDER_DB_PASSWORD`
   - `ORDER_DB_NAME`
2. Ajouter la validation config correspondante.
3. Declarer une nouvelle connexion nommee, par exemple `orderDb`.
4. Exporter la connexion dans un module dedie.
5. Verifier que l'application demarre meme si aucun repository DB2 metier n'est encore branche.

### Sortie attendue

- une connexion DB2 utilisable par injection

### Verification

- l'app compile
- le bootstrap ne casse pas
- les repositories DB1 existants fonctionnent toujours

## Epic B. Couche de lecture de la base commande

### Objectif concret

Centraliser toutes les lectures DB2 utiles au metier.

### Fichiers a creer

- `message_whatsapp/src/order-read/order-read.module.ts`
- `message_whatsapp/src/order-read/entities/order-command.entity.ts`
- `message_whatsapp/src/order-read/entities/order-status.entity.ts`
- `message_whatsapp/src/order-read/entities/order-call-log.entity.ts`
- `message_whatsapp/src/order-read/entities/order-whatsapp-number-to-call.entity.ts` si retenu
- `message_whatsapp/src/order-read/services/order-command-read.service.ts`
- `message_whatsapp/src/order-read/services/order-status-read.service.ts`
- `message_whatsapp/src/order-read/services/order-call-log-read.service.ts`
- `message_whatsapp/src/order-read/services/order-segmentation-read.service.ts`

### Tables source a mapper

- `commandes`
- `statuts_commandes`
- `call_logs`
- `whatsapp_numbers_to_call` uniquement si utile

### Taches atomiques

1. Mapper les entites DB2 minimales.
2. Ajouter les repositories DB2 correspondants.
3. Ecrire les methodes de lecture:
   - `findCancelledOrders`
   - `findProspectCandidates`
   - `findDormantClients`
   - `findCallsSince(cursor)`
4. Normaliser les numeros de telephone dans une seule couche.
5. Ne faire aucune logique de sync ici: lecture seulement.

### Sortie attendue

- une couche `read-only` exploitable depuis les services metier

### Verification

- tests unitaires de mapping minimum
- requetes lisibles et centralisees

## Epic C. Couche miroir DB2

### Objectif concret

Permettre a la messagerie d'ecrire ses donnees dans des tables miroir dediees cote base commande.

### Fichiers a creer

- `message_whatsapp/src/order-write/order-write.module.ts`
- `message_whatsapp/src/order-write/entities/messaging-client-dossier-mirror.entity.ts`
- `message_whatsapp/src/order-write/entities/messaging-conversation-closure.entity.ts`
- `message_whatsapp/src/order-write/entities/messaging-call-validation-event.entity.ts`
- `message_whatsapp/src/order-write/entities/messaging-follow-up-export.entity.ts`
- `message_whatsapp/src/order-write/services/order-dossier-mirror-write.service.ts`
- `message_whatsapp/src/order-write/services/order-closure-mirror-write.service.ts`
- `message_whatsapp/src/order-write/services/order-call-validation-write.service.ts`
- `message_whatsapp/src/order-write/services/order-follow-up-write.service.ts`

### Tache importante

La table miroir principale n'est pas `messaging_conversation_reports`.
Elle devient:

- `messaging_client_dossier_mirror`

### Taches atomiques

1. Mapper l'entite `messaging_client_dossier_mirror`.
2. Ajouter une methode d'upsert basee sur:
   - `messaging_chat_id`
   - ou `messaging_report_id`
3. Mapper les tables secondaires si vous les gardez.
4. Ne jamais ecrire dans `commandes`, `statuts_commandes`, `call_logs`.

### Sortie attendue

- des writers DB2 centralises et reutilisables

### Verification

- les services d'ecriture sont idempotents
- un deuxieme envoi ne cree pas de doublon logique

## Epic D. Journal de synchronisation local

### Objectif concret

Tracer localement toutes les ecritures faites vers DB2.

### Fichiers a creer

- `message_whatsapp/src/integration-sync/integration-sync.module.ts`
- `message_whatsapp/src/integration-sync/entities/integration-sync-log.entity.ts`
- `message_whatsapp/src/integration-sync/integration-sync-log.service.ts`

### Taches atomiques

1. Creer la table locale de log.
2. Ajouter les statuts:
   - `pending`
   - `success`
   - `failed`
3. Ajouter les champs:
   - `entity_type`
   - `entity_id`
   - `target_table`
   - `attempt_count`
   - `last_error`
4. Ajouter les appels au log dans tous les writers DB2.

### Sortie attendue

- toute synchro DB2 est tracable

## Epic E. Refactor de la soumission du rapport

### Objectif concret

Remplacer la soumission HTTP du rapport par une ecriture dans `messaging_client_dossier_mirror`.

### Fichiers existants a modifier

- `message_whatsapp/src/gicop-report/report-submission.service.ts`
- `message_whatsapp/src/gicop-report/order-platform-sync.service.ts`
- `message_whatsapp/src/gicop-report/conversation-report.controller.ts`
- `message_whatsapp/src/gicop-report/entities/conversation-report.entity.ts`

### Taches atomiques

1. Conserver `ReportSubmissionService`.
2. Supprimer sa dependance HTTP.
3. Transformer `OrderPlatformSyncService` en writer DB2 ou le remplacer.
4. Lors du submit:
   - charger le rapport
   - charger le commercial
   - charger le dossier client utile
   - construire le payload dossier complet
   - faire l'upsert dans `messaging_client_dossier_mirror`
5. Mettre a jour:
   - `submissionStatus`
   - `submittedAt`
   - `submissionError`
6. Conserver le retry automatique mais contre DB2.

### Sortie attendue

- `submitReport()` ne fait plus d'appel HTTP
- il ecrit en DB2

### Verification

- le submit fonctionne
- le retry fonctionne
- les erreurs sont stockees

## Epic F. Fermeture conversationnelle guidee

### Objectif concret

Faire de la fermeture un workflow metier bloque tant que le dossier n'est pas complet.

### Fichiers a creer

- `message_whatsapp/src/conversation-closure/conversation-closure.module.ts`
- `message_whatsapp/src/conversation-closure/conversation-closure.service.ts`
- `message_whatsapp/src/conversation-closure/dto/close-conversation.dto.ts`
- `message_whatsapp/src/conversation-closure/entities/closure-attempt-log.entity.ts`

### Fichiers existants a modifier

- `front/src/components/conversation/conversationOptionMenu.tsx`
- `front/src/components/chat/GicopReportPanel.tsx`
- `front/src/components/chat/ChatHeader.tsx`
- eventuellement `message_whatsapp/src/whatsapp_chat/*`

### Regles minimales a coder

- rapport complet
- dossier complet
- resultat de conversation renseigne
- prochaine action renseignee
- relance planifiee si necessaire
- obligations d'appel satisfaites si blocantes

### Taches atomiques

1. Centraliser les regles dans `ConversationClosureService`.
2. Retourner une liste de blocages normalises.
3. Ajouter un endpoint dedie de cloture.
4. Creer une modal unique de cloture cote front.
5. Apres cloture:
   - mettre a jour localement la conversation
   - ecrire la fermeture en DB2
   - mettre a jour `messaging_client_dossier_mirror`

### Sortie attendue

- fermeture conversationnelle unifiee

### Verification

- impossible de fermer si le rapport est incomplet
- blocages visibles cote UI

## Epic G. Lecture des appels depuis `call_logs`

### Objectif concret

Alimenter les validations d'appel depuis DB2.

### Fichiers a creer

- `message_whatsapp/src/order-call-sync/order-call-sync.module.ts`
- `message_whatsapp/src/order-call-sync/order-call-sync.service.ts`
- `message_whatsapp/src/order-call-sync/order-call-sync.job.ts`
- `message_whatsapp/src/order-call-sync/entities/order-call-sync-cursor.entity.ts`

### Fichiers existants a modifier

- `message_whatsapp/src/call-obligations/call-obligation.service.ts`
- `message_whatsapp/src/window/services/call-event.service.ts` si reutilise

### Taches atomiques

1. Lire les nouveaux appels incrementalement depuis `call_logs`.
2. Memoriser le dernier curseur lu.
3. Resoudre le commercial.
4. Resoudre le client.
5. Rattacher une conversation si possible.
6. Evaluer l'eligibilite.
7. Mettre a jour `CallObligationService`.
8. Ecrire une trace miroir si retenu.

### Sortie attendue

- les appels utiles sont pris en compte sans webhook

### Verification

- pas de doublons de traitement
- les appels > 90s alimentent bien les obligations

## Epic H. Menus metier dedies

### Objectif concret

Construire les ecrans prospects / annulees / anciennes clientes a partir de DB2.

### Fichiers backend a creer ou modifier

- `message_whatsapp/src/order-read/services/order-segmentation-read.service.ts`
- nouveaux endpoints ou services dans un module CRM/contacts dedie

### Fichiers front a creer ou modifier

- `front/src/app/contacts/page.tsx`
- `front/src/components/contacts/*`
- nouvelle navigation si necessaire dans `ConversationSidebar`

### Taches atomiques

1. Creer le service de segmentation.
2. Ajouter 3 vues metier:
   - prospects
   - commandes annulees
   - anciennes clientes
3. Ajouter compteurs.
4. Ajouter actions rapides:
   - ouvrir conversation
   - ouvrir dossier
   - planifier relance
   - appeler

### Sortie attendue

- vues operateur metier construites depuis DB2

## Epic I. Rappel automatique des relances

### Objectif concret

Executer des rappels a echeance et les rendre visibles.

### Fichiers existants a modifier

- `message_whatsapp/src/follow-up/follow_up.service.ts`
- `front/src/components/chat/FollowUpPanel.tsx`

### Fichiers a creer

- `message_whatsapp/src/follow-up/follow-up-reminder.job.ts`

### Taches atomiques

1. Ajouter un job de rappel.
2. Ajouter un marquage "rappel execute".
3. Creer une notification locale.
4. Exporter en DB2 si necessaire via table miroir relance.

### Sortie attendue

- les relances arrivent automatiquement a l'echeance

## Epic J. Priorisation appels en absence / messages poste

### Objectif concret

Mettre les urgences du poste avant les autres traitements.

### Fichiers a creer

- `message_whatsapp/src/poste-priority/poste-priority.module.ts`
- `message_whatsapp/src/poste-priority/poste-priority.service.ts`

### Fichiers front a modifier

- `front/src/components/sidebar/Sidebar.tsx`
- `front/src/components/sidebar/UserHeader.tsx`
- nouveaux composants priorite si necessaire

### Taches atomiques

1. Calculer les appels manques prioritaires.
2. Calculer les conversations messages prioritaires.
3. Exposer un resume du poste.
4. Afficher ces priorites dans l'UI.
5. Bloquer partiellement certaines actions si necessaire.

### Sortie attendue

- l'operateur voit ce qui est prioritaire avant le reste

## Epic K. Refactor admin pour la nouvelle architecture

### Objectif concret

Mettre l'admin en coherence avec DB-to-DB.

### Fichiers existants a modifier

- `admin/src/app/ui/IntegrationView.tsx`
- `admin/src/app/ui/GicopSupervisionView.tsx`
- `admin/src/app/data/admin-data.ts`
- `admin/src/app/dashboard/commercial/page.tsx`

### Taches atomiques

1. Supprimer la documentation webhook dans `IntegrationView`.
2. Renommer la vue en `Integration DB` ou `Mappings`.
3. Modifier `GicopSupervisionView` pour afficher:
   - statut des synchros DB2
   - rapports en echec DB2
   - statut lecture appels DB2
4. Nettoyer la navigation admin.

### Sortie attendue

- l'admin ne parle plus de flux GICOP webhook si DB-only confirme

## Epic L. Suppression de l'ancien code

### Objectif concret

Supprimer les modules obsoletes une fois la nouvelle architecture branchée.

### A supprimer seulement apres migration

- `message_whatsapp/src/inbound-integration/*`
- `message_whatsapp/src/gicop-webhook/*`
- dispatch HTTP dans `message_whatsapp/src/integration/integration.service.ts`
- `message_whatsapp/src/integration/integration.listener.ts` si plus utilise
- logique HTTP de `message_whatsapp/src/gicop-report/order-platform-sync.service.ts`

### A auditer avant suppression

- `front/src/app/auto_connexion/page.tsx`
- `auth/auto-login`
- `admin/src/app/ui/IpAccessView.tsx`
- `outbound-webhook`
- champs legacy de `conversation-report.entity.ts`

### Taches atomiques

1. Verifier absence d'usage runtime.
2. Retirer les imports de `app.module.ts`.
3. Retirer les endpoints admin/API associes.
4. Supprimer les settings obsoletes:
   - `INTEGRATION_ERP_URL`
   - `INTEGRATION_SECRET`
   - `GICOP_WEBHOOK_VERIFY_TOKEN`
   - `ORDER_PLATFORM_REPORT_URL`

### Sortie attendue

- plus aucun flux critique ne depend de l'ancienne architecture

## Definition of Done orientee IA de codage

Une tache n'est pas consideree terminee si:

- le fichier n'existe pas mais est reference
- le service compile mais n'est pas branche dans un module
- le front appelle encore un ancien endpoint obsolet
- le backend ecrit encore dans une table metier native de la base commande
- la synchro DB2 n'est pas tracee localement

Une tache est consideree terminee si:

- le code compile
- le module est branche
- la responsabilite est centralisee
- les anciens appels redondants sont retires
- le comportement est testable ou verifiable

## Sequence de livraison recommandee

### Lot 1

- Epic A
- Epic B
- Epic C
- Epic D

### Lot 2

- Epic E
- Epic F

### Lot 3

- Epic G
- Epic H
- Epic I
- Epic J

### Lot 4

- Epic K
- Epic L

## Note importante

L'IA de codage ne doit pas faire de migration brute "tout supprimer / tout refaire".

La bonne strategie est:

- ajouter DB2
- brancher les nouveaux services
- basculer les flux critiques
- supprimer seulement ensuite le code ancien devenu sans usage
