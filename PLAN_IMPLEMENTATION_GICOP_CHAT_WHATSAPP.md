# Plan d'implementation detaille - Chat WhatsApp Messenger GICOP

Date: 22 avril 2026

Perimetre:
- backend `message_whatsapp`
- front commercial `front`
- panel admin `admin`

Objectif du document:
- analyser les besoins cibles GICOP
- les comparer au code reel deja present
- proposer un plan d'implementation detaille, priorise et executable
- identifier les dependances metier, techniques et data avant developpement

---

## 1. Synthese executive

La plateforme actuelle n'est pas a reconstruire. Elle contient deja une base solide sur:
- l'affectation et la reaffectation des conversations
- la capacite conversationnelle par poste
- la qualification de fin de conversation
- les relances
- les reponses rapides
- la reception d'evenements metier depuis la plateforme de gestion des commandes
- le temps reel front/back

Le besoin GICOP demande surtout de transformer ce socle en moteur metier plus strict, avec:
- une affectation persistante par poste
- un rapport obligatoire de qualification par conversation
- une enforcement stricte de la limite des 10 conversations actives
- un moteur d'obligations d'appels par tranche de 10 conversations terminees
- des automatisations sortantes apres relance, commande et expedition
- un systeme de notation de fin de conversation
- un catalogue de contenus multimedia envoyables depuis le chat

Conclusion:
- le projet est faisable par extensions incrementalement livrables
- la plus grosse partie du travail sera dans le modele de donnees, les regles de validation, les listeners d'evenements et l'UX de qualification
- les dependances externes les plus critiques concernent les payloads ERP, les regles WhatsApp sur la fenetre 24h et les arbitrages metier sur les exceptions

### 1.1. Contrainte de branches et de publication

Le projet doit maintenant etre pense avec une contrainte de livraison tres importante:
- la branche `production` est la branche actuellement exploitee et fonctionnelle
- la branche `master` est la branche cible qui doit devenir la prochaine version publiee
- la base de donnees deja utilisee en production contient deja beaucoup de donnees metier qui ne doivent en aucun cas etre perdues au moment du basculement vers `master`

Implication directe:
- toutes les migrations ajoutees dans `master` doivent etre compatibles avec une base issue de `production`
- aucune migration GICOP ne doit supposer une base vide
- aucune migration GICOP ne doit supprimer ou ecraser des donnees fonctionnelles existantes sans mecanisme explicite de preservation, de backfill ou d'archivage

Le plan GICOP doit donc etre lu avec deux objectifs simultanes:
- ajouter les nouvelles fonctionnalites metier
- garantir une transition sure entre `production` et `master`

### 1.2. Regles de migration obligatoires entre `production` et `master`

Toutes les evolutions de schema liees a GICOP doivent respecter les regles suivantes.

#### Regle 1 - Migrations additives d'abord

Favoriser:
- ajout de tables
- ajout de colonnes nullable
- ajout d'index
- ajout de tables de mapping ou d'historique

Eviter en premiere vague:
- suppression de colonnes existantes
- renommage destructif de colonnes
- changement de type non reversible
- ajout de contrainte `NOT NULL` sans backfill prealable

#### Regle 2 - Compatibilite ascendante du code

Le code de `master` doit pouvoir lire une base qui contient:
- des lignes anciennes creees par `production`
- des colonnes potentiellement non remplies pour les nouvelles fonctionnalites GICOP

Consequence:
- les nouveaux champs GICOP doivent avoir des valeurs par defaut ou etre geres comme optionnels tant que le backfill n'est pas termine

#### Regle 3 - Zero perte de donnees

Interdictions:
- ecraser une information existante pour la remplacer par une valeur derivee non fiable
- recalculer aveuglement des affectations, relances, resultats ou categories si la source historique est ambigue
- supprimer un champ ou une table encore utilisee par `production` sans strategie de remplacement

#### Regle 4 - Migrations en plusieurs etapes

Pour tout changement important, utiliser la sequence suivante:
1. ajout de la nouvelle structure
2. backfill progressif ou calcul partiel
3. code lisant ancien + nouveau modele
4. verification
5. activation metier
6. nettoyage final seulement dans une phase ulterieure

#### Regle 5 - Feature flags ou activation progressive

Les fonctionnalites GICOP les plus sensibles doivent pouvoir etre activees progressivement:
- sticky assignment
- blocage du rapport obligatoire
- automatisations de satisfaction
- recap commande
- envoi code expedition

Pourquoi:
- pour deployer `master` sur la base existante sans tout activer d'un coup
- pour observer les effets sur les donnees reelles

### 1.3. Impact concret sur le chantier GICOP

Les besoins GICOP ne doivent pas seulement etre implementes.
Ils doivent etre implementes de maniere migrable.

Cela implique en pratique:

#### Affectation persistante

Si l'on cree une table `contact_assignment_affinity`:
- ne pas supprimer ou surcharger brutalement `poste_id` sur `whatsapp_chat`
- backfiller progressivement les affinites a partir de l'historique existant quand c'est fiable
- si l'historique est ambigu, laisser l'affinite vide plutot que d'inventer une valeur

#### Rapport conversationnel

Si l'on cree `conversation_report`:
- ne pas rendre les champs obligatoires immediatement sur toutes les conversations historiques
- creer les rapports au fil de l'eau pour les nouvelles conversations
- prevoir un backfill partiel optionnel seulement sur les conversations recentes ou actives si la donnee existe deja ailleurs

#### Lots d'appels et notation

Pour `commercial_obligation_batch`, `call_task`, `conversation_rating`:
- ne jamais supposer que les anciennes conversations possedent deja toutes les donnees necessaires
- declencher ces mecanismes seulement a partir d'une date d'activation GICOP clairement definie

#### Automatisations commande et expedition

Pour les nouveaux evenements ERP:
- ne pas supposer que les anciennes commandes ou anciennes conversations ont toutes les liaisons necessaires
- activer les automatisations seulement pour les evenements recus apres mise en service du contrat cible

### 1.4. Strategie de migration recommandee pour la publication future de `master`

La publication de `master` vers l'environnement aujourd'hui servi par `production` doit se faire en plusieurs etapes.

#### Etape A - Audit de schema avant bascule

Avant toute publication:
- comparer le schema reel de la base issue de `production`
- comparer les migrations deja presentes dans `master`
- identifier:
  - colonnes existantes en production mais non attendues par `master`
  - colonnes attendues par `master` mais absentes en production
  - indexes manquants
  - tables deja peuplees qui seront touchees par GICOP

#### Etape B - Migrations de compatibilite avant activation metier

Premiere vague de migrations GICOP:
- uniquement additives
- sans blocage metier
- sans suppression
- sans contrainte forte sur l'historique

#### Etape C - Backfill controle

Lancer ensuite des scripts de backfill ou jobs admin pour:
- rattacher ce qui peut l'etre de maniere fiable
- calculer les affinites de base si la donnee existe
- initialiser certains rapports ou statuts derives quand la source est sure

Important:
- tout backfill doit etre idempotent
- tout backfill doit produire un rapport
- tout backfill doit pouvoir etre rejoue sans corrompre la base

#### Etape D - Activation progressive

Activer ensuite les comportements GICOP par lots:
- d'abord lecture seule ou observabilite
- ensuite avertissements non bloquants
- enfin blocages et automatisations

#### Etape E - Nettoyage differe

Les suppressions de structures legacy ne doivent pas faire partie de la premiere publication de `master` si elles mettent en risque les donnees actuelles.

### 1.5. Regles specifiques a ajouter dans le plan technique

Chaque lot GICOP devra maintenant inclure une sous-partie supplementaire:
- impact schema sur base `production`
- strategie de backfill
- compatibilite avec donnees historiques
- rollback logique

Pour chaque migration future, il faudra documenter:
- si elle est additive ou destructive
- si elle touche des tables deja fortement peuplees
- si elle necessite un script de reprise
- si elle peut etre executee sans interruption

### 1.6. Travaux transverses a ajouter avant publication de `master`

Ajouter au plan un lot transverse "securisation de la bascule `production` -> `master`".

Contenu recommande:
- inventaire des divergences de schema entre `production` et `master`
- verification de toutes les migrations `message_whatsapp/src/database/migrations`
- creation d'une checklist de prepublication
- scripts de sauvegarde et verification post-migration
- scripts SQL de controle:
  - comptage des conversations
  - comptage des contacts
  - comptage des relances
  - comptage des appels
  - comptage des messages
- comparaison avant/apres deployment

Livrables recommandes:
- un document de runbook de migration
- un rapport de dry-run sur une copie de base `production`
- une liste des migrations GICOP classees:
  - sans risque
  - avec backfill requis
  - a activer plus tard

### 1.7. Regles concretes de migration SQL a respecter

Cette section doit etre appliquee comme norme de developpement pour toutes les migrations GICOP a venir.

#### Regle SQL 1 - Toujours separer ajout de structure et durcissement

Ordre impose:
1. ajouter la structure
2. deployer le code compatible
3. backfiller
4. seulement ensuite durcir contraintes et validations

Exemple correct:
1. `ADD COLUMN ... NULL`
2. code qui lit la colonne si presente sinon fallback
3. script de backfill
4. eventuellement `ALTER ... NOT NULL` dans une release ulterieure

Exemple interdit en premiere release:
- ajouter directement une colonne `NOT NULL` sur une table historisee sans backfill complet

#### Regle SQL 2 - Toute colonne nouvelle sur table deja peuplee doit etre nullable ou defaultee

Applicable a:
- `whatsapp_chat`
- `contact`
- `follow_up`
- `call_log`
- toute table alimentee en `production`

Recommandation:
- preferer `NULL` si la valeur n'est pas toujours connue
- preferer une valeur par defaut seulement si elle est semantiquement juste

Interdiction:
- utiliser une valeur par defaut trompeuse uniquement pour satisfaire une contrainte SQL

#### Regle SQL 3 - Aucun `DROP COLUMN`, `DROP TABLE` ou renommage destructif dans la premiere release GICOP

En premiere publication de `master` ciblee vers la base actuelle:
- pas de suppression de colonne legacy
- pas de suppression de table legacy
- pas de renommage destructif

Alternative recommandee:
- creer la nouvelle colonne ou la nouvelle table
- conserver l'ancienne structure
- migrer la lecture/criture dans le code
- supprimer plus tard seulement apres verification en production

#### Regle SQL 4 - Tout backfill doit etre idempotent

Un script de backfill doit pouvoir etre relance:
- sans dupliquer les lignes
- sans ecraser les valeurs deja corrigees manuellement
- sans produire un resultat different si la source n'a pas change

Techniques recommandees:
- `INSERT ... WHERE NOT EXISTS`
- `UPDATE ... WHERE nouvelle_colonne IS NULL`
- usage de cles de correlation stables
- journalisation du nombre de lignes traitees

Interdiction:
- `UPDATE` massif sans clause de protection
- `DELETE` preparatoire pour "reconstruire ensuite"

#### Regle SQL 5 - Toute migration doit etre pensee pour une base volumineuse

La base `production` contient deja beaucoup de donnees.

Donc:
- eviter les locks longs sur grosses tables
- indexer avant les backfills si necessaire
- faire les updates par lots quand le volume le justifie
- tester la duree d'execution sur copie de base

Pour les gros traitements:
- preferer un script admin ou un job batch plutot qu'une migration TypeORM qui tente de tout recalculer en une seule transaction

#### Regle SQL 6 - Les index doivent accompagner les nouvelles lectures GICOP

Chaque nouvelle table GICOP doit etre creee avec ses indexes minimaux des la premiere migration.

Exemples:
- `contact_assignment_affinity(contact_id, is_active)`
- `conversation_report(conversation_id)`
- `conversation_report(contact_id)`
- `commercial_obligation_batch(commercial_id, triggered_at)`
- `call_task(batch_id, status)`
- `outbound_automation_log(conversation_id, automation_type, created_at)`

Pourquoi:
- eviter qu'un nouveau module marche fonctionnellement mais degrade la base reellement

#### Regle SQL 7 - Toute table GICOP doit inclure une strategie de rattachement a l'historique

Avant de creer une table, il faut definir:
- comment elle se rattache a une conversation existante
- comment elle se rattache a un contact existant
- comment elle se comporte si les references historiques sont absentes ou ambiguës

Exigence:
- pas de schema "propre en theorie" qui serait impossible a remplir sur les donnees reelles

#### Regle SQL 8 - Les foreign keys doivent etre prudentes

Recommandation:
- utiliser `SET NULL` ou une policy defensive quand la relation historique peut etre incomplete
- reserver les `RESTRICT` stricts aux relations nouvelles et parfaitement controlees

Pourquoi:
- lors du basculement `production` -> `master`, certaines donnees anciennes peuvent ne pas satisfaire des hypotheses trop strictes

#### Regle SQL 9 - Les enums doivent etre geres avec prudence

Si une table existante contient des champs enum ou des statuts:
- ne pas casser les anciennes valeurs
- ajouter les nouvelles valeurs avant de les utiliser dans le code
- verifier la compatibilite des lignes existantes

Applicable notamment a:
- `conversation_result`
- `FollowUpStatus`
- toute future enum GICOP

#### Regle SQL 10 - Toute migration doit avoir sa verification post-execution

Chaque migration GICOP doit venir avec une checklist SQL de verification.

Exemples de controles:
- la table existe
- les indexes existent
- le nombre de lignes avant/apres est coherent
- les colonnes backfillees ont un taux de remplissage attendu
- aucune ligne critique n'a perdu sa reference principale

### 1.8. Patterns imposes pour les migrations GICOP

#### Pattern A - Ajout d'une nouvelle colonne metier sur table existante

Pattern obligatoire:
1. migration 1: `ADD COLUMN nullable`
2. code: lecture defensive
3. script de backfill
4. monitoring du taux de remplissage
5. migration 2 eventuelle: contrainte plus stricte

Usage cible:
- champs derives sur `whatsapp_chat`
- enrichissements sur `follow_up`

#### Pattern B - Introduction d'une nouvelle table liee a l'historique

Pattern obligatoire:
1. creation table
2. creation indexes
3. foreign keys defensives
4. backfill partiel facultatif
5. activation fonctionnelle progressive

Usage cible:
- `conversation_report`
- `conversation_rating`
- `contact_assignment_affinity`
- `commercial_obligation_batch`

#### Pattern C - Remplacement progressif d'une logique existante

Pattern obligatoire:
1. garder l'ancien comportement
2. introduire le nouveau stockage
3. ecrire dans les deux mondes si necessaire
4. comparer
5. basculer la lecture
6. supprimer plus tard

Usage cible:
- remplacement de certaines regles de dispatch
- remplacement de logiques de cron legacy

#### Pattern D - Backfill volumineux

Pattern recommande:
1. requete de qualification des lignes cible
2. traitement par batch
3. logs par lot
4. possibilite de reprise
5. rapport final

Interdiction:
- un backfill unique et opaque qui modifie toute la base sans granularite

### 1.9. Checklist pre-deploiement pour toute migration GICOP

Avant fusion finale vers la publication de `master`, chaque lot doit repondre a cette checklist:

#### Checklist schema

- la migration est-elle additive ?
- touche-t-elle une table deja fortement peuplee ?
- ajoute-t-elle une contrainte `NOT NULL` ?
- ajoute-t-elle une FK potentiellement bloquante ?
- les indexes necessaires sont-ils presents ?

#### Checklist data

- que devient une ligne historique creee par `production` ?
- la migration preserve-t-elle toutes les donnees existantes ?
- un backfill est-il requis ?
- le backfill est-il idempotent ?
- le plan de verification post-backfill existe-t-il ?

#### Checklist code

- le code `master` supporte-t-il les lignes encore non backfillees ?
- le code supporte-t-il les anciennes valeurs ou anciens statuts ?
- existe-t-il un feature flag ou une activation progressive si le changement est sensible ?

#### Checklist exploitation

- la migration a-t-elle ete testee sur une copie de base `production` ?
- le temps d'execution a-t-il ete mesure ?
- les requetes de controle avant/apres sont-elles pretes ?
- un plan de rollback logique existe-t-il ?

### 1.10. Controle avant/apres publication de `master`

Le document doit imposer un controle de conservation des donnees au moment de la publication.

#### Controle avant deployment

Mesures minimales a capturer:
- nombre de contacts
- nombre de conversations
- nombre de messages
- nombre de relances
- nombre d'appels
- nombre de conversations fermees / actives / en attente

#### Controle apres deployment

Verifier:
- les memes volumes de reference
- absence de chute anormale
- absence de colonnes critiques a `NULL` de maniere inattendue
- absence d'echec sur les crons critiques
- absence d'erreur sur les nouveaux modules GICOP

#### Controle apres activation fonctionnelle

Verifier:
- creation correcte des nouvelles lignes GICOP
- aucune regression sur les anciennes conversations
- aucune perte de lien entre contact, conversation, relance et appel

### 1.11. Conclusion de gouvernance

Le plan GICOP ne doit pas etre vu seulement comme un plan de developpement.

Il doit aussi etre un plan de convergence entre:
- la branche `production` actuellement exploitee
- la branche `master` qui doit devenir la future version publiee
- une base de donnees reelle deja chargee en donnees metier

La regle absolue pour tout le chantier est donc:
- `master` doit enrichir la base existante, jamais la traiter comme une base neuve
- toute migration GICOP doit etre reversible, additive ou progressivisable autant que possible

---

## 2. Base existante confirmee dans le code

### 2.1. Affectation, queue et reassignation

Points confirmes dans le backend:
- `message_whatsapp/src/dispatcher/application/assign-conversation.use-case.ts`
- `message_whatsapp/src/dispatcher/domain/dispatch-policy.service.ts`
- `message_whatsapp/src/dispatcher/infrastructure/dispatch-query.service.ts`
- `message_whatsapp/src/dispatcher/application/reinject-conversation.use-case.ts`
- `message_whatsapp/src/dispatcher/application/redispatch-waiting.use-case.ts`

Capacites deja presentes:
- recherche d'une conversation existante par `chat_id`
- logique de reuse si le poste courant est eligible
- affectation d'une nouvelle conversation a un poste resolu par la policy
- gestion des cas sans poste disponible avec mise en attente
- publication temps reel apres assignation ou reassignation
- reinjection et redistribution des conversations selon disponibilite

Limite actuelle:
- le systeme raisonne sur l'affectation courante
- il n'existe pas encore de notion robuste d'affinite historique client -> poste

### 2.2. Limitation de charge et fenetre glissante

Points confirmes:
- `message_whatsapp/src/conversation-capacity/conversation-capacity.service.ts`
- `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`

Capacites deja presentes:
- quota actif par defaut `10`
- quota total par defaut `50`
- verrouillage de conversations au-dela du quota actif
- mode fenetre glissante avec `window_slot`, `window_status`, `is_locked`
- resumee admin par poste

Limite actuelle:
- la logique existe mais doit etre rendue incontestable sur tous les chemins de changement d'etat
- le besoin GICOP parle d'une regle metier stricte "pas plus de 10 simultanees", ce qui impose de clarifier la definition de simultane

### 2.3. Qualification de fin de conversation

Points confirmes:
- `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`
- `front/src/components/chat/ConversationOutcomeModal.tsx`

Capacites deja presentes:
- champ `conversation_result`
- liste de resultats metier deja en place:
  - `commande_confirmee`
  - `commande_a_saisir`
  - `a_relancer`
  - `rappel_programme`
  - `pas_interesse`
  - `sans_reponse`
  - `infos_incompletes`
  - `deja_client`
  - `annule`
- modal front de saisie du resultat

Limite actuelle:
- la qualification n'est pas encore couplee a un rapport structure obligatoire
- les regles conditionnelles ne sont pas encore durcies

### 2.4. Relances

Points confirmes:
- `message_whatsapp/src/follow-up/follow_up.service.ts`
- `front/src/components/chat/CreateFollowUpModal.tsx`

Capacites deja presentes:
- creation de relance
- completion et annulation
- recherche par commercial et contact
- cron de passage en retard
- emission d'evenements `follow_up.created` et `follow_up.completed`

Limite actuelle:
- aucune automatisation d'envoi client a la date de relance
- la relance existe comme enregistrement metier, pas comme scenario sortant complet

### 2.5. Reponses rapides

Points confirmes:
- `message_whatsapp/src/canned-response/canned-response.service.ts`
- `front/src/components/chat/CannedResponseMenu.tsx`

Capacites deja presentes:
- bibliotheque de reponses rapides textuelles
- filtrage par tenant et poste
- categories
- menu d'autocompletion dans le chat

Limite actuelle:
- pas de gestion native d'assets multimedia metiers
- pas de workflows par categorie GICOP

### 2.6. Appels et historique relationnel

Points confirmes:
- `message_whatsapp/src/call-log/call_log.service.ts`
- `message_whatsapp/src/client-dossier/client-dossier.service.ts`
- `front/src/components/contacts/CallLogHistory.tsx`

Capacites deja presentes:
- journalisation des appels
- recherche par commercial et contact
- dossier client et timeline relationnelle

Limite actuelle:
- pas de moteur de taches d'appels obligatoires
- pas de controle automatique "appel valide si duree >= 90 secondes"

### 2.7. Integration ERP entrante

Points confirmes:
- `message_whatsapp/src/inbound-integration/inbound-integration.service.ts`
- `PLATEFORME_CONVERSATION_GESTION_COMMANDE.md`

Capacites deja presentes:
- reception de:
  - `order_created`
  - `order_updated`
  - `order_cancelled`
  - `client_order_summary_updated`
  - `client_certification_updated`
  - `referral_updated`
- mise a jour de `Contact`
- mapping partiel de categories clients

Limite actuelle:
- l'integration met a jour le dossier client mais ne declenche pas encore de messages automatiques GICOP
- les payloads actuels ne semblent pas encore couvrir tous les attributs necessaires au recap commande et au code d'expedition

---

## 3. Analyse des besoins GICOP par rapport a l'existant

### 3.1. Besoin 1 - Retour automatique sur le poste deja affecte

Etat:
- partiellement couvert

Ce qui existe:
- reuse de la conversation si le poste courant reste eligible

Ce qui manque:
- une memoire persistante de l'affectation de reference du client ou de la conversation
- une policy d'exception explicite quand le poste de reference est offline, inactif ou ferme

### 3.2. Besoin 2 - Rapport obligatoire pour chaque message entrant

Etat:
- non couvert de maniere structuree

Ce qui existe:
- certaines donnees sont stockables dans `Contact`
- la fin de conversation peut etre qualifiee

Ce qui manque:
- un rapport conversationnel dedie
- des champs metiers normalises
- une obligation de completude avant certaines actions

### 3.3. Besoin 3 - Limite stricte a 10 conversations simultanees

Etat:
- couvert techniquement en grande partie

Ce qui existe:
- quotas et verrouillage

Ce qui manque:
- une enforcement metier claire sur tous les flux
- une UX qui rende la contrainte visible et non contournable

### 3.4. Besoin 4 - Tous les 10 dossiers termines, generer un lot d'appels obligatoires

Etat:
- non couvert

Ce qui existe:
- logs d'appels
- categories clients partiellement alimentees

Ce qui manque:
- moteur de jalons
- generation de lots et de taches
- controles sur duree d'appel
- controle qualite des derniers messages

### 3.5. Besoin 5 - Notation client en fin de conversation

Etat:
- non couvert

Ce qui manque:
- message sortant de satisfaction
- stockage de la note et du commentaire
- rattachement a la conversation et au commercial

### 3.6. Besoin 6 - Message automatique a la date de relance

Etat:
- partiellement couvert

Ce qui existe:
- la relance et sa date existent

Ce qui manque:
- ordonnanceur d'envoi
- journalisation du message automatique
- prise en compte de la fenetre WhatsApp 24h et des templates

### 3.7. Besoin 7 - Envoi du recapitulatif de commande + photo si 24h ouvertes

Etat:
- non couvert

Ce qui existe:
- reception d'un `order_created`

Ce qui manque:
- donnees completes de commande
- verificateur de fenetre 24h
- composeur de message multi-parties
- recuperation ou stockage de la photo produit

### 3.8. Besoin 8 - Envoi automatique du code d'expedition

Etat:
- non couvert

Ce qui manque:
- evenement entrant dedie ou enrichissement de `order_updated`
- template/message sortant et trace d'envoi

### 3.9. Besoin 9 - Bouton d'envoi de categories d'information multimedia

Etat:
- partiellement couvert via les canned responses

Ce qui manque:
- vraie bibliotheque multimedia metier
- envoi texte + image/video/document
- gestion admin de ces contenus

---

## 4. Principes d'architecture recommandes pour GICOP

### 4.1. Regle generale

Il faut separer clairement:
- les donnees relationnelles durables du client
- les donnees de traitement de la conversation
- les automatismes derives d'un evenement metier

### 4.2. Source de verite recommandees

Conversationnelle:
- affectation conversationnelle
- rapport de qualification
- resultat de conversation
- relances
- appels relationnels
- messages automatiques sortants
- notation de satisfaction

Plateforme de gestion des commandes:
- commande
- lignes produit
- photo produit
- expedition
- statut logistique
- categorie derivee du cycle de commande si elle depend du metier de commande

### 4.3. Principe de conception

Ne pas surcharger `Contact` ni `WhatsappChat` avec tous les nouveaux besoins. Ajouter des entites specialisees pour:
- le rapport conversationnel
- l'affinite d'affectation
- les obligations d'appels
- les notations
- les contenus informationnels
- les logs d'automatisation

### 4.4. Regle d'implementation

Chaque fonctionnalite GICOP doit etre livree avec:
- migration
- entite TypeORM
- service metier
- endpoints ou listeners
- publication temps reel si besoin
- UX front
- tests unitaires
- tests e2e ou integration quand l'evenement est critique

---

## 5. Cible de donnees a introduire

## 5.1. Affectation persistante

### Option recommandee

Creer une table dediee:
- `contact_assignment_affinity`

Champs recommandes:
- `id`
- `tenant_id`
- `contact_id`
- `primary_chat_id` nullable
- `poste_id`
- `assigned_at`
- `last_returned_at`
- `source`
- `is_active`
- `released_at`
- `released_reason`
- `updated_by`
- `created_at`
- `updated_at`

Pourquoi une table dediee:
- un client peut changer de conversation
- l'affinite doit survivre aux fermetures et reouvertures
- il faut historiser les changements

Alternative minimale:
- ajouter `sticky_poste_id` sur `WhatsappChat`

Verdict:
- non recommande si l'objectif est "toutes les fois ou ce message revient"
- une logique client -> poste est plus robuste qu'une logique chat -> poste

## 5.2. Rapport conversationnel

Creer:
- `conversation_report`

Champs recommandes:
- `id`
- `tenant_id`
- `conversation_id`
- `contact_id`
- `commercial_id`
- `client_full_name`
- `city`
- `commune`
- `district`
- `product_interest_category`
- `product_interest_detail`
- `skin_tone_or_shape`
- `other_phone_numbers` JSON
- `follow_up_due_at`
- `customer_need`
- `interest_score`
- `is_uninterested_male`
- `is_complete`
- `last_completed_at`
- `created_at`
- `updated_at`

Remarques:
- `product_interest_category` doit pouvoir couvrir "type de teint" et "forme"
- `other_phone_numbers` doit etre exploitable pour enrichir les numeros du client a terme

## 5.3. Notation de conversation

Creer:
- `conversation_rating`

Champs recommandes:
- `id`
- `tenant_id`
- `conversation_id`
- `contact_id`
- `commercial_id`
- `rating`
- `comment`
- `request_message_id`
- `sent_at`
- `received_at`
- `status`
- `channel`
- `created_at`
- `updated_at`

## 5.4. Lots et taches d'appels obligatoires

Creer:
- `commercial_obligation_batch`
- `call_task`

`commercial_obligation_batch`:
- `id`
- `tenant_id`
- `commercial_id`
- `trigger_count`
- `triggered_at`
- `status`
- `quality_check_status`
- `quality_check_snapshot` JSON
- `validated_at`
- `created_at`
- `updated_at`

`call_task`:
- `id`
- `tenant_id`
- `batch_id`
- `commercial_id`
- `contact_id`
- `conversation_id` nullable
- `task_type`
- `target_category`
- `min_duration_sec`
- `required_calls_count`
- `status`
- `matched_call_log_id` nullable
- `completed_at`
- `validation_reason`
- `created_at`
- `updated_at`

## 5.5. Bibliotheque multimedia d'information

Creer:
- `information_category_asset`

Champs recommandes:
- `id`
- `tenant_id`
- `poste_id` nullable
- `category_code`
- `title`
- `description`
- `text_content`
- `media_type`
- `media_url`
- `document_url`
- `thumbnail_url`
- `mime_type`
- `sort_order`
- `is_active`
- `created_by`
- `created_at`
- `updated_at`

## 5.6. Logs d'automatisation

Creer:
- `outbound_automation_log`

Champs recommandes:
- `id`
- `tenant_id`
- `conversation_id`
- `contact_id`
- `commercial_id` nullable
- `automation_type`
- `trigger_event`
- `payload_snapshot` JSON
- `channel_provider`
- `message_id` nullable
- `status`
- `error_code` nullable
- `error_message` nullable
- `sent_at` nullable
- `created_at`

Pourquoi:
- indispensable pour debug, audit, reprise manuelle et supervision admin

---

## 6. Plan detaille par besoin

## 6.1. Besoin 1 - Affectation persistante sur le meme poste

### Objectif metier

Des la premiere affectation utile d'un client, tout nouveau retour de ce client doit revenir sur le meme poste, sauf derogation explicite.

### Regles metier recommandees

Regle nominale:
- premiere affectation reussie -> creation ou activation d'une affinite `contact -> poste`
- nouveau message entrant du meme client -> recherche prioritaire du poste d'affinite

Cas d'exception a parametrer:
- poste d'affinite offline
- poste desactive
- poste supprime
- depassement de capacite
- transfert manuel

Politique recommandee:
- par defaut, si le poste d'affinite est offline, conserver la conversation en attente pendant une duree configurable
- si le delai expire, fallback sur la policy normale
- un transfert manuel peut etre de deux types:
  - `transfert_temporaire`: ne casse pas l'affinite historique
  - `transfert_proprietaire`: remplace l'affinite historique

### Impacts backend

Modules cibles:
- `dispatcher`
- `contact`
- `whatsapp_chat`

Travaux:
- ajouter l'entite `contact_assignment_affinity`
- ajouter un service `AssignmentAffinityService`
- enrichir le pipeline d'assignation dans `assign-conversation.use-case.ts`
- faire resoudre le poste d'affinite avant la policy standard
- tracer la decision:
  - `AFFINITY_HIT`
  - `AFFINITY_WAITING`
  - `AFFINITY_FALLBACK`
  - `AFFINITY_OVERRIDDEN`

### Impacts front

Dans le chat et la liste:
- afficher "poste proprietaire"
- afficher quand la conversation est temporairement attribuee hors affinite
- afficher le motif

### Impacts admin

Ajouter:
- consultation des affinites
- override manuel
- historique des changements

### Criteres d'acceptation

- si le client ecrit a nouveau et que le poste d'affinite est disponible, la conversation revient au meme poste
- si le poste d'affinite est indisponible, le comportement suit la policy choisie
- un transfert proprietaire met a jour l'affinite

### Tests

- test unitaire de la resolution d'affinite
- test e2e "conversation fermee -> nouveau message -> retour meme poste"
- test e2e "poste offline -> attente puis fallback"

---

## 6.2. Besoin 2 - Rapport obligatoire pour toute conversation entrante

### Objectif metier

Chaque conversation active doit avoir un rapport de qualification exploitable par le commercial et par la suite du processus.

### Champs imposes par GICOP

- nom et/ou prenoms
- ville
- commune
- quartier
- categorie de produit interesse
- type de teint ou forme
- autres numeros de telephone
- date et heure de relance
- besoin de la cliente
- note d'interet sur 5
- est-ce un homme non interesse

### Regle recommandees

Regle pragmatique:
- le rapport n'a pas besoin d'etre complet des le tout premier message
- en revanche, il doit etre minimalement renseigne avant:
  - fermeture
  - transfert proprietaire
  - qualification finale comme `commande_confirmee`, `a_relancer`, `pas_interesse`

Bloc minimum recommande avant cloture:
- `customer_need`
- `interest_score`
- `product_interest_category` ou `is_uninterested_male`
- `client_full_name` si connu

Regle conditionnelle:
- si resultat final = `a_relancer` ou `rappel_programme`, alors `follow_up_due_at` est obligatoire
- si `is_uninterested_male = true`, alors `interest_score` peut etre nul ou force a 1 selon arbitrage metier

### Impacts backend

Creer module:
- `conversation-report`

API recommandee:
- `GET /chats/:chatId/report`
- `PUT /chats/:chatId/report`
- `PATCH /chats/:chatId/report/validate`

Validations:
- `interest_score` entre 1 et 5
- numerotation des telephones secondaires normalisee
- `follow_up_due_at` non passee

Couplage metier:
- a l'ouverture d'une conversation, creer le brouillon du rapport si absent
- lors de la mise a jour, emitter `conversation_report.updated`
- lors de la validation, emitter `conversation_report.completed`

### Impacts front

Ajouter dans l'ecran chat:
- un panneau lateral ou un bloc fixe "Rapport GICOP"
- sauvegarde progressive
- indicateur:
  - `Incomplet`
  - `A verifier`
  - `Complet`

UX recommandee:
- autosave
- champs compacts
- validation non bloquante pendant la conversation
- blocage uniquement au moment des actions metier finales

### Impacts admin

Ajouter:
- recherche des rapports
- completude par commercial
- export

### Criteres d'acceptation

- un brouillon est cree des la prise en charge ou a la premiere ouverture du panneau
- la fermeture est refusee si les champs minimaux ne sont pas remplis
- la relance proposee peut pre-remplir la date du rapport

### Tests

- test unitaire de validation des champs
- test e2e blocage de fermeture sans rapport
- test e2e completion du rapport puis fermeture autorisee

---

## 6.3. Besoin 3 - Limite stricte a 10 conversations simultanees

### Objectif metier

Un commercial ne doit pas traiter plus de 10 conversations en parallele avec droit de reponse actif.

### Definition recommandees

Pour eviter l'ambiguite, definir officiellement:
- `conversation simultanee` = conversation non fermee attribuee au poste et non `released`
- `conversation active` = conversation avec droit de reponse immediat

La regle GICOP doit porter sur:
- maximum 10 `ACTIVE` ou `VALIDATED` selon la semantics retenue

### Impacts backend

Travaux:
- auditer tous les chemins qui changent `poste_id`, `status`, `window_status`, `is_locked`
- verifier que `onConversationAssigned` est appele sur:
  - assignation initiale
  - reassignation
  - reouverture
  - transferts
- ajouter un garde-fou centralise au niveau service pour toute prise en charge manuelle

### Impacts front

Ajouter:
- indicateur visible `x/10`
- badge "verrouillee"
- blocage du bouton de prise en charge si quota atteint

### Impacts admin

Ajouter:
- parametre quota si besoin
- ecran de surcharge
- audit des depassements

### Criteres d'acceptation

- impossible d'activer une 11e conversation
- a la liberation d'une conversation, une conversation verrouillee devient eligible selon la policy existante

### Tests

- test unitaire d'assignation 11e conversation
- test e2e de liberation puis deblocage

---

## 6.4. Besoin 4 - Tous les 10 dossiers termines, generation d'obligations d'appels

### Objectif metier

Apres chaque groupe de 10 conversations terminees par un commercial:
- 5 appels a des clientes avec commandes annulees
- 5 appels a des clientes deja livrees
- 5 appels a des clientes venues sans commande GICOP
- chaque appel doit durer au moins 90 secondes
- controle des 10 derniers messages de conversation
- le commercial doit avoir la derniere reponse

### Sous-problemes a traiter

1. Detection du seuil des 10 conversations
2. Selection des clientes cibles
3. Generation des taches
4. Validation via `call_log`
5. Controle qualite conversationnel

### Regle de declenchement recommandees

Evenement de reference:
- `conversation.closed` ou `conversation.finalized`

Compteur:
- compter les conversations terminees avec resultat valide
- a chaque multiple de 10, creer un `commercial_obligation_batch`

Important:
- il faut geler le compteur par batch pour eviter la double generation en cas de retry

### Selection des cibles

Categorie 1:
- `commande_annulee`

Categorie 2:
- `commande_avec_livraison`

Categorie 3:
- `venue_sans_commande`

Point d'attention:
- la categorie 3 n'est pas clairement modelisee aujourd'hui
- il faudra soit:
  - l'alimenter depuis l'ERP
  - soit la deduire depuis le rapport conversationnel et l'absence de commande

Pre-requis bloquant:
- le Lot F ne doit pas commencer tant que les 3 categories cibles ne sont pas formellement alimentees et verifiables en base
- la modelisation de `venue_sans_commande` doit etre decidee avant le developpement du moteur de batch

Decision de planification:
- l'alimentation fiable des categories clients devient un pre-requis a traiter des la Phase 1 ou Phase 2
- le moteur de batch d'appels reste en Phase 4, mais sa data foundation doit etre livree plus tot

### Validation d'appel

Une tache est completee si:
- un `call_log` du commercial vers le contact existe
- la duree >= 90 secondes
- l'appel est posterieur a la creation de la tache

### Controle qualite sur les 10 derniers messages

Version minimum recommandee pour V1:
- recuperer les 10 derniers messages de la conversation
- verifier que:
  - le dernier message est sortant commercial
  - il n'y a pas de question cliente sans reponse si le message client est le dernier entrant important

Version V2 possible:
- score automatique assiste par IA
- checklist admin de revue

### Impacts backend

Creer modules:
- `commercial-milestone`
- `call-task`
- `conversation-quality`

Travaux:
- listener sur fin de conversation
- generation des batches
- selection de contacts par categorie
- matching automatique avec `CallLog`
- service de qualite sur les 10 derniers messages

### Impacts front

Ajouter:
- vue "Obligations d'appels"
- progression du batch
- statut par categorie
- indicateur "controle qualite conforme / non conforme"

### Impacts admin

Ajouter:
- suivi par commercial
- batchs ouverts, termines, bloques
- causes d'echec

### Criteres d'acceptation

- a 10 conversations terminees, un batch est cree une seule fois
- les 15 taches sont generees si la data client est disponible
- un appel de 45 secondes ne valide pas la tache
- un appel de 95 secondes valide la tache
- la qualite des 10 derniers messages est calculee

### Tests

- tests unitaires du compteur de batch
- tests unitaires de matching `call_log`
- tests integration sur la selection des clientes
- tests e2e sur generation du batch

---

## 6.5. Besoin 5 - Notation client en fin de conversation

### Objectif metier

A la fin de chaque conversation, le client recoit une demande de notation du commercial et de la prestation.

### Regle recommandees

Evenement declencheur:
- conversation fermee avec resultat final valide

Canal:
- message WhatsApp libre si fenetre 24h ouverte
- sinon template WhatsApp pre-approuve

Format V1 recommande:
- note sur 5
- commentaire optionnel

### Impacts backend

Creer module:
- `conversation-rating`

Travaux:
- listener `conversation.closed`
- emission du message de notation
- reception et rattachement de la reponse si la strategie de collecte passe par inbound parsing
- stockage du statut d'envoi

Attention:
- il faut definir comment parser la note recue:
  - simple reponse numerique
  - bouton template si disponible

### Impacts front

Ajouter:
- note recue dans le dossier client
- note moyenne du commercial
- derniere satisfaction dans le chat ou la fiche contact

### Impacts admin

Ajouter:
- dashboard satisfaction
- moyenne par commercial
- taux de reponse

### Criteres d'acceptation

- a la fermeture d'une conversation, une demande de notation est generee
- la note recue est rattachee au bon commercial et a la bonne conversation

### Tests

- test listener fermeture -> demande de notation
- test parsing note inbound

---

## 6.6. Besoin 6 - Message automatique a la date de relance

### Objectif metier

Apres enregistrement d'une relance, le systeme doit envoyer le rappel ou la prise de rendez-vous a la date choisie.

### Regle recommandees

Flux:
1. le commercial cree une relance
2. la relance est stockee
3. si l'option d'envoi automatique est activee, une tache de message planifie est creee
4. a l'echeance, le message est envoye

Option recommandee de modelisation:
- enrichir `follow_up`
- et introduire `scheduled_outbound_message` si plusieurs automations arrivent

Comme plusieurs cas automatiques GICOP existent, la meilleure option est:
- creer une table generique `scheduled_outbound_message`

Champs recommandes:
- `id`
- `tenant_id`
- `contact_id`
- `conversation_id`
- `trigger_type`
- `scheduled_for`
- `template_code` nullable
- `free_text_content`
- `status`
- `attempts`
- `sent_at`
- `error_message`

### Impacts backend

Travaux:
- listener sur `follow_up.created`
- job cron d'envoi
- integration avec `communication_whapi`
- journalisation dans `outbound_automation_log`

### Impacts front

Ajouter:
- case "envoyer rappel automatique"
- preview du message
- statut du rappel envoye ou en attente

### Impacts admin

Ajouter:
- file des messages planifies
- echecs et relances manuelles

### Criteres d'acceptation

- une relance avec date cree un message planifie
- a l'heure prevue, le message est envoye ou marke en echec

### Tests

- test creation message planifie
- test cron d'envoi
- test comportement hors fenetre 24h

---

## 6.7. Besoin 7 - Recapitulatif de commande + photo produit si 24h ouvertes

### Objectif metier

Des qu'une commande est enregistree sur une conversation recente et que la fenetre 24h WhatsApp est encore ouverte, le systeme envoie:
- le recapitulatif de la commande
- la photo du produit

### Pre-requis data

Le payload entrant doit au minimum fournir:
- `order_id`
- `client_id` ou telephone
- `conversation_id` si connu
- detail produit
- nom produit
- quantite
- montant
- photo produit ou URL de media
- date de creation de commande

Etat actuel:
- l'interface `OrderCreatedPayload` ne fournit pas encore assez d'information

### Regle recommandee

Condition d'envoi:
- fenetre 24h ouverte par rapport au dernier message entrant client
- conversation rattachee ou contact identifiable

Sinon:
- ne pas envoyer de message libre
- basculer vers:
  - template si approuve
  - ou simple log d'eligibilite manquee selon arbitrage

### Impacts backend

Travaux:
- etendre `InboundIntegrationService`
- enrichir les DTOs entrants ERP
- creer un service `WhatsappWindowPolicyService`
- composer le recapitulatif
- envoyer texte + media

### Impacts front

Ajouter:
- trace dans la timeline
- badge "recap commande envoye"

### Impacts admin

Ajouter:
- visualisation des automations commande
- reprise manuelle

### Criteres d'acceptation

- sur `order_created`, si la fenetre est ouverte, le recap et la photo sont envoyes
- si la fenetre est fermee, le comportement suit la policy definie

### Tests

- test event `order_created` avec fenetre ouverte
- test event `order_created` avec fenetre fermee

---

## 6.8. Besoin 8 - Envoi automatique du code d'expedition

### Objectif metier

Des qu'un code d'expedition est genere, il doit etre envoye au numero WhatsApp du client.

### Pre-requis

Il faut un evenement entrant explicite:
- `shipment_code_created`

ou un enrichissement de:
- `order_updated`

Payload minimum:
- `order_id`
- `client_id` ou telephone
- `shipment_code`
- `carrier_name` optionnel
- `created_at`

### Impacts backend

Travaux:
- etendre `InboundIntegrationService`
- retrouver le bon contact
- envoyer le message
- journaliser

### Impacts front

Ajouter:
- historique "code d'expedition envoye"

### Impacts admin

Ajouter:
- logs d'expedition envoyee
- re-envoi manuel

### Criteres d'acceptation

- quand le code est recu, le systeme l'envoie au bon numero WhatsApp

### Tests

- test reception evenement expedition
- test absence de contact identifiable

---

## 6.9. Besoin 9 - Bouton d'envoi de categories d'information multimedia

### Objectif metier

Le commercial doit pouvoir envoyer rapidement des contenus GICOP standards:
- utilisation d'un produit ou d'une gamme
- numero de depot
- carte de visite de la commerciale
- autres

Avec support:
- texte
- image
- video
- document

### Strategie recommandee

Ne pas surcharger les `canned_response` existantes.

Creer un catalogue dedie:
- gere par categories
- capable de porter un ou plusieurs medias
- exploitable depuis le chat par un bouton metier distinct

### Impacts backend

Creer module:
- `information-catalog`

API:
- CRUD admin
- listing commercial par categorie
- endpoint d'envoi

### Impacts front commercial

Ajouter:
- bouton dans `ChatInput`
- modal de selection par categorie
- preview avant envoi
- support texte + media

### Impacts admin

Ajouter:
- ecran de gestion de la bibliotheque
- activation/desactivation
- tri et ciblage par poste

### Criteres d'acceptation

- le commercial peut choisir une categorie et envoyer un contenu avec media
- le contenu est journalise comme message sortant normal

### Tests

- test CRUD du catalogue
- test envoi d'un asset
- test affichage front

---

## 7. Evolutions transverses obligatoires

## 7.1. Evenements metier a standardiser

Evenements internes a ajouter:
- `conversation.assigned_affinity_created`
- `conversation.assigned_affinity_updated`
- `conversation.report_updated`
- `conversation.report_completed`
- `conversation.finalized`
- `conversation.rating_requested`
- `conversation.rating_received`
- `commercial.batch_created`
- `call_task.completed`
- `automation.scheduled`
- `automation.sent`
- `automation.failed`

Evenements entrants ERP a formaliser ou enrichir:
- `order_created`
- `order_updated`
- `order_cancelled`
- `client_order_summary_updated`
- `shipment_code_created`
- `product_media_updated` si necessaire

## 7.2. Politique de fenetre 24h WhatsApp

Comme plusieurs besoins GICOP dependent des regles WhatsApp, il faut un service transversal:
- `WhatsappWindowPolicyService`

Responsabilites:
- determiner si la fenetre 24h est ouverte
- indiquer si un message libre est autorise
- indiquer si un template est necessaire
- fournir la raison d'ineligibilite
- exposer une decision normalisee reutilisable par tous les modules

Contrat minimal recommande:
- `window_open: boolean`
- `free_text_allowed: boolean`
- `template_required: boolean`
- `recommended_template_code: string | null`
- `fallback_mode: 'template' | 'log_only' | 'skip'`
- `reason_code`
- `reason_message`

Ce service doit etre utilise par:
- relances automatiques
- notation client
- recap commande
- code d'expedition si besoin

Arbitrages a rendre obligatoires avant implementation:
- hors fenetre 24h, la regle par defaut est-elle:
  - envoi via template
  - simple journalisation sans envoi
  - ou blocage explicite avec reprise manuelle
- quels templates WhatsApp doivent exister pour:
  - notation client
  - relance planifiee
  - recap commande
  - code expedition

Regle projet:
- aucun besoin 5, 6, 7 ou 8 ne doit implementer sa propre logique locale de fenetre 24h
- toute decision doit passer par `WhatsappWindowPolicyService`

## 7.3. Observabilite et audit

Tous les besoins GICOP doivent etre traçables.

Il faut journaliser:
- pourquoi une affectation est revenue ou non sur le poste historique
- pourquoi une conversation a ete verrouillee a cause de la capacite
- pourquoi un batch d'appels a ete cree
- pourquoi une tache d'appel a ete validee ou refusee
- pourquoi une automation a ete envoyee, reportee ou annulee

Livrables explicites obligatoires:
- logs structures pour chaque decision metier critique
- dashboards admin minimaux pour:
  - affectation sticky
  - fermetures automatiques bloquees ou executees
  - automations envoyees / refusees
  - batches d'appels generes / bloques
- ecran de suivi des crons et jobs a risque GICOP

Regle de delivery:
- aucune phase GICOP ne sera consideree terminee sans ses logs et indicateurs minimums

## 7.4. Permissions et RBAC

Verifier que les roles existants couvrent:
- edition du rapport GICOP
- validation ou override admin
- gestion du catalogue multimedia
- visualisation des notes et batches d'appels

## 7.5. Normalisation des telephones

Le besoin GICOP introduit "autres numeros de telephone". Il faut:
- normaliser tous les numeros secondaires
- eviter les doublons
- distinguer numero WhatsApp, numero principal, numero secondaire

Ce sujet devra idealement converger avec le document:
- `PLATEFORME_CONVERSATION_GESTION_COMMANDE.md`

---

## 8. Audit des crons et jobs planifies

Le plan GICOP doit tenir compte des traitements automatiques deja presents dans le code, car plusieurs jobs peuvent modifier une conversation sans intervention humaine.

Avec GICOP, cela devient critique sur 6 sujets:
- retour au poste affecte
- blocage a 10 conversations
- rapport obligatoire
- fermeture de conversation
- relances automatiques
- automatisations de satisfaction et de commande

Il faut distinguer:
- les jobs pilotes via `cron_config`
- les jobs declares directement en `@Cron`

Les premiers sont administrables centralement.
Les seconds sont plus risqués car ils tournent hors du registre central des crons.

## 8.1. Jobs pilotes via `cron_config`

### `sla-checker`

Sources:
- `message_whatsapp/src/jorbs/first-response-timeout.job.ts`
- `message_whatsapp/src/jorbs/cron-config.service.ts`

Etat actuel:
- actif par defaut
- cadence par intervalle
- valeur par defaut actuelle: `121` minutes
- ignore automatiquement la tranche 21h -> 5h
- relance `dispatcher.jobRunnerAllPostes()`

Impact fonctionnel:
- re-injection ou re-dispatch des conversations non lues ou sans reponse

Risque GICOP:
- eleve
- peut casser la regle "toujours revenir sur le poste affecte" si la logique sticky n'est pas integree
- peut produire une reaffectation silencieuse contraire au futur modele d'affinite

Decision recommandee:
- `A CONSERVER`
- `A ADAPTER AVANT LIVRAISON GICOP`

Conditions d'adaptation:
- integrer la `contact_assignment_affinity` dans le dispatcher
- journaliser toute reaffectation forcee hors affinite
- respecter une policy explicite si le poste proprietaire est indisponible

### `read-only-enforcement`

Sources:
- `message_whatsapp/src/jorbs/read-only-enforcement.job.ts`
- `message_whatsapp/src/jorbs/cron-config.service.ts`

Etat actuel:
- actif par defaut
- intervalle par defaut: `60` minutes
- ferme automatiquement les conversations inactives
- le seuil est stocke dans `ttlDays` mais interprete en heures

Impact fonctionnel:
- fermeture automatique des conversations non fermees

Risque GICOP:
- tres eleve
- peut fermer une conversation avant:
  - completion du rapport GICOP
  - envoi de la notation client
  - generation d'un batch commercial
  - execution d'une relance attendue

Decision recommandee:
- `A CONSERVER SOUS CONDITION`
- `A DESACTIVER TEMPORAIREMENT EN RECETTE GICOP` si les nouvelles regles de cloture ne sont pas encore implementees

Conditions d'adaptation:
- ne jamais fermer si rapport GICOP requis et incomplet
- ne jamais fermer si une notation doit etre envoyee
- ne jamais fermer si une automation critique est planifiee
- tracer les cas bloques par regle GICOP

### `offline-reinject`

Sources:
- `message_whatsapp/src/jorbs/offline-reinjection.job.ts`
- `message_whatsapp/src/jorbs/cron-config.service.ts`

Etat actuel:
- actif par defaut
- cron par defaut: `0 0,9 * * *`
- traite les conversations actives sur des postes hors ligne

Impact fonctionnel:
- re-injection de conversations bloquees par indisponibilite du poste

Risque GICOP:
- tres eleve
- entre directement en conflit avec la sticky assignment

Decision recommandee:
- `A CONSERVER`
- `A REECRIRE METIEREMENT`

Conditions d'adaptation:
- gerer les modes:
  - attente avant fallback
  - reassignation temporaire
  - changement definitif de proprietaire
- conserver la traçabilite de l'exception

### `orphan-checker`

Sources:
- `message_whatsapp/src/jorbs/orphan-checker.job.ts`
- `message_whatsapp/src/jorbs/cron-config.service.ts`

Etat actuel:
- actif par defaut
- intervalle: `15` minutes
- cible les conversations sans `poste_id`
- ignore la tranche 21h -> 5h

Impact fonctionnel:
- rattrapage technique des conversations orphelines

Risque GICOP:
- moyen a eleve
- utile comme filet de securite
- dangereux s'il traite une conversation qui aurait du revenir au poste proprietaire

Decision recommandee:
- `A CONSERVER`
- `A LIMITER AUX CAS TECHNIQUES`

Conditions d'adaptation:
- si une affinite active existe, toujours la tenter avant dispatch standard
- marquer l'action comme rattrapage technique

### `webhook-purge`

Source:
- `message_whatsapp/src/whapi/webhook-idempotency-purge.service.ts`

Etat actuel:
- actif par defaut
- cron par defaut: `0 3 * * *`

Impact fonctionnel:
- maintenance technique des logs d'idempotence webhook

Risque GICOP:
- faible

Decision recommandee:
- `A CONSERVER`

## 8.2. Jobs declares directement en `@Cron`

### `FollowUpService.markOverdue`

Source:
- `message_whatsapp/src/follow-up/follow_up.service.ts`

Etat actuel:
- toutes les 30 minutes
- passe les relances `PLANIFIEE` en `EN_RETARD`

Risque GICOP:
- faible a moyen
- ne deplace pas les conversations
- doit etre aligne avec le futur envoi automatique a date

Decision recommandee:
- `A CONSERVER`

Adaptation:
- coordonner avec le futur moteur `scheduled_outbound_message`

### `ValidationEngineService.handleExternalCriterionTimeout`

Source:
- `message_whatsapp/src/window/services/validation-engine.service.ts`

Etat actuel:
- toutes les heures
- auto-valide le critere `call_confirmed` apres timeout

Risque GICOP:
- tres eleve
- peut auto-debloquer artificiellement une validation alors que GICOP impose plus de rigueur metier

Decision recommandee:
- `A REEVALUER EN PRIORITE`
- `CANDIDAT FORT A DESACTIVATION` pour le scope GICOP

Pourquoi:
- l'auto-validation est incoherente avec:
  - le rapport obligatoire
  - la qualite des traitements
  - la logique des 10 conversations terminees

### `FlowPollingJob.resumeExpiredWaitingSessions`

Source:
- `message_whatsapp/src/flowbot/jobs/flow-polling.job.ts`

Etat actuel:
- toutes les 30 secondes

Risque GICOP:
- moyen
- acceptable si les flows bot restent strictement hors du parcours commercial humain

Decision recommandee:
- `A CONSERVER`
- `A CADRER PAR SCOPE`

### `FlowPollingJob.checkNoResponseSessions`

Etat actuel:
- toutes les minutes

Risque GICOP:
- moyen a eleve
- peut concurrencer les futures relances GICOP

Decision recommandee:
- `A CONSERVER AVEC GARDE-FOUS`

### `FlowPollingJob.pollQueueWait`

Etat actuel:
- toutes les 5 minutes
- cible les conversations en attente sans poste

Risque GICOP:
- tres eleve
- concurrence directe du dispatch humain et de la sticky assignment

Decision recommandee:
- `A REEVALUER`
- `A DESACTIVER POUR LE SCOPE GICOP` si le traitement doit rester humain

### `FlowPollingJob.pollInactivity`

Etat actuel:
- toutes les 5 minutes
- cible les conversations actives ou en attente inactives

Risque GICOP:
- tres eleve
- risque de doublon avec:
  - relances GICOP
  - fermetures automatiques
  - messages de satisfaction

Decision recommandee:
- `A REEVALUER`
- `A DESACTIVER POUR LE SCOPE GICOP` ou a refondre

### `FlowSessionCleanerJob.expireOrphanedSessions`

Source:
- `message_whatsapp/src/flowbot/jobs/flow-session-cleaner.job.ts`

Etat actuel:
- toutes les heures
- scan supplementaire au demarrage

Risque GICOP:
- faible a moyen

Decision recommandee:
- `A CONSERVER`

### `ChannelHealthService.checkAllMetaChannels`

Source:
- `message_whatsapp/src/channel/channel-health.service.ts`

Etat actuel:
- toutes les heures

Risque GICOP:
- faible

Decision recommandee:
- `A CONSERVER`

## 8.3. Crons les plus problematiques pour GICOP

Priorite haute:
- `read-only-enforcement`
- `offline-reinject`
- `sla-checker`
- `ValidationEngineService.handleExternalCriterionTimeout`
- `FlowPollingJob.pollQueueWait`
- `FlowPollingJob.pollInactivity`

Raison:
- ces jobs peuvent fermer, reassigner, auto-valider ou relancer une conversation en contredisant les futures regles GICOP

## 8.4. Crons a desactiver temporairement pendant le chantier GICOP

En environnement de recette GICOP, il est recommande de pouvoir suspendre temporairement:
- `read-only-enforcement`
- `ValidationEngineService.handleExternalCriterionTimeout`
- `FlowPollingJob.pollQueueWait`
- `FlowPollingJob.pollInactivity`

Condition:
- tant que les regles GICOP finales ne sont pas implementees et testees

Critere explicite de reactivation de `read-only-enforcement`:
- rapport GICOP minimum obligatoire implemente
- blocage de cloture et cas d'exception valides
- `WhatsappWindowPolicyService` en place pour les automations de fermeture/satisfaction
- absence de fermeture automatique illegitime sur la campagne de recette
- logs admin disponibles pour justifier chaque fermeture et chaque skip

Critere explicite de reactivation des jobs FlowBot a risque:
- preuve que le scope GICOP humain est correctement exclu
- aucun doublon observe entre relance bot et relance GICOP

## 8.5. Crons a conserver absolument

- `sla-checker`
- `offline-reinject`
- `orphan-checker`
- `FollowUpService.markOverdue`
- `webhook-purge`
- `FlowSessionCleanerJob.expireOrphanedSessions`
- `ChannelHealthService.checkAllMetaChannels`

Ils ne doivent pas etre supprimes sans mecanisme de remplacement.

## 8.6. Candidats a suppression ou refonte

Au vu du code actuel, aucun cron critique ne doit etre supprime immediatement sans remplacement.

Les meilleurs candidats a refonte ou desactivation ciblee sont:
- `ValidationEngineService.handleExternalCriterionTimeout`
- `FlowPollingJob.pollQueueWait`
- `FlowPollingJob.pollInactivity`

La bonne strategie n'est pas une suppression brutale, mais une:
- desactivation par scope
- refonte metier
- reintegration dans un catalogue central de jobs

## 8.7. Travaux a ajouter au chantier GICOP sur les crons

Ajouter un lot transverse "gouvernance des jobs" avec:
- cartographie complete des jobs actifs
- distinction jobs techniques / jobs conversationnels / jobs bot / jobs automation client
- exposition admin des jobs `@Cron` aujourd'hui hors `cron_config`
- ajout d'un champ de scope ou d'eligibilite par conversation
- logs enrichis:
  - nombre de conversations impactees
  - nombre de skips
  - raison des blocages GICOP

Livrable recommande:
- un ecran admin "Catalogue des crons et jobs"

---

## 9. Plan de livraison recommande

## Phase 0 - Decisions bloquantes et dry-run de convergence

Contenu:
- definition metier officielle de `poste`
- cadrage du contrat ERP pour commande + expedition
- specification ferme de `WhatsappWindowPolicyService`
- audit des categories clients requises pour le Lot F
- dry-run des migrations sur une copie de base issue de `production`
- strategie de rollback logique par phase
- mise en place du socle minimal d'observabilite GICOP

Valeur:
- debloque les lots ulterieurs sans construire sur des hypotheses ambiguës

Bloquants leves par cette phase:
- Lot A ne demarre pas sans definition officielle de `poste`
- Lots G / besoins 7 et 8 ne demarrent pas sans contrat ERP valide
- besoins 5, 6, 7, 8 ne demarrent pas sans politique 24h specifiee

Livrables:
- decision note "definition de poste"
- contrat d'echange ERP v1
- spec `WhatsappWindowPolicyService`
- rapport de dry-run migration
- checklist rollback par phase
- tableau de bord minimal d'observabilite

## Gate 0 - Conditions d'entree avant tout sprint GICOP

Les points suivants sont maintenant obligatoires avant de lancer le Lot A:
- definition de `poste` signee metier/technique
- strategie sticky au niveau:
  - poste technique
  - commercial
  - ou proprietaire conversationnel
- contrat ERP de principe confirme pour:
  - `order_created`
  - `shipment_code_created`
- policy 24h arbitree
- liste des crons a suspendre en recette GICOP validee
- environnement de dry-run base `production` disponible

## Phase 1 - Durcissement conversationnel

Contenu:
- affectation persistante
- enforcement stricte des 10 conversations
- visibilite front/admin de la capacite
- alimentation initiale des categories clients utiles au futur Lot F
- instrumentation sticky assignment et capacite

Valeur:
- regle coeur de distribution stabilisee

Dependances:
- migrations DB
- arbitrage sur politique d'attente si poste indisponible
- Gate 0 validee

Sortie obligatoire:
- preuve que la sticky assignment fonctionne sur donnees reelles
- aucun cron de reinjection ne casse silencieusement l'affinite
- categories clients de base disponibles ou plan de backfill valide

## Phase 2 - Rapport GICOP et cloture metier

Contenu:
- `conversation_report`
- blocage a la cloture
- couplage rapport <-> conversation_result
- politique de fermeture automatique compatible GICOP
- logs de cloture et de refus de cloture

Valeur:
- donnees de qualification enfin structurees

Dependances:
- arbitrage sur champs minimums obligatoires
- critere de reactivation de `read-only-enforcement` formellement valide

Sortie obligatoire:
- read-only-enforcement soit encore suspendu, soit reactive avec criteres remplis
- aucune fermeture auto ne bypass le rapport obligatoire

## Phase 3 - Relances et satisfaction

Contenu:
- messages planifies de relance
- notation client de fin de conversation
- logs d'automatisation
- implementation centralisee de `WhatsappWindowPolicyService`

Valeur:
- premier lot d'automatisation sortante visible

Dependances:
- politique 24h / templates WhatsApp
- spec `WhatsappWindowPolicyService` validee en Phase 0

## Phase 4 - Moteur d'obligations d'appels

Contenu:
- batches par tranche de 10 conversations
- taches d'appels
- validation par duree
- controle qualite sur les derniers messages

Valeur:
- pilotage commercial et discipline operationnelle

Dependances:
- categories clients fiables
- arbitrage sur la definition de "venue sans GICOP"

Sortie obligatoire:
- les 3 categories de selection sont visibles et verifiables en base avant activation des batches

## Phase 5 - Automatisation liee aux commandes

Contenu:
- recap commande + photo
- code d'expedition
- timeline et logs

Valeur:
- boucle conversation -> commande -> suivi client

Dependances:
- enrichissement des payloads ERP
- contrat ERP valide depuis la Phase 0
- medias produit et code expedition disponibles dans les payloads reels

## Phase 6 - Catalogue multimedia GICOP

Contenu:
- bibliotheque d'informations
- gestion admin
- bouton d'envoi dans le chat

Valeur:
- acceleration du travail commercial et standardisation des contenus

---

## 10. Decoupage en lots techniques exploitables

## Lot 0 - Convergence production -> master et cadrage bloquant

Livrables:
- definition officielle de `poste`
- spec `WhatsappWindowPolicyService`
- contrat ERP v1 pour commande + expedition
- dry-run migration sur copie de base `production`
- plan de rollback logique par phase
- inventaire des categories clients pour le Lot F
- observabilite minimale GICOP

Condition de sortie:
- Lot A n'est pas autorise a commencer sans fermeture de ce lot

## Lot A - Sticky assignment

Livrables:
- migration `contact_assignment_affinity`
- service d'affinite
- update dispatcher
- UI indicateur proprietaire

Blocage explicite:
- definition de `poste` obligatoire avant demarrage

Risques specifiques:
- impacte dispatcher, crons, transferts, reouvertures et fenetre glissante

Rollback logique:
- feature flag sticky OFF
- conservation de l'affectation courante sans suppression de la table d'affinite

## Lot B - Capacity hardening

Livrables:
- audit des flux d'assignation
- garde-fou centralise
- quota visible en front

## Lot C - Conversation report

Livrables:
- module `conversation-report`
- endpoints
- UI panel
- blocage a la cloture

## Lot D - Finalisation et rating

Livrables:
- listener fermeture
- message de notation
- stockage des retours

## Lot E - Follow-up automation

Livrables:
- `scheduled_outbound_message`
- job d'envoi
- historisation

## Lot F - Call obligations

Livrables:
- `commercial_obligation_batch`
- `call_task`
- matching `call_log`
- vue front/admin

Pre-requis bloquants:
- categories `commande_annulee`, `commande_avec_livraison`, `venue_sans_commande` disponibles et fiables
- definition officielle de `venue_sans_commande`

## Lot G - Order automations

Livrables:
- extension payloads ERP
- recap commande
- code expedition
- logs

Pre-requis bloquants:
- contrat ERP valide
- payloads reels testes sur environnement de recette

## Lot I - Observabilite GICOP

Livrables:
- logs structures des decisions metier
- dashboards admin minimaux
- audit des crons a risque
- suivi sticky / fermeture / automations / batches

Objectif:
- rendre toute decision GICOP explicable en exploitation

## Lot H - Information catalog

Livrables:
- `information_category_asset`
- backoffice
- bouton de chat

---

## 11. Backlog de realisation par sprint et par lot

Le but de cette section est de transformer le plan en backlog directement exploitable.

Convention retenue:
- un sprint = un ensemble coherent de livrables testables
- un lot ne demarre pas si ses bloquants d'entree ne sont pas leves
- chaque sprint doit produire:
  - du code
  - des tests
  - des logs/indicateurs minimums
  - un plan de rollback logique

## 11.1. Sprint 0 - Cadrage bloquant et securisation de bascule

Objectif:
- lever les inconnues structurantes avant d'engager le code metier

Lots couverts:
- `Lot 0`
- base du `Lot I`

Travaux:
- definir officiellement `poste`
- arbitrer la sticky assignment cible
- formaliser le contrat ERP minimal:
  - `order_created`
  - `shipment_code_created`
- specifier `WhatsappWindowPolicyService`
- identifier les categories clients necessaires au Lot F
- preparer l'environnement de dry-run base `production`
- lister les crons a suspendre en recette GICOP

Modules/fichiers touches:
- documentation projet
- contrat d'integration ERP
- `message_whatsapp/src/jorbs/*`
- `message_whatsapp/src/inbound-integration/*`
- `message_whatsapp/src/dispatcher/*`

Bloquants d'entree:
- acces a une copie de base `production`
- disponibilite metier pour arbitrer `poste`
- disponibilite equipe ERP

Definition of done:
- note de decision `poste`
- spec `WhatsappWindowPolicyService`
- contrat ERP v1 valide
- plan de suspension des crons a risque
- rapport de dry-run initial
- checklist de rollback par phase

## 11.2. Sprint 1 - Fondations sticky assignment

Objectif:
- preparer puis livrer la base technique de l'affinite d'affectation

Lots couverts:
- `Lot A`
- partie du `Lot I`

Travaux:
- creer la migration `contact_assignment_affinity`
- creer le service `AssignmentAffinityService`
- brancher la lecture d'affinite dans le dispatcher
- journaliser les decisions:
  - `AFFINITY_HIT`
  - `AFFINITY_WAITING`
  - `AFFINITY_FALLBACK`
  - `AFFINITY_OVERRIDDEN`
- ajouter le feature flag sticky

Modules/fichiers touches:
- `message_whatsapp/src/dispatcher/*`
- nouveau module `assignment-affinity`
- `message_whatsapp/src/whatsapp_chat/*`
- `front/src/components/sidebar/*`

Bloquants d'entree:
- Sprint 0 termine
- definition de `poste` signee

Definition of done:
- nouvelle table en place
- dispatcher compatible ancien + nouveau modele
- aucun impact destructif sur la base existante
- logs visibles en admin ou dans les journaux
- rollback par feature flag prouve

## 11.3. Sprint 2 - Enforcement capacite et stabilisation des crons d'affectation

Objectif:
- rendre la limite des 10 conversations incontestable
- aligner les crons d'affectation avec l'affinite

Lots couverts:
- `Lot B`
- continuation `Lot A`
- continuation `Lot I`

Travaux:
- auditer tous les chemins d'assignation/reassignation
- centraliser les garde-fous de capacite
- rendre l'UI `x/10` visible
- adapter:
  - `sla-checker`
  - `offline-reinject`
  - `orphan-checker`
- verifier que les crons ne cassent pas la sticky assignment

Modules/fichiers touches:
- `message_whatsapp/src/conversation-capacity/*`
- `message_whatsapp/src/jorbs/*`
- `message_whatsapp/src/window/*`
- `front/src/components/chat/*`
- `front/src/components/sidebar/*`

Bloquants d'entree:
- Sprint 1 termine
- environnement de recette avec crons pilotables

Definition of done:
- impossible d'activer une 11e conversation
- les crons adaptes respectent l'affinite
- les depassements de capacite sont visibles
- tests e2e passes sur cas 11e conversation et retour poste

## 11.4. Sprint 3 - Data foundation des categories clients

Objectif:
- preparer les donnees indispensables au futur moteur d'obligations d'appels

Lots couverts:
- pre-requis `Lot F`
- partie `Lot G`

Travaux:
- formaliser les 3 categories:
  - `commande_annulee`
  - `commande_avec_livraison`
  - `venue_sans_commande`
- choisir la source de verite de `venue_sans_commande`
- enrichir les mappings existants si necessaire
- preparer backfill ou calcul progressif
- exposer la categorie dans les vues admin/CRM si utile

Modules/fichiers touches:
- `message_whatsapp/src/contact/*`
- `message_whatsapp/src/inbound-integration/*`
- `message_whatsapp/src/client-dossier/*`
- documentation integration ERP

Bloquants d'entree:
- arbitrage metier sur `venue_sans_commande`

Definition of done:
- les 3 categories sont definies, calculables et verifiables en base
- une requete de controle permet de lister des contacts par categorie
- la base `production` peut etre backfillee sans perte

## 11.5. Sprint 4 - Rapport GICOP et cloture metier

Objectif:
- rendre la qualification structuree obligatoire avant cloture

Lots couverts:
- `Lot C`
- partie `Lot I`

Travaux:
- creer `conversation_report`
- creer les endpoints et validations
- ajouter le panneau front
- bloquer la cloture si le minimum n'est pas rempli
- ajouter logs de refus de cloture
- definir la coexistence avec `read-only-enforcement`

Modules/fichiers touches:
- nouveau module `conversation-report`
- `message_whatsapp/src/whatsapp_chat/*`
- `front/src/components/chat/*`
- `admin` vue rapports

Bloquants d'entree:
- champs minimums obligatoires arbitres

Definition of done:
- rapport enregistrable et consultable
- cloture manuelle refusee si rapport incomplet
- fermeture automatique soit suspendue, soit compatible et tracee

## 11.6. Sprint 5 - Politique 24h, relances automatiques et satisfaction

Objectif:
- centraliser les decisions d'envoi WhatsApp et brancher les deux premiers automatismes

Lots couverts:
- `Lot D`
- `Lot E`
- partie `Lot I`

Travaux:
- implementer `WhatsappWindowPolicyService`
- creer `scheduled_outbound_message`
- brancher automation de relance
- brancher notation client fin de conversation
- tracer succes / refus / fallback template

Modules/fichiers touches:
- `message_whatsapp/src/follow-up/*`
- `message_whatsapp/src/communication_whapi/*`
- `message_whatsapp/src/inbound-integration/*` si parsing reponse
- nouveau module `conversation-rating`
- nouveau module `scheduled-outbound-message`

Bloquants d'entree:
- spec 24h validee
- templates WhatsApp identifies

Definition of done:
- aucune logique locale de fenetre 24h hors service central
- une relance planifiee peut etre envoyee automatiquement
- une demande de notation part a la fermeture
- les decisions d'envoi sont journalisees

## 11.7. Sprint 6 - Obligations d'appels et controle qualite

Objectif:
- mettre en service les batches d'appels sur base de donnees fiables

Lots couverts:
- `Lot F`
- partie `Lot I`

Travaux:
- creer `commercial_obligation_batch`
- creer `call_task`
- matcher `call_log`
- calculer le controle qualite des 10 derniers messages
- afficher la progression front/admin

Modules/fichiers touches:
- nouveau module `commercial-milestone`
- nouveau module `call-task`
- nouveau module `conversation-quality`
- `message_whatsapp/src/call-log/*`
- `front/src/components/contacts/*`
- `admin` vues batches

Bloquants d'entree:
- Sprint 3 termine
- categories clients fiables
- definition officielle de `venue_sans_commande`

Definition of done:
- a 10 conversations terminees, un batch unique est cree
- les taches ne se valident qu'avec appel >= 90 sec
- le controle qualite est consultable

## 11.8. Sprint 7 - Automatisations commandes et expedition

Objectif:
- connecter reellement la boucle conversation -> commande -> expédition

Lots couverts:
- `Lot G`
- partie `Lot I`

Travaux:
- etendre les DTO ERP
- traiter `order_created`
- traiter `shipment_code_created`
- envoyer recap commande + photo
- envoyer code expedition
- journaliser et afficher en timeline

Modules/fichiers touches:
- `message_whatsapp/src/inbound-integration/*`
- `message_whatsapp/src/communication_whapi/*`
- `front` timeline contact/chat
- `admin` logs automations

Bloquants d'entree:
- contrat ERP reel valide
- payloads testes sur recette

Definition of done:
- les evenements reels ERP sont acceptes sans adaptation manuelle
- recap et code expedition suivent la policy 24h centralisee
- les echecs sont visibles et rejouables

## 11.9. Sprint 8 - Catalogue multimedia GICOP

Objectif:
- accelerer l'envoi de contenus standards depuis le chat

Lots couverts:
- `Lot H`

Travaux:
- creer `information_category_asset`
- CRUD admin
- bouton chat et modal de selection
- envoi texte + media

Modules/fichiers touches:
- nouveau module `information-catalog`
- `front/src/components/chat/ChatInput.tsx`
- `admin` vue catalogue

Bloquants d'entree:
- strategie media validee

Definition of done:
- un commercial peut envoyer un contenu de categorie avec media
- les contenus sont versionnes/activables cote admin

## 11.10. Sprint 9 - Hardening, runbook et go-live

Objectif:
- preparer la publication de `master` vers l'environnement actuellement alimente par `production`

Lots couverts:
- consolidation de tous les lots

Travaux:
- dry-run final sur copie de base `production`
- verification des volumetries avant/apres
- revue des crons actifs
- revue des feature flags
- redaction du runbook de publication
- tests de bascule et rollback logique

Bloquants d'entree:
- tous les lots precedents termines ou explicitement de-scopes

Definition of done:
- runbook valide
- dry-run final concluant
- plan de repli connu
- decision GO/NOGO documentee

---

## 12. Backlog technique par couche

## 12.1. Backend `message_whatsapp`

Nouveaux modules probables:
- `conversation-report`
- `conversation-rating`
- `assignment-affinity`
- `commercial-milestone`
- `call-task`
- `conversation-quality`
- `information-catalog`
- `scheduled-outbound-message`

Modules a modifier:
- `dispatcher`
- `follow-up`
- `inbound-integration`
- `communication_whapi`
- `whatsapp_chat`
- `client-dossier`
- `call-log`
- `realtime`
- `system-config`

## 12.2. Front commercial `front`

Zones a modifier:
- `front/src/components/chat/ChatMainArea.tsx`
- `front/src/components/chat/ChatInput.tsx`
- `front/src/components/chat/ConversationOutcomeModal.tsx`
- `front/src/components/chat/CreateFollowUpModal.tsx`
- `front/src/components/chat/ClientInfoBanner.tsx`
- `front/src/components/sidebar/ConversationItem.tsx`
- `front/src/types/chat.ts`
- stores API et mappers associes

Nouveaux composants probables:
- `ConversationReportPanel`
- `ConversationCapacityBadge`
- `CommercialObligationPanel`
- `InformationCategoryPickerModal`
- `ConversationRatingBadge`

## 12.3. Admin `admin`

Nouveaux ecrans ou sections:
- vue affinites d'affectation
- vue rapports GICOP
- vue batches d'appels
- vue satisfaction client
- vue automatisations sortantes
- vue catalogue multimedia

---

## 13. Tests indispensables

## 13.1. Tests unitaires

- resolution d'affinite
- validation du rapport
- enforcement du quota 10
- generation de batchs d'appels
- matching d'un `call_log` avec une `call_task`
- evaluation qualite des 10 derniers messages
- fenetre 24h et eligibilite WhatsApp

## 13.2. Tests integration

- `order_created` -> recap commande
- `shipment_code_created` -> envoi code
- `follow_up.created` -> message planifie
- `conversation.closed` -> demande de notation

## 13.3. Tests e2e

- nouveau message client deja connu -> retour au poste d'affinite
- 11e conversation -> refus ou verrouillage
- conversation sans rapport -> fermeture refusee
- 10e conversation terminee -> batch d'appels cree
- appel 95 secondes -> tache validee
- envoi d'un contenu multimedia depuis le chat

## 13.4. Tests de migration

- creation des nouvelles tables sur base existante
- compatibilite avec donnees historiques
- backfill eventuel des affinites a partir des conversations existantes
- dry-run complet sur copie de base `production`
- mesure des temps d'execution des migrations lourdes
- verification avant/apres sur volumes reels

## 13.5. Tests de bascule et de rollback

- test de publication de `master` sur une copie de base `production`
- test d'activation progressive par feature flag
- test de desactivation rapide d'un lot en cas d'incident
- verification que les nouvelles tables GICOP peuvent rester inutilisees sans casser le flux legacy

---

## 14. Risques principaux

## Risque 1 - Ambiguite sur la notion de "poste affecte"

Il faut fixer si "poste" signifie:
- poste technique
- commercial
- file de travail
- terminal connecte

Sans cela, la sticky assignment restera fragile.

Traitement:
- risque bloquant a lever en Phase 0 avant Lot A

## Risque 2 - Donnees ERP insuffisantes

Les besoins 7 et 8 dependent d'evenements plus riches que ceux visibles aujourd'hui.

Traitement:
- risque a traiter des Phase 0 avec contrat ERP v1

## Risque 3 - Surcharge UX du chat

Si le rapport GICOP est trop lourd, les commerciaux le contourneront ou bloqueront la conversation.

## Risque 4 - Regles WhatsApp

Les automatisations doivent respecter:
- fenetre 24h
- templates si necessaire
- types de medias autorises

Traitement:
- spec `WhatsappWindowPolicyService` obligatoire avant implementation des besoins 5 a 8

## Risque 5 - Categories clients non stabilisees

Le moteur d'obligations d'appels depend fortement de categories fiables.

Traitement:
- alimentation des categories avancee en Phase 1/2 avant Lot F

## Risque 6 - Collision entre cloture automatique et rapport obligatoire

Le cron `read-only-enforcement` peut entrer en conflit direct avec la regle "rapport obligatoire avant cloture".

Traitement:
- suspension temporaire en recette GICOP
- reactivation seulement sur criteres explicites definis section 8.4

## Risque 7 - Observabilite insuffisante

Sans logs et dashboards explicites, les decisions GICOP seront impossibles a expliquer apres incident.

Traitement:
- Lot I dedie

---

## 15. Arbitrages metier a valider avant implementation

### Affectation persistante

- si le poste proprietaire est offline, combien de temps attendre avant fallback ?
- un transfert manuel remplace-t-il toujours l'affinite ?
- l'affinite est-elle au niveau client ou conversation ?
- que signifie exactement `poste` dans le modele cible:
  - poste technique
  - commercial
  - proprietaire conversationnel

Statut:
- arbitrage `bloquant Phase 0`

### Rapport GICOP

- quels champs sont obligatoires avant cloture ?
- faut-il imposer le rapport sur toutes les conversations ou seulement celles prises en charge par un commercial ?

### Limite des 10

- 10 conversations visibles ou 10 conversations activement traitables ?
- une conversation verrouillee compte-t-elle dans la simultaneite metier ?

### Batch d'appels

- qu'est-ce qu'une conversation "terminee" ?
- les conversations `sans_reponse` comptent-elles ?
- comment definir officiellement "venue mais n'a pas passe de GICOP" ?

Statut:
- arbitrage `bloquant Lot F`

### Notation client

- note seule ou note + commentaire ?
- faut-il relancer les clients qui n'ont pas note ?

### Automatisations sortantes

- hors fenetre 24h, faut-il envoyer via template ou simplement journaliser comme non envoyable ?
- quels templates WhatsApp doivent etre prepares en amont ?

Statut:
- arbitrage `bloquant besoins 5, 6, 7, 8`

### Contrat ERP

- quels champs minimums seront presents dans `order_created` reel ?
- quel evenement officiel portera le code d'expedition ?
- la photo produit sera-t-elle fournie directement, par URL, ou via un identifiant a resoudre ?

Statut:
- arbitrage `bloquant Lot G`

---

## 16. Recommandation finale

La sequence la plus saine est:
1. lever les decisions bloquantes Phase 0
2. rendre l'affectation persistante et la capacite incontestable
3. introduire le rapport GICOP et durcir la finalisation des conversations
4. brancher les automatisations de relance et de satisfaction
5. implementer le moteur d'obligations d'appels
6. enrichir l'integration ERP pour la commande et l'expedition
7. terminer par le catalogue multimedia

Ce plan minimise le risque parce que:
- il force la resolution des ambiguïtés structurantes avant le premier sprint
- il commence par les regles coeur du chat
- il rend les donnees de qualification fiables avant de faire des automatismes
- il retarde les besoins dependants de l'ERP tant que les contrats d'echange ne sont pas complets
- il traite l'observabilite et le rollback comme des livrables, pas comme des accessoires

En pratique, la plateforme actuelle couvre deja environ la moitie du chemin technique. Le travail restant est surtout un travail de structuration metier, de controle des transitions, de modelisation des nouvelles entites et de mise en coherence des automatisations.
