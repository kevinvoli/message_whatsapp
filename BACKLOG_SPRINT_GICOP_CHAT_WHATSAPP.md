# Backlog Sprint GICOP - Chat WhatsApp Messenger

Date: 22 avril 2026

Reference principale:
- `PLAN_IMPLEMENTATION_GICOP_CHAT_WHATSAPP.md`

Objectif du document:
- transformer le plan GICOP en backlog exploitable par sprint
- fournir des tickets concrets pour backend, front, admin, data, ops et ERP
- rendre visibles les blocants, dependances et criteres d'acceptation

Regles de lecture:
- un ticket ne doit pas commencer si ses blocants ne sont pas leves
- les tickets `data` et `ops` sont aussi importants que les tickets `backend`
- les tickets de rollback, dry-run et observabilite ne sont pas optionnels

Convention:
- `BE` = backend `message_whatsapp`
- `FE` = front commercial `front`
- `ADM` = panel admin `admin`
- `DATA` = migrations, backfills, controles SQL
- `OPS` = runbook, cron, recette, bascule
- `ERP` = contrat et payloads plateforme commandes

---

## 1. Vue d'ensemble des sprints

| Sprint | Objectif principal | Lots concernes | Gate de sortie |
|---|---|---|---|
| Sprint 0 | Lever les blocants structurants | Lot 0, base Lot I | `poste` defini, ERP v1 cadre, policy 24h specifiee, dry-run initial fait |
| Sprint 1 | Livrer les fondations sticky assignment | Lot A, Lot I | affinite en base, dispatcher compatible, feature flag disponible |
| Sprint 2 | Durcir capacite et crons d'affectation | Lot B, Lot A, Lot I | limite 10 enforcee, crons compatibles affinite |
| Sprint 3 | Stabiliser les categories clients | pre-requis Lot F, part Lot G | categories fiables et verifiables en base |
| Sprint 4 | Livrer rapport GICOP et cloture metier | Lot C, Lot I | cloture bloquee si rapport incomplet |
| Sprint 5 | Livrer relances auto, satisfaction et policy 24h | Lot D, Lot E, Lot I | automations pilotables et tracees |
| Sprint 6 | Livrer obligations d'appels | Lot F, Lot I | batchs generes et validates par donnees reelles |
| Sprint 7 | Livrer automations commande et expedition | Lot G, Lot I | flux ERP reel teste et journalise |
| Sprint 8 | Livrer catalogue multimedia | Lot H | envoi texte + media via bouton chat |
| Sprint 9 | Hardening, runbook, GO/NOGO | tous lots | dry-run final, rollback, runbook et decision de publication |

---

## 2. Sprint 0 - Cadrage bloquant et convergence

### S0-001

- `ID`: `S0-001`
- `Sprint`: `Sprint 0`
- `Lot`: `Lot 0`
- `Intitule`: Definir officiellement la notion de `poste`
- `Perimetre`: `metier`, `BE`, `OPS`
- `Blocants`:
  - disponibilite des decideurs metier
  - disponibilite lead technique dispatcher
- `Livrable attendu`:
  - note de decision signee avec definition cible:
    - poste technique
    - commercial
    - proprietaire conversationnel
  - consequences sur sticky assignment, transferts et reouvertures
- `Critere d'acceptation`:
  - un document de decision existe
  - le Lot A peut s'appuyer sur une definition unique

### S0-002

- `ID`: `S0-002`
- `Sprint`: `Sprint 0`
- `Lot`: `Lot 0`
- `Intitule`: Specifier `WhatsappWindowPolicyService`
- `Perimetre`: `BE`, `metier`
- `Blocants`:
  - arbitrage metier hors fenetre 24h
- `Livrable attendu`:
  - spec du service avec contrat minimal:
    - `window_open`
    - `free_text_allowed`
    - `template_required`
    - `recommended_template_code`
    - `fallback_mode`
    - `reason_code`
- `Critere d'acceptation`:
  - les besoins 5, 6, 7, 8 peuvent l'utiliser sans logique locale divergente

### S0-003

- `ID`: `S0-003`
- `Sprint`: `Sprint 0`
- `Lot`: `Lot 0`
- `Intitule`: Formaliser le contrat ERP v1 pour commande et expedition
- `Perimetre`: `ERP`, `BE`, `DATA`
- `Blocants`:
  - disponibilite equipe ERP
- `Livrable attendu`:
  - payload cible `order_created`
  - payload cible `shipment_code_created`
  - definition du transport photo produit
- `Critere d'acceptation`:
  - les champs minimums sont valides et signs entre equipes

### S0-004

- `ID`: `S0-004`
- `Sprint`: `Sprint 0`
- `Lot`: `Lot 0`
- `Intitule`: Identifier la source de verite des categories clients du futur Lot F
- `Perimetre`: `metier`, `BE`, `DATA`, `ERP`
- `Blocants`:
  - arbitrage `venue_sans_commande`
- `Livrable attendu`:
  - tableau source de verite par categorie
  - regle de calcul ou d'alimentation
- `Critere d'acceptation`:
  - les trois categories sont calculables ou alimentables

### S0-005

- `ID`: `S0-005`
- `Sprint`: `Sprint 0`
- `Lot`: `Lot 0`
- `Intitule`: Executer un dry-run initial de migrations sur copie de base `production`
- `Perimetre`: `DATA`, `OPS`
- `Blocants`:
  - copie de base disponible
- `Livrable attendu`:
  - rapport dry-run initial
  - mesures de temps
  - anomalies de schema
- `Critere d'acceptation`:
  - les ecarts `production` -> `master` sont listes
  - les migrations sensibles sont identifiees

### S0-006

- `ID`: `S0-006`
- `Sprint`: `Sprint 0`
- `Lot`: `Lot I`
- `Intitule`: Identifier les crons a suspendre en recette GICOP
- `Perimetre`: `OPS`, `BE`
- `Blocants`:
  - audit cron termine
- `Livrable attendu`:
  - liste des crons suspendus:
    - `read-only-enforcement`
    - `ValidationEngineService.handleExternalCriterionTimeout`
    - `FlowPollingJob.pollQueueWait`
    - `FlowPollingJob.pollInactivity`
- `Critere d'acceptation`:
  - le plan de recette GICOP ne subit pas de perturbation automatique non controlee

### S0-007

- `ID`: `S0-007`
- `Sprint`: `Sprint 0`
- `Lot`: `Lot I`
- `Intitule`: Definir le socle minimal d'observabilite GICOP
- `Perimetre`: `BE`, `ADM`, `OPS`
- `Blocants`:
  - aucun
- `Livrable attendu`:
  - liste des logs structures obligatoires
  - liste des dashboards minimaux
- `Critere d'acceptation`:
  - chaque lot GICOP connait deja ses exigences de trace

---

## 3. Sprint 1 - Fondations sticky assignment

### S1-001

- `ID`: `S1-001`
- `Sprint`: `Sprint 1`
- `Lot`: `Lot A`
- `Intitule`: Creer la migration `contact_assignment_affinity`
- `Perimetre`: `DATA`, `BE`
- `Blocants`:
  - `S0-001`
- `Livrable attendu`:
  - table et indexes associes
- `Critere d'acceptation`:
  - migration additive
  - compatible base `production`

### S1-002

- `ID`: `S1-002`
- `Sprint`: `Sprint 1`
- `Lot`: `Lot A`
- `Intitule`: Implementer `AssignmentAffinityService`
- `Perimetre`: `BE`
- `Blocants`:
  - `S1-001`
- `Livrable attendu`:
  - service create/update/release/find active affinity
- `Critere d'acceptation`:
  - service teste unitairement

### S1-003

- `ID`: `S1-003`
- `Sprint`: `Sprint 1`
- `Lot`: `Lot A`
- `Intitule`: Brancher l'affinite dans le dispatcher
- `Perimetre`: `BE`
- `Blocants`:
  - `S1-002`
- `Livrable attendu`:
  - lecture d'affinite avant policy standard
- `Critere d'acceptation`:
  - un client deja connu revient au bon poste quand la policy le permet

### S1-004

- `ID`: `S1-004`
- `Sprint`: `Sprint 1`
- `Lot`: `Lot A`
- `Intitule`: Ajouter feature flag sticky assignment
- `Perimetre`: `BE`, `OPS`
- `Blocants`:
  - `S1-003`
- `Livrable attendu`:
  - flag on/off pilotable
- `Critere d'acceptation`:
  - rollback logique du lot possible sans migration destructive

### S1-005

- `ID`: `S1-005`
- `Sprint`: `Sprint 1`
- `Lot`: `Lot I`
- `Intitule`: Journaliser les decisions d'affinite
- `Perimetre`: `BE`, `ADM`
- `Blocants`:
  - `S1-003`
- `Livrable attendu`:
  - logs `AFFINITY_HIT`, `AFFINITY_WAITING`, `AFFINITY_FALLBACK`, `AFFINITY_OVERRIDDEN`
- `Critere d'acceptation`:
  - toute reaffectation sticky est explicable

### S1-006

- `ID`: `S1-006`
- `Sprint`: `Sprint 1`
- `Lot`: `Lot A`
- `Intitule`: Ajouter indicateur proprietaire en interface
- `Perimetre`: `FE`
- `Blocants`:
  - `S1-003`
- `Livrable attendu`:
  - badge proprietaire/affinite
- `Critere d'acceptation`:
  - le poste de reference est visible cote commercial

---

## 4. Sprint 2 - Capacite et crons d'affectation

### S2-001

- `ID`: `S2-001`
- `Sprint`: `Sprint 2`
- `Lot`: `Lot B`
- `Intitule`: Auditer tous les flux d'assignation et reassignation
- `Perimetre`: `BE`
- `Blocants`:
  - `S1-003`
- `Livrable attendu`:
  - matrice des points d'entree:
    - assignation initiale
    - reouverture
    - transfert
    - reinjection
    - reset stuck
- `Critere d'acceptation`:
  - tous les chemins critiques sont identifies

### S2-002

- `ID`: `S2-002`
- `Sprint`: `Sprint 2`
- `Lot`: `Lot B`
- `Intitule`: Centraliser l'enforcement de la capacite 10
- `Perimetre`: `BE`
- `Blocants`:
  - `S2-001`
- `Livrable attendu`:
  - garde-fou service unique pour la prise en charge
- `Critere d'acceptation`:
  - impossible d'activer une 11e conversation

### S2-003

- `ID`: `S2-003`
- `Sprint`: `Sprint 2`
- `Lot`: `Lot B`
- `Intitule`: Afficher clairement le quota `x/10`
- `Perimetre`: `FE`
- `Blocants`:
  - `S2-002`
- `Livrable attendu`:
  - badge `x/10`, conversation verrouillee visible
- `Critere d'acceptation`:
  - le commercial voit sa capacite restante

### S2-004

- `ID`: `S2-004`
- `Sprint`: `Sprint 2`
- `Lot`: `Lot A`
- `Intitule`: Adapter `sla-checker` a la sticky assignment
- `Perimetre`: `BE`, `OPS`
- `Blocants`:
  - `S1-003`
- `Livrable attendu`:
  - `sla-checker` respecte l'affinite
- `Critere d'acceptation`:
  - aucune reaffectation contradictoire en recette

### S2-005

- `ID`: `S2-005`
- `Sprint`: `Sprint 2`
- `Lot`: `Lot A`
- `Intitule`: Adapter `offline-reinject` a la sticky assignment
- `Perimetre`: `BE`, `OPS`
- `Blocants`:
  - `S1-003`
- `Livrable attendu`:
  - policy offline/fallback tracee
- `Critere d'acceptation`:
  - comportement offline conforme a la decision metier

### S2-006

- `ID`: `S2-006`
- `Sprint`: `Sprint 2`
- `Lot`: `Lot I`
- `Intitule`: Ajouter audit admin des depassements et reassignations
- `Perimetre`: `ADM`, `BE`
- `Blocants`:
  - `S2-002`, `S2-004`, `S2-005`
- `Livrable attendu`:
  - vue admin de surcharge et reassignation
- `Critere d'acceptation`:
  - incidents de capacite et d'affinite visibles cote admin

---

## 5. Sprint 3 - Data foundation categories clients

### S3-001

- `ID`: `S3-001`
- `Sprint`: `Sprint 3`
- `Lot`: `pre-Lot F`
- `Intitule`: Modeliser les 3 categories clients cibles
- `Perimetre`: `metier`, `DATA`, `BE`
- `Blocants`:
  - `S0-004`
- `Livrable attendu`:
  - definitions metier figees
- `Critere d'acceptation`:
  - chaque categorie a une regle de calcul ou une source de verite

### S3-002

- `ID`: `S3-002`
- `Sprint`: `Sprint 3`
- `Lot`: `pre-Lot F`
- `Intitule`: Etendre le modele ou les mappings pour categories client
- `Perimetre`: `BE`, `DATA`
- `Blocants`:
  - `S3-001`
- `Livrable attendu`:
  - colonnes/mappings/aggregats necessaires
- `Critere d'acceptation`:
  - les categories sont persistables ou recalculables

### S3-003

- `ID`: `S3-003`
- `Sprint`: `Sprint 3`
- `Lot`: `pre-Lot F`
- `Intitule`: Executer le backfill des categories sur copie de base production
- `Perimetre`: `DATA`, `OPS`
- `Blocants`:
  - `S3-002`
- `Livrable attendu`:
  - script idempotent
  - rapport de backfill
- `Critere d'acceptation`:
  - des contacts reels existent dans les 3 categories

### S3-004

- `ID`: `S3-004`
- `Sprint`: `Sprint 3`
- `Lot`: `pre-Lot F`
- `Intitule`: Exposer une requete de controle par categorie
- `Perimetre`: `BE`, `ADM`
- `Blocants`:
  - `S3-003`
- `Livrable attendu`:
  - endpoint ou ecran de verification admin
- `Critere d'acceptation`:
  - les categories sont verifiables avant le Lot F

---

## 6. Sprint 4 - Rapport GICOP et cloture metier

### S4-001

- `ID`: `S4-001`
- `Sprint`: `Sprint 4`
- `Lot`: `Lot C`
- `Intitule`: Creer la migration `conversation_report`
- `Perimetre`: `DATA`, `BE`
- `Blocants`:
  - champs minimums arbitres
- `Livrable attendu`:
  - table + indexes
- `Critere d'acceptation`:
  - migration compatible base existante

### S4-002

- `ID`: `S4-002`
- `Sprint`: `Sprint 4`
- `Lot`: `Lot C`
- `Intitule`: Implementer endpoints rapport GICOP
- `Perimetre`: `BE`
- `Blocants`:
  - `S4-001`
- `Livrable attendu`:
  - `GET`, `PUT`, `PATCH validate`
- `Critere d'acceptation`:
  - rapport modifiable et validable

### S4-003

- `ID`: `S4-003`
- `Sprint`: `Sprint 4`
- `Lot`: `Lot C`
- `Intitule`: Ajouter panneau rapport dans le chat
- `Perimetre`: `FE`
- `Blocants`:
  - `S4-002`
- `Livrable attendu`:
  - panneau side/report avec autosave
- `Critere d'acceptation`:
  - le commercial peut remplir le rapport sans quitter la conversation

### S4-004

- `ID`: `S4-004`
- `Sprint`: `Sprint 4`
- `Lot`: `Lot C`
- `Intitule`: Bloquer la cloture si rapport incomplet
- `Perimetre`: `BE`, `FE`
- `Blocants`:
  - `S4-002`
- `Livrable attendu`:
  - validation metier a la cloture
- `Critere d'acceptation`:
  - une conversation ne se ferme pas sans minimum requis

### S4-005

- `ID`: `S4-005`
- `Sprint`: `Sprint 4`
- `Lot`: `Lot C`
- `Intitule`: Encadrer `read-only-enforcement` en contexte GICOP
- `Perimetre`: `BE`, `OPS`
- `Blocants`:
  - `S4-004`
- `Livrable attendu`:
  - cron suspendu ou adapte
- `Critere d'acceptation`:
  - aucune fermeture auto ne bypass le rapport obligatoire

---

## 7. Sprint 5 - Policy 24h, relances automatiques et satisfaction

### S5-001

- `ID`: `S5-001`
- `Sprint`: `Sprint 5`
- `Lot`: `Lot D`, `Lot E`
- `Intitule`: Implementer `WhatsappWindowPolicyService`
- `Perimetre`: `BE`
- `Blocants`:
  - `S0-002`
- `Livrable attendu`:
  - service central reutilisable
- `Critere d'acceptation`:
  - tous les appels passent par ce service

### S5-002

- `ID`: `S5-002`
- `Sprint`: `Sprint 5`
- `Lot`: `Lot E`
- `Intitule`: Creer `scheduled_outbound_message`
- `Perimetre`: `DATA`, `BE`
- `Blocants`:
  - `S5-001`
- `Livrable attendu`:
  - table + service + job d'envoi
- `Critere d'acceptation`:
  - un message planifie peut etre cree et execute

### S5-003

- `ID`: `S5-003`
- `Sprint`: `Sprint 5`
- `Lot`: `Lot E`
- `Intitule`: Brancher automation de relance sur `follow_up.created`
- `Perimetre`: `BE`
- `Blocants`:
  - `S5-002`
- `Livrable attendu`:
  - listener + scheduling
- `Critere d'acceptation`:
  - une relance datee peut generer un envoi automatique

### S5-004

- `ID`: `S5-004`
- `Sprint`: `Sprint 5`
- `Lot`: `Lot D`
- `Intitule`: Creer `conversation_rating` et message de satisfaction
- `Perimetre`: `DATA`, `BE`
- `Blocants`:
  - `S5-001`
- `Livrable attendu`:
  - table + listener fermeture
- `Critere d'acceptation`:
  - une demande de notation est envoyee a la fin de conversation

### S5-005

- `ID`: `S5-005`
- `Sprint`: `Sprint 5`
- `Lot`: `Lot D`
- `Intitule`: Afficher note et satisfaction dans front/admin
- `Perimetre`: `FE`, `ADM`
- `Blocants`:
  - `S5-004`
- `Livrable attendu`:
  - vues satisfaction
- `Critere d'acceptation`:
  - note visible sur fiche client ou dashboard

---

## 8. Sprint 6 - Obligations d'appels et qualite

### S6-001

- `ID`: `S6-001`
- `Sprint`: `Sprint 6`
- `Lot`: `Lot F`
- `Intitule`: Creer `commercial_obligation_batch`
- `Perimetre`: `DATA`, `BE`
- `Blocants`:
  - `S3-004`
- `Livrable attendu`:
  - table + service de jalon
- `Critere d'acceptation`:
  - batch cree une seule fois a chaque multiple de 10

### S6-002

- `ID`: `S6-002`
- `Sprint`: `Sprint 6`
- `Lot`: `Lot F`
- `Intitule`: Creer `call_task`
- `Perimetre`: `DATA`, `BE`
- `Blocants`:
  - `S6-001`
- `Livrable attendu`:
  - table + statuts de taches
- `Critere d'acceptation`:
  - les 15 taches sont generables si data disponible

### S6-003

- `ID`: `S6-003`
- `Sprint`: `Sprint 6`
- `Lot`: `Lot F`
- `Intitule`: Matcher `call_log` avec les taches d'appels
- `Perimetre`: `BE`
- `Blocants`:
  - `S6-002`
- `Livrable attendu`:
  - regle de validation >= 90 sec
- `Critere d'acceptation`:
  - un appel de 95 sec valide, 45 sec invalide

### S6-004

- `ID`: `S6-004`
- `Sprint`: `Sprint 6`
- `Lot`: `Lot F`
- `Intitule`: Calculer le controle qualite des 10 derniers messages
- `Perimetre`: `BE`
- `Blocants`:
  - `S6-001`
- `Livrable attendu`:
  - service `conversation-quality`
- `Critere d'acceptation`:
  - le dernier message commercial et la couverture minimale sont evaluables

### S6-005

- `ID`: `S6-005`
- `Sprint`: `Sprint 6`
- `Lot`: `Lot F`
- `Intitule`: Construire les vues front/admin des batches
- `Perimetre`: `FE`, `ADM`
- `Blocants`:
  - `S6-003`, `S6-004`
- `Livrable attendu`:
  - ecrans progression batch
- `Critere d'acceptation`:
  - le commercial et l'admin visualisent l'etat des obligations

---

## 9. Sprint 7 - Automatisations commande et expedition

### S7-001

- `ID`: `S7-001`
- `Sprint`: `Sprint 7`
- `Lot`: `Lot G`
- `Intitule`: Etendre les DTO ERP `order_created`
- `Perimetre`: `ERP`, `BE`
- `Blocants`:
  - `S0-003`
- `Livrable attendu`:
  - payload reel supporte detail commande + media produit
- `Critere d'acceptation`:
  - event reel parse sans contournement

### S7-002

- `ID`: `S7-002`
- `Sprint`: `Sprint 7`
- `Lot`: `Lot G`
- `Intitule`: Implementer recap commande + photo
- `Perimetre`: `BE`
- `Blocants`:
  - `S7-001`, `S5-001`
- `Livrable attendu`:
  - listener `order_created`
- `Critere d'acceptation`:
  - recap envoye si policy 24h l'autorise

### S7-003

- `ID`: `S7-003`
- `Sprint`: `Sprint 7`
- `Lot`: `Lot G`
- `Intitule`: Implementer envoi code expedition
- `Perimetre`: `ERP`, `BE`
- `Blocants`:
  - `S0-003`, `S5-001`
- `Livrable attendu`:
  - traitement `shipment_code_created`
- `Critere d'acceptation`:
  - code envoye au bon contact

### S7-004

- `ID`: `S7-004`
- `Sprint`: `Sprint 7`
- `Lot`: `Lot G`
- `Intitule`: Afficher automations commande et expedition dans timeline/admin
- `Perimetre`: `FE`, `ADM`
- `Blocants`:
  - `S7-002`, `S7-003`
- `Livrable attendu`:
  - timeline et logs admin
- `Critere d'acceptation`:
  - chaque envoi ou echec est visible

---

## 10. Sprint 8 - Catalogue multimedia

### S8-001

- `ID`: `S8-001`
- `Sprint`: `Sprint 8`
- `Lot`: `Lot H`
- `Intitule`: Creer `information_category_asset`
- `Perimetre`: `DATA`, `BE`
- `Blocants`:
  - strategie media validee
- `Livrable attendu`:
  - table + indexes + CRUD API
- `Critere d'acceptation`:
  - les contenus sont gerables cote admin

### S8-002

- `ID`: `S8-002`
- `Sprint`: `Sprint 8`
- `Lot`: `Lot H`
- `Intitule`: Construire backoffice catalogue multimedia
- `Perimetre`: `ADM`
- `Blocants`:
  - `S8-001`
- `Livrable attendu`:
  - ecran de gestion catalogue
- `Critere d'acceptation`:
  - ajout, edition, activation, desactivation possibles

### S8-003

- `ID`: `S8-003`
- `Sprint`: `Sprint 8`
- `Lot`: `Lot H`
- `Intitule`: Ajouter bouton d'envoi par categorie dans le chat
- `Perimetre`: `FE`
- `Blocants`:
  - `S8-001`
- `Livrable attendu`:
  - modal de selection et preview
- `Critere d'acceptation`:
  - un commercial peut envoyer texte + media en un flux unique

---

## 11. Sprint 9 - Hardening, runbook et go-live

### S9-001

- `ID`: `S9-001`
- `Sprint`: `Sprint 9`
- `Lot`: `cross`
- `Intitule`: Executer dry-run final sur copie de base `production`
- `Perimetre`: `DATA`, `OPS`
- `Blocants`:
  - tous les lots precedents livres ou de-scopes
- `Livrable attendu`:
  - rapport dry-run final
- `Critere d'acceptation`:
  - aucune migration critique non maitrisee

### S9-002

- `ID`: `S9-002`
- `Sprint`: `Sprint 9`
- `Lot`: `cross`
- `Intitule`: Verifier crons actifs et feature flags de publication
- `Perimetre`: `OPS`, `BE`
- `Blocants`:
  - `S9-001`
- `Livrable attendu`:
  - matrice finale crons ON/OFF
  - matrice flags ON/OFF
- `Critere d'acceptation`:
  - aucun cron a risque non controle

### S9-003

- `ID`: `S9-003`
- `Sprint`: `Sprint 9`
- `Lot`: `cross`
- `Intitule`: Rediger runbook de publication `master` -> environnement actuel
- `Perimetre`: `OPS`
- `Blocants`:
  - `S9-001`
- `Livrable attendu`:
  - runbook pas a pas
- `Critere d'acceptation`:
  - publication et rollback logique decrits clairement

### S9-004

- `ID`: `S9-004`
- `Sprint`: `Sprint 9`
- `Lot`: `cross`
- `Intitule`: Organiser revue GO/NOGO
- `Perimetre`: `OPS`, `metier`, `tech`
- `Blocants`:
  - `S9-002`, `S9-003`
- `Livrable attendu`:
  - compte-rendu GO/NOGO
- `Critere d'acceptation`:
  - decision finale documentee

---

## 12. Matrice des blocants structurants

| Sujet | Ticket(s) lies | Bloque |
|---|---|---|
| Definition de `poste` | `S0-001` | `S1-001`, `S1-002`, `S1-003`, donc tout Lot A |
| Policy 24h WhatsApp | `S0-002` | besoins 5, 6, 7, 8 |
| Contrat ERP v1 | `S0-003` | Lot G, partiellement Sprint 3 |
| Categories clients | `S0-004`, `S3-*` | Lot F |
| Dry-run base production | `S0-005`, `S9-001` | publication `master` |
| Suspension crons recette | `S0-006` | recette GICOP fiable |
| Observabilite minimum | `S0-007` | validation de tous les lots |

---

## 13. Priorisation immediate recommande

Ordre recommande des 10 premiers tickets a lancer:
1. `S0-001` - Definition de `poste`
2. `S0-002` - Spec `WhatsappWindowPolicyService`
3. `S0-003` - Contrat ERP v1
4. `S0-005` - Dry-run initial base `production`
5. `S0-006` - Suspension des crons a risque
6. `S0-007` - Socle observabilite
7. `S1-001` - Migration `contact_assignment_affinity`
8. `S1-002` - Service d'affinite
9. `S1-003` - Dispatcher sticky
10. `S2-002` - Enforcement capacite 10

---

## 14. Definition of done globale du programme GICOP

Le programme ne peut etre considere pret a publier que si:
- les blocants Phase 0 sont leves
- les migrations ont reussi sur une copie de base `production`
- les crons a risque sont maitrises
- la sticky assignment est verifiee sur donnees reelles
- la cloture ne bypass pas le rapport GICOP
- les automations WhatsApp passent toutes par `WhatsappWindowPolicyService`
- les obligations d'appels reposent sur des categories fiables
- les logs et dashboards permettent d'expliquer toute decision critique
- le runbook de publication et rollback existe
