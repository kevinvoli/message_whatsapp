# Audit complet du projet WhatsApp

## Portee
- Monorepo: `message_whatsapp` (backend NestJS), `front` (interface commerciaux), `admin` (interface administration).
- Analyse statique du code source, architecture, endpoints, websocket, auth, qualite de code, doublons et fichiers potentiellement inutiles.

## Synthese executive
- Le projet est fonctionnel en base, mais il contient des risques critiques en securite et fiabilite.
- Les 4 priorites immediates:
  1. Corriger l'auth `front` (format de reponse + gestion cookies), sinon login fragile/casse.
  2. Re-securiser les routes publiques (`/chats`, `/api/metriques`) et webhook WhatsApp.
  3. Corriger les metriques SQL (`$gte/$gt/$ne` en TypeORM SQL) et les types incoherents.
  4. Eliminer le code mort/duplique (components chat en double, gateways Nest generes non utilises, fichiers parasites).

---

## Backend (message_whatsapp)

### Points forts
- Architecture modulaire NestJS claire avec separation domaines (auth, messages, chats, channels, dispatcher).
- Validation globale active (`ValidationPipe`) dans `message_whatsapp/src/main.ts`.
- Separation auth commercial/admin deja en place (cookies + strategies dediees).
- Flux websocket principal centralise dans `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`.

### Bugs presents (confirmes)
1. **Credentials admin hardcoded (critique)**
- `message_whatsapp/src/admin/admin.service.ts:24`
- Creation automatique d'un admin par defaut avec email/mot de passe statiques.
- Risque: compromission immediate en environnement expose.

2. **Routes chats non protegees (critique)**
- `message_whatsapp/src/whatsapp_chat/whatsapp_chat.controller.ts:7`
- Guard JWT commentee.
- Impact: lecture/modification de conversations sans auth.

3. **Metriques potentiellement fausses (critique)**
- `message_whatsapp/src/metriques/metriques.service.ts:102`, `message_whatsapp/src/metriques/metriques.service.ts:163`, `message_whatsapp/src/metriques/metriques.service.ts:179`, `message_whatsapp/src/metriques/metriques.service.ts:254`, `message_whatsapp/src/metriques/metriques.service.ts:324`
- Utilisation d'operateurs type Mongo (`$gte`, `$gt`, `$ne`) dans un contexte TypeORM SQL.
- Impact: comptes incorrects, dashboard admin incoherent.

4. **Webhook Meta/Whapi mal chaine (critique)**
- `message_whatsapp/src/whapi/whapi.controller.ts:122`, `message_whatsapp/src/whapi/whapi.controller.ts:127`
- `metaToWhapi(payload)` calcule `payloads` mais `handleIncomingMessage(payload)` est appele avec le payload brut.
- Impact: mapping webhooks incomplet/incorrect.

5. **Type incoherent sur champ readonly (important)**
- `message_whatsapp/src/whatsapp_chat/entities/whatsapp_chat.entity.ts:194`
- Colonne declaree `varchar` pour un champ logique booleen `readonly`.
- Impact: erreurs de logique/serialisation.

6. **DTO metriques incomplet (important)**
- `message_whatsapp/src/metriques/dto/create-metrique.dto.ts:120`
- `ApiProperty` pour `messagesEnAttente` sans propriete effective.
- Impact: schema API incoherent avec ce que le front attend.

7. **Logs sensibles en production (important)**
- `message_whatsapp/src/whatsapp_commercial/entities/user.entity.ts:103` (log password en clair)
- `message_whatsapp/src/auth_admin/auth_admin.controller.ts:14`
- `message_whatsapp/src/whapi/whapi.controller.ts:21`
- Impact: fuite d'information et bruit important.

8. **Schema sync active en runtime (important)**
- `message_whatsapp/src/database/database.module.ts:22`
- `synchronize:true` en production est dangereux (alterations schema non controlees).

### Bugs latents / risques
- Webhook sans verification signature (Meta) et traitement permissif.
- Plusieurs gateways Nest "scaffold" actives CORS `*` sans besoin metier clair:
  - `message_whatsapp/src/whatsapp_error/whatsapp_error.gateway.ts`
  - `message_whatsapp/src/whatsapp_contacts/whatsapp_contacts.gateway.ts`
  - `message_whatsapp/src/whatsapp_customer/whatsapp_customer.gateway.ts`
  - `message_whatsapp/src/whatsapp_message_content/whatsapp_message_content.gateway.ts`
- `EventEmitter.defaultMaxListeners = 0` dans `message_whatsapp/src/main.ts` masque potentiellement des fuites listeners.

### Structuration a ameliorer
- Trop de modules/DTO/gateways generes peu relies au flux principal, ce qui augmente la maintenance.
- Nommage heterogene (`jorbs`, `create-metrique.dto.ts` mixant plusieurs DTO, champs FR/EN melanges).
- Documentation technique generique (README Nest par defaut) non operationnelle pour l'equipe.

### Fonctions en double / a centraliser
- Auth commercial/admin: logique proche (validate/login/profile/logout).
- Recommandation: extraire un service auth shared (cookie utils, token utils, response DTO commun).

### Fichiers inutiles / a supprimer ou deplacer
- `admin/UN_DES_FICHIERS.ts` (placeholder "// test").
- `message_whatsapp/src/dispatcher/Untitle.ini` (spec metier, pas un fichier runtime).
- `message_whatsapp/src/whatsapp_message/# ?? Cahier des charges – Dispatcher Mul.md` (doc metier dans dossier source runtime).
- `wha^pi.session.sql` (commande shell, pas SQL executable).

### Actions prioritaires (backend)
1. Supprimer credentials hardcodes et forcer variables d'environnement.
2. Reactiver guards sur `/chats` et proteger `/api/metriques`.
3. Corriger les requetes metriques avec operators TypeORM SQL (`MoreThan`, `Not`, etc.).
4. Corriger webhook `metaToWhapi` + signature verification + idempotence.
5. Corriger types DB (`readonly` boolean), ajouter migration.
6. Nettoyer logs sensibles et introduire un logger structure avec niveau env.
7. Desactiver `synchronize` hors local.

---

## Front (front)

### Points forts
- Stack moderne (Next.js + Zustand + socket.io-client).
- Bonne base de normalisation avec `transformToConversation` / `transformToMessage`.
- Separation UI par domaines (sidebar/chat/contact).

### Bugs presents (confirmes)
1. **Contrat login casse avec backend (critique)**
- `front/src/contexts/AuthProvider.tsx:71`
- Le front attend `{ token, user }`, alors que le backend renvoie `{ user }` via cookie HTTP-only (`message_whatsapp/src/auth/auth.controller.ts:39`).
- Impact: token `undefined`, session incoherente.

2. **Gestion auth incoherente (critique)**
- `front/src/contexts/AuthProvider.tsx:42` a `front/src/contexts/AuthProvider.tsx:76`
- Stockage localStorage du token alors que le backend fonctionne par cookies HTTP-only.
- Impact: logique de session fragile + dette securite.

3. **Handlers non implementes qui throw (important)**
- `front/src/components/chat/ChatHeader.tsx:42`, `front/src/components/chat/ChatHeader.tsx:45`
- `front/src/app/whatsapp/page.tsx:135`
- Impact: crash runtime quand action utilisateur declenchee.

4. **Ecouteurs websocket incoherents (important)**
- `front/src/components/WebSocketEvents.tsx:254`, `front/src/components/WebSocketEvents.tsx:255`
- Listeners `contact:get` / `contact:update` branches vers handlers conversation.
- Impact: confusion eventing et bugs silencieux.

5. **Mismatch statuts conversation (important)**
- `front/src/types/chat.ts:9` (`attente`) vs validation `front/src/types/chat.ts:751` (`en attente`).
- Impact: filtres/affichage incorrects selon source des donnees.

6. **Code mort ou incorrect dans store contacts (important)**
- `front/src/store/contactStore.ts` ecrit une cle `messages` inexistante dans l'etat.
- Impact: dette et comportement non maitrise.

### Bugs latents / risques
- `WebSocketEvents` cumule anciens et nouveaux protocoles d'evenements.
- Forte presence de `console.log` dans chemin critique chat (latence/perf/bruit).
- Encodage texte partiellement corrompu (caracteres accentues mal rendus dans plusieurs fichiers).

### Structuration a ameliorer
- Duplication composant chat:
  - Flux actif: `ChatMessages` + `ChatInput`.
  - Flux legacy: `MessageList` + `MessageComposer` + `QuickTemplates`.
- `ChatMainArea` importe des composants non utilises.

### Fonctions/fichiers qui font la meme chose
- `ChatMessages` vs `MessageList` (affichage messages).
- `ChatInput` vs `MessageComposer` (saisie message).
- Plusieurs chemins de handling websocket pour meme domaine.

### Fichiers inutiles / a supprimer
- `front/src/components/chat/MessageList.tsx` (import invalide `@/lib/definitions`, non utilise).
- `front/src/components/chat/MessageComposer.tsx` (duplique `ChatInput`, non branche).
- `front/src/components/chat/QuickTemplates.tsx` (non branche).

### Actions prioritaires (front)
1. Aligner AuthProvider sur cookies HTTP-only (supprimer token localStorage).
2. Corriger le contrat login et ajouter `withCredentials`/gestion session robuste.
3. Remplacer tous les `throw new Error('Function not implemented.')` par handlers reellement implementes ou no-op securises.
4. Unifier protocole websocket autour de `chat:event` et `contact:event`.
5. Fusionner composants chat legacy/actifs en une seule implementation.

---

## Admin (admin)

### Points forts
- Dashboard riche avec vues distinctes (overview, commerciaux, postes, canaux, conversations).
- Centralisation API dans `admin/src/app/lib/api.ts`.
- Auth cookie HTTP-only (`credentials: 'include'`) deja appliquee.

### Bugs presents (confirmes)
1. **Mise a jour commercial routee vers `/chats/:id` (important)**
- `admin/src/app/lib/api.ts:93` (`updatCommercial`)
- Endpoint attendu pour commerciaux devrait etre `/users/:id`.
- Impact: edition commerciaux non fiable / modifie potentiellement un chat.

2. **ConversationsView desactivee en pratique (important)**
- `admin/src/app/ui/ConversationsView.tsx` utilise `PLACEHOLDER_POSTE_ID` et bouton/inputs `disabled={true}`.
- Impact: fonctionnalite presente mais non operationnelle.

3. **Overview contient des valeurs aleatoires (important)**
- `admin/src/app/ui/OverviewView.tsx:39`
- `Math.random()` dans variation affichage.
- Impact: KPI non fiables visuellement.

### Bugs latents / risques
- Polling global toutes les 30s sur beaucoup d'endpoints peut surcharger back (`admin/src/app/dashboard/commercial/page.tsx`).
- Type defs heterogenes (`created_at` vs `createdAt`) et mapping incomplet.
- Multiples logs de debug en prod.

### Structuration a ameliorer
- `admin/src/app/lib/definitions.ts` melange anciens types mock et nouveaux types metriques.
- Plusieurs vues CRUD repetent la meme logique modal/form/loading/error (postes, canaux, clients, messages auto).

### Fonctions en double / a centraliser
- CRUD patterns repetes dans:
  - `admin/src/app/ui/PostesView.tsx`
  - `admin/src/app/ui/ChannelsView.tsx`
  - `admin/src/app/ui/ClientsView.tsx`
  - `admin/src/app/ui/MessageAutoView.tsx`
- Recommandation: hooks generiques `useCrudResource` + composants `EntityTable`/`EntityModalForm`.

### Fichiers inutiles / a ameliorer
- README Next par defaut, non specifique projet:
  - `admin/README.md`
- Variables/fonctions non exploitees dans certaines vues (bruit de maintenance).

### Actions prioritaires (admin)
1. Corriger `updatCommercial` -> endpoint `/users/:id` + renommer en `updateCommercial`.
2. Finaliser ConversationsView (poste_id dynamique, activation envoi).
3. Supprimer KPI aleatoires, connecter uniquement aux metriques reelles.
4. Factoriser les vues CRUD repetitives.

---

## Qualite globale & dette transversale

### Incoherences de contrat Front/Back/Admin
- Auth front commercial encore orientee token JSON alors que le back est cookie-based.
- Plusieurs noms de champs et statuts divergents (`attente` vs `en attente`, `created_at` vs `createdAt`).
- Protocoles websocket mixes (events legacy + event bus `chat:event`).

### Fichiers/documentation a nettoyer
- Garder les specs metier dans un dossier `docs/` a la racine.
- Supprimer les artefacts tests/placeholders de la racine et des `src/`.
- Remplacer les READMEs templates par un README monorepo operationnel.

### Plan de remediation recommande (ordre)
1. Securite/auth (admin hardcode, guards, webhook).
2. Correctness metriques et contrats API.
3. Stabilisation websocket et UI chat.
4. Nettoyage structure (code mort, docs, naming, factorisation).

## Limites de cet audit
- Audit statique uniquement: pas de lancement d'app, pas de tests automatiques executes dans cet environnement.
- Verification runtime (charge/perf, E2E websocket, auth cross-origin) a completer sur environnement de dev/staging.
