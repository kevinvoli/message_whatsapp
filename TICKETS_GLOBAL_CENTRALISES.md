# TICKETS_GLOBAL_CENTRALISES.md

## 1. Registre central des tickets

Ce document est le backlog unique d'execution, consolide depuis:
- `AUDIT_COMPLET.md`
- `MATRICE_FONCTIONNALITES.md`
- `CAHIER_DES_CHARGES_CORRECTION_IMPLEMENTATION_IA.md`

Regle: un ticket = une livraison atomique verifiable.

### Statuts autorises
- `todo`
- `in_progress`
- `blocked`
- `review`
- `done`

### Priorites
- `P0` critique (securite/bloquant prod)
- `P1` haute (stabilisation fonctionnelle)
- `P2` amelioration/industrialisation

---

## 2. Vue globale (portfolio)

| ID | Priorite | Domaine | Titre | Dependances | Estimation | Statut |
|---|---|---|---|---|---|---|
| TKT-P0-001 | P0 | Back | Suppression credentials admin hardcodes | - | 0.5j | done |
| TKT-P0-002 | P0 | Back | Protection routes chats | TKT-P0-001 | 0.5j | done |
| TKT-P0-003 | P0 | Back | Protection endpoints metriques | TKT-P0-001 | 0.5j | done |
| TKT-P0-004 | P0 | Front/Back | Alignement auth front cookie-based | TKT-P0-002 | 1j | done |
| TKT-P0-005 | P0 | Back/Admin | Correction metriques SQL TypeORM | TKT-P0-003 | 1j | done |
| TKT-P0-006 | P0 | Back | Correction pipeline webhook Meta->Whapi | TKT-P0-001 | 1j | done |
| TKT-P1-001 | P1 | Front | Suppression throws "Function not implemented" | TKT-P0-004 | 0.5j | done |
| TKT-P1-002 | P1 | Front | Normalisation protocole websocket front | TKT-P0-004 | 1j | done |
| TKT-P1-003 | P1 | Admin/Back | Correction update commercial (/users/:id) | TKT-P0-002 | 0.5j | done |
| TKT-P1-004 | P1 | Admin | Finalisation ConversationsView admin | TKT-P1-003 | 1j | done |
| TKT-P1-005 | P1 | Front/Admin/Back | Unification types status/date | TKT-P0-005 | 1j | done |
| TKT-P1-006 | P1 | Back | Correction type `readonly` entite chat + migration | TKT-P2-001 | 1j | done |
| TKT-P2-001 | P2 | Back | Migrations TypeORM + synchronize conditionnel | TKT-P0-001 | 1j | done |
| TKT-P2-002 | P2 | Repo | Nettoyage fichiers inutiles et docs runtime | - | 0.5j | done |
| TKT-P2-003 | P2 | Front | Suppression doublons composants chat | TKT-P1-002 | 0.5j | done |
| TKT-P2-004 | P2 | Admin | Factorisation CRUD (hook + composants) | TKT-P1-003 | 1.5j | done |
| TKT-P2-005 | P2 | Back | Webhook hardening (signature + idempotence) | TKT-P0-006 | 1.5j | done |
| TKT-P2-006 | P2 | Observabilite | Remplacement logs sensibles par logger structure | TKT-P0-001 | 1j | in_progress |
| TKT-P2-007 | P2 | Qualite | Suite de tests E2E transverse auth/chat/admin | TKT-P0-* + TKT-P1-* | 1.5j | todo |

---

## 3. Ordonnancement de reference

### Wave 1 (blocage securite)
- TKT-P0-001
- TKT-P0-002
- TKT-P0-003

### Wave 2 (blocage fonctionnel)
- TKT-P0-004
- TKT-P0-005
- TKT-P0-006

### Wave 3 (stabilisation produit)
- TKT-P1-003
- TKT-P1-004
- TKT-P1-001
- TKT-P1-002
- TKT-P1-005

### Wave 4 (industrialisation)
- TKT-P2-001
- TKT-P1-006
- TKT-P2-002
- TKT-P2-003
- TKT-P2-004
- TKT-P2-005
- TKT-P2-006
- TKT-P2-007

---

## 4. Tickets detailles

## TKT-P0-001
### Meta
- Priorite: P0
- Domaine: Backend
- Type: securite
- Statut: done
- Owner cible: IA Back

### Titre
Suppression des credentials admin hardcodes et initialisation securisee

### Problematique
`message_whatsapp/src/admin/admin.service.ts` cree un admin avec credentials statiques.

### Objectif mesurable
- 0 credential hardcode dans le repository.
- Bootstrap admin uniquement via variables d'environnement valides.

### Fichiers cibles
- `message_whatsapp/src/admin/admin.service.ts`
- `message_whatsapp/src/app.module.ts` (validation config si necessaire)
- `.env.example` (a creer/mette a jour)

### Taches implementation
1. Remplacer constantes hardcodes par `process.env.ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`.
2. Ajouter validation stricte config (Joi) pour ces variables en prod.
3. Ajouter garde-fou: en production, si variable manquante => exception explicite au demarrage.
4. Masquer tout log contenant des secrets.

### Criteres d'acceptation
- [ ] Aucun hardcode d'identifiant admin dans le code.
- [ ] Demarrage prod echoue proprement si variables absentes.
- [ ] Demarrage dev accepte configuration explicite locale.

### Scenarios Gherkin
- Given aucun admin en base et variables admin valides, when app demarre, then admin est cree.
- Given variables admin manquantes en prod, when app demarre, then erreur de configuration est levee.

### Tests
- Unit: `ensureAdminUserExists()` sur 3 cas (deja present, creation, variable manquante).
- Integration: bootstrap module avec config test.

### Rollback
- Revenir au commit precedent + conserver table admin intacte.

---

## TKT-P0-002
### Meta
- Priorite: P0
- Domaine: Backend
- Type: securite API
- Statut: done

### Titre
Protection des routes `/chats` par guard adapte

### Problematique
`@UseGuards(AuthGuard('jwt'))` commente dans `whatsapp_chat.controller.ts`.

### Objectif mesurable
- 100% des endpoints `/chats` necessitent authentification.

### Fichiers cibles
- `message_whatsapp/src/whatsapp_chat/whatsapp_chat.controller.ts`
- eventuellement guards/policies associes

### Taches implementation
1. Reactiver guard sur controller ou methodes.
2. Verifier droits selon role (admin/commercial) si requis.
3. Retourner 401/403 standards en non-auth.

### Criteres d'acceptation
- [ ] GET/PATCH `/chats` refuses sans cookie JWT valide.
- [ ] Requetes authentifiees continuent de fonctionner.

### Tests
- E2E: cas non auth/auth sur GET list, GET by id, PATCH.

### Risques
- Rupture de flux admin si mauvais guard choisi.

---

## TKT-P0-003
### Meta
- Priorite: P0
- Domaine: Backend
- Type: securite API

### Titre
Protection des endpoints `/api/metriques/*`

### Problematique
Guard auth commente dans `metriques.controller.ts`.

### Objectif mesurable
- Acces metriques reserve comptes admin.

### Fichiers cibles
- `message_whatsapp/src/metriques/metriques.controller.ts`

### Taches implementation
1. Ajouter `@UseGuards(AdminGuard)`.
2. Harmoniser codes erreurs auth.
3. Valider absence de fuite de donnees sans session.

### Criteres d'acceptation
- [ ] Non-auth => 401/403 sur tous endpoints metriques.
- [ ] Admin auth => 200 avec payload attendu.

### Tests
- E2E sur `globales`, `overview`, `channels`, `commerciaux`, `performance-temporelle`.

---

## TKT-P0-004
### Meta
- Priorite: P0
- Domaine: Front + Back
- Type: bug bloquant auth

### Titre
Alignement complet auth front sur modele cookie HTTP-only

### Problematique
`AuthProvider` attend `token` JSON + localStorage, backend renvoie `{ user }` avec cookies.

### Objectif mesurable
- Login/logout/session stable sans localStorage token.

### Fichiers cibles
- `front/src/contexts/AuthProvider.tsx`
- `front/src/app/login/page.tsx`
- `front/src/contexts/SocketProvider.tsx` (impact session)

### Taches implementation
1. Supprimer stockage token localStorage (`token`, `setToken`, removeItem/setItem).
2. Adapter parsing login: `response.data.user`.
3. Ajouter check session au boot via endpoint profile (credentials inclus).
4. Assurer logout appelle backend puis reset stores.
5. Documenter contrat auth front/back.

### Criteres d'acceptation
- [ ] Login fonctionne sans token en body.
- [ ] Refresh page conserve user connecte via cookie.
- [ ] Logout invalide session et redirige proprement.

### Tests
- Integration React testing library (mock API).
- Test manuel: login -> refresh -> navigation protegee -> logout.

---

## TKT-P0-005
### Meta
- Priorite: P0
- Domaine: Backend + Admin
- Type: correctness data

### Titre
Correction des filtres metriques SQL (TypeORM)

### Problematique
Usage de `$gte/$gt/$ne` en TypeORM SQL dans `metriques.service.ts`.

### Objectif mesurable
- 0 operateur Mongo-like dans metriques.
- KPI dashboards coherents avec fixtures DB.

### Fichiers cibles
- `message_whatsapp/src/metriques/metriques.service.ts`
- potentiellement DTO et mapping admin

### Taches implementation
1. Remplacer par `MoreThan`, `Not`, `IsNull`, `MoreThanOrEqual`.
2. Revoir calculs `messagesAujourdhui`, `chatsNonLus`, `tauxAssignation`, `channelsActifs`.
3. Valider compatibilite MySQL.

### Criteres d'acceptation
- [ ] Requetes retournent resultats exacts sur jeu de donnees controle.
- [ ] Aucune regression sur endpoint `overview`.

### Tests
- Unit tests service metriques.
- Snapshot/contract test des payloads API metriques.

---

## TKT-P0-006
### Meta
- Priorite: P0
- Domaine: Backend
- Type: bug integration webhook

### Titre
Correction transformation payload Meta -> format interne Whapi

### Problematique
`metaToWhapi(payload)` est appele mais payload non transforme reutilise.

### Objectif mesurable
- Tous events Meta supportes traites a partir du payload transforme.

### Fichiers cibles
- `message_whatsapp/src/whapi/whapi.controller.ts`
- `message_whatsapp/src/whapi/utile/meta-to-whapi.service.ts`

### Taches implementation
1. Utiliser `payloads` transforme pour traitement.
2. Ajouter schema validation minimale d'entree.
3. Journaliser uniquement metadata non sensible.

### Criteres d'acceptation
- [ ] Event entrant valide est traite sans erreur de mapping.
- [ ] Event invalide retourne erreur claire sans crash.

### Tests
- Unit tests controller: payload valide/invalide.
- Integration test webhook endpoint.

---

## TKT-P1-001
### Titre
Suppression des crashes UI causes par handlers non implementes

### Scope
- `front/src/components/chat/ChatHeader.tsx`
- `front/src/app/whatsapp/page.tsx`

### Taches
1. Remplacer `throw new Error('Function not implemented.')` par handlers metier.
2. Si fonctionnalite non prete: no-op + toast "bientot disponible".

### Acceptance
- [ ] Aucune action utilisateur ne crash la page.
- [ ] Erreur visible et non bloquante si fonctionnalite desactivee.

---

## TKT-P1-002
### Titre
Normalisation websocket front et nettoyage listeners incoherents

### Scope
- `front/src/components/WebSocketEvents.tsx`
- stores associes

### Taches
1. Supprimer bindings `contact:get` / `contact:update` incorrects.
2. Standardiser handling via `chat:event` et `contact:event`.
3. Nettoyer listeners legacy non emis par backend.

### Acceptance
- [ ] Plus de listener sans evenement backend correspondant.
- [ ] Flux conversation/contact stable apres reconnexion.

### Tests
- integration socket mock: sequence connect->events->disconnect.

---

## TKT-P1-003
### Titre
Correction API admin update commercial

### Scope
- `admin/src/app/lib/api.ts`
- `admin/src/app/ui/CommerciauxView.tsx`

### Taches
1. Renommer `updatCommercial` en `updateCommercial`.
2. Corriger route vers `/users/:id`.
3. Ajuster typing de payload update.

### Acceptance
- [ ] Edition d'un commercial met bien a jour l'utilisateur cible.

---

## TKT-P1-004
### Titre
Finalisation fonctionnelle ConversationsView admin

### Scope
- `admin/src/app/ui/ConversationsView.tsx`

### Taches
1. Supprimer `PLACEHOLDER_POSTE_ID`.
2. Recuperer `poste_id` depuis contexte/session admin.
3. Reactiver zone de saisie et bouton send selon droits.

### Acceptance
- [ ] Envoi admin possible et persiste.
- [ ] Plus de `disabled={true}` en dur sans condition metier.

---

## TKT-P1-005
### Titre
Unification des conventions de types (status/date)

### Scope
- `front/src/types/chat.ts`
- `admin/src/app/lib/definitions.ts`
- mapping front/admin

### Taches
1. Aligner `attente` vs `en attente` (choix unique).
2. Normaliser mapping dates snake_case -> camelCase.
3. Ajouter validateurs/type guards coherents.

### Acceptance
- [ ] Filtres statut fonctionnels sans cas fantome.
- [ ] Typage compile strict sans casts `any` superflus.

---

## TKT-P1-006
### Titre
Correction du type DB `readonly` sur WhatsappChat

### Scope
- `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts`
- migration SQL

### Taches
1. Convertir colonne `readonly` en boolean.
2. Migration de donnees existantes (`'true'/'false'` -> bool).
3. Verifier compat API sortante.

### Acceptance
- [ ] Schema DB coherent.
- [ ] Aucun bug de serialisation du flag readonly.

---

## TKT-P2-001
### Titre
Industrialiser migrations TypeORM et desactiver synchronize en environnement non local

### Scope
- `message_whatsapp/src/database/database.module.ts`
- scripts package backend

### Taches
1. `synchronize` conditionnel (local uniquement).
2. Ajouter commandes migration generation/run/revert.
3. Documenter workflow migration.

### Acceptance
- [ ] Staging/prod sans `synchronize:true`.
- [ ] Migrations executables en CI.

---

## TKT-P2-002
### Titre
Nettoyage fichiers parasites et repositionnement documentation

### Scope
- `admin/UN_DES_FICHIERS.ts`
- `message_whatsapp/src/dispatcher/Untitle.ini`
- `message_whatsapp/src/whatsapp_message/# ?? Cahier des charges – Dispatcher Mul.md`
- `wha^pi.session.sql`

### Taches
1. Supprimer artefacts inutiles runtime.
2. Deplacer specs metier sous `docs/`.
3. Mettre a jour index doc.

### Acceptance
- [ ] Arborescence `src` propre.
- [ ] Documentation centralisee hors runtime.

---

## TKT-P2-003
### Titre
Suppression des doublons composants chat front

### Scope
- `front/src/components/chat/MessageList.tsx`
- `front/src/components/chat/MessageComposer.tsx`
- `front/src/components/chat/QuickTemplates.tsx`

### Taches
1. Conserver un seul chemin d'affichage/saisie.
2. Retirer imports morts dans `ChatMainArea`.
3. Nettoyer styles et type references legacy.

### Acceptance
- [ ] Build front sans composants legacy inutilises.

---

## TKT-P2-004
### Titre
Factorisation CRUD admin

### Scope
- Vues: Postes, Channels, Clients, MessageAuto

### Taches
1. Creer hook `useCrudResource`.
2. Extraire `EntityTable` et `EntityFormModal` reutilisables.
3. Uniformiser gestion loading/error/success.

### Acceptance
- [ ] Code duplique sensiblement reduit.
- [ ] Comportement UX coherent sur toutes vues CRUD.

---

## TKT-P2-005
### Titre
Durcissement webhook: signature + idempotence

### Scope
- module webhook whapi/meta

### Taches
1. Verification signature provider.
2. Stockage dedupe sur event/message id.
3. Refus/rejeu geres explicitement.

### Acceptance
- [ ] Rejeu webhook ne cree aucun doublon.
- [ ] Webhook non signe (si requis) refuse proprement.

---

## TKT-P2-006
### Titre
Observabilite et hygiene logs

### Scope
- back/front/admin (zones critiques)

### Taches
1. Remplacer `console.log` critiques par logger structure.
2. Masquer donnees sensibles (password, tokens, payload brut).
3. Definir niveaux log par environnement.

### Acceptance
- [ ] Aucun log sensible restant.
- [ ] Logs utiles pour diagnostic prod.

---

## TKT-P2-007
### Titre
Suite de tests transverse (auth/chat/admin)

### Scope
- tests backend + front + admin

### Taches
1. Couvrir parcours critiques:
   - login commercial/admin
   - acces endpoints proteges
   - websocket conversation/message
   - dashboard metriques
2. Ajouter checks de non-regression.

### Acceptance
- [ ] Pipeline tests vert sur parcours critiques.

---

## 5. Convention de branches, commits, PR

### Branches
- `ticket/TKT-P0-001-admin-secrets`
- `ticket/TKT-P1-002-websocket-front-normalization`

### Commits
- `fix(auth): remove hardcoded admin credentials [TKT-P0-001]`
- `fix(metrics): replace mongo operators with typeorm operators [TKT-P0-005]`

### PR checklist obligatoire
- [ ] Lien ticket
- [ ] Scope respecte
- [ ] Tests ajoutés/mis a jour
- [ ] Evidence execution tests
- [ ] Rollback plan
- [ ] Changelog technique

---

## 6. Table de suivi execution (a mettre a jour)

| ID | Statut | Date debut | Date fin | Owner | PR | Notes |
|---|---|---|---|---|---|---|
| TKT-P0-001 | done |  |  |  |  |  |
| TKT-P0-002 | done |  |  |  |  |  |
| TKT-P0-003 | done |  |  |  |  |  |
| TKT-P0-004 | done |  |  |  |  |  |
| TKT-P0-005 | done |  |  |  |  |  |
| TKT-P0-006 | done |  |  |  |  |  |
| TKT-P1-001 | done |  |  |  |  |  |
| TKT-P1-002 | done |  |  |  |  |  |
| TKT-P1-003 | done |  |  |  |  |  |
| TKT-P1-004 | done |  |  |  |  |  |
| TKT-P1-005 | done |  |  |  |  |  |
| TKT-P1-006 | done |  |  |  |  |  |
| TKT-P2-001 | done |  |  |  |  |  |
| TKT-P2-002 | done |  |  |  |  |  |
| TKT-P2-003 | done |  |  |  |  |  |
| TKT-P2-004 | done |  |  |  |  |  |
| TKT-P2-005 | done |  |  |  |  |  |
| TKT-P2-006 | in_progress |  |  |  |  |  |
| TKT-P2-007 | todo |  |  |  |  |  |









