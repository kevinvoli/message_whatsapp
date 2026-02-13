# Matrice des fonctionnalites (Front / Back / Admin)

Statuts:
- `present`
- `a_ameliorer`
- `a_implementer`

## Backend

| Fonctionnalite | Statut | Commentaire |
|---|---|---|
| Auth commercial (login/profile/logout) | a_ameliorer | Fonctionnelle mais contrat front non aligne + gestion refresh incomplete. |
| Auth admin (login/profile/logout) | present | Fonctionnelle en cookie HTTP-only. |
| Initialisation admin par defaut | a_ameliorer | Existant mais dangereux (credentials hardcodes). |
| CRUD postes | present | Endpoints en place avec guard admin. |
| CRUD channels | present | Endpoints en place avec guard admin. |
| CRUD contacts | present | Endpoints en place avec guard admin. |
| CRUD commerciaux | present | Endpoints en place avec guard admin. |
| CRUD messages auto | present | Endpoints en place avec guard admin. |
| CRUD messages (REST) | present | En place, protege admin. |
| CRUD chats (REST) | a_ameliorer | Expose sans guard sur controller chats. |
| Webhook WHAPI | present | Recu et traite, mais verification et mapping a corriger. |
| Webhook Meta->WHAPI bridge | a_ameliorer | Mapping calcule puis payload brut reutilise. |
| Dispatcher d'affectation conversations | present | Logique presente avec queue/locks/jobs. |
| Reaffectation conversation | present | Emission websocket et logique dispatcher presentes. |
| Typing events realtime | present | In/out cote gateway + Whapi typing. |
| Metriques globales dashboard | a_ameliorer | Endpoints existants, mais requetes SQL incorrectes sur certains filtres. |
| Metriques overview optimisees | present | Endpoint `api/metriques/overview` present. |
| Controle d'acces metriques | a_ameliorer | Guard commente sur controller metriques. |
| Migration schema versionnee | a_implementer | `synchronize:true` utilise, migrations absentes. |
| Verification signature webhook | a_implementer | Non implementee. |

## Front (commercial)

| Fonctionnalite | Statut | Commentaire |
|---|---|---|
| Page login commercial | a_ameliorer | UI presente mais contrat API/login incoherent. |
| Session utilisateur | a_ameliorer | Melange cookies HTTP-only et localStorage token. |
| Connexion websocket commerciale | present | Socket connecte avec `commercialId`. |
| Chargement conversations realtime | present | Via `chat:event` et mapping types. |
| Chargement messages realtime | present | Via `MESSAGE_LIST`/`MESSAGE_ADD`. |
| Envoi message realtime | present | `message:send` avec optimistic update. |
| Typing indicator | a_ameliorer | Present mais declenchement UX partiellement commente. |
| Vue contacts | present | Vue et store contacts presentes. |
| Changement statut conversation | a_ameliorer | UI presente mais handlers non implementes -> throw. |
| Statut appels/contact | a_ameliorer | UI presente mais handlers non branches. |
| Filtres/recherche conversations | present | Implantes dans page/sidebar. |
| Filtres/recherche contacts | present | Implantes dans `ContactsListView`. |
| Gestion erreurs websocket | a_ameliorer | Base presente mais protocoles legacy melanges. |
| Protocole websocket unifie | a_implementer | Coexistence events legacy + event bus; a simplifier. |
| Composants chat uniques (sans duplication) | a_implementer | Doublons `ChatInput/MessageComposer`, `ChatMessages/MessageList`. |

## Admin

| Fonctionnalite | Statut | Commentaire |
|---|---|---|
| Login admin | present | Fonctionnel via cookie HTTP-only. |
| Verification session admin au chargement | present | `checkAdminAuth()` sur page d'accueil. |
| Dashboard overview metriques | a_ameliorer | Donnees reelles + variations aleatoires a supprimer. |
| Vue commerciaux | a_ameliorer | Listing ok, update route API erronee (`/chats/:id`). |
| Vue postes (CRUD) | present | Fonctionnelle avec refresh parent. |
| Vue canaux (CRUD) | present | Fonctionnelle. |
| Vue clients (CRUD) | present | Fonctionnelle. |
| Vue messages auto (CRUD) | present | Fonctionnelle. |
| Vue conversations | a_ameliorer | Flux partiellement desactive, placeholder poste_id. |
| Vue messages | present | Presente et alimentee. |
| Auto-refresh dashboard | a_ameliorer | Present (30s), optimisation/perf a affiner. |
| Hooks/services CRUD factorises | a_implementer | Beaucoup de logique repetitive entre vues. |

## Liste courte: fonctionnalites a ajouter en priorite

### Backend
- Signature verification webhook Meta.
- Migrations TypeORM et desactivation `synchronize` hors local.
- Guard obligatoire sur `/chats` et `/api/metriques`.

### Front
- Auth cookie-first (suppression localStorage token + gestion session via profile endpoint).
- Handlers reellement implementes pour changement statut conversation/appel.
- Nettoyage composants dupliques et protocole websocket unique.

### Admin
- Correction endpoint update commercial.
- ConversationsView: poste_id dynamique + envoi actif.
- Composants/hook CRUD reutilisables pour reduire duplication.
