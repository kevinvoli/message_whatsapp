
# Plan de Passage en Production — Fonctionnalités Existantes

> **Objectif** : Faire passer chaque fonctionnalité de son niveau actuel ("présent" ou "solide")
> au niveau **production-grade** : robuste, observable, résilient, testé et finalisé.
>
> **Date** : 2026-03-25
> **Référence** : `ANALYSE_APPLICATION.md` § 3

---

## Sommaire

| # | Fonctionnalité | Niveau actuel | Travail requis |
|---|---------------|---------------|----------------|
| 1 | [Validation HMAC Whapi](#1-validation-hmac-whapi) | Désactivée | Réactiver + tester |
| 2 | [WebSocket — Résilience](#2-websocket--résilience) | Présent | Reconnexion + error boundary |
| 3 | [Dispatch automatique](#3-dispatch-automatique) | Présent | SLA + observabilité |
| 4 | [Messages automatiques (MessageAuto)](#4-messages-automatiques-messageauto) | Présent | Guard template + retry DLQ |
| 5 | [Métriques admin](#5-métriques-admin) | Présent | Corriger Math.random() + tests |
| 6 | [Enregistrement vocal](#6-enregistrement-vocal) | Présent — avancé | Limite durée + UX |
| 7 | [Réponse à un message (reply)](#7-réponse-à-un-message-reply) | Présent | Affichage historique |
| 8 | [Multi-providers — Uniformité erreurs](#8-multi-providers--uniformité-des-erreurs) | Avancé | Normaliser les erreurs sortantes |
| 9 | [Sécurité CORS](#9-sécurité-cors) | Présent | Durcir la configuration |
| 10 | [Feature Flags](#10-feature-flags) | Présent | Centraliser + documenter |
| 11 | [Metadata / SEO interface](#11-metadata--seo-interface) | Non finalisé | Corriger les titres de page |
| 12 | [Contacts — Déduplication](#12-contacts--déduplication) | Présent | Validation + merge |
| 13 | [Typing indicator — Cleanup](#13-typing-indicator--cleanup) | Présent | Timeout + nettoyage mémoire |
| 14 | [Gestion des migrations DB](#14-gestion-des-migrations-db) | Présent | TYPEORM_SYNCHRONIZE=false en prod |
| 15 | [Tests automatisés](#15-tests-automatisés) | Partiel | Couverture critique minimale |

---

## 1. Validation HMAC Whapi

**Fichier** : `message_whatsapp/src/whapi/whapi.controller.ts` ligne ~58

**Problème** :
```typescript
// this.assertWhapiSecret(headers, request.rawBody, payload); // ← COMMENTÉ
```
La validation de signature HMAC est désactivée. N'importe qui connaissant l'URL du webhook
peut injecter de faux événements.

**Ce qu'il faut faire** :
1. Réactiver `assertWhapiSecret()` en production
2. Ajouter un test d'intégration qui vérifie qu'une requête sans signature valide retourne `401`
3. Vérifier que `WHAPI_WEBHOOK_SECRET_HEADER` et `WHAPI_WEBHOOK_SECRET_VALUE` sont définis dans les variables d'environnement de production
4. Documenter la procédure de rotation du secret (variable `WHAPI_WEBHOOK_SECRET_VALUE_PREVIOUS` déjà prévue)

**Risque si non traité** : Injection d'événements frauduleux → création de fausses conversations, messages malveillants en base.

---

## 2. WebSocket — Résilience

**Fichiers** : `front/src/contexts/SocketProvider.tsx`, `front/src/components/WebSocketEvents.tsx`

**Problèmes** :
- Pas de stratégie de reconnexion exponentielle documentée
- Pas d'`ErrorBoundary` React autour du composant `WebSocketEvents`
- Si la connexion WebSocket tombe pendant qu'un agent tape, le message est perdu silencieusement

**Ce qu'il faut faire** :
1. Vérifier que le client Socket.IO est configuré avec `reconnectionAttempts`, `reconnectionDelay`, `reconnectionDelayMax`
2. Ajouter un `ErrorBoundary` React autour de `<WebSocketEvents />`
3. Implémenter une file d'attente locale (localStorage ou mémoire) des messages en cours de frappe : si la connexion tombe, proposer de renvoyer à la reconnexion
4. Afficher un indicateur clair "Reconnexion en cours..." (le message existe mais vérifier qu'il couvre tous les cas de déconnexion)
5. Tester le comportement quand le serveur redémarre en cours de session

---

## 3. Dispatch automatique

**Fichiers** : `message_whatsapp/src/dispatcher/dispatcher.service.ts`, `message_whatsapp/src/dispatcher/services/queue.service.ts`

**Problèmes** :
- Pas de timeout sur le verrou Mutex (`dispatchLock`) — si `assignConversationInternal` plante, le mutex reste bloqué
- `first_response_deadline_at` est calculé mais aucun système ne surveille son dépassement
- Pas de métriques sur le nombre de conversations en attente sans agent disponible
- Pas de fallback quand aucun agent n'est disponible (la conversation reste silencieusement en queue)

**Ce qu'il faut faire** :
1. Entourer `dispatchLock.runExclusive()` d'un timeout explicite (ex: 5s) avec fallback
2. Créer un CronJob qui surveille les conversations dont `first_response_deadline_at` est dépassé et notifie l'admin
3. Ajouter un log structuré quand une conversation reste en attente >X minutes sans agent
4. Ajouter une métrique `conversations_waiting_without_agent` dans le tableau de bord admin
5. Définir et documenter le comportement attendu si zéro agent est disponible

---

## 4. Messages automatiques (MessageAuto)

**Fichiers** : `message_whatsapp/src/message-auto/auto-message-orchestrator.service.ts`, `message_whatsapp/src/message-auto/message-auto.service.ts`

**Problèmes** :
- Aucune vérification du statut du template avant envoi (un template `PAUSED` fera échouer tous les envois silencieusement)
- Pas de Dead Letter Queue : si un envoi échoue définitivement, la séquence d'auto-messages s'arrête sans trace exploitable
- Pas de limite de tentatives configurée par template
- Pas d'alertes si le taux d'échec dépasse un seuil

**Ce qu'il faut faire** :
1. Ajouter une table `message_templates` avec colonnes `name`, `language`, `status`, `quality_score`, `last_checked_at`
2. Avant chaque envoi d'un template HSM, vérifier que `status === 'APPROVED'` — sinon skipper et loguer
3. Implémenter une logique de Dead Letter : après N échecs consécutifs sur un même chat, marquer la séquence comme `failed` et notifier l'admin
4. Souscrire au webhook Meta `message_template_status_update` pour maintenir la table à jour en temps réel (voir `META_WEBHOOK_EVENTS_PAR_PRIORITE_ET_INTERFACE.md`)
5. Ajouter un rapport hebdomadaire automatique du taux de succès/échec par template

---

## 5. Métriques admin

**Fichier** : `admin/src/app/ui/OverviewView.tsx` ligne ~76

**Problème critique** :
```typescript
const getVariation = (valeur: number) => {
  return Math.floor(Math.random() * 30) - 10; // ← Math.random() en production !
};
```
Les indicateurs de variation ("↑ +12%", "↓ -5%") sont **générés aléatoirement** à chaque rendu.
C'est une donnée fictive affichée comme réelle à l'administrateur.

**Ce qu'il faut faire** :
1. Supprimer `Math.random()` immédiatement
2. Implémenter les vraies variations : comparer la période actuelle avec la période précédente équivalente (ex: semaine N vs semaine N-1)
3. Le backend doit retourner dans `getOverviewMetriques()` les données comparatives : `{ current: 120, previous: 100, variation: 20 }`
4. Si les données comparatives ne sont pas encore disponibles, afficher `—` plutôt qu'une valeur fausse

---

## 6. Enregistrement vocal

**Fichier** : `front/src/components/chat/ChatInput.tsx`

**Problèmes** :
- Pas de limite de durée d'enregistrement — un agent peut enregistrer indéfiniment, créer un fichier de plusieurs dizaines de Mo
- Pas de confirmation avant envoi (contrairement à WhatsApp natif qui permet d'écouter avant d'envoyer)
- Si l'onglet est fermé pendant un enregistrement, les tracks microphone ne sont pas libérés

**Ce qu'il faut faire** :
1. Ajouter une limite de durée maximale (ex: 5 minutes) avec arrêt automatique et avertissement à 30s de la fin
2. Ajouter un bouton "Écouter avant d'envoyer" — lire localement le blob avant upload
3. S'assurer que `stream.getTracks().forEach(t => t.stop())` est appelé dans tous les cas (succès, erreur, fermeture de page) via un `beforeunload` listener
4. Afficher la taille estimée du fichier pendant l'enregistrement

---

## 7. Réponse à un message (reply)

**Fichier** : `front/src/components/chat/ChatInput.tsx`, `front/src/components/chat/ChatMessage.tsx`

**Problème** :
La bannière "En réponse à..." s'affiche dans le champ de saisie, mais dans l'historique
des messages, le message cité n'est probablement pas rendu avec le bloc de citation
(bulle grise au-dessus) comme dans WhatsApp natif.

**Ce qu'il faut faire** :
1. Dans `ChatMessage.tsx`, si `message.quotedMessage` est présent, afficher un bloc de citation
   au-dessus du texte principal (fond gris, barre verte à gauche, texte tronqué)
2. Rendre le bloc cliquable pour scroller jusqu'au message original dans l'historique
3. Gérer le cas où le message cité a été supprimé (`quotedMessage: null` avec `quoted_message_id` non null)

---

## 8. Multi-providers — Uniformité des erreurs

**Fichiers** : `message_whatsapp/src/communication_whapi/communication_meta.service.ts`, `communication_messenger.service.ts`, `communication_instagram.service.ts`, `communication_telegram.service.ts`

**Problème** :
Chaque provider a sa propre logique d'erreur. Les erreurs Meta sont bien classifiées (`permanent` / `transient`), mais Telegram et Messenger n'ont pas de classification équivalente — une erreur Telegram plante sans retry.

**Ce qu'il faut faire** :
1. Appliquer le même pattern `WhapiOutboundError` avec `kind: 'permanent' | 'transient'` à tous les providers
2. Uniformiser les codes de retry : Telegram 429 → `transient`, 400 → `permanent`
3. Créer un test par provider qui vérifie le comportement sur erreur réseau (timeout)
4. Ajouter dans les logs sortants le provider, le statut HTTP et le type de l'erreur pour faciliter le débogage

---

## 9. Sécurité CORS

**Fichier** : `message_whatsapp/src/app.module.ts` + configuration CORS dans `main.ts`

**Problème** :
`CORS_ORIGINS` est configurable via `SystemConfig` mais la valeur par défaut n'est pas documentée.
En développement, une valeur trop permissive (`*`) pourrait être poussée accidentellement en production.

**Ce qu'il faut faire** :
1. S'assurer que `CORS_ORIGINS` est **obligatoire** en `NODE_ENV=production` (ajouter une validation Joi)
2. Supprimer tout wildcard `*` en production
3. Documenter les origines autorisées dans le `.env.example`
4. Ajouter un test de démarrage qui rejette `*` si `NODE_ENV=production`

---

## 10. Feature Flags

**Fichiers** : `message_whatsapp/src/whapi/whapi.service.ts`, `message_whatsapp/src/system-config/system-config.service.ts`

**Problème** :
Les feature flags (`FF_UNIFIED_WEBHOOK_ROUTER`, `FF_SHADOW_UNIFIED`, `FF_UNIFIED_WHAPI_PCT`)
sont lus directement depuis `process.env` dans les services, sans centralisation ni documentation.
Il n'existe pas de vue admin des flags actifs.

**Ce qu'il faut faire** :
1. Centraliser la lecture des feature flags dans un service dédié `FeatureFlagService`
2. Ajouter une vue admin "Feature Flags" qui liste tous les flags, leur valeur actuelle et leur description
3. Permettre l'activation/désactivation depuis l'admin sans redémarrage (déjà possible via `SystemConfig` — vérifier que les flags sont rechargés dynamiquement)
4. Documenter chaque flag avec : description, valeur par défaut, impact si activé/désactivé

---

## 11. Metadata / SEO interface

**Fichier** : `front/src/app/layout.tsx` ligne 19

**Problème** :
```typescript
title: "Create Next App",
description: "Generated by create next app",
```

**Ce qu'il faut faire** :
1. Mettre à jour le titre et la description dans `front/src/app/layout.tsx`
2. Ajouter un favicon personnalisé (remplacer `favicon.ico`)
3. Vérifier et mettre à jour `admin/src/app/layout.tsx` de la même façon
4. Ajouter des titres de page dynamiques par route (ex: "Conversations — [Nom de l'app]")

---

## 12. Contacts — Déduplication

**Fichier** : `message_whatsapp/src/contact/contact.service.ts`

**Problème** :
Il n'existe pas de logique de déduplication des contacts. Un même client peut exister
en double si son numéro est saisi légèrement différemment (`+213 XX` vs `213XX` vs `0XXX`).

**Ce qu'il faut faire** :
1. Normaliser tous les numéros de téléphone au format E.164 (`+213XXXXXXXXX`) à la création et à la mise à jour
2. Ajouter une contrainte unique sur le numéro normalisé
3. Ajouter une vue admin "Doublons potentiels" qui liste les contacts avec des numéros similaires
4. Créer un outil de merge de contacts (fusionner l'historique des conversations et call logs)

---

## 13. Typing indicator — Cleanup

**Fichiers** : `front/src/components/chat/ChatInput.tsx`, backend gateway

**Problème** :
L'indicateur de frappe utilise `setTimeout(2000ms)` pour s'auto-arrêter, mais si l'agent
ferme l'onglet ou change de conversation en pleine frappe, l'événement `typing_stop` n'est
pas envoyé — le client voit l'indicateur indéfiniment.

**Ce qu'il faut faire** :
1. Envoyer `typing_stop` dans le `beforeunload` et `visibilitychange` listeners
2. Côté backend, implémenter un TTL sur les statuts de frappe (ex: auto-effacement après 5s sans mise à jour)
3. S'assurer que le changement de conversation (`selectConversation`) déclenche `typing_stop` sur l'ancienne conversation

---

## 14. Gestion des migrations DB

**Fichier** : `message_whatsapp/src/app.module.ts` + `.env`

**Problème** :
`TYPEORM_SYNCHRONIZE` est une variable d'environnement. Si elle est à `true` en production
(par erreur ou négligence), TypeORM peut modifier le schéma de la base silencieusement
— y compris supprimer des colonnes.

**Ce qu'il faut faire** :
1. Forcer `synchronize: false` dans le code si `NODE_ENV=production`, **indépendamment** de la variable d'env
2. Vérifier que toutes les migrations sont dans `message_whatsapp/src/database/migrations/`
3. Ajouter un script de vérification pre-deploy qui vérifie qu'aucune migration en attente n'existe
4. Documenter la procédure de migration : `npm run migration:run` avant chaque déploiement

---

## 15. Tests automatisés

**Fichiers** : `message_whatsapp/src/**/*.spec.ts`

**Situation actuelle** :
Des tests existent pour les services critiques (idempotence, rate limit, adapter),
mais la couverture des chemins d'erreur et des cas limites est insuffisante.

**Ce qu'il faut faire — couverture minimale prioritaire** :

| Composant | Test à écrire |
|-----------|--------------|
| `MetaAdapter` | Message entrant `referral`, `reaction`, `system` |
| `OutboundRouterService` | Comportement si channel sans `external_id` |
| `CommunicationMetaService` | Retry sur erreur 429, pas de retry sur 400 |
| `DispatcherService` | Dispatch quand zéro agent disponible |
| `InboundMessageService` | Traitement de deux messages simultanés pour le même chat |
| `WebhookController` | Rejet si signature HMAC invalide |
| `MessageAutoOrchestrator` | Comportement si template PAUSED |

---

## Priorisation globale

| Priorité | Items | Effort estimé |
|----------|-------|---------------|
| 🔴 Immédiat (avant mise en prod) | #1 HMAC, #5 Math.random(), #14 synchronize | < 1 jour chacun |
| 🟠 Court terme (< 2 semaines) | #2 WebSocket, #3 Dispatch, #4 MessageAuto, #8 Erreurs | 2-3 jours chacun |
| 🟡 Moyen terme (< 1 mois) | #6 Vocal, #7 Reply, #9 CORS, #12 Contacts, #15 Tests | 1-2 jours chacun |
| 🟢 Long terme | #10 FeatureFlags, #11 Metadata, #13 Typing, | < 1 jour chacun |

---

*Ce plan couvre exclusivement les fonctionnalités existantes — pour les nouvelles fonctionnalités,
voir `PLAN_IMPLEMENTATION_FONCTIONNALITES_MANQUANTES.md`.*
