# Plan de correction des ecarts E-GICOP

Date : 2026-04-27  
Projet : plateforme WhatsApp / E-GICOP  
Objectif : combler les ecarts entre le code actuel et la feuille de route E-GICOP.

## 1. Objectif du plan

Le projet actuel est une base solide de messagerie commerciale, avec integration DB2, rapports GICOP, fenetre glissante et temps reel. La cible E-GICOP est plus large : une plateforme complete de pilotage commercial, de discipline operationnelle, de suivi client et de coordination logistique.

Ce plan vise a transformer le projet actuel en plateforme E-GICOP mature.

Objectif business :

```text
Multiplier les ventes actuelles par 20 en 90 jours maximum.
```

Objectif technique :

```text
Passer d'une application de messagerie commerciale avancee
a une plateforme de pilotage commercial controlee, mesurable et automatisee.
```

## 2. Principes directeurs

1. DB1 reste la source de verite pour l'execution commerciale.
2. DB2 reste la source commandes/logistique.
3. La communication DB1 -> DB2 doit passer par une outbox fiable.
4. Les commerciaux doivent etre guides et parfois bloques selon les priorites.
5. Les indicateurs doivent etre calculables quotidiennement.
6. Chaque action commerciale importante doit etre tracable.
7. Le front doit afficher des etats simples, pas porter la logique metier.
8. Les flux critiques doivent avoir des tests e2e.

## 3. Phase 1 - Stabiliser le socle actuel

Duree estimee : 1 a 2 semaines

### Objectif

Rendre fiable le moteur actuel : conversations, rapports, rotation, affichage et diagnostic.

### Actions

1. Ajouter un verrou distribue sur la rotation.
   - Utiliser Redis/Redlock ou un lock DB.
   - Remplacer ou completer le verrou in-memory `rotatingPostes`.
   - Objectif : eviter deux rotations simultanees si plusieurs instances backend tournent.

2. Ajouter un dashboard debug par poste.
   - `activeCount`
   - `lockedCount`
   - `submittedCount`
   - `requiredCount`
   - `rotationWouldTrigger`
   - `lastRotationAt`
   - `lastRotationError`

3. Nettoyer les anciens etats DB.
   - `window_status = validated` vers `active` ou `locked`.
   - `released` avec `window_slot` non null vers `window_slot = null`.
   - `active` avec `is_locked = true` vers `is_locked = false`.
   - `locked` avec `is_locked = false` vers `is_locked = true`.

4. Ajouter tests e2e critiques.
   - 10 rapports soumis.
   - 10 rapports soumis avec conversations `ferme`.
   - DB2 indisponible.
   - emission `WINDOW_ROTATED`.
   - reload front apres rotation.

5. Renommer progressivement les notions historiques.
   - `validated` -> `submitted`
   - `blockProgress.validated` -> `blockProgress.submitted`
   - `WINDOW_REPORT_SUBMITTED` doit remplacer les anciennes notions de validation conversation.

### Livrable

```text
Une vendeuse peut gerer strictement des blocs de 10 conversations sans intervention manuelle.
```

## 4. Phase 2 - Fiabiliser la communication DB1 / DB2

Duree estimee : 2 a 3 semaines

### Objectif

Garantir qu'aucun rapport ou evenement commercial important ne soit perdu entre DB1 et DB2.

### Actions

1. Creer une table `integration_outbox`.

Champs recommandes :

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

2. Ecrire dans l'outbox dans la meme transaction que l'action metier.

Exemple soumission rapport :

```text
transaction DB1:
  update conversation_report
  insert integration_outbox(REPORT_SUBMITTED)
```

3. Creer un worker DB2.
   - Lit les evenements `pending`.
   - Fait l'upsert dans `messaging_client_dossier_mirror`.
   - Marque `success`.
   - En cas d'erreur, planifie un retry exponentiel.

4. Ajouter un dashboard sync DB2.
   - Succes.
   - Echecs.
   - Dernieres erreurs.
   - Nombre de retry.
   - Retry manuel.

5. Ajouter des alertes.
   - DB2 indisponible.
   - Trop d'echecs consecutifs.
   - Outbox bloquee.

### Livrable

```text
Aucun rapport soumis ne peut etre perdu pour DB2.
```

## 5. Phase 3 - Dashboard commercial minimum viable

Duree estimee : 2 a 3 semaines

### Objectif

Donner a chaque commercial et superviseur une lecture claire de la performance.

### Actions

1. Creer un module `commercial-performance`.

2. Centraliser les metriques :
   - ventes ;
   - commandes livrees ;
   - comptes ouverts ;
   - appels ;
   - messages recus ;
   - messages repondus ;
   - rapports soumis ;
   - relances ;
   - plaintes ;
   - heures travaillees ;
   - absences ;
   - notes client.

3. Creer une table de snapshots :

```text
commercial_daily_performance
```

4. Creer les classements :
   - jour ;
   - semaine ;
   - mois ;
   - groupe 1 ;
   - groupe 2.

5. Ajouter au front :
   - barre fixe avec rang ;
   - meilleure vendeuse du mois ;
   - meilleure vendeuse du jour ;
   - objectifs personnels ;
   - progression mensuelle.

### Livrable

```text
Chaque commercial voit ses objectifs, son rang et ses retards.
```

## 6. Phase 4 - Gates de priorite commerciale

Duree estimee : 2 semaines

### Objectif

Forcer les bonnes actions avant les actions secondaires.

### Module a creer

```text
commercial-action-gate
```

### Priorites recommandees

1. Appels en absence non traites.
2. Messages entrants non repondus.
3. Conversations actives sans rapport.
4. Obligations d'appels apres bloc de 10.
5. Relances arrivees a echeance.
6. Plaintes critiques.

### Reponses possibles

```text
allow
warn
block
redirect_to_task
```

### Actions

1. Ajouter une API :

```http
GET /commercial-action-gate/status
```

2. Ajouter un guard metier pour certaines actions :
   - envoyer message ;
   - ouvrir nouvelle conversation ;
   - cloturer ;
   - prendre pause ;
   - soumettre rapport.

3. Ajouter une UI front expliquant le blocage.

### Livrable

```text
La plateforme guide et contraint le travail quotidien.
```

## 7. Phase 5 - Obligations d'appel

Duree estimee : 1 a 2 semaines

### Objectif

Ajouter explicitement les obligations d'appel dans le declenchement de rotation.

### Regle cible

```text
Rotation = rapports du bloc actif soumis + obligations d'appel validees
```

### Obligations

Apres chaque bloc de 10 conversations :

1. 5 clientes avec commandes annulees.
2. 5 clientes avec commandes livrees.
3. 5 prospects sans commande.
4. Duree minimale : 1 min 30.
5. Controle que le commercial a la derniere reponse sur les conversations.

### Actions

1. Brancher `CallObligationService` dans `checkAndTriggerRotation`.
2. Si obligations activees et non completes : pas de rotation.
3. Afficher les obligations restantes dans le front.
4. Relancer `checkAndTriggerRotation` apres chaque appel valide.
5. Ajouter les tests :
   - rapports soumis + appels incomplets => pas de rotation ;
   - rapports soumis + appels complets => rotation ;
   - appel trop court => ne compte pas ;
   - mauvaise categorie => ne compte pas.

### Livrable

```text
La rotation peut etre conditionnee par les appels valides selon la regle GICOP.
```

## 8. Phase 6 - Temps de travail et planning

Duree estimee : 2 a 3 semaines

### Objectif

Mesurer et encadrer la presence des commerciaux.

### Modules a creer

```text
work-schedule
work-attendance
```

### Evenements de pointage

```text
arrivee
depart_pause
retour_pause
depart_maison
```

### Planning

Deux groupes de pause :

```text
Groupe A : 12h30 - 14h00
Groupe B : 14h00 - 15h30
```

### Actions

1. Creer les tables planning et pointage.
2. Ajouter l'ecran planning commercial.
3. Ajouter le compteur :
   - heures faites aujourd'hui ;
   - heures restantes ;
   - heures du mois ;
   - retards ;
   - absences.
4. Bloquer certaines actions si le commercial n'est pas pointe.

### Livrable

```text
La presence et les pauses sont mesurees et controlees.
```

## 9. Phase 7 - Files d'action commerciale

Duree estimee : 3 a 4 semaines

### Objectif

Transformer les segments clients en files d'action exploitables.

### Files a creer

1. Potentiels clients sans commande.
2. Commandes annulees.
3. Clients inactifs depuis 60 jours.
4. Erreurs commandes.
5. Appels en absence.
6. Messages venus sur le poste.

### Donnees communes

Chaque file doit avoir :

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

### Formulaire post-appel commun

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

### Livrable

```text
Chaque segment client devient une file d'action commerciale mesurable.
```

## 10. Phase 8 - Plaintes

Duree estimee : 2 semaines

### Objectif

Enregistrer et suivre les plaintes jusqu'a resolution.

### Module a creer

```text
complaints
```

### Categories

1. Commande non livree.
2. Erreur produit.
3. Code expedition non recu.
4. Plainte livreur.
5. Plainte commerciale.
6. Plainte utilisation produit.

### Workflow

```text
ouverte
assignee
en_traitement
resolue
rejetee
```

### Champs minimum

```text
complaint_id
contact_id
chat_id
order_id_db2
category
priority
status
assigned_to
resolution_note
created_at
resolved_at
```

### Livrable

```text
Chaque plainte a un responsable, un statut et une resolution tracee.
```

## 12. Phase 10 - Securite utilisateur

Duree estimee : 1 a 2 semaines

### Objectif

Securiser l'acces aux donnees commerciales.

### Actions

1. Ajouter les types d'utilisateurs :

```text
stagiaire
vendeuse_confirmee
superviseur
admin
```

2. Ajouter double verification email.
3. Rendre la restriction bureau obligatoire.
4. Journaliser les connexions :

```text
user_id
poste_id
ip
device
localisation
otp_status
login_at
```

5. Ajouter une page admin des sessions suspectes.

### Livrable

```text
L'acces front commercial est controle, journalise et limite au cadre GICOP.
```

## 13. Ordre de livraison recommande

Ordre prioritaire :

1. Rotation + DB2 fiable.
2. Dashboard commercial minimum.
3. Gates de priorite.
4. Obligations d'appel.
5. Files d'action.
6. Temps de travail.
7. Plaintes.
8. Securite avancee.

## 14. Jalons 90 jours

### Jours 1 a 15

```text
Rotation stable
Debug poste
Tests e2e critiques
Nettoyage DB historique
```

### Jours 10 a 30

```text
Outbox DB2
Worker DB2
Retry
Dashboard sync
```

### Jours 20 a 45

```text
Dashboard commercial minimum
Objectifs personnels
Classements
Stats quotidiennes
```

### Jours 35 a 60

```text
Gates de priorite
Obligations d'appel
Controle derniere reponse
```

### Jours 50 a 75

```text
Files d'action commerciale
Potentiels clients
Commandes annulees
Clients inactifs
Erreurs commandes
```

### Jours 70 a 90

```text
Plaintes
Notes client
Qualite commerciale
```

## 15. Architecture cible

```text
Front commercial
  -> Dashboard
  -> Chat
  -> Objectifs
  -> Files d'action
  -> Planning
  -> Plaintes

Backend DB1
  -> Source de verite messagerie et execution commerciale
  -> Outbox transactionnelle
  -> Moteur de regles / action gates
  -> Moteur objectifs et classements
  -> Moteur fenetre 10 conversations

Worker integration
  -> Sync DB2
  -> Retry
  -> Logs
  -> Alertes

DB2 GICOP commandes
  -> Commandes
  -> Livraisons
  -> Call logs
  -> Tables miroir messaging_*
```

## 16. Resultat attendu

Apres execution du plan, E-GICOP doit permettre :

1. Un controle strict du travail commercial.
2. Une mesure quotidienne de la performance.
3. Une synchronisation fiable avec DB2.
4. Une gestion priorisee des actions commerciales.
5. Une rotation conversationnelle stable.
6. Une exploitation des prospects, annules et anciennes clientes.
7. Une meilleure qualite client via plaintes et notes.

Le niveau de maturite cible apres ces phases :

```text
8 / 10
```

contre environ :

```text
5.2 / 10 selon la feuille de route E-GICOP complete
```
