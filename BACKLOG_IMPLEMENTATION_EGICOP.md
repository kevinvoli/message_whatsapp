# Backlog d'implementation E-GICOP

Date : 2026-04-27  
Projet : plateforme WhatsApp / E-GICOP  
Source : `PLAN_CORRECTION_ECARTS_EGICOP.md`

## 1. Objectif du backlog

Ce backlog transforme le plan de correction E-GICOP en tickets d'implementation concrets.

Objectif principal :

```text
Stabiliser le chat commercial, fiabiliser DB1/DB2, imposer les bonnes actions commerciales,
et construire progressivement la plateforme E-GICOP cible.
```

Regle de priorisation :

```text
P0 = bloque la production ou la rotation commerciale
P1 = necessaire pour piloter les ventes et eviter les pertes de donnees
P2 = important pour structurer les operations
P3 = amelioration ou extension fonctionnelle
```

## 2. Vue d'ensemble des epics

| Epic | Nom | Priorite | Horizon |
| --- | --- | --- | --- |
| E01 | Stabilisation rotation conversations | P0 | Jours 1-15 |
| E02 | Fiabilisation DB1 vers DB2 | P0 | Jours 10-30 |
| E03 | Dashboard commercial minimum | P1 | Jours 20-45 |
| E04 | Gates de priorite commerciale | P1 | Jours 35-60 |
| E05 | Obligations d'appel | P1 | Jours 35-60 |
| E06 | Files d'action commerciale | P1 | Jours 50-75 |
| E07 | Temps de travail et planning | P2 | Jours 50-75 |
| E08 | Comptes certifies | P2 | Jours 70-90 |
| E09 | Plaintes | P2 | Jours 70-90 |
| E10 | Securite utilisateur | P2 | Jours 70-90 |
| E11 | Qualite, observabilite et tests | P0 | Continu |

## 3. Sprint 1 - Rotation conversationnelle stable

### E01-T01 - Ajouter un verrou distribue de rotation

Priorite : P0  
Estimation : 2 jours  
Composants : backend `message_whatsapp`, module `window`

Description :

Remplacer ou completer le verrou in-memory `rotatingPostes` par un verrou distribue compatible multi-instances.

Criteres d'acceptation :

- Deux appels simultanes de rotation pour le meme poste ne peuvent pas executer deux rotations.
- Le verrou expire automatiquement si une instance plante.
- Un log clair indique `lock_acquired`, `lock_skipped` et `lock_released`.
- Les tests couvrent deux rotations concurrentes.

Dependances :

- Choix technique Redis/Redlock ou lock DB.

### E01-T02 - Ajouter un etat debug complet par poste

Priorite : P0  
Estimation : 1 jour  
Composants : backend `window`, front commercial admin/debug

Description :

Exposer un endpoint de diagnostic pour comprendre pourquoi une rotation se declenche ou non.

Champs attendus :

```text
posteId
activeCount
lockedCount
submittedCount
requiredCount
rotationWouldTrigger
lastRotationAt
lastRotationError
blockers
```

Criteres d'acceptation :

- `GET /window/debug/:posteId` retourne un diagnostic exploitable.
- Les conversations avec rapport soumis sont distinguees des conversations sans rapport.
- Les conversations fermees avec rapport soumis ne bloquent pas la rotation.

### E01-T03 - Nettoyer les anciens etats de fenetre

Priorite : P0  
Estimation : 1 jour  
Composants : migration DB1

Description :

Creer une migration de nettoyage des anciens etats incoherents.

Regles :

```text
window_status = validated -> active ou locked selon is_locked
released avec window_slot non null -> window_slot = null
active avec is_locked = true -> is_locked = false
locked avec is_locked = false -> is_locked = true
```

Criteres d'acceptation :

- La migration est idempotente.
- Un script de verification donne le nombre de lignes corrigees.
- Aucun usage metier de `validated` ne reste dans la rotation.

### E01-T04 - Renommer les notions `validated` vers `submitted`

Priorite : P0  
Estimation : 2 jours  
Composants : backend, front, types, tests

Description :

Supprimer la logique historique de validation et aligner le vocabulaire sur la soumission de rapport.

Criteres d'acceptation :

- Le front n'affiche plus de badge ou statut `validated`.
- Le backend ne conditionne plus la rotation a `validated`.
- Les metriques utilisent `submittedCount`.
- Les tests ne referencent plus `validated` sauf migration historique.

### E01-T05 - Tests e2e rotation bloc de 10

Priorite : P0  
Estimation : 2 jours  
Composants : tests e2e

Scenarios :

- 10 conversations actives avec rapports soumis declenchent la rotation.
- 10 conversations fermees avec rapports soumis declenchent la rotation.
- 9 rapports soumis ne declenchent pas la rotation.
- Apres refresh front, les anciennes conversations ne reapparaissent pas.
- L'evenement `WINDOW_ROTATED` est emis.

Criteres d'acceptation :

- Tests automatises reproductibles.
- Les tests echouent si une conversation soumise reste dans le bloc actif apres rotation.

## 4. Sprint 2 - Fiabilisation DB1 vers DB2

### E02-T01 - Creer la table `integration_outbox`

Priorite : P0  
Estimation : 1 jour  
Composants : migration DB1

Schema minimum :

```text
id
event_type
entity_id
target
payload_json
payload_hash
schema_version
status
attempt_count
next_retry_at
last_error
created_at
processed_at
```

Criteres d'acceptation :

- Index sur `status`, `next_retry_at`, `event_type`.
- Contrainte d'idempotence via `payload_hash` ou cle metier.
- Migration reversible ou documentee.

### E02-T02 - Ecrire les soumissions de rapport dans l'outbox

Priorite : P0  
Estimation : 2 jours  
Composants : `conversation-report`, DB1

Description :

Lorsqu'un rapport est soumis, ecrire l'evenement `REPORT_SUBMITTED` dans la meme transaction que le rapport.

Criteres d'acceptation :

- Si la transaction echoue, ni rapport ni outbox ne sont persistants.
- Si la transaction reussit, l'outbox existe toujours.
- La soumission repetee reste idempotente.

### E02-T03 - Implementer le worker de synchronisation DB2

Priorite : P0  
Estimation : 3 jours  
Composants : worker integration, DB2

Description :

Lire les evenements pending et synchroniser `messaging_client_dossier_mirror`.

Criteres d'acceptation :

- Upsert DB2 idempotent.
- Retry exponentiel en cas d'echec.
- `attempt_count`, `last_error`, `processed_at` sont correctement mis a jour.
- Une indisponibilite DB2 ne bloque pas la soumission du rapport cote DB1.

### E02-T04 - Dashboard de synchronisation DB2

Priorite : P1  
Estimation : 2 jours  
Composants : backend admin, front admin

Description :

Afficher l'etat de la synchronisation DB2.

Criteres d'acceptation :

- Nombre d'evenements pending, success, failed.
- Dernieres erreurs visibles.
- Action de retry manuel pour un evenement.
- Filtre par type d'evenement.

### E02-T05 - Alertes DB2 et outbox bloquee

Priorite : P1  
Estimation : 1 jour  
Composants : logging/alerting

Criteres d'acceptation :

- Alerte si DB2 est indisponible.
- Alerte si trop d'echecs consecutifs.
- Alerte si un evenement reste pending trop longtemps.

## 5. Sprint 3 - Dashboard commercial minimum

### E03-T01 - Creer le module `commercial-performance`

Priorite : P1  
Estimation : 2 jours  
Composants : backend

Description :

Centraliser les calculs de performance commerciale.

Metriques initiales :

```text
ventes
commandes livrees
comptes ouverts
appels
messages recus
messages repondus
rapports soumis
relances
plaintes
heures travaillees
absences
notes client
```

Criteres d'acceptation :

- API de lecture par commercial et par periode.
- Separation claire entre metriques temps reel et snapshots.

### E03-T02 - Creer les snapshots quotidiens

Priorite : P1  
Estimation : 2 jours  
Composants : DB1, cron

Table cible :

```text
commercial_daily_performance
```

Criteres d'acceptation :

- Snapshot quotidien par commercial.
- Recalcul possible pour une date.
- Donnees exploitables pour jour, semaine et mois.

### E03-T03 - Ajouter les classements

Priorite : P1  
Estimation : 2 jours  
Composants : backend

Classements :

- Meilleure vendeuse du jour.
- Meilleure vendeuse de la semaine.
- Meilleure vendeuse du mois.
- Classements groupe 1 et groupe 2.
- Classement ouverture de comptes.
- Classement appels.

Criteres d'acceptation :

- API avec rang global et rang groupe.
- Gestion des egalites.
- Filtrage par periode.

### E03-T04 - Front dashboard commercial minimum

Priorite : P1  
Estimation : 3 jours  
Composants : front commercial

Elements :

- Barre fixe avec rang mensuel.
- Premiere vendeuse du mois.
- Premiere vendeuse du jour en prise de commande.
- Objectifs personnels.
- Progression mensuelle.

Criteres d'acceptation :

- Affichage lisible sur desktop et mobile.
- Etat loading, vide et erreur.
- Les chiffres viennent des APIs backend, pas de calcul critique dans le front.

## 6. Sprint 4 - Gates de priorite commerciale

### E04-T01 - Creer le module `commercial-action-gate`

Priorite : P1  
Estimation : 2 jours  
Composants : backend

Description :

Retourner le statut operationnel du commercial.

API :

```http
GET /commercial-action-gate/status
```

Reponses :

```text
allow
warn
block
redirect_to_task
```

Criteres d'acceptation :

- Le statut explique la raison du blocage.
- Les priorites sont ordonnees.
- Les APIs critiques peuvent consulter ce gate.

### E04-T02 - Implementer les priorites de blocage

Priorite : P1  
Estimation : 3 jours  
Composants : backend

Ordre :

1. Appels en absence non traites.
2. Messages entrants non repondus.
3. Conversations actives sans rapport.
4. Obligations d'appels apres bloc de 10.
5. Relances arrivees a echeance.
6. Plaintes critiques.

Criteres d'acceptation :

- Un seul blocage principal est retourne.
- Les blocages secondaires restent visibles.
- Les superviseurs peuvent etre exemptes selon role.

### E04-T03 - Brancher le gate sur les actions critiques

Priorite : P1  
Estimation : 2 jours  
Composants : backend

Actions a controler :

- Envoyer message.
- Ouvrir nouvelle conversation.
- Cloturer conversation.
- Soumettre rapport.
- Prendre pause.

Criteres d'acceptation :

- Les actions bloquees retournent une erreur metier claire.
- Les actions autorisees ne sont pas ralenties de facon notable.
- Les logs indiquent quel gate a bloque l'action.

### E04-T04 - UI de blocage commercial

Priorite : P1  
Estimation : 2 jours  
Composants : front commercial

Criteres d'acceptation :

- Le commercial voit la tache prioritaire.
- Un bouton l'emmene vers la bonne file.
- Le message est court et actionnable.

## 7. Sprint 5 - Obligations d'appel

### E05-T01 - Modeliser les obligations d'appel

Priorite : P1  
Estimation : 2 jours  
Composants : backend, DB1

Regle :

```text
Apres chaque bloc de 10 conversations :
- 5 clientes commandes annulees
- 5 clientes commandes livrees
- 5 prospects sans commande
- duree minimale 90 secondes
```

Criteres d'acceptation :

- Les obligations sont rattachees au commercial et au bloc.
- Chaque appel valide une seule obligation.
- Un appel de moins de 90 secondes ne compte pas.

### E05-T02 - Brancher les appels sur la rotation

Priorite : P1  
Estimation : 2 jours  
Composants : `window-rotation`, `call-obligation`

Description :

La rotation devient :

```text
rapports du bloc actif soumis + obligations d'appel completees
```

Criteres d'acceptation :

- Si les obligations sont activees et incompletes, pas de rotation.
- Si les obligations sont completes, la rotation se declenche automatiquement.
- `checkAndTriggerRotation` est relance apres chaque appel valide.

### E05-T03 - Controle de la derniere reponse commerciale

Priorite : P1  
Estimation : 2 jours  
Composants : backend chat

Description :

Verifier que le commercial a la derniere reponse sur les 10 conversations avant rotation.

Criteres d'acceptation :

- Une conversation ou le client a envoye le dernier message bloque la rotation.
- Le front indique les conversations a repondre.
- Les conversations fermees restent gerees selon regle metier.

### E05-T04 - Front obligations restantes

Priorite : P1  
Estimation : 2 jours  
Composants : front commercial

Criteres d'acceptation :

- Affiche les categories restantes.
- Affiche le nombre d'appels valides par categorie.
- Indique pourquoi un appel ne compte pas.

### E05-T05 - Tests obligations d'appel

Priorite : P1  
Estimation : 2 jours  
Composants : tests

Scenarios :

- Rapports soumis + appels incomplets => pas de rotation.
- Rapports soumis + appels complets => rotation.
- Appel trop court => ne compte pas.
- Mauvaise categorie => ne compte pas.
- Derniere reponse client => pas de rotation.

## 8. Sprint 6 - Files d'action commerciale

### E06-T01 - Creer le modele commun `commercial_action_task`

Priorite : P1  
Estimation : 2 jours  
Composants : backend, DB1

Champs :

```text
source
priority
assigned_to
status
next_action
due_at
last_attempt_at
attempt_count
form_data
audio_recording_url
```

Criteres d'acceptation :

- Modele reutilisable pour toutes les files.
- Assignation a un poste ou commercial.
- Historique minimal des tentatives.

### E06-T02 - File potentiels clients sans commande

Priorite : P1  
Estimation : 2 jours

Criteres d'acceptation :

- Liste les contacts venus sur la plateforme sans commande.
- Permet d'ouvrir l'historique conversation.
- Permet d'enregistrer le formulaire post-appel.

### E06-T03 - File commandes annulees

Priorite : P1  
Estimation : 2 jours

Criteres d'acceptation :

- Recupere les commandes annulees depuis DB2 ou miroir.
- Assigne les relances.
- Enregistre resultat d'appel et prochaine relance.

### E06-T04 - File clients inactifs 60 jours

Priorite : P1  
Estimation : 2 jours

Criteres d'acceptation :

- Identifie les clients sans retour depuis plus de 60 jours.
- Permet de filtrer par derniere commande et produit.
- Permet relance et prochaine action.

### E06-T05 - File erreurs commandes

Priorite : P1  
Estimation : 2 jours

Criteres d'acceptation :

- Liste les commandes avec erreur sur le poste.
- Actions disponibles : joindre, reprogrammer, annuler, relancer.
- Statut resolu trace.

### E06-T06 - Files appels en absence et messages venus

Priorite : P1  
Estimation : 2 jours

Criteres d'acceptation :

- Les appels en absence bloquent les actions secondaires via gate.
- Les messages venus sur le poste sont visibles et traitables.
- Chaque element traite sort de la file.

### E06-T07 - Formulaire post-appel commun

Priorite : P1  
Estimation : 2 jours  
Composants : front, backend

Champs :

```text
nom / prenoms
ville
commune
quartier
categorie produit
autres numeros
date et heure de relance
besoin client
score interet /5
homme non interesse
audio appel
```

Criteres d'acceptation :

- Meme formulaire reutilisable dans les files.
- Validation front et backend.
- Donnees exploitables dans les stats.

## 9. Sprint 7 - Temps de travail et planning

### E07-T01 - Creer `work-schedule`

Priorite : P2  
Estimation : 2 jours

Criteres d'acceptation :

- Planning par commercial et par groupe.
- Groupes de pause configurables.
- Consultation front par commercial.

### E07-T02 - Creer `work-attendance`

Priorite : P2  
Estimation : 2 jours

Evenements :

```text
arrivee
depart_pause
retour_pause
depart_maison
```

Criteres d'acceptation :

- Pointage journalier complet.
- Calcul heures faites et heures restantes.
- Historique mensuel.

### E07-T03 - Gate de presence

Priorite : P2  
Estimation : 1 jour

Criteres d'acceptation :

- Certaines actions sont bloquees si le commercial n'est pas pointe.
- La pause respecte les creneaux du groupe.
- Les exceptions superviseur sont gerees.

## 10. Sprint 8 - Comptes certifies

### E08-T01 - Creer le module `client-certification`

Priorite : P2  
Estimation : 2 jours

Etats :

```text
draft
ready_for_review
rejected
certified
```

Criteres d'acceptation :

- Workflow complet de certification.
- Lien avec contact, commandes, adresses et produits.

### E08-T02 - Validation anti-noms invalides

Priorite : P2  
Estimation : 1 jour

Bloquer :

```text
Mme
Madame
Monsieur
Mlle
Mademoiselle
noms uniquement numeriques
noms trop courts
doublons evidents
```

Criteres d'acceptation :

- Validation backend obligatoire.
- Message d'erreur clair dans le front.

### E08-T03 - Revue gestionnaire livraison

Priorite : P2  
Estimation : 2 jours

Criteres d'acceptation :

- Un gestionnaire peut confirmer ou rejeter.
- Le rejet demande une note.
- Le compte certifie devient reutilisable commercialement.

## 11. Sprint 9 - Plaintes

### E09-T01 - Creer le module `complaints`

Priorite : P2  
Estimation : 2 jours

Categories :

- Commande non livree.
- Erreur produit.
- Code expedition non recu.
- Plainte livreur.
- Plainte commerciale.
- Plainte utilisation produit.

Criteres d'acceptation :

- Creation plainte depuis une conversation ou une commande.
- Assignation a un responsable.
- Priorite visible.

### E09-T02 - Workflow de resolution

Priorite : P2  
Estimation : 2 jours

Workflow :

```text
ouverte
assignee
en_traitement
resolue
rejetee
```

Criteres d'acceptation :

- Chaque changement de statut est trace.
- Une plainte resolue demande une note de resolution.
- Les plaintes critiques peuvent bloquer via action gate.

## 12. Sprint 10 - Securite utilisateur

### E10-T01 - Roles utilisateurs E-GICOP

Priorite : P2  
Estimation : 1 jour

Roles :

```text
stagiaire
vendeuse_confirmee
superviseur
admin
```

Criteres d'acceptation :

- Les permissions front et backend distinguent les roles.
- Les stagiaires sont identifiables dans les stats.

### E10-T02 - Double verification email

Priorite : P2  
Estimation : 2 jours

Criteres d'acceptation :

- OTP email obligatoire a la connexion.
- Expiration du code.
- Limitation des tentatives.
- Journalisation du statut OTP.

### E10-T03 - Restriction bureau GICOP

Priorite : P2  
Estimation : 2 jours

Criteres d'acceptation :

- Liste blanche IP ou regle reseau configuree.
- Tentatives hors bureau journalisees.
- Exceptions admin documentees.

### E10-T04 - Journal des connexions

Priorite : P2  
Estimation : 1 jour

Champs :

```text
user_id
poste_id
ip
device
localisation
otp_status
login_at
```

Criteres d'acceptation :

- Page admin des sessions suspectes.
- Filtrage par utilisateur, IP et periode.

## 13. Qualite, tests et observabilite

### E11-T01 - Ajouter tests unitaires des regles metier critiques

Priorite : P0  
Estimation : continu

Regles a couvrir :

- Rotation sur rapports soumis.
- Rotation bloquee par obligations.
- Outbox idempotente.
- Gates de priorite.
- Calculs de performance.

### E11-T02 - Ajouter tests e2e des parcours commerciaux

Priorite : P0  
Estimation : continu

Parcours :

- Reception conversation -> reponse -> rapport -> rotation.
- Rapport soumis avec DB2 indisponible.
- Blocage par appel en absence.
- Obligation d'appel completee -> rotation automatique.

### E11-T03 - Logs metier structures

Priorite : P1  
Estimation : 1 jour par module critique

Evenements :

```text
REPORT_SUBMITTED
WINDOW_ROTATION_CHECKED
WINDOW_ROTATED
DB2_SYNC_FAILED
DB2_SYNC_SUCCESS
ACTION_GATE_BLOCKED
CALL_OBLIGATION_VALIDATED
```

Criteres d'acceptation :

- Logs correlables par `posteId`, `commercialId`, `conversationId`.
- Les erreurs contiennent une cause exploitable.

## 14. Ordre recommande de livraison

1. `E01-T01` a `E01-T05` : rotation fiable.
2. `E02-T01` a `E02-T05` : DB2 fiable.
3. `E03-T01` a `E03-T04` : dashboard commercial minimum.
4. `E04-T01` a `E04-T04` : gates de priorite.
5. `E05-T01` a `E05-T05` : obligations d'appel.
6. `E06-T01` a `E06-T07` : files d'action.
7. `E07-T01` a `E07-T03` : temps de travail.
8. `E08-T01` a `E08-T03` : comptes certifies.
9. `E09-T01` a `E09-T02` : plaintes.
10. `E10-T01` a `E10-T04` : securite.

## 15. Definition of Done globale

Un ticket est termine uniquement si :

1. Le code est implemente.
2. Les migrations necessaires sont ajoutees.
3. Les tests pertinents passent.
4. Les cas d'erreur sont journalises.
5. Le front gere loading, erreur et etat vide si applicable.
6. La documentation technique minimale est mise a jour.
7. Le comportement est coherent avec la regle E-GICOP.

## 16. Risques principaux

| Risque | Impact | Mitigation |
| --- | --- | --- |
| Rotation concurrente multi-instance | Conversations dupliquees ou non liberees | Verrou distribue |
| DB2 indisponible | Rapport perdu ou non synchronise | Outbox + retry |
| Regles metier dans le front | Incoherence apres refresh | Logique dans backend |
| Trop de blocages commerciaux | Ralentissement operationnel | Statuts `warn` avant `block` sur certaines regles |
| Donnees historiques incoherentes | Rotation fausse | Migration de nettoyage + debug poste |
| Obligations d'appel mal mesurees | Contournement commercial | Duree minimale + categorie + trace appel |

## 17. Jalons de controle

### Jalon 1 - Jour 15

```text
Rotation stable, debug poste disponible, tests critiques verts.
```

### Jalon 2 - Jour 30

```text
Rapports synchronises vers DB2 via outbox, retry actif, dashboard sync disponible.
```

### Jalon 3 - Jour 45

```text
Dashboard commercial minimum disponible avec objectifs et classements.
```

### Jalon 4 - Jour 60

```text
Gates de priorite et obligations d'appel connectes a la rotation.
```

### Jalon 5 - Jour 75

```text
Files d'action commerciale exploitables pour prospects, annules, inactifs et erreurs.
```

### Jalon 6 - Jour 90

```text
Comptes certifies, plaintes, securite utilisateur et qualite commerciale en place.
```
