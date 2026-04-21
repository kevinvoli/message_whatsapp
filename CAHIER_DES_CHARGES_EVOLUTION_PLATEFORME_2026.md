# Cahier des Charges — Évolution de la Plateforme Conversationnelle

**Version** : 1.2  
**Date** : 21 avril 2026  
**Périmètre** : Plateforme conversationnelle (backend `message_whatsapp`, front commercial `front`, panel admin `admin`) + intégration plateforme de gestion des commandes  

> **Note importante** : La plateforme est déjà en production avec des données réelles actives. Toutes les évolutions décrites dans ce document doivent être conçues et déployées sans interruption de service ni perte de données existantes.

---

## Table des matières

1. [Contexte et objectifs](#1-contexte-et-objectifs)
2. [État actuel de la plateforme](#2-état-actuel-de-la-plateforme)
3. [Vision cible](#3-vision-cible)
4. [Fonctionnalités à implémenter](#4-fonctionnalités-à-implémenter)
5. [Intégration avec la plateforme de gestion des commandes](#5-intégration-avec-la-plateforme-de-gestion-des-commandes)
6. [Gouvernance des données](#6-gouvernance-des-données)
7. [Plan de livraison](#7-plan-de-livraison)
8. [Contraintes techniques](#8-contraintes-techniques)
9. [Stratégie de migration et continuité de production](#9-stratégie-de-migration-et-continuité-de-production)
10. [Risques](#10-risques)

---

## 1. Contexte et objectifs

### 1.1. Contexte général

L'entreprise exploite une plateforme conversationnelle multi-canal (WhatsApp, Messenger, Instagram, Telegram) permettant à des agents commerciaux de traiter les demandes clients entrantes. Cette plateforme communique avec des clients en temps réel, automatise les premières interactions via FlowBot, et dispose déjà d'un socle opérationnel solide.

Le parcours client actuel est le suivant :
- Le client arrive via publicité sur un canal de messagerie
- Le commercial discute avec lui via la plateforme conversationnelle
- Le commercial peut appeler le client via les téléphones de l'entreprise
- La commande est saisie dans une plateforme de gestion des commandes distincte
- La logistique et la livraison sont gérées par des applications déjà connectées à la plateforme de gestion

**Problème central** : il n'existe aujourd'hui aucun lien entre la phase de qualification commerciale (plateforme conversationnelle) et la phase de prise/suivi de commande (plateforme de gestion des commandes). Les commerciaux doivent changer d'outil à chaque étape, ce qui entraîne des pertes d'information, des retards et une impossibilité de piloter la performance commerciale de bout en bout.

### 1.2. Objectifs de ce cahier des charges

Ce document décrit les évolutions à apporter à la plateforme conversationnelle pour :

1. **Transformer la plateforme en outil de suivi client complet** : dossier client vivant, portefeuille, relances, statuts métier
2. **Donner aux managers les outils de pilotage commercial** : ranking, objectifs, contrôle de charge, heures de travail
3. **Connecter la plateforme conversationnelle à la plateforme de gestion des commandes** via une architecture webhook bidirectionnelle
4. **Introduire des règles métier structurantes** : limitation de conversations, conditions de déblocage, restriction de connexion

### 1.3. Ce que ce document ne couvre pas

- La plateforme de gestion des commandes elle-même (périmètre externe)
- Les applications livreur et stock (déjà connectées)
- L'application téléphonique de l'entreprise (déjà connectée)

---

## 2. État actuel de la plateforme

### 2.1. Ce qui existe et fonctionne

| Module | Capacités présentes |
|--------|---------------------|
| `contact` + `call-log` | Contact, statut d'appel, date dernier appel, prochaine date, notes, historique |
| `crm` | Champs personnalisés par tenant, valeurs par contact, édition admin et agent |
| `whatsapp_chat` + `whatsapp_message` | Conversations temps réel, messagerie, transfert, merge, labels |
| `flowbot` | Bot, automatisations, triggers, sessions, conditions, délais, A/B, HTTP, templates |
| `analytics` + `sla` + `audit` + `rbac` | KPIs globaux, performance agents, SLA, rôles et permissions, audit |
| `ai-assistant` + `sentiment` | Suggestions de réponse IA (ChatInput), résumé conversation IA (ChatHeader), réécriture/correction de texte, sentiment lexical — fournisseur et modèle configurables depuis le panel admin (Anthropic, OpenAI, compatible OpenAI, Ollama) |
| `dispatcher` | Dispatch automatique, queue, postes dédiés, conversations orphelines |
| `broadcast` + `whatsapp-template` | Templates HSM, broadcasts par lots |
| `outbound-webhook` | Webhooks sortants signés avec retry |
| `realtime` | WebSocket Socket.IO, notifications temps réel |

### 2.2. Ce qui manque

| Besoin | État actuel |
|--------|-------------|
| Dossier client vivant | Contact trop léger, dérivé des conversations |
| Portefeuille client | Pas d'attribution client→commercial structurée |
| Statut métier de fin de conversation | Inexistant (seul statut d'appel basique) |
| Système de relance robuste | Partiel (`next_call_date`, `call_status`), non industrialisé |
| Calcul d'heures de travail | Connexion loggée mais non calculée |
| Classement commercial | Non calculé, non structuré |
| Objectifs commerciaux | Inexistants |
| Restriction de connexion | Inexistante |
| Limitation/déblocage de conversations | Inexistante |
| Catégorisation client calculée | Inexistante (dépend de l'intégration commandes) |
| Certification client | Inexistante |
| Parrainage | Inexistant |
| Dashboard technique serveur | Partiel (metrics ops et webhook dans OverviewView) |
| Intégration commandes | Aucune |

---

## 3. Vision cible

À l'issue de l'implémentation décrite dans ce document, la plateforme conversationnelle devra être :

1. **Un outil de suivi client centralisé** : chaque commercial dispose d'un portefeuille de clients avec dossier complet, historique interactionnel, statuts commerciaux, relances planifiées
2. **Un outil de pilotage managérial** : les managers disposent d'indicateurs de ranking, d'objectifs, de contrôle de présence et de charge commerciale
3. **Un point d'entrée connecté à la gestion des commandes** : les informations de commande, livraison, annulation et catégorisation client circulent automatiquement entre les deux systèmes
4. **Un environnement contrôlé et gouverné** : limitation de charge, restriction d'accès géographique, règles de déblocage, traçabilité complète

---

## 4. Fonctionnalités à implémenter

### 4.1. Dossier client complet

**Priorité** : Critique  
**Phase de livraison** : Phase 1

#### Description fonctionnelle

Créer une fiche client exploitable et persistante, dissociée de la simple liste de conversations. Cette fiche doit consolider toutes les informations utiles au suivi relationnel d'un client.

#### Contenu de la fiche client cible

- Informations d'identité (nom, téléphones, ville, adresse, canal d'entrée)
- Historique des conversations (toutes, avec résultats)
- Historique des appels (via `call-log`)
- Champs CRM personnalisés (via module `crm`)
- Statuts relationnels et dernières actions
- Relances planifiées et passées
- Catégorie client (calculée ou synchronisée depuis la plateforme commandes)
- Informations de commandes reçues (via intégration webhook)
- Certification et parrainage (via intégration webhook)

#### Travail backend

- Étendre l'entité `Contact` ou créer une couche de projection client enrichie
- Créer un service `ClientDossierService` agrégeant les données des modules `contact`, `call-log`, `crm`, `whatsapp_chat`, `whatsapp_message`
- Exposer une API `/clients/:id/dossier` retournant le dossier complet
- Versionner les changements importants (statut, catégorie, commercial)

#### Travail front

- Refondre la vue `front/src/app/contacts/page.tsx` : liste clients réelle (non dérivée des conversations chargées)
- Créer une vue détaillée client dans `front/src/components/contacts/ContactDetailView.tsx` avec tous les blocs ci-dessus
- Ajouter un accès rapide depuis la conversation vers le dossier du client en cours

#### Travail admin

- Enrichir `admin/src/app/ui/ClientsView.tsx` avec les données complètes du dossier
- Permettre la consultation et modification admin des données client

#### Modules cibles

- `message_whatsapp/src/contact`
- `message_whatsapp/src/call-log`
- `message_whatsapp/src/crm`
- `front/src/components/contacts`
- `admin/src/app/ui/ClientsView.tsx`

---

### 4.2. Statut métier de fin de conversation

**Priorité** : Critique  
**Phase de livraison** : Phase 1

#### Description fonctionnelle

Toute conversation doit se terminer avec un résultat métier explicite. Les commerciaux doivent qualifier le résultat avant de clore ou transférer une conversation.

#### Valeurs de statut métier

| Code | Label |
|------|-------|
| `commande_confirmee` | Commande confirmée |
| `commande_a_saisir` | Commande à saisir |
| `a_relancer` | À relancer |
| `rappel_programme` | Rappel programmé |
| `pas_interesse` | Pas intéressé |
| `sans_reponse` | Sans réponse |
| `infos_incompletes` | Informations incomplètes |
| `deja_client` | Déjà client |
| `annule` | Annulé |

#### Travail backend

- Ajouter un champ `conversation_result` à l'entité `WhatsappChat` ou créer une entité `ConversationOutcome`
- Exposer une API `PATCH /chats/:id/outcome` pour mettre à jour le statut
- Historiser chaque changement de statut avec timestamp et commercial auteur
- Émettre un événement temps réel lors d'un changement de statut (via WebSocket)
- Déclencher l'envoi d'un webhook sortant vers la plateforme de gestion des commandes (event `conversation_status_changed`)

#### Travail front

- Ajouter un modal de clôture/qualification dans `front/src/components/chat`
- Proposer le modal à la fermeture de conversation ou au transfert
- Afficher le statut métier actuel dans la liste de conversations et la fiche client

#### Travail admin

- Filtrer les conversations par statut métier dans `admin/src/app/ui/ConversationsView.tsx`
- Afficher les statistiques par statut dans les vues analytics et performance

---

### 4.3. Système de relance client

**Priorité** : Critique  
**Phase de livraison** : Phase 1

#### Description fonctionnelle

Planifier, suivre et exécuter les relances commerciales de manière structurée.

#### Types de relance

- Rappel programmé
- Relance post-conversation sans commande
- Relance après annulation
- Relance de fidélisation
- Relance sans réponse

#### Statuts de relance

| Statut | Description |
|--------|-------------|
| `planifiee` | Créée, non encore due |
| `en_retard` | Date passée, non traitée |
| `effectuee` | Traitée avec résultat |
| `annulee` | Annulée manuellement |

#### Travail backend

- Créer un module `follow-up` (entité `FollowUp` avec champs : `type`, `status`, `scheduled_at`, `completed_at`, `result`, `notes`, `contact_id`, `commercial_id`, `conversation_id`)
- Cron de surveillance : détection des relances en retard, émission de notification
- API : créer, lister, mettre à jour, compléter une relance
- Intégration webhook sortant vers la plateforme commandes (events `follow_up_created`, `follow_up_completed`)

#### Travail front

- Vue "Mes relances" accessible depuis la sidebar
- Affichage des relances dues aujourd'hui avec indicateur visuel
- Création de relance depuis le dossier client ou la conversation
- Formulaire de complétion avec champ résultat

#### Travail admin

- Dashboard des relances en retard avec filtres par commercial et période
- Vue globale des relances planifiées

---

### 4.4. Portefeuille client par commercial

**Priorité** : Critique  
**Phase de livraison** : Phase 1

#### Description fonctionnelle

Attribuer explicitement des clients à des commerciaux. Un client appartient à un seul commercial principal à un instant donné. Cette attribution est modifiable par l'admin.

#### Travail backend

- Ajouter `portfolio_owner_id` (FK vers `WhatsappCommercial`) sur l'entité `Contact`
- API : assigner, réaffecter, lister le portefeuille d'un commercial
- Historiser les réaffectations

#### Travail front

- Vue "Mon portefeuille" dans `front/src/app/contacts/page.tsx` avec filtre par défaut sur le commercial connecté
- Indicateur visuel dans la liste contacts si client dans le portefeuille du commercial connecté

#### Travail admin

- Affectation manuelle ou par règle dans `admin/src/app/ui/CommerciauxView.tsx`
- Vue de supervision : nombre de clients par commercial, répartition

---

### 4.5. Historique complet des interactions

**Priorité** : Haute  
**Phase de livraison** : Phase 1

#### Description fonctionnelle

Afficher dans le dossier client une timeline chronologique de toutes les interactions : messages, appels, notes, relances, changements de statut, informations de commande reçues.

#### Travail backend

- Créer un endpoint `/clients/:id/timeline` agrégeant par date :
  - messages (depuis `whatsapp_message`)
  - appels (depuis `call_log`)
  - relances (depuis `follow_up`)
  - changements de statut de conversation
  - événements de commande (depuis les webhooks entrants de la plateforme commandes)

#### Travail front

- Composant timeline dans `front/src/components/contacts/ContactDetailView.tsx`
- Filtres par type d'interaction

#### Travail admin

- Même timeline consultable et exportable en CSV

---

### 4.6. Catégorisation client

**Priorité** : Haute  
**Phase de livraison** : Phase 2 (après intégration webhook commandes)

#### Description fonctionnelle

Afficher des catégories clients cohérentes calculées à partir de l'historique de commande.

#### Catégories cibles

| Code | Label |
|------|-------|
| `jamais_commande` | Client venu sans jamais commander |
| `commande_sans_livraison` | Commande passée, jamais livrée |
| `commande_avec_livraison` | Livré au moins une fois |
| `commande_annulee` | Commande passée puis annulée |

#### Source de vérité

La catégorie est calculée par la **plateforme de gestion des commandes** et transmise à la plateforme conversationnelle via webhook (`client_order_summary_updated`). La plateforme conversationnelle la stocke sur le `Contact` en lecture.

#### Travail backend

- Ajouter `client_category` et `client_order_summary` (JSON) sur l'entité `Contact`
- Créer un handler de webhook entrant pour `client_order_summary_updated`

#### Travail front + admin

- Badges de catégorie dans la liste contacts et le dossier client
- Filtres par catégorie dans l'admin et le front

---

### 4.7. Classement des commerciaux

**Priorité** : Haute  
**Phase de livraison** : Phase 2 ✅ Implémenté

#### Description fonctionnelle

Calculer un ranking commercial basé sur des indicateurs mesurables et afficher un classement dans l'admin avec filtres par période (aujourd'hui / 7 derniers jours / mois courant).

#### Indicateurs de ranking

| Indicateur | Source | Poids par défaut |
|------------|--------|-----------------|
| Commandes (`commande_confirmee` + `commande_a_saisir`) | statut de conversation | 5 |
| Conversations traitées | `whatsapp_message` (DISTINCT chat_id, direction OUT) | 3 |
| Appels réalisés | `call_log` | 2 |
| Relances effectuées (`status = 'effectuee'`) | `follow_up` | 2 |
| Messages envoyés | `whatsapp_message` (direction OUT) | 0.1 (arrondi inférieur) |

**Formule** : `score = commandes × P1 + conversations × P2 + appels × P3 + relances × P4 + ⌊messages × P5⌋`

#### Formule paramétrable depuis l'admin ✅

Les 5 poids sont stockés dans la table `system_configs` (clés `RANKING_WEIGHT_ORDERS`, `RANKING_WEIGHT_CONVERSATIONS`, `RANKING_WEIGHT_CALLS`, `RANKING_WEIGHT_FOLLOW_UPS`, `RANKING_WEIGHT_MESSAGES`) et modifiables directement depuis la section **Paramètres → Classement** du panel admin, sans redémarrage.

Un endpoint dédié `GET /targets/ranking/formula` (AdminGuard) expose les poids courants au frontend, qui les affiche en bas du tableau de classement.

#### Travail backend ✅

- Module `targets` avec `TargetsService.getRanking(period)` et `getRankingWeights()`
- Endpoint `GET /targets/ranking?period=today|week|month`
- Endpoint `GET /targets/ranking/formula`
- Les poids sont lus depuis `SystemConfigService` à chaque calcul (pas de cache — changement immédiatement effectif)

#### Travail admin ✅

- Vue `admin/src/app/ui/RankingView.tsx` : tableau de classement, médailles or/argent/bronze, badges par indicateur, score affiché, formule active avec poids réels en bas de page
- Les poids sont modifiables dans `admin/src/app/ui/SettingsView.tsx` → catégorie "Classement — Poids de la formule"

#### Travail front

- Widget "Ma position" dans le dashboard commercial (à implémenter)

---

### 4.8. Objectifs commerciaux

**Priorité** : Haute  
**Phase de livraison** : Phase 2

#### Description fonctionnelle

Permettre à l'admin de définir des objectifs par commercial, par période et par indicateur. Afficher la progression en temps réel.

#### Structure d'un objectif

- Commercial cible
- Période (mois, semaine, trimestre)
- Indicateur (conversations, relances, commandes, appels)
- Valeur cible
- Progression calculée automatiquement

#### Travail backend

- Créer un module `targets` avec entités `CommercialTarget` et `TargetPeriod`
- Service de calcul de progression à partir des indicateurs analytics existants

#### Travail admin

- Écran d'administration des objectifs
- Comparaison objectif vs réalisé par commercial et par période

#### Travail front

- Affichage du suivi d'objectif personnel du commercial avec jauge de progression

---

### 4.9. Calcul des heures de travail des commerciaux

**Priorité** : Haute  
**Phase de livraison** : Phase 2

#### Description fonctionnelle

Mesurer la présence et l'activité réelle des commerciaux, en distinguant heure de connexion et activité utile.

#### Travail backend

- Créer une entité `CommercialSession` journalisant : connexion, déconnexion, durée totale, présence journalière
- Calculer : durée de session, présence journalière, activité utile (messages envoyés, conversations traitées pendant la session)
- S'appuyer sur les événements existants `isConnected` / `lastConnectionAt` de `WhatsappCommercial`

#### Travail admin

- Dashboard heures de travail dans `admin/src/app/ui/CommerciauxView.tsx` : présence journalière, heures par semaine, comparaison entre commerciaux

---

### 4.10. Restriction de connexion par adresse IP

**Priorité** : Haute  
**Phase de livraison** : Phase 2

#### Description fonctionnelle

Empêcher les connexions depuis des adresses IP non autorisées (hors locaux de l'entreprise ou VPN approuvé).

#### Travail backend

- Dans `message_whatsapp/src/auth`, vérifier l'IP source à chaque tentative de connexion
- Gérer une whitelist d'IPs et/ou de plages CIDR dans `system-config`
- Journaliser les tentatives de connexion refusées dans `audit`
- Option : restreindre par appareil reconnu (device fingerprint)

#### Travail front

- Message d'erreur explicite : "Connexion refusée — vous devez être connecté depuis le réseau de l'entreprise"

#### Travail admin

- Écran de configuration des règles d'accès : whitelist IP, activer/désactiver, historique des refus

---

### 4.11. IA conversationnelle et correction de texte

**Priorité** : Moyenne  
**Phase de livraison** : Phase 4 ✅ Implémenté

#### Description fonctionnelle

Trois fonctionnalités IA au service du commercial, toutes pilotées par un fournisseur IA configurable depuis le panel admin.

#### 4.11.1 Fournisseur IA configurable ✅

Le fournisseur IA, le modèle, la clé API et l'URL sont **stockés en base de données** dans `system_configs` et modifiables depuis **Paramètres → Intelligence Artificielle** dans le panel admin, sans redémarrage du backend.

| Clé de config | Description | Défaut |
|---------------|-------------|--------|
| `AI_PROVIDER` | `anthropic`, `openai`, `ollama`, `custom` | `anthropic` |
| `AI_MODEL` | Identifiant du modèle | `claude-haiku-4-5-20251001` |
| `AI_API_KEY` | Clé API (champ secret masqué en admin) | fallback sur `ANTHROPIC_API_KEY` env |
| `AI_API_URL` | URL de l'API (utile pour Ollama / API custom) | URL Anthropic standard |
| `AI_FLOWBOT_ENABLED` | Active/désactive le nœud IA dans FlowBot | `false` |

Le service `AiAssistantService.getAiConfig()` lit ces valeurs à chaque appel. Le dispatch vers `callAnthropic()` ou `callOpenAiCompat()` est automatique selon le provider.

#### 4.11.2 Suggestions de réponse dans le chat ✅

Bouton "Sparkles" (⚡) dans `front/src/components/chat/ChatInput.tsx` (visible quand le champ est vide). Déclenche `GET /ai/suggestions/:chat_id` → 3 suggestions cliquables affichées dans un panneau violet au-dessus du champ de saisie.

#### 4.11.3 Résumé IA de la conversation ✅

Bouton "Résumé IA" dans `front/src/components/chat/ChatHeader.tsx`. Déclenche `GET /ai/summary/:chat_id` → modal affichant : sentiment (badge coloré), points clés (puces), actions suggérées (flèches). Le résumé est mis en cache localement (ne recharge pas si déjà chargé).

#### 4.11.4 Correction / amélioration de texte ✅

Endpoint `POST /ai/rewrite` acceptant le texte brut + le mode.

| Mode | Description |
|------|-------------|
| Correction simple | Orthographe et grammaire uniquement |
| Ton professionnel | Reformulation plus formelle |
| Reformulation courte | Version condensée du message |

Prévisualisation de la version corrigée avant envoi dans `ChatInput.tsx`, avec option d'accepter ou ignorer.

#### 4.11.5 Nœud FlowBot AI_REPLY ✅

Nouveau type de nœud `AI_REPLY` dans le moteur FlowBot (`FlowNodeType.AI_REPLY`). Quand `AI_FLOWBOT_ENABLED = true` en base, le nœud appelle `suggestReplies()` et envoie automatiquement la première suggestion générée par le LLM configuré. Paramètres du nœud : `fallbackText` (texte de repli si IA désactivée ou en erreur), `variableName` (stocker la réponse dans une variable de session). Configurable depuis le FlowBuilder admin.

---

### 4.12. Certification des comptes client

**Priorité** : Moyenne  
**Phase de livraison** : Phase 4

#### Description fonctionnelle

Afficher dans la fiche client un statut de vérification/certification. La source de vérité est la **plateforme de gestion des commandes** ; la plateforme conversationnelle reçoit ces données via webhook.

#### Statuts

| Statut | Description |
|--------|-------------|
| `non_verifie` | Aucune vérification effectuée |
| `en_attente` | Vérification en cours |
| `certifie` | Client certifié |
| `rejete` | Certification refusée |

#### Travail backend

- Ajouter `certification_status` et `certification_level` sur l'entité `Contact`
- Handler webhook entrant `client_certification_updated`

#### Travail front + admin

- Badge de certification dans la fiche client et la liste de contacts
- Filtre par statut de certification dans l'admin

---

### 4.13. Système de parrainage

**Priorité** : Moyenne  
**Phase de livraison** : Phase 4

#### Description fonctionnelle

Afficher dans la fiche client les informations de parrainage. La source de vérité est la **plateforme de gestion des commandes**.

#### Travail backend

- Créer un module `referral` ou une projection dans l'entité `Contact`
- Handler webhook entrant `referral_updated`
- Stocker : parrain, filleul, statut de la récompense, date de validation

#### Travail front + admin

- Affichage des informations de parrainage dans la fiche client
- Vue de suivi dans l'admin

---

### 4.14. Dashboard technique serveur et applications

**Priorité** : Moyenne  
**Phase de livraison** : Phase 4

#### Description fonctionnelle

Afficher l'état de santé des serveurs et applications dans le panel admin.

#### Métriques cibles

- RAM utilisée / disponible
- CPU (charge actuelle)
- Bande passante
- Statut des services applicatifs (backend, sockets, workers BullMQ, crons)
- Taux d'erreur des webhooks entrants/sortants

#### Travail backend

- Endpoint `GET /admin/system/health` agrégeant les métriques système via `os` Node.js + health checks applicatifs
- Étendre `message_whatsapp/src/system-alert` si besoin

#### Travail admin

- Bloc de santé technique dans `admin/src/app/ui/OverviewView.tsx`

---

### 4.15. Restriction et déblocage des conversations par commercial

**Priorité** : Critique (mais implémentée en Phase 3, après les fondations métier)  
**Phase de livraison** : Phase 3

#### Description fonctionnelle

Contrôler la charge conversationnelle des commerciaux avec des règles de limitation strictes.

#### Règles métier

| Règle | Valeur par défaut | Configurable |
|-------|-------------------|--------------|
| Quota total de conversations | 50 | Oui (par admin) |
| Quota de conversations actives visibles | 10 | Oui |
| Conversations au-delà du quota actif | Grisées (inaccessibles) | - |
| Déblocage | Selon critères de complétion définis | Oui |

#### Critères de déblocage d'une conversation grisée

- Conversation qualifiée avec statut métier (`conversation_result` renseigné)
- Relance planifiée si statut = `a_relancer`
- Cloture effective si statut final

#### Masquage des données sur conversations grisées

- Numéro client masqué
- Messages masqués
- Impossibilité de répondre

#### Travail backend

- Créer un `ConversationCapacityEngine` dans le module `dispatcher`
- Calculer en temps réel le nombre de conversations actives d'un commercial
- Appliquer les règles de quotas au chargement des conversations
- Marquer les conversations `locked` (champ `is_locked` sur `WhatsappChat`)
- Filtre dans les WebSocket : ne pas envoyer les données sensibles des conversations verrouillées
- Endpoint `GET /chats/me` retourne les 10 actives + N verrouillées avec données masquées
- API admin pour configurer les quotas par commercial, par poste ou globalement

#### Travail front

- Afficher les conversations actives normalement
- Afficher les conversations verrouillées en grisé avec mention "Non accessible"
- Compteur : "X actives / Y total"
- Bloquer l'accès au détail et à la réponse sur les conversations verrouillées

#### Travail admin

- Écran de paramétrage des quotas
- Visualisation globale : nombre de conversations verrouillées par commercial
- Possibilité de forcer le déblocage manuel d'une conversation

> **Point critique** : Cette logique doit être appliquée côté backend, pas uniquement côté frontend. Le front ne doit jamais recevoir les données masquées via WebSocket.

---

## 5. Intégration avec la plateforme de gestion des commandes

### 5.1. Architecture d'intégration

Le mode de communication retenu est le **webhook bidirectionnel** :
- Chaque plateforme notifie l'autre lors d'événements métier
- Les échanges sont orientés événements
- Chaque webhook est horodaté, signé (HMAC), idempotent et traçable

### 5.2. Corrélation des identifiants

Les deux plateformes utilisent des types d'identifiants différents :
- Plateforme conversationnelle : `UUID string`
- Plateforme de gestion des commandes : `integer`

**Règle de corrélation principale** : le numéro de téléphone normalisé sert de clé fonctionnelle de rapprochement.

**Table de mapping obligatoire** à créer dans la plateforme conversationnelle :

```
client_identity_mapping
- conversation_client_id (UUID)
- order_client_id (integer, nullable)
- phone_number_raw
- phone_number_normalized
- phone_number_type (conversation_origin | principal | secondaire | livraison | whatsapp | appel)
- is_primary (boolean)
- client_reference_code (nullable)
- mapping_status
- created_at / updated_at
```

**Ordre de corrélation recommandé** :
1. Téléphone normalisé (primaire)
2. Numéro additionnel déjà rattaché au même client
3. `client_reference_code` si disponible
4. Rapprochement manuel contrôlé si ambiguïté

**Table de mapping commerciaux** :

```
commercial_identity_mapping
- conversation_commercial_id (UUID)
- order_commercial_id (integer, nullable)
- commercial_phone_number_raw
- commercial_phone_number_normalized
- is_active
- created_at / updated_at
```

### 5.3. Webhooks émis par la plateforme conversationnelle

| Événement | Déclencheur | Données clés |
|-----------|-------------|--------------|
| `lead_created` | Premier contact sérieux qualifié | Identité client, téléphone, commercial |
| `client_updated` | Mise à jour informations client | Identité, téléphones, qualification |
| `conversation_status_changed` | Changement de statut métier | `conversation_result`, date, commercial |
| `conversation_closed` | Clôture de conversation | Statut final, timestamp |
| `callback_scheduled` | Rappel programmé | Date, heure, commercial |
| `follow_up_created` | Création d'une relance | Type, date prévue, commercial |
| `follow_up_completed` | Complétion d'une relance | Résultat, timestamp |
| `call_context_updated` | Appel rattaché à une conversation | ID appel, contexte commercial |
| `client_category_updated` | Catégorie calculée côté conversationnel | Catégorie, raison |
| `automation_message_sent` | Message automatique envoyé | Type, template, statut de livraison |

#### Format standard du payload webhook

```json
{
  "event_id": "uuid-v4",
  "event_type": "conversation_status_changed",
  "event_version": "1.0",
  "event_timestamp": "2026-04-20T10:00:00.000Z",
  "source_system": "plateforme_conversationnelle",
  "webhook_signature": "hmac-sha256-signature",
  "conversation_client_id": "uuid",
  "order_client_id": 12345,
  "phone_number": "+33600000000",
  "phone_number_normalized": "+33600000000",
  "commercial_id": "uuid",
  "commercial_phone_number_normalized": "+33600000001",
  "payload": { ... }
}
```

### 5.4. Webhooks reçus depuis la plateforme de gestion des commandes

| Événement | Utilisation côté conversationnel |
|-----------|----------------------------------|
| `order_created` | Rattacher la commande au dossier client |
| `order_updated` | Mettre à jour les informations de commande |
| `order_status_changed` | Afficher le statut dans le dossier |
| `delivery_status_changed` | Mettre à jour la livraison dans le dossier |
| `order_cancelled` | Déclencher une relance si configuré |
| `client_order_summary_updated` | Recalculer la catégorie client |
| `client_certification_updated` | Mettre à jour le badge de certification |
| `referral_updated` | Mettre à jour les infos de parrainage |

### 5.5. Règles de sécurité et de fiabilité des webhooks

#### Sécurité
- Signature HMAC-SHA256 avec secret partagé sur chaque webhook émis/reçu
- Validation de la signature côté récepteur avant traitement
- Whitelist des IPs sources si possible
- HTTPS obligatoire

#### Fiabilité
- Identifiant unique `event_id` sur chaque webhook (UUID v4)
- Horodatage `event_timestamp` obligatoire
- Idempotence : si `event_id` déjà traité, ignorer silencieusement
- Retry automatique en cas d'échec (3 tentatives avec backoff exponentiel)
- Journalisation des envois et réceptions dans `outbound_webhook_log`

#### Observabilité
- Statut de livraison de chaque webhook (succès/échec/retry)
- Historique consultable dans l'admin
- Alertes système si taux d'échec > seuil configurable

---

## 6. Gouvernance des données

### 6.1. Sources de vérité

| Donnée | Source de vérité |
|--------|-----------------|
| Conversations et messages | Plateforme conversationnelle |
| Statuts de conversation | Plateforme conversationnelle |
| Qualification commerciale et notes | Plateforme conversationnelle |
| Relances et rappels | Plateforme conversationnelle |
| Portefeuille commercial | Plateforme conversationnelle |
| Messages automatiques | Plateforme conversationnelle |
| Règles de charge conversationnelle | Plateforme conversationnelle |
| Commandes et détails | Plateforme de gestion des commandes |
| Statuts de commande | Plateforme de gestion des commandes |
| Livraisons | Plateforme de gestion des commandes |
| Annulations | Plateforme de gestion des commandes |
| Agrégats de commandes du client | Plateforme de gestion des commandes |
| Catégorie client basée sur la commande | Plateforme de gestion des commandes |
| Certification client | Plateforme de gestion des commandes |
| Parrainage | Plateforme de gestion des commandes |
| Corrélation client (mapping) | Partagée — téléphone comme clé principale |
| Corrélation commerciale (mapping) | Partagée — téléphone commercial comme clé principale |

### 6.2. Règle anti-doublon client

- Si un numéro de téléphone existe déjà dans la plateforme de gestion des commandes : ne pas recréer un nouveau client sans vérification
- Si un client ajoute un nouveau numéro : le rattacher au client existant et le synchroniser vers l'autre plateforme
- Un client peut avoir plusieurs numéros (modèle multi-téléphone)

### 6.3. Terminologie unifiée

Pour éviter la confusion entre les concepts `contact`, `client`, `customer`, `customer_contact` :
- Utiliser systématiquement le mot **`client`** dans les écrans, les APIs et les contrats d'intégration
- Ne pas utiliser `customer` dans les structures de données cibles de l'intégration
- Un `contact` conversationnel doit évoluer vers un `client` structuré

---

## 7. Plan de livraison

### Phase 1 — Fondations de suivi client

**Objectif** : Créer les bases métier sans casser l'existant  
**Durée estimée** : 4 à 6 semaines

**Inclus** :
- 4.1 Dossier client complet
- 4.2 Statuts métier de fin de conversation
- 4.3 Système de relance client
- 4.4 Portefeuille client par commercial
- 4.5 Historique complet des interactions

**Critères de validation** :
- Un commercial peut accéder au dossier complet d'un client
- Une conversation ne peut pas être clôturée sans statut métier
- Les relances dues aujourd'hui s'affichent dans une vue dédiée
- Un admin peut consulter et modifier le portefeuille d'un commercial

---

### Phase 2 — Pilotage commercial

**Objectif** : Rendre le système manageable  
**Durée estimée** : 3 à 4 semaines

**Prérequis** : Phase 1 terminée

**Inclus** :
- 4.7 Classement des commerciaux
- 4.8 Objectifs commerciaux
- 4.9 Calcul des heures de travail
- 4.10 Restriction de connexion IP
- 4.6 Catégorisation client (après Phase intégration webhook)

**Critères de validation** :
- Un tableau de ranking commercial est disponible dans l'admin
- Des objectifs peuvent être définis et leur progression suivie
- Les heures de travail sont loggées et consultables
- Les connexions hors réseau autorisé sont bloquées

---

### Phase 3 — Règles de capacité conversationnelle

**Objectif** : Contrôler la charge et imposer le traitement progressif  
**Durée estimée** : 2 à 3 semaines

**Prérequis** : Phase 1 terminée (les statuts et critères de complétion doivent être fiables)

**Inclus** :
- 4.15 Restriction et déblocage des conversations (quota 50 / 10 actives / grisées / critères)

**Critères de validation** :
- Un commercial ne voit que 10 conversations actives maximum
- Les conversations au-delà de ce quota sont grisées et inaccessibles
- Le déblocage nécessite la qualification d'une conversation existante
- La logique de masquage est appliquée côté backend (non contournable par le front)

---

### Phase 4 — Fonctions avancées

**Objectif** : Ajouter les briques de confort et de maturité  
**Durée estimée** : 2 à 3 semaines

**Inclus** :
- 4.11 IA de correction de texte
- 4.12 Certification des comptes client
- 4.13 Système de parrainage
- 4.14 Dashboard technique serveur

---

### Phase Intégration — Connexion plateforme de gestion des commandes

**Objectif** : Relier les deux systèmes via webhooks  
**Peut démarrer en parallèle de la Phase 2**  
**Durée estimée** : 3 à 4 semaines

**Inclus** :
- Création de la table de mapping client (UUID ↔ integer)
- Création de la table de mapping commercial
- Webhooks sortants : `lead_created`, `client_updated`, `conversation_status_changed`, `follow_up_created`, `follow_up_completed`
- Handlers webhooks entrants : `order_created`, `order_status_changed`, `delivery_status_changed`, `order_cancelled`, `client_order_summary_updated`, `client_certification_updated`, `referral_updated`
- Affichage dans le dossier client des informations de commande et livraison

**Critères de validation** :
- Un commercial peut voir les commandes et leur statut depuis le dossier client
- La catégorie client est mise à jour automatiquement après une livraison ou une annulation
- Les webhooks sont signés, idempotents et loggés

---

## 8. Contraintes techniques

### 8.1. Architecture existante à respecter

- Backend NestJS + TypeORM + MySQL (aucune migration vers un autre SGBD)
- Frontend Next.js App Router avec Tailwind
- Admin Next.js App Router
- WebSocket Socket.IO pour le temps réel
- BullMQ pour les traitements asynchrones
- Migrations TypeORM avec naming convention `PhaseXDescription{timestamp13}` (ex : `Phase7Followup1745000000001`)

### 8.2. Conventions de code à respecter

- Entités TypeORM : `camelCase` en propriété, `snake_case` en nom de colonne SQL
- QueryBuilder TypeORM : utiliser les property names camelCase, pas les column names
- DTOs : peuvent garder `snake_case` pour les données externes (Whapi, webhooks entrants)
- Dates : toujours via `dateUtils.ts` (fonctions `formatTime`, `formatDate`, etc.), locale `fr-FR`, nulls → `"-"`
- Réponses null/invalide : jamais de fallback sur `Date.now()`

### 8.3. Règles métier non négociables

- Les règles critiques (statuts, quotas, critères de déblocage) doivent vivre dans le **backend**, pas dans le front
- Le front ne doit **jamais** recevoir via WebSocket des données masquées des conversations verrouillées
- Toute action sensible (réaffectation portefeuille, modification quota, déblocage forcé) doit être auditée

### 8.4. Performances

- Le calcul du ranking commercial ne doit pas charger la base de données à chaque requête : utiliser des snapshots périodiques ou du cache Redis
- Le moteur de capacité conversationnelle (quotas) doit répondre en < 100ms
- Les webhooks sortants doivent partir de manière asynchrone (via BullMQ) pour ne pas bloquer les appels HTTP métier

---

## 9. Stratégie de migration et continuité de production

### 9.1. Principe fondamental

La plateforme est **déjà en production** avec des données clients, des conversations, des messages et des contacts réels. Aucune évolution ne doit :
- provoquer une interruption de service (downtime zéro pendant les heures ouvrées)
- supprimer, écraser ou corrompre des données existantes
- bloquer les commerciaux actifs pendant un déploiement
- casser les webhooks entrants en attente de traitement

**Règle d'or** : chaque modification de base de données doit être rétrocompatible. Le nouveau code doit fonctionner avec l'ancien schéma pendant la fenêtre de déploiement, et l'ancien code doit pouvoir tourner avec le nouveau schéma sans erreur.

---

### 9.2. Stratégie de migration de base de données

#### Principe expand-contract (obligatoire)

Toute modification de schéma suit le cycle en 3 étapes :

**Étape 1 — Expand (ajout non-destructif)**
- Ajouter les nouvelles colonnes/tables en les rendant **nullable** ou avec une valeur par défaut
- Ne jamais supprimer de colonne existante dans cette étape
- Ne jamais renommer de colonne existante dans cette étape (créer une nouvelle colonne à la place)
- Déployer le backend qui écrit dans les nouvelles colonnes **et** dans les anciennes

**Étape 2 — Migration des données existantes**
- Remplir les nouvelles colonnes à partir des données existantes (backfill)
- Utiliser des scripts de migration exécutés en arrière-plan, par lots, sans verrouillage de table
- Vérifier l'intégrité après backfill avant de passer à l'étape 3

**Étape 3 — Contract (nettoyage)**
- Uniquement après validation complète et rollback possible
- Rendre les colonnes non-nullable si nécessaire
- Supprimer les anciennes colonnes devenues obsolètes (dans une migration séparée, déployée plus tard)

#### Exemples concrets d'application

**Ajout de `conversation_result` sur `whatsapp_chat`**
```sql
-- Migration Expand (étape 1)
ALTER TABLE whatsapp_chat 
  ADD COLUMN conversation_result VARCHAR(50) NULL DEFAULT NULL;
-- Aucun NOT NULL, aucune contrainte bloquante
-- Les conversations existantes ont NULL : c'est normal et géré dans le code
```

**Ajout du module `follow_up`**
```sql
-- Nouvelle table : aucun impact sur les tables existantes
CREATE TABLE follow_up (
  id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,       -- FK nullable pour gérer les contacts orphelins
  conversation_id CHAR(36) NULL,  -- FK nullable
  commercial_id CHAR(36) NULL,
  ...
);
```

**Ajout de `portfolio_owner_id` sur `contact`**
```sql
-- Migration Expand
ALTER TABLE contact 
  ADD COLUMN portfolio_owner_id CHAR(36) NULL DEFAULT NULL;
-- Backfill : NULL = non attribué. Les contacts existants restent accessibles.
```

#### Règles de nommage des migrations

Convention existante à respecter :
```
Phase{N}{Description}{timestamp13chiffres}
ex : Phase7Followup1745000000001
```

Chaque fonctionnalité de ce cahier des charges correspond à une ou plusieurs migrations numérotées séquentiellement.

---

### 9.3. Backfill des données existantes

Certaines nouvelles fonctionnalités nécessitent d'initialiser des données à partir de l'existant. Ces backfills doivent être planifiés et exécutés avec soin.

#### Backfills requis par fonctionnalité

| Fonctionnalité | Backfill nécessaire | Stratégie |
|----------------|---------------------|-----------|
| Portefeuille commercial | `portfolio_owner_id` sur contacts existants | Script de migration : attribuer au commercial qui a traité le plus de conversations avec ce contact |
| Statut métier de conversation | `conversation_result` sur conversations fermées | Valeur par défaut `null` (non qualifié). Afficher dans l'admin la liste des conversations sans statut pour rattrapage manuel |
| Sessions de travail | `CommercialSession` pour les connexions passées | Calculer à partir de `lastConnectionAt` si disponible. Sinon, historique commence à la date de déploiement |
| Mapping client | Table `client_identity_mapping` | Générer un enregistrement par contact existant avec le téléphone normalisé. `order_client_id` = null jusqu'à la première corrélation |
| Catégorie client | `client_category` sur contacts existants | `null` jusqu'à réception du premier webhook `client_order_summary_updated` de la plateforme commandes |

#### Règle de backfill

- Les backfills s'exécutent par lots de 500 enregistrements maximum avec un délai entre chaque lot pour ne pas saturer la base
- Un backfill est idempotent : si interrompu, il peut être relancé sans risque de doublon
- Un backfill est journalisé : début, fin, nombre d'enregistrements traités, erreurs éventuelles

---

### 9.4. Déploiement sans interruption de service

#### Stratégie de déploiement recommandée

1. **Migration de schéma en premier** (Expand uniquement) : exécuter la migration avant de déployer le nouveau code backend
2. **Déploiement backend** : le nouveau code tourne avec le nouveau schéma. L'ancien schéma (sans les nouvelles colonnes) est maintenu compatible pendant la fenêtre de transition
3. **Validation fonctionnelle** en production sur un échantillon réduit
4. **Backfill des données** si nécessaire, en arrière-plan
5. **Déploiement front/admin** (aucun impact base de données)
6. **Migration Contract** (suppression colonnes obsolètes) uniquement après 72h de stabilité confirmée

#### Fenêtres de déploiement

- Les migrations de schéma sont exécutées **hors heures de pointe** (nuit ou week-end)
- Les déploiements applicatifs peuvent être réalisés à tout moment si rétrocompatibles
- Un plan de rollback doit être préparé avant chaque déploiement (voir section 9.5)

#### Gestion des WebSockets actifs pendant un déploiement

Les commerciaux connectés via WebSocket doivent être gérés proprement lors d'un redémarrage du backend :
- Utiliser un redémarrage graceful (SIGTERM → draining → shutdown)
- Informer le front d'une reconnexion nécessaire via un événement WebSocket `server_restart` si besoin
- Le front doit gérer la reconnexion automatique sans perte d'état visible

---

### 9.5. Plan de rollback

Chaque déploiement doit avoir un plan de rollback documenté **avant** d'être appliqué.

#### Rollback base de données

Les migrations Expand (ajout de colonnes/tables nullables) sont réversibles :
```sql
-- Rollback de l'ajout de conversation_result
ALTER TABLE whatsapp_chat DROP COLUMN IF EXISTS conversation_result;
```

Les migrations Contract (suppression de colonnes) sont **irréversibles** : ne jamais les appliquer sans sauvegarde complète préalable.

#### Rollback applicatif

- Conserver l'image Docker ou l'artefact de la version N-1 disponible en permanence
- Le rollback applicatif doit pouvoir être exécuté en moins de 5 minutes
- Tester le rollback en environnement de staging avant chaque mise en production

#### Règle de non-régression

Avant tout déploiement en production :
1. Appliquer la migration sur une copie de la base de production (staging avec dump récent)
2. Valider que les fonctionnalités existantes fonctionnent toujours
3. Valider que les commerciaux actifs ne sont pas impactés

---

### 9.6. Sauvegarde et protection des données

#### Sauvegardes obligatoires

- Une sauvegarde complète de la base de données **avant chaque migration** de schéma, sans exception
- Conserver les sauvegardes sur un stockage distinct du serveur de production (S3, NAS, etc.)
- Durée de rétention minimale recommandée : 30 jours

#### Tables critiques à protéger en priorité

| Table | Criticité | Raison |
|-------|-----------|--------|
| `whatsapp_message` | Critique | Historique complet des conversations clients |
| `whatsapp_chat` | Critique | État de toutes les conversations |
| `contact` | Critique | Base clients |
| `call_log` | Haute | Historique des appels commerciaux |
| `whatsapp_commercial` | Haute | Comptes des agents |
| `crm_field_value` | Haute | Données CRM personnalisées |
| `audit_log` | Haute | Traçabilité réglementaire |
| `outbound_webhook_log` | Moyenne | Historique des notifications sortantes |

#### Règle de suppression

- Ne jamais utiliser `DELETE` brut sur les tables critiques
- Utiliser le **soft delete** (`deletedAt IS NOT NULL`) sur toutes les entités exposées à des suppressions utilisateur
- Les suppressions physiques (hard delete) sont interdites en production sauf décision explicite et documentée

---

### 9.7. Gestion de la compatibilité des APIs existantes

#### Versionnement des APIs

- Ne jamais supprimer ou modifier le contrat d'un endpoint existant sans période de transition
- Si un endpoint doit changer de comportement : créer une version `/v2/...` en parallèle, maintenir l'ancienne version active pendant au moins 2 semaines
- Documenter les changements de contrat dans le changelog

#### Compatibilité des WebSockets

- Les nouveaux événements WebSocket ajoutés (ex : `conversation_locked`, `follow_up_due`) ne doivent pas casser les clients existants qui ne les écoutent pas
- Les événements existants (`MESSAGE_ADD`, `CHAT_UPDATE`, etc.) ne doivent pas changer de format sans migration explicite du front

#### Compatibilité des webhooks entrants (Whapi, Meta, etc.)

- Les handlers de webhooks entrants existants ne doivent pas être modifiés dans leur logique d'idempotence
- Toute nouvelle table ou champ alimenté par un webhook entrant doit être nullable avec valeur par défaut

---

### 9.8. Environnements et promotion du code

#### Chaîne de déploiement recommandée

```
développement local → staging (avec dump de production anonymisé) → production
```

**Staging** :
- Doit contenir un dump récent et anonymisé de la base de production (numéros de téléphone masqués, noms anonymisés)
- Toutes les migrations doivent passer sur staging avant production
- Les tests de non-régression doivent passer sur staging

**Production** :
- Jamais de migration sans validation préalable sur staging
- Jamais de déploiement le vendredi après-midi ou la veille d'un jour férié
- Un responsable technique doit être disponible pendant et après chaque déploiement

---

## 10. Risques

### 10.1. Risque métier — Trop de logique côté front

**Description** : Si les règles de verrouillage ou de qualification sont uniquement appliquées côté frontend, elles sont contournables.  
**Mitigation** : Toute règle critique est vérifiée côté backend. Le front ne fait qu'afficher le résultat.

### 10.2. Risque de doublon client

**Description** : Sans table de mapping claire entre `UUID` et `integer`, des clients peuvent être créés en doublon dans les deux plateformes.  
**Mitigation** : Implémenter la table de mapping dès le début de la Phase Intégration. Le téléphone normalisé est la clé principale de déduplication.

### 10.3. Risque UX — Surcharge de l'interface commerciale

**Description** : Ajouter trop de fonctionnalités dans le front commercial peut le rendre difficile à utiliser au quotidien.  
**Mitigation** : Prioriser les vues essentielles. Les fonctionnalités secondaires (parrainage, certification, IA) sont accessibles depuis le dossier client, pas depuis la conversation principale.

### 10.4. Risque de performance — Moteur de capacité temps réel

**Description** : Calculer les quotas de conversations en temps réel pour tous les commerciaux connectés peut charger la base de données.  
**Mitigation** : Utiliser Redis comme cache du compteur de conversations actives par commercial. Invalider le cache uniquement lors des transitions d'état significatives.

### 10.5. Risque d'incohérence entre plateformes

**Description** : Si les webhooks entre plateformes ne sont pas stabilisés, les catégories client et les données de commande seront incorrectes dans la plateforme conversationnelle.  
**Mitigation** : Prévoir une réconciliation périodique (cron) pour re-synchroniser les catégories et données clients en cas d'échec de webhook. Afficher un indicateur "données à jour / en attente de synchronisation" dans la fiche client.

### 10.6. Risque de régression — Implémentation des quotas avant les statuts

**Description** : Si les règles de limitation (Phase 3) sont activées avant que les statuts métier (Phase 1) et les critères de complétion soient fiables, les commerciaux seront bloqués sans possibilité de débloquer leurs conversations.  
**Mitigation** : Respecter strictement l'ordre des phases. La Phase 3 ne démarre qu'après validation complète de la Phase 1.

### 10.7. Risque de perte de données — Migration de schéma en production

**Description** : Une migration mal rédigée (NOT NULL sans valeur par défaut, renommage de colonne, suppression prématurée) peut corrompre des tables critiques ou bloquer le service.  
**Mitigation** : Appliquer systématiquement le principe expand-contract. Tester chaque migration sur un dump de production dans l'environnement staging avant de l'exécuter en production. Ne jamais appliquer une migration Contract sans sauvegarde complète préalable.

### 10.8. Risque de régression — Déploiement avec WebSockets actifs

**Description** : Un redémarrage brutal du backend pendant que des commerciaux sont connectés peut entraîner des messages perdus ou des conversations orphelines côté WebSocket.  
**Mitigation** : Utiliser le mode graceful shutdown du serveur NestJS (SIGTERM → drainer les connexions → arrêter). S'assurer que le front gère la reconnexion automatique et que les messages en transit sont persistés avant le shutdown.

### 10.9. Risque de doublon de backfill

**Description** : Si un script de backfill est exécuté plusieurs fois (interruption + relance), il peut créer des doublons (ex : plusieurs entrées de mapping pour le même contact).  
**Mitigation** : Tous les scripts de backfill doivent être idempotents. Utiliser des clauses `INSERT ... ON DUPLICATE KEY UPDATE` ou des vérifications préalables avant insertion.

---

## Annexe — Récapitulatif des modules à créer / étendre / conserver

### Modules backend à créer

| Module | Description |
|--------|-------------|
| `follow-up` | Entité et service de gestion des relances |
| `targets` | Objectifs commerciaux par indicateur et période |
| `conversation-capacity` | Moteur de quotas et règles de déblocage |
| `client-mapping` | Table de correspondance UUID ↔ integer |
| `commercial-session` | Journalisation et calcul des sessions de travail |
| `webhook-inbound` | Handlers des webhooks entrants depuis la plateforme commandes |
| `referral` | Modèle de parrainage (lecture uniquement) |

### Modules backend à étendre

| Module | Extension requise |
|--------|-------------------|
| `contact` | `portfolio_owner_id`, `client_category`, `certification_status`, `referral_data`, `order_summary` |
| `whatsapp_chat` | `conversation_result`, `is_locked`, historique des statuts |
| `analytics` | Calcul de ranking, snapshots, service de progression objectifs |
| `ai-assistant` | ✅ Endpoints suggestions, résumé, réécriture — fournisseur multi-provider configurable via `SystemConfigService` (clés `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_API_URL`, `AI_FLOWBOT_ENABLED`) |
| `targets` | ✅ `getRanking()` avec formule paramétrable — poids lus depuis `SystemConfigService` (clés `RANKING_WEIGHT_*`) — endpoint `GET /targets/ranking/formula` |
| `flowbot` | ✅ Nœud `AI_REPLY` — appel `AiAssistantService.suggestReplies()` conditionné par `AI_FLOWBOT_ENABLED` |
| `system-config` | ✅ Catégories `ranking` et `ai` ajoutées au catalogue — visibles dans Paramètres admin |
| `auth` | Vérification IP, whitelist, journalisation des refus |
| `outbound-webhook` | Nouveaux événements métier (follow_up, client, conversation) |

### Modules backend à conserver sans modification

- `dispatcher`, `flowbot`, `whatsapp_message`, `broadcast`, `whatsapp-template`, `realtime`, `sla`, `audit`, `rbac`, `notification`, `system-config`, `channel`, `call-log`, `crm`, `sentiment`

---

---

## Changelog

| Version | Date | Modifications |
|---------|------|---------------|
| 1.0 | 20 avril 2026 | Version initiale |
| 1.1 | 20 avril 2026 | Ajout intégration ERP (catégorie client, certification, parrainage) dans front commercial |
| 1.2 | 21 avril 2026 | Section 4.7 : formule de classement paramétrable (5 poids configurables via Paramètres admin) ; Section 4.11 : refonte complète IA (fournisseur multi-provider DB-configurable, suggestions chat, résumé IA, nœud FlowBot AI_REPLY) ; Annexe : extensions `ai-assistant`, `targets`, `flowbot`, `system-config` documentées |

*Fin du cahier des charges — Version 1.2 — 21 avril 2026*
