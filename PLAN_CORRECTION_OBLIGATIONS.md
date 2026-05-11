# Plan de correction -- Feature Obligations (appels + rapports)

**Date :** 2026-05-11
**Auteur :** Team Lead
**Branche cible :** feature/fix-obligations-cycle

---

## PROBLEME 1 -- Cycle incomplet

### Cause racine

Fichier : message_whatsapp/src/call-obligations/call-obligation.service.ts

La methode getActiveBatch(posteId) filtre uniquement status: BatchStatus.PENDING (ligne 146).
isPosteReadyForRotation() retourne true quand getActiveBatch() retourne null (lignes 408-411).
Quand les 15 appels sont atteints, tryMatchCallToTask() passe le batch en COMPLETE (ligne 245).
A cet instant getActiveBatch() retourne null : isPosteReadyForRotation() retourne true sans verifier les rapports.
La rotation est donc autorisee prematurement.
getStatus() (endpoint GET /call-obligations/mine) retourne aussi null.
ObligationProgressBar disparait (ligne 44 : if (!status) return null).

### Etape 1 -- Modifier getActiveBatch()

Logique cible -- chercher PENDING puis COMPLETE :
  1. batchRepo.findOne({ where: { posteId, status: BatchStatus.PENDING } })
  2. Si trouve : retourner ce batch
  3. Sinon batchRepo.findOne({ where: { posteId, status: BatchStatus.COMPLETE }, order: { batchNumber: DESC } })
  4. Retourner null si rien trouve

Rappel TypeORM : order: { batchNumber: DESC } -- property camelCase, JAMAIS batch_number snake_case

Impact sur les autres appelants dans le meme fichier :
  getOrCreateActiveBatch() ligne 86 : utiliser batchRepo.findOne PENDING directement
  tryMatchCallToTask() ligne 202 : batch COMPLETE trouve mais taches DONE, rejet quota_categorie_atteint -- correct
  getStatus() ligne 292 : retournera le batch COMPLETE, endpoint retourne un objet non-null
  getActivePosteIds() ligne 331 : utilise batchRepo.find() directement -- non impacte
  getStuckBatches() ligne 346 : utilise batchRepo.find() directement -- non impacte
  initAllBatches() ligne 360 : poste COMPLETE vu comme deja actif -- correct

### Etape 2 -- Modifier isPosteReadyForRotation()

Injecter ConversationReportService via @Optional() dans le constructeur de CallObligationService.

Logique cible :
  1. batch = this.getActiveBatch(posteId)  -- retourne PENDING ou COMPLETE
  2. Si null : retourner true (pas de batch = pas de blocage)
  3. Si isBatchReady(batch) === false : retourner false (appels incomplets)
  4. activeConvs = await this.getActiveBlockConversations(posteId)
  5. Si activeConvs.length === 0 : retourner true (pas de rapports requis)
  6. submittedMap = await this.conversationReportService.getSubmittedMapBulk(activeConvs.map(c => c.chat_id))
  7. Retourner activeConvs.every(c => submittedMap.get(c.chat_id) === true)

### Etape 3 -- Mettre a jour call-obligation.module.ts

Importer GicopReportModule dans CallObligationModule.
Si dependance circulaire : utiliser forwardRef().
Verifier que GicopReportModule exporte bien ConversationReportService.

### Etape 4 -- Enrichir ObligationStatus et getStatus()

Ajouter dans ObligationStatus (ligne 34) :
  reportsRequired: number   // nb conversations actives du bloc actif
  reportsSubmitted: number  // nb rapports soumis dans le bloc actif

Dans getStatus() :
  Si batch PENDING : reportsRequired = 0, reportsSubmitted = 0
  Si batch COMPLETE : calculer via getActiveBlockConversations() + getSubmittedMapBulk()

### Etape 5 -- Mettre a jour ObligationProgressBar.tsx

1. Enrichir ObligationStatus dans front/src/store/chatStore.ts :
   reportsRequired: number, reportsSubmitted: number, status: string

2. Quand allCallsDone === true et status.reportsRequired > 0 :
   Afficher section Rapports GICOP : {reportsSubmitted}/{reportsRequired} soumis
   Barre verte quand reportsSubmitted === reportsRequired

3. Garder if (!status) return null
4. Garder if (status.readyForRotation) return null

### Recapitulatif fichiers -- Probleme 1

message_whatsapp/src/call-obligations/call-obligation.service.ts -- MODIFICATION
  getActiveBatch() inclut COMPLETE, isPosteReadyForRotation() verifie les rapports
  getStatus() enrichi, injection ConversationReportService via @Optional()

message_whatsapp/src/call-obligations/call-obligation.module.ts -- MODIFICATION
  Importer GicopReportModule

message_whatsapp/src/gicop-report/conversation-report.module.ts -- MODIFICATION POSSIBLE
  Exporter ConversationReportService si absent

front/src/store/chatStore.ts -- MODIFICATION
  Enrichir ObligationStatus avec reportsRequired, reportsSubmitted, status

front/src/components/sidebar/ObligationProgressBar.tsx -- MODIFICATION
  Section rapports quand appels complets

---
## PROBLEME 2 -- Pas de mise a jour temps reel

### Cause racine

tryMatchCallToTask() incremente les compteurs en base (lignes 236-249) mais n emet aucun evenement.
Le frontend poll GET /call-obligations/mine toutes les 60 secondes (ligne 32 du composant).
L evenement DOM obligations:reload (ligne 36) n est jamais declenche par le backend.

Architecture socket existante :
  Gateway WhatsappMessageGateway : @WebSocketServer() server: Server
  RealtimeServerService : partage la reference via getServer()
  Publishers : pattern @OnEvent() + RealtimeServerService (voir window.publisher.ts)
  Rooms : poste:{posteId} pour les commerciaux (ligne 102 agent-connection.service.ts)

### Etape 1 -- Injecter EventEmitter2

Fichier : message_whatsapp/src/call-obligations/call-obligation.service.ts
Importer EventEmitter2 depuis @nestjs/event-emitter.
L ajouter au constructeur (deja disponible dans le projet -- visible dans WindowRotationService ligne 5).

### Etape 2 -- Emettre apres validation

Dans tryMatchCallToTask(), apres await this.batchRepo.save(batch) (ligne 249) :
  const obligationStatus = await this.getStatus(posteId);
  this.eventEmitter.emit(call_obligation.matched, { posteId, obligationStatus });

### Etape 3 -- Creer ObligationPublisher

Fichier a creer : message_whatsapp/src/realtime/publishers/obligation.publisher.ts
Modele exact : message_whatsapp/src/realtime/publishers/window.publisher.ts

Structure :
  @Injectable()
  Constructeur : injecter RealtimeServerService
  @OnEvent(call_obligation.matched, { async: true })
  Payload recu : { posteId: string; obligationStatus: ObligationStatus | null }
  Emettre sur poste:{posteId} : chat:event de type OBLIGATION_UPDATED
  Log : OBLIGATION_UPDATED vers poste:{posteId}

### Etape 4 -- Constante OBLIGATION_UPDATED

Fichier backend : message_whatsapp/src/realtime/events/socket-events.constants.ts
Dans CHAT_EVENT_TYPES, ajouter : OBLIGATION_UPDATED: OBLIGATION_UPDATED

Fichier miroir frontend : front/src/lib/socket/socket-events.constants.ts
Ajouter la meme constante (les deux fichiers doivent rester identiques, cf commentaire ligne 4).

### Etape 5 -- Enregistrer ObligationPublisher

Localiser le module Realtime (realtime.module.ts ou app.module.ts).
Ajouter ObligationPublisher aux providers.

### Etape 6 -- Ecouter OBLIGATION_UPDATED cote frontend

Fichier : front/src/modules/realtime/store/socket-session.store.ts (ou equivalent)
Dans le handler des evenements chat:event, ajouter :
  case OBLIGATION_UPDATED: set({ obligationStatus: payload }); break;

### Recapitulatif fichiers -- Probleme 2

message_whatsapp/src/call-obligations/call-obligation.service.ts -- MODIFICATION
  Injecter EventEmitter2 ; emettre call_obligation.matched

message_whatsapp/src/realtime/publishers/obligation.publisher.ts -- CREATION
  Ecoute call_obligation.matched, emet OBLIGATION_UPDATED sur poste:{posteId}

message_whatsapp/src/realtime/events/socket-events.constants.ts -- MODIFICATION
  Ajouter OBLIGATION_UPDATED dans CHAT_EVENT_TYPES

Module Realtime -- MODIFICATION
  Enregistrer ObligationPublisher dans les providers

front/src/lib/socket/socket-events.constants.ts -- MODIFICATION
  Ajouter OBLIGATION_UPDATED

front/src/modules/realtime/store/socket-session.store.ts -- MODIFICATION
  Traiter OBLIGATION_UPDATED, appeler set({ obligationStatus: payload })

---
## ORDRE D IMPLEMENTATION

Phase 1 -- Backend :
  1. call-obligation.service.ts :
     a. getActiveBatch() inclut COMPLETE
     b. Injecter EventEmitter2
     c. Emettre call_obligation.matched apres batchRepo.save()
     d. Injecter ConversationReportService via @Optional()
     e. isPosteReadyForRotation() verifie les rapports
     f. Enrichir ObligationStatus avec reportsRequired/reportsSubmitted
     g. getStatus() calcule ces champs
  2. call-obligation.module.ts : importer GicopReportModule
  3. conversation-report.module.ts : exporter ConversationReportService si absent
  4. Creer obligation.publisher.ts
  5. socket-events.constants.ts backend : ajouter OBLIGATION_UPDATED
  6. Module Realtime : enregistrer ObligationPublisher

Phase 2 -- Frontend :
  7. chatStore.ts : enrichir ObligationStatus
  8. socket-events.constants.ts frontend : ajouter OBLIGATION_UPDATED
  9. Handler socket : traiter OBLIGATION_UPDATED
  10. ObligationProgressBar.tsx : afficher section rapports

---

## RISQUES

1. Dependance circulaire CallObligationService <-> ConversationReportService
   Verifier le graphe avant implementation. Si circulaire : forwardRef().

2. Batch COMPLETE sans conversations actives
   reportsRequired = 0 : rotation autorisee immediatement. Comportement correct.

3. Regression initAllBatches()
   Poste COMPLETE vu comme deja actif. Correct : nouveau batch cree par _executeRotation().

4. getActivePosteIds() non impacte
   Utilise batchRepo.find() directement.

5. Race condition
   Emissions idempotentes. Frontend applique le dernier etat recu.

---

## CRITERES DE VALIDATION

### Critere 1 -- Rotation bloquee apres les 15 appels

Test manuel :
  1. Valider 15 appels (5 par categorie)
  2. En base : batch.status = complete
  3. GET /call-obligations/mine retourne objet non-null avec status: complete
  4. ObligationProgressBar reste visible (15/15 vert + section rapports 0/N)
  5. Aucune rotation ne se produit
  6. Dernier rapport soumis : rotation automatique

Tests unitaires call-obligation.service.spec.ts :
  isPosteReadyForRotation() COMPLETE + rapports incomplets => false
  isPosteReadyForRotation() COMPLETE + tous rapports soumis => true
  isPosteReadyForRotation() sans batch => true

### Critere 2 -- Section rapports dans le frontend

  Apres 15 appels : section Rapports GICOP 0/N soumis visible
  Chaque rapport soumis : compteur incremente
  Tous soumis : composant disparait

### Critere 3 -- Temps reel inferieur a 2 secondes

  Valider un appel : ObligationProgressBar mis a jour sans attendre le poll 60s
  Log backend : OBLIGATION_UPDATED vers poste:{posteId}

### Critere 4 -- Aucune regression

  npx jest --testPathPattern=call-obligation|window-rotation|conversation-report --coverage
  npx tsc --noEmit
  Resultat : 0 echec, 0 erreur TypeScript

### Critere 5 -- Cycle complet de bout en bout

  1. Batch PENDING, 15 appels (temps reel OK), batch COMPLETE, rotation bloquee
  2. Rapports soumis progressivement, frontend a jour
  3. Dernier rapport soumis : rotation automatique, nouveau batch PENDING

---

## CONVENTIONS

TypeORM : property names camelCase (batchNumber, posteId, createdAt)
  JAMAIS les column names snake_case (batch_number, poste_id, created_at)
TypeORM order: { batchNumber: DESC } -- JAMAIS { batch_number: DESC }
Jamais ecrire dans les tables natives DB2
Migration eventuelle : class name terminant par timestamp 13 chiffres
  Exemple : FixObligationsCycle1747008000001
Ne jamais commiter automatiquement -- attendre instruction explicite
Toujours travailler depuis une branche feature, jamais directement sur master

---

## FICHIERS A LIRE AVANT IMPLEMENTATION

Agent backend-dev :
  1. message_whatsapp/src/call-obligations/call-obligation.service.ts
  2. message_whatsapp/src/call-obligations/call-obligation.module.ts
  3. message_whatsapp/src/gicop-report/conversation-report.module.ts
  4. Module Realtime (realtime.module.ts ou app.module.ts)
  5. message_whatsapp/src/realtime/publishers/window.publisher.ts (modele a suivre)

Agent frontend-dev :
  1. front/src/store/chatStore.ts
  2. front/src/components/sidebar/ObligationProgressBar.tsx
  3. front/src/modules/realtime/store/socket-session.store.ts
  4. front/src/lib/socket/socket-events.constants.ts