# Documentation FlowBot — Flux Conversationnels

> **Version** : Basée sur le code source en production (branche `production`)  
> **Date** : Avril 2026  
> **Portée** : Backend NestJS + Panel Admin

---

## Table des matières

1. [Architecture générale](#1-architecture-générale)
2. [Concepts fondamentaux](#2-concepts-fondamentaux)
   - [FlowBot (le flux)](#21-flowbot-le-flux)
   - [FlowTrigger (déclencheurs)](#22-flowtrigger-déclencheurs)
   - [FlowNode (nœuds)](#23-flownode-nœuds)
   - [FlowEdge (transitions)](#24-flowedge-transitions)
   - [FlowSession (état en cours)](#25-flowsession-état-en-cours)
3. [Variables disponibles](#3-variables-disponibles)
4. [Cycle de vie d'une session](#4-cycle-de-vie-dune-session)
5. [Exemples complets par cas d'usage](#5-exemples-complets-par-cas-dusage)
   - [CAS 1 — Message de bienvenue (CONVERSATION_OPEN)](#cas-1--message-de-bienvenue-conversation_open)
   - [CAS 2 — Réponse à un mot-clé (KEYWORD)](#cas-2--réponse-à-un-mot-clé-keyword)
   - [CAS 3 — Hors horaires (OUT_OF_HOURS)](#cas-3--hors-horaires-out_of_hours)
   - [CAS 4 — Réouverture de conversation (CONVERSATION_REOPEN)](#cas-4--réouverture-de-conversation-conversation_reopen)
   - [CAS 5 — FAQ interactive (INBOUND_MESSAGE + CONDITION)](#cas-5--faq-interactive-inbound_message--condition)
   - [CAS 6 — Qualification de lead (QUESTION en cascade)](#cas-6--qualification-de-lead-question-en-cascade)
   - [CAS 7 — Notification d'assignation agent (ON_ASSIGN)](#cas-7--notification-dassignation-agent-on_assign)
   - [CAS 8 — Relance client sans réponse (NO_RESPONSE)](#cas-8--relance-client-sans-réponse-no_response)
   - [CAS 9 — Message d'attente en queue (QUEUE_WAIT)](#cas-9--message-dattente-en-queue-queue_wait)
   - [CAS 10 — Inactivité prolongée (INACTIVITY)](#cas-10--inactivité-prolongée-inactivity)
   - [CAS 11 — Flux planifié (SCHEDULE)](#cas-11--flux-planifié-schedule)
   - [CAS 12 — Test A/B de messages (AB_TEST)](#cas-12--test-ab-de-messages-ab_test)
   - [CAS 13 — Flux avec variables de session](#cas-13--flux-avec-variables-de-session)
   - [CAS 14 — Canal spécifique (scopeChannelType)](#cas-14--canal-spécifique-scopechanneltype)
6. [Règles importantes et pièges à éviter](#6-règles-importantes-et-pièges-à-éviter)
7. [Référence complète](#7-référence-complète)

---

## 1. Architecture générale

```
Message entrant (WhatsApp/Telegram/Meta/Instagram)
        │
        ▼
BotInboundListener.handleBotInbound()
        │
        ▼
FlowEngineService.handleInbound()
        │
        ├─ Session WAITING_REPLY active ? ──► resumeSession() → continuer le flux
        │
        └─ Pas de session active
                │
                ▼
        FlowTriggerService.findMatchingFlow()
                │  Parcourt les flux actifs par priorité DESC
                │  Teste chaque trigger du flux
                │
                ├─ Aucun match → Arrêt (dispatcher normal prend la main)
                │
                └─ Match trouvé
                        │
                        ▼
                Créer FlowSession
                        │
                        ▼
                executeNode(entry point)
                        │
                        ▼
                ... exécution récursive des nœuds ...
                        │
                        ▼
                Session COMPLETED / ESCALATED / WAITING_*
```

**Principe clé** : Une session FlowBot est exclusive. Si une session `WAITING_REPLY` est en cours sur une conversation, TOUS les messages entrants sont routés vers ce flux — le dispatcher ne voit rien jusqu'à ce que la session se termine ou s'escalade.

---

## 2. Concepts fondamentaux

### 2.1 FlowBot (le flux)

| Champ | Type | Description |
|-------|------|-------------|
| `name` | string | Nom du flux (ex: "Accueil client WhatsApp") |
| `description` | string | Description optionnelle |
| `isActive` | boolean | **Doit être `true`** pour que le flux soit évalué |
| `priority` | int | Ordre d'évaluation — **plus grand = testé en premier** |
| `scopeChannelType` | string? | Limiter à un canal : `"whatsapp"`, `"telegram"`, `"messenger"`, `"instagram"` |
| `scopeProviderRef` | string? | Limiter à un provider : `"whapi"`, `"meta"` |

**Règle de priorité** : Si deux flux actifs ont des triggers compatibles avec le même message, c'est celui avec la `priority` la plus haute qui s'exécute. Un seul flux démarre par message.

### 2.2 FlowTrigger (déclencheurs)

Un flux peut avoir **plusieurs triggers** — si l'un d'eux est vérifié, le flux démarre.

| Type | Quand déclenché | Config requise |
|------|-----------------|----------------|
| `INBOUND_MESSAGE` | À chaque message entrant | Aucune |
| `CONVERSATION_OPEN` | Premier message du contact (jamais vu avant) | Aucune |
| `CONVERSATION_REOPEN` | Conversation rouverte après fermeture | Aucune |
| `OUT_OF_HOURS` | Message hors des heures d'ouverture configurées | Aucune |
| `KEYWORD` | Le texte du message contient un mot-clé | `{ "keywords": ["aide", "help"] }` |
| `ON_ASSIGN` | Un agent vient d'être assigné à la conversation | Aucune |
| `NO_RESPONSE` | Pas de réponse de l'agent depuis N secondes | `{ "timeoutSeconds": 300 }` |
| `QUEUE_WAIT` | Contact en attente dans la queue depuis N secondes | `{ "waitSeconds": 120 }` |
| `INACTIVITY` | Aucune activité (ni agent ni client) depuis N secondes | `{ "inactivitySeconds": 3600 }` |
| `SCHEDULE` | Exécution selon un cron | `{ "cronExpression": "0 9 * * 1-5" }` |

> **Important** : `NO_RESPONSE`, `QUEUE_WAIT`, `INACTIVITY` et `SCHEDULE` sont gérés par des **jobs périodiques** (cron toutes les minutes). Ils ne répondent pas immédiatement.

### 2.3 FlowNode (nœuds)

Un flux est un graphe de nœuds reliés par des arêtes. Il doit avoir **exactement un nœud d'entrée** (`isEntryPoint: true`).

#### Types de nœuds

##### MESSAGE — Envoie un texte puis continue automatiquement
```json
{
  "type": "MESSAGE",
  "label": "Message bienvenue",
  "isEntryPoint": true,
  "config": {
    "body": "Bonjour {contact_name} ! Comment puis-je vous aider ?",
    "typingDelaySeconds": 2,
    "mediaUrl": null
  }
}
```
- `body` : Texte avec variables entre `{}`
- `typingDelaySeconds` : Affiche "en train d'écrire..." avant d'envoyer (0 = désactivé)
- `mediaUrl` : URL d'un média à joindre (optionnel)
- **Comportement** : Envoie le message, puis suit automatiquement l'arête `always`

##### QUESTION — Envoie un texte et ATTEND la réponse
```json
{
  "type": "QUESTION",
  "label": "Demande de choix",
  "config": {
    "body": "Tapez :\n1️⃣ Support technique\n2️⃣ Information commande\n3️⃣ Autre",
    "typingDelaySeconds": 1
  },
  "timeoutSeconds": 300
}
```
- **Comportement** : Envoie la question, met la session en `WAITING_REPLY`, arrête l'exécution
- La **prochaine réponse du client** reprend le flux à partir de ce nœud (les arêtes sortantes sont évaluées avec le texte de la réponse)
- `timeoutSeconds` : Si aucune réponse en N secondes → escalade (géré par polling job)

##### CONDITION — Branchement conditionnel (pas d'envoi)
```json
{
  "type": "CONDITION",
  "label": "Analyse du choix",
  "config": {}
}
```
- **Comportement** : Évalue les arêtes sortantes dans l'ordre de `sortOrder`, prend la première qui matche
- Si aucune arête ne matche → escalade vers un agent
- Utilise la variable `last_message_text` (le dernier message reçu du client)

##### ACTION — Exécute une action métier
```json
{
  "type": "ACTION",
  "label": "Définir variable commande",
  "config": {
    "actionType": "set_variable",
    "key": "service_choisi",
    "value": "support"
  }
}
```
Actions disponibles :

| actionType | Effet | Paramètres |
|-----------|-------|-----------|
| `set_variable` | Stocke une valeur en session | `key`, `value` |
| `mark_as_read` | Marque le message comme lu | Aucun |
| `send_typing` | Envoie indicateur "en train d'écrire" | Aucun |
| `set_contact_known` | Marque le contact comme connu | Aucun |
| `close_conversation` | Ferme la conversation | Aucun |

##### WAIT — Pause le flux pendant N secondes
```json
{
  "type": "WAIT",
  "label": "Pause 30s",
  "config": {
    "delaySeconds": 30
  }
}
```
- **Comportement** : Met la session en `WAITING_DELAY`. Un job cron vérifie toutes les minutes si le délai est écoulé et reprend le flux.
- Cas d'usage : Envoyer un premier message, attendre 30s, envoyer un second message de suivi.

##### ESCALATE — Transfère à un agent humain
```json
{
  "type": "ESCALATE",
  "label": "Transfert agent",
  "config": {
    "agentRef": null
  }
}
```
- **Comportement** : Met la session en `ESCALATED`, émet un événement pour notifier un agent, libère la conversation.
- `agentRef` : UUID d'un agent spécifique (null = agent libre)

##### END — Termine le flux proprement
```json
{
  "type": "END",
  "label": "Fin",
  "config": {}
}
```
- **Comportement** : Met la session en `COMPLETED`, marque le contact comme "connu" (`isKnownContact = true`), libère la conversation.

##### AB_TEST — Test A/B aléatoire
```json
{
  "type": "AB_TEST",
  "label": "Test variation message",
  "config": {}
}
```
- **Comportement** : Les arêtes sortantes ont des poids dans `conditionValue` (ex: `"70"` et `"30"` pour 70%/30%)
- La sélection est aléatoire, pondérée par ces valeurs

### 2.4 FlowEdge (transitions)

Les arêtes relient les nœuds. Elles ont des conditions qui décident si la transition est prise.

| conditionType | conditionValue | Évaluation |
|---------------|---------------|------------|
| `always` | — | Toujours vraie (transition automatique après MESSAGE/ACTION/WAIT) |
| `message_contains` | sous-chaîne | Le dernier message du client contient ce texte (insensible à la casse) |
| `message_equals` | texte exact | Le message est exactement ce texte (insensible à la casse) |
| `message_matches_regex` | regex | Le message matche cette expression régulière |
| `contact_is_new` | — | Contact jamais vu dans FlowBot |
| `channel_type` | `"whatsapp"` / `"telegram"` etc. | Le canal correspond |
| `agent_assigned` | — | Un agent est assigné à la conversation |
| `variable_equals` | `"CLE=VALEUR"` | La variable de session vaut cette valeur |

**`conditionNegate: true`** inverse n'importe quelle condition.

**`sortOrder`** : Les arêtes d'un nœud CONDITION sont évaluées dans cet ordre (ASC). La **première qui matche** est prise.

### 2.5 FlowSession (état en cours)

| Statut | Signification | Action requise |
|--------|---------------|----------------|
| `ACTIVE` | Exécution en cours | Automatique |
| `WAITING_REPLY` | En attente de la réponse client | Reprend au prochain message |
| `WAITING_DELAY` | En attente d'un délai (WAIT) | Repris par job cron |
| `COMPLETED` | Flux terminé normalement | — |
| `ESCALATED` | Transféré à un agent | — |
| `EXPIRED` | Timeout > 24h sans activité | Nettoyé automatiquement |
| `CANCELLED` | Annulé (pas de nœud d'entrée) | — |

---

## 3. Variables disponibles

Dans `config.body` des nœuds MESSAGE et QUESTION, utilisez `{nom_variable}` :

| Variable | Valeur | Exemple |
|----------|--------|---------|
| `{contact_name}` | Nom du contact | `"Jean Dupont"` |
| `{contact_phone}` | Numéro/ID du contact | `"33612345678"` |
| `{agent_name}` | Nom de l'agent assigné | `"Sophie Martin"` |
| `{current_time}` | Heure actuelle (HH:MM) | `"14:35"` |
| `{current_date}` | Date actuelle (JJ/MM/AAAA) | `"15/04/2026"` |
| `{wait_minutes}` | Minutes écoulées depuis dernier message | `"12"` |
| `{session.CLE}` | Valeur stockée via ACTION `set_variable` | `"commande-123"` |

> **Variable inconnue** : Si `{xxx}` n'est pas reconnu, le texte `{xxx}` reste tel quel.

---

## 4. Cycle de vie d'une session

```
Flux déclenché
     │
     ▼
[ACTIVE] ──► executeNode(entry) ──► MESSAGE ──► envoie + suit arête "always"
                                      │
                                      ▼
                                    QUESTION ──► envoie + [WAITING_REPLY] ◄──── STOP
                                                           │
                                         Client répond ──►┘
                                                           │
                                                           ▼
                                          Évalue arêtes sortantes
                                           (avec texte de la réponse)
                                                           │
                                         ┌─────────────────┴──────────────────┐
                                         ▼                                    ▼
                                    CONDITION                              autres nœuds
                                         │
                                 ┌───────┴───────┐
                                 ▼               ▼
                              Branche A      Branche B
                                 │
                                 ▼
                              WAIT ──► [WAITING_DELAY] ◄──── STOP
                                              │
                              Job cron (1min) ┘
                                              │
                                              ▼
                                           ACTION ──► [ACTIVE] ──► continue
                                              │
                                              ▼
                                           END ──► [COMPLETED] ──► contact marqué "connu"
                                           ou
                                           ESCALATE ──► [ESCALATED] ──► agent notifié
```

**Limite anti-boucle** : 50 étapes maximum par session. Au-delà, la session est escaladée.

---

## 5. Exemples complets par cas d'usage

---

### CAS 1 — Message de bienvenue (CONVERSATION_OPEN)

**Objectif** : Accueillir automatiquement un nouveau contact et lui proposer un menu.

**Scénario** :
```
Contact envoie son premier message
→ Le bot répond : "Bonjour [nom] ! Bienvenue. Tapez OUI pour continuer."
→ Contact répond "oui"
→ Bot : "Parfait ! Un agent vous contactera sous peu."
→ Escalade vers agent
```

**Configuration du flux** :
```
Nom: "Accueil nouveaux contacts"
Priorité: 10
isActive: true
scopeChannelType: null  (tous canaux)
```

**Triggers** :
```json
[
  {
    "triggerType": "CONVERSATION_OPEN",
    "isActive": true,
    "config": {}
  }
]
```

**Nœuds** :

```
Nœud 1 — MESSAGE (entry point)
  label: "Bienvenue"
  isEntryPoint: true
  config: {
    "body": "Bonjour {contact_name} ! 👋\n\nBienvenue sur notre support WhatsApp.\nTapez OUI pour être mis en contact avec un agent.",
    "typingDelaySeconds": 2
  }

Nœud 2 — QUESTION
  label: "Confirmation OUI/NON"
  config: {
    "body": "Souhaitez-vous être mis en contact avec un agent ? (OUI / NON)",
    "typingDelaySeconds": 1
  }

Nœud 3 — CONDITION
  label: "Analyse réponse"
  config: {}

Nœud 4 — MESSAGE
  label: "Confirmation escalade"
  config: {
    "body": "Parfait ! 🎯 Un agent va prendre en charge votre demande dans quelques instants.\nDate : {current_date} à {current_time}"
  }

Nœud 5 — ESCALATE
  label: "Vers agent"
  config: { "agentRef": null }

Nœud 6 — MESSAGE
  label: "Réponse refus"
  config: {
    "body": "Très bien {contact_name}. N'hésitez pas à revenir si vous avez besoin d'aide !"
  }

Nœud 7 — END
  label: "Fin"
  config: {}
```

**Arêtes** :

| Source | Cible | Condition | sortOrder |
|--------|-------|-----------|-----------|
| Nœud 1 | Nœud 2 | `always` | 0 |
| Nœud 2 | Nœud 3 | `always` | 0 |
| Nœud 3 | Nœud 4 | `message_contains` = `"oui"` | 0 |
| Nœud 3 | Nœud 6 | `message_contains` = `"non"` | 1 |
| Nœud 4 | Nœud 5 | `always` | 0 |
| Nœud 6 | Nœud 7 | `always` | 0 |

**Visualisation du flux** :
```
[MESSAGE: Bienvenue] ──always──► [QUESTION: OUI/NON ?] ──always──► [CONDITION]
                                                                          │
                                              message_contains "oui" ────┤
                                                                          │────► [MESSAGE: Parfait!] ──► [ESCALATE]
                                              message_contains "non" ────┤
                                                                          │────► [MESSAGE: Au revoir] ──► [END]
```

---

### CAS 2 — Réponse à un mot-clé (KEYWORD)

**Objectif** : Détecter des mots-clés spécifiques et répondre automatiquement.

**Scénario** :
```
Contact envoie "prix", "tarif" ou "coût"
→ Bot envoie la grille tarifaire
→ Demande si besoin d'aide
→ Si "oui" → escalade, sinon → fin
```

**Configuration du flux** :
```
Nom: "FAQ - Tarifs"
Priorité: 20   (plus haute que l'accueil générique)
isActive: true
```

**Triggers** :
```json
[
  {
    "triggerType": "KEYWORD",
    "isActive": true,
    "config": {
      "keywords": ["prix", "tarif", "coût", "combien", "tarification"]
    }
  }
]
```

> La détection est **insensible à la casse** et cherche la présence du mot dans le texte (pas l'égalité exacte). "Quels sont vos tarifs ?" déclenchera le trigger `"tarif"`.

**Nœuds** :

```
Nœud 1 — MESSAGE (entry point)
  isEntryPoint: true
  config: {
    "body": "📋 *Nos tarifs :*\n\n• Forfait Starter : 29€/mois\n• Forfait Pro : 79€/mois\n• Forfait Entreprise : sur devis\n\nTous nos forfaits incluent un support 7j/7."
  }

Nœud 2 — QUESTION
  config: {
    "body": "Souhaitez-vous qu'un commercial vous contacte pour un devis personnalisé ? (OUI / NON)"
  }

Nœud 3 — CONDITION
  config: {}

Nœud 4 — ESCALATE
  config: { "agentRef": null }

Nœud 5 — MESSAGE
  config: {
    "body": "D'accord ! Vous pouvez retrouver toutes nos offres sur notre site.\nÀ bientôt {contact_name} ! 👋"
  }

Nœud 6 — END
  config: {}
```

**Arêtes** :

| Source | Cible | Condition | sortOrder |
|--------|-------|-----------|-----------|
| Nœud 1 | Nœud 2 | `always` | 0 |
| Nœud 2 | Nœud 3 | `always` | 0 |
| Nœud 3 | Nœud 4 | `message_contains` = `"oui"` | 0 |
| Nœud 3 | Nœud 5 | `always` | 1 |
| Nœud 5 | Nœud 6 | `always` | 0 |

> **Astuce** : L'arête `always` en dernière position (sortOrder=1) sert de **branche par défaut** — elle capture toute réponse autre que "oui".

---

### CAS 3 — Hors horaires (OUT_OF_HOURS)

**Objectif** : Informer les clients qui écrivent en dehors des heures d'ouverture.

**Scénario** :
```
Contact écrit à 22h30
→ Bot : "Nos bureaux sont fermés. Nous répondrons demain à partir de 9h."
→ Propose de laisser un message
→ Enregistre et confirme la prise en charge
```

**Configuration du flux** :
```
Nom: "Hors horaires"
Priorité: 50   (très haute — doit passer avant tout autre flux)
isActive: true
```

**Triggers** :
```json
[
  {
    "triggerType": "OUT_OF_HOURS",
    "isActive": true,
    "config": {}
  }
]
```

> **Prérequis** : Le signal `isOutOfHours` est calculé par le backend en amont (dispatcher ou webhook), selon les horaires configurés dans le système.

**Nœuds** :

```
Nœud 1 — MESSAGE (entry point)
  config: {
    "body": "Bonsoir {contact_name} ! 🌙\n\nNos équipes ne sont pas disponibles en ce moment.\n\n🕒 Horaires d'ouverture :\nLun-Ven : 9h00 - 18h00\nSamedi : 9h00 - 12h00\n\nVotre message a bien été enregistré et sera traité dès demain matin.",
    "typingDelaySeconds": 3
  }

Nœud 2 — QUESTION
  config: {
    "body": "Souhaitez-vous laisser un message prioritaire pour nos équipes ? (OUI / NON)"
  }

Nœud 3 — CONDITION
  config: {}

Nœud 4 — QUESTION
  label: "Collecte du message"
  config: {
    "body": "Décrivez brièvement votre demande et nous vous recontacterons en priorité demain :"
  }

Nœud 5 — ACTION
  label: "Sauvegarder le message"
  config: {
    "actionType": "set_variable",
    "key": "message_urgent",
    "value": "{session.last_message_text}"
  }

Nœud 6 — MESSAGE
  config: {
    "body": "✅ Merci {contact_name} ! Votre message a été transmis à nos équipes.\nNous vous recontacterons dès l'ouverture ({current_date})."
  }

Nœud 7 — END
  config: {}

Nœud 8 — MESSAGE
  config: {
    "body": "Très bien ! À demain {contact_name}. 👋"
  }

Nœud 9 — END
  config: {}
```

**Arêtes** :

| Source | Cible | Condition | sortOrder |
|--------|-------|-----------|-----------|
| Nœud 1 | Nœud 2 | `always` | 0 |
| Nœud 2 | Nœud 3 | `always` | 0 |
| Nœud 3 | Nœud 4 | `message_contains` = `"oui"` | 0 |
| Nœud 3 | Nœud 8 | `always` | 1 |
| Nœud 4 | Nœud 5 | `always` | 0 |
| Nœud 5 | Nœud 6 | `always` | 0 |
| Nœud 6 | Nœud 7 | `always` | 0 |
| Nœud 8 | Nœud 9 | `always` | 0 |

---

### CAS 4 — Réouverture de conversation (CONVERSATION_REOPEN)

**Objectif** : Accueillir différemment un client qui revient après une conversation fermée.

**Scénario** :
```
Client revient après fermeture de conversation
→ Bot reconnaît qu'il est déjà connu
→ Propose la reprise rapide
```

**Triggers** :
```json
[
  {
    "triggerType": "CONVERSATION_REOPEN",
    "isActive": true,
    "config": {}
  }
]
```

**Nœuds** :

```
Nœud 1 — CONDITION (entry point)
  isEntryPoint: true
  label: "Nouveau ou connu ?"
  config: {}

Nœud 2 — MESSAGE
  label: "Accueil contact connu"
  config: {
    "body": "Bonjour {contact_name} ! 👋 Ravi de vous revoir.\nComment puis-je vous aider aujourd'hui ?"
  }

Nœud 3 — MESSAGE
  label: "Premier retour"
  config: {
    "body": "Bonjour {contact_name} ! Votre demande précédente a été traitée.\nAvez-vous une nouvelle question ?"
  }

Nœud 4 — ESCALATE
  config: { "agentRef": null }
```

**Arêtes** :

| Source | Cible | Condition | sortOrder |
|--------|-------|-----------|-----------|
| Nœud 1 | Nœud 2 | `contact_is_new` + `conditionNegate: true` | 0 |
| Nœud 1 | Nœud 3 | `always` | 1 |
| Nœud 2 | Nœud 4 | `always` | 0 |
| Nœud 3 | Nœud 4 | `always` | 0 |

> **`conditionNegate: true`** sur `contact_is_new` = "le contact N'EST PAS nouveau" = contact déjà connu.

---

### CAS 5 — FAQ interactive (INBOUND_MESSAGE + CONDITION)

**Objectif** : Répondre à n'importe quel message avec un menu de FAQ, puis brancher selon le choix.

**Scénario** :
```
Contact envoie n'importe quoi
→ Bot : menu à 3 options (1, 2, 3)
→ Selon le choix → réponse spécifique
→ Retour au menu (via variable loop) ou fin
```

**Triggers** :
```json
[
  {
    "triggerType": "INBOUND_MESSAGE",
    "isActive": true,
    "config": {}
  }
]
```

> **Attention** : Ce flux sera déclenché à chaque message. Mettez une `priority` basse (ex: 0) pour qu'il ne court-circuite pas les autres flux plus spécifiques.

**Nœuds** :

```
Nœud 1 — MESSAGE (entry point)
  config: {
    "body": "Bonjour {contact_name} ! Comment puis-je vous aider ?\n\n*1️⃣* Suivi de commande\n*2️⃣* Problème technique\n*3️⃣* Parler à un agent\n\nRépondez avec le chiffre de votre choix."
  }

Nœud 2 — QUESTION
  config: { "body": "Votre choix (1, 2 ou 3) :" }

Nœud 3 — CONDITION
  label: "Analyse choix"
  config: {}

Nœud 4 — MESSAGE
  label: "Réponse suivi commande"
  config: {
    "body": "📦 Pour suivre votre commande, rendez-vous sur notre site avec votre numéro de commande.\n\nBesoin d'aide supplémentaire ?"
  }

Nœud 5 — MESSAGE
  label: "Réponse problème technique"
  config: {
    "body": "🔧 Pour un problème technique, essayez d'abord de redémarrer l'application.\n\nSi le problème persiste, je vous transfère à notre équipe technique."
  }

Nœud 6 — ESCALATE
  label: "Vers agent (demande directe)"
  config: {}

Nœud 7 — ESCALATE
  label: "Vers équipe technique"
  config: {}

Nœud 8 — QUESTION
  label: "Autre question ?"
  config: {
    "body": "Avez-vous une autre question ? (OUI / NON)"
  }

Nœud 9 — CONDITION
  config: {}

Nœud 10 — END
  label: "Fin"
  config: {}
```

**Arêtes** :

| Source | Cible | Condition | sortOrder |
|--------|-------|-----------|-----------|
| Nœud 1 | Nœud 2 | `always` | 0 |
| Nœud 2 | Nœud 3 | `always` | 0 |
| Nœud 3 | Nœud 4 | `message_equals` = `"1"` | 0 |
| Nœud 3 | Nœud 5 | `message_equals` = `"2"` | 1 |
| Nœud 3 | Nœud 6 | `message_equals` = `"3"` | 2 |
| Nœud 3 | Nœud 1 | `always` | 3 |
| Nœud 4 | Nœud 8 | `always` | 0 |
| Nœud 5 | Nœud 7 | `always` | 0 |
| Nœud 8 | Nœud 9 | `always` | 0 |
| Nœud 9 | Nœud 1 | `message_contains` = `"oui"` | 0 |
| Nœud 9 | Nœud 10 | `always` | 1 |

> **Branche fallback** : L'arête sortOrder=3 du Nœud 3 ramène au menu si le contact n'a pas tapé 1, 2 ou 3.

---

### CAS 6 — Qualification de lead (QUESTION en cascade)

**Objectif** : Collecter des informations structurées via plusieurs questions.

**Scénario** :
```
Contact envoie "démonstration" ou "demo"
→ Bot pose 3 questions (nom entreprise, taille, secteur)
→ Résume les informations et escalade à un commercial
```

**Triggers** :
```json
[
  {
    "triggerType": "KEYWORD",
    "isActive": true,
    "config": {
      "keywords": ["demo", "démonstration", "essai", "tester"]
    }
  }
]
```

**Nœuds** :

```
Nœud 1 — MESSAGE (entry point)
  config: {
    "body": "Excellent choix {contact_name} ! 🎯\nJe vais vous poser quelques questions pour préparer votre démonstration personnalisée.\n\nCela ne prendra que 2 minutes."
  }

Nœud 2 — QUESTION
  label: "Nom entreprise"
  config: {
    "body": "1️⃣ Quel est le nom de votre entreprise ?",
    "typingDelaySeconds": 1
  }

Nœud 3 — ACTION
  label: "Sauvegarder entreprise"
  config: {
    "actionType": "set_variable",
    "key": "company_name",
    "value": "{{ last_message_text }}"
  }

Nœud 4 — QUESTION
  label: "Taille de l'équipe"
  config: {
    "body": "2️⃣ Combien d'agents/commerciaux utiliseront la solution ?\n\n• *1* — Moins de 5\n• *2* — 5 à 20\n• *3* — Plus de 20"
  }

Nœud 5 — CONDITION
  label: "Analyse taille"
  config: {}

Nœud 6 — ACTION
  label: "Taille: petite"
  config: {
    "actionType": "set_variable",
    "key": "team_size",
    "value": "moins de 5"
  }

Nœud 7 — ACTION
  label: "Taille: moyenne"
  config: {
    "actionType": "set_variable",
    "key": "team_size",
    "value": "5 à 20"
  }

Nœud 8 — ACTION
  label: "Taille: grande"
  config: {
    "actionType": "set_variable",
    "key": "team_size",
    "value": "plus de 20"
  }

Nœud 9 — QUESTION
  label: "Secteur d'activité"
  config: {
    "body": "3️⃣ Quel est votre secteur d'activité ? (ex: E-commerce, Immobilier, Santé, Finance...)"
  }

Nœud 10 — ACTION
  label: "Sauvegarder secteur"
  config: {
    "actionType": "set_variable",
    "key": "sector",
    "value": "{session.last_message_text}"
  }

Nœud 11 — MESSAGE
  label: "Récapitulatif"
  config: {
    "body": "✅ *Récapitulatif de votre demande :*\n\n🏢 Entreprise : {session.company_name}\n👥 Équipe : {session.team_size}\n🏭 Secteur : {session.sector}\n\nUn commercial va vous contacter pour organiser votre démonstration personnalisée !"
  }

Nœud 12 — ESCALATE
  label: "Vers commercial"
  config: {}
```

**Arêtes** :

| Source | Cible | Condition | sortOrder |
|--------|-------|-----------|-----------|
| Nœud 1 | Nœud 2 | `always` | 0 |
| Nœud 2 | Nœud 3 | `always` | 0 |
| Nœud 3 | Nœud 4 | `always` | 0 |
| Nœud 4 | Nœud 5 | `always` | 0 |
| Nœud 5 | Nœud 6 | `message_equals` = `"1"` | 0 |
| Nœud 5 | Nœud 7 | `message_equals` = `"2"` | 1 |
| Nœud 5 | Nœud 8 | `always` | 2 |
| Nœud 6 | Nœud 9 | `always` | 0 |
| Nœud 7 | Nœud 9 | `always` | 0 |
| Nœud 8 | Nœud 9 | `always` | 0 |
| Nœud 9 | Nœud 10 | `always` | 0 |
| Nœud 10 | Nœud 11 | `always` | 0 |
| Nœud 11 | Nœud 12 | `always` | 0 |

> **Note sur `set_variable` avec la réponse** : Dans un nœud ACTION qui suit un nœud QUESTION, la variable `last_message_text` de session contient le dernier message tapé par le client. Vous pouvez la copier dans une autre variable : `"value": "{session.last_message_text}"`.

---

### CAS 7 — Notification d'assignation agent (ON_ASSIGN)

**Objectif** : Informer le client qu'un agent vient d'être assigné à sa conversation.

**Scénario** :
```
Admin assigne la conversation à Sophie Martin
→ Bot envoie automatiquement un message au client
→ L'agent prend ensuite la main manuellement
```

**Triggers** :
```json
[
  {
    "triggerType": "ON_ASSIGN",
    "isActive": true,
    "config": {}
  }
]
```

**Nœuds** :

```
Nœud 1 — MESSAGE (entry point)
  config: {
    "body": "Bonjour {contact_name} ! 👋\n\n{agent_name} vient d'être assigné(e) à votre conversation.\n\nElle vous répondra dans les plus brefs délais.",
    "typingDelaySeconds": 1
  }

Nœud 2 — END
  config: {}
```

**Arêtes** :

| Source | Cible | Condition | sortOrder |
|--------|-------|-----------|-----------|
| Nœud 1 | Nœud 2 | `always` | 0 |

> **Simple et efficace** — Ce flux ne fait qu'envoyer un message de notification puis se termine immédiatement pour laisser l'agent reprendre la main.

---

### CAS 8 — Relance client sans réponse (NO_RESPONSE)

**Objectif** : Relancer un client qui n'a pas reçu de réponse de l'agent depuis un certain temps.

**Scénario** :
```
Après 10 minutes sans réponse de l'agent
→ Bot envoie un message d'excuse et propose une alternative
→ Si client répond "urgent" → escalade prioritaire
→ Sinon → message de patience
```

**Triggers** :
```json
[
  {
    "triggerType": "NO_RESPONSE",
    "isActive": true,
    "config": {
      "timeoutSeconds": 600
    }
  }
]
```

> Ce trigger est évalué par un **job cron** (toutes les minutes). Précision ±1 minute.

**Nœuds** :

```
Nœud 1 — MESSAGE (entry point)
  config: {
    "body": "Bonjour {contact_name},\n\nNous nous excusons pour ce délai d'attente ({wait_minutes} min). Notre équipe est momentanément surchargée.\n\nEst-ce urgent ? (OUI / NON)"
  }

Nœud 2 — QUESTION
  config: {
    "body": "Tapez OUI si votre demande est urgente, NON sinon :"
  }

Nœud 3 — CONDITION
  config: {}

Nœud 4 — MESSAGE
  label: "Escalade urgente"
  config: {
    "body": "⚡ Votre demande est marquée comme urgente. Je vous transfère immédiatement à un superviseur."
  }

Nœud 5 — ESCALATE
  config: { "agentRef": null }

Nœud 6 — MESSAGE
  label: "Message de patience"
  config: {
    "body": "Merci pour votre patience {contact_name}. Un agent vous répondra dans les 15 prochaines minutes.\n\nNous vous remercions de votre compréhension. 🙏"
  }

Nœud 7 — END
  config: {}
```

**Arêtes** :

| Source | Cible | Condition | sortOrder |
|--------|-------|-----------|-----------|
| Nœud 1 | Nœud 2 | `always` | 0 |
| Nœud 2 | Nœud 3 | `always` | 0 |
| Nœud 3 | Nœud 4 | `message_contains` = `"oui"` | 0 |
| Nœud 3 | Nœud 6 | `always` | 1 |
| Nœud 4 | Nœud 5 | `always` | 0 |
| Nœud 6 | Nœud 7 | `always` | 0 |

---

### CAS 9 — Message d'attente en queue (QUEUE_WAIT)

**Objectif** : Rassurer un contact qui attend en file d'attente depuis trop longtemps.

**Scénario** :
```
Contact attend dans la queue depuis 3 minutes
→ Bot envoie un message d'attente estimé
→ Attend 5 minutes supplémentaires via WAIT
→ Si toujours en attente → second message
→ Escalade prioritaire
```

**Triggers** :
```json
[
  {
    "triggerType": "QUEUE_WAIT",
    "isActive": true,
    "config": {
      "waitSeconds": 180
    }
  }
]
```

**Nœuds** :

```
Nœud 1 — MESSAGE (entry point)
  config: {
    "body": "Bonjour {contact_name} ! ⏳\n\nVous êtes actuellement en file d'attente. Temps d'attente estimé : 5-10 minutes.\n\nMerci de patienter, un agent sera disponible très prochainement.",
    "typingDelaySeconds": 2
  }

Nœud 2 — WAIT
  label: "Attente 5 minutes"
  config: {
    "delaySeconds": 300
  }

Nœud 3 — MESSAGE
  label: "Deuxième message"
  config: {
    "body": "Nous vous remercions de votre patience {contact_name}. 🙏\n\nUn agent va prendre en charge votre conversation dans quelques instants."
  }

Nœud 4 — ESCALATE
  config: {}
```

**Arêtes** :

| Source | Cible | Condition | sortOrder |
|--------|-------|-----------|-----------|
| Nœud 1 | Nœud 2 | `always` | 0 |
| Nœud 2 | Nœud 3 | `always` | 0 |
| Nœud 3 | Nœud 4 | `always` | 0 |

> **Nœud WAIT** : Le flux se met en pause 5 minutes. Le contact peut envoyer des messages pendant ce temps sans déclencher un nouveau flux (la session est en `WAITING_DELAY`).

---

### CAS 10 — Inactivité prolongée (INACTIVITY)

**Objectif** : Détecter quand une conversation est abandonnée (ni agent, ni client n'a écrit depuis longtemps) et la fermer proprement.

**Triggers** :
```json
[
  {
    "triggerType": "INACTIVITY",
    "isActive": true,
    "config": {
      "inactivitySeconds": 7200
    }
  }
]
```

**Nœuds** :

```
Nœud 1 — QUESTION (entry point)
  config: {
    "body": "Bonjour {contact_name},\n\nVotre conversation semble inactive depuis un moment. Avez-vous encore besoin d'assistance ? (OUI / NON)"
  }

Nœud 2 — CONDITION
  config: {}

Nœud 3 — ESCALATE
  label: "Contact encore présent"
  config: {}

Nœud 4 — ACTION
  label: "Fermer conversation"
  config: {
    "actionType": "close_conversation"
  }

Nœud 5 — MESSAGE
  label: "Message de clôture"
  config: {
    "body": "Cette conversation a été clôturée faute d'activité. N'hésitez pas à nous recontacter. À bientôt ! 👋"
  }

Nœud 6 — END
  config: {}
```

**Arêtes** :

| Source | Cible | Condition | sortOrder |
|--------|-------|-----------|-----------|
| Nœud 1 | Nœud 2 | `always` | 0 |
| Nœud 2 | Nœud 3 | `message_contains` = `"oui"` | 0 |
| Nœud 2 | Nœud 4 | `always` | 1 |
| Nœud 4 | Nœud 5 | `always` | 0 |
| Nœud 5 | Nœud 6 | `always` | 0 |

---

### CAS 11 — Flux planifié (SCHEDULE)

**Objectif** : Envoyer un message récurrent à une heure précise (ex: rappel quotidien, bulletin hebdomadaire).

> ⚠️ **Attention** : Le trigger SCHEDULE est un cas particulier. Il ne s'applique pas à une conversation entrante, mais déclenche le flux sur toutes les conversations actives selon le cron. Utilisez avec précaution.

**Triggers** :
```json
[
  {
    "triggerType": "SCHEDULE",
    "isActive": true,
    "config": {
      "cronExpression": "0 9 * * 1-5"
    }
  }
]
```

> Le format cron : `minute heure jour mois jour_semaine`
> - `0 9 * * 1-5` = tous les jours de semaine à 9h00
> - `0 18 * * 5` = chaque vendredi à 18h00
> - `0 10 1 * *` = le 1er de chaque mois à 10h00

**Nœuds** :

```
Nœud 1 — MESSAGE (entry point)
  config: {
    "body": "Bonjour {contact_name} ! ☀️\n\nRappel : nous sommes disponibles jusqu'à 18h aujourd'hui ({current_date}).\n\nN'hésitez pas à nous contacter pour toute question."
  }

Nœud 2 — END
  config: {}
```

---

### CAS 12 — Test A/B de messages (AB_TEST)

**Objectif** : Tester deux versions d'un message d'accueil pour mesurer laquelle convertit le mieux.

**Scénario** :
```
70% des nouveaux contacts → Version A (message formel)
30% des nouveaux contacts → Version B (message décontracté)
Les deux finissent par une escalade
```

**Triggers** :
```json
[
  {
    "triggerType": "CONVERSATION_OPEN",
    "isActive": true,
    "config": {}
  }
]
```

**Nœuds** :

```
Nœud 1 — AB_TEST (entry point)
  isEntryPoint: true
  label: "Split A/B bienvenue"
  config: {}

Nœud 2 — MESSAGE
  label: "Version A — Formel"
  config: {
    "body": "Bonjour {contact_name},\n\nBienvenue. Notre équipe est à votre disposition pour répondre à vos questions.",
    "typingDelaySeconds": 1
  }

Nœud 3 — MESSAGE
  label: "Version B — Décontracté"
  config: {
    "body": "Salut {contact_name} ! 👋 Super de vous voir !\n\nOn est là pour vous aider, n'hésitez pas !",
    "typingDelaySeconds": 1
  }

Nœud 4 — ESCALATE
  label: "Vers agent"
  config: {}
```

**Arêtes** :

> Pour AB_TEST, le `conditionValue` contient le **poids** (nombre entier). La somme des poids donne la base de calcul.

| Source | Cible | conditionType | conditionValue (poids) | sortOrder |
|--------|-------|---------------|------------------------|-----------|
| Nœud 1 | Nœud 2 | `always` | `"70"` | 0 |
| Nœud 1 | Nœud 3 | `always` | `"30"` | 1 |
| Nœud 2 | Nœud 4 | `always` | — | 0 |
| Nœud 3 | Nœud 4 | `always` | — | 0 |

> L'onglet **Analytics** du FlowBuilder montre combien de sessions ont emprunté chaque branche.

---

### CAS 13 — Flux avec variables de session

**Objectif** : Démontrer l'utilisation avancée des variables pour personnaliser un flux entier.

**Scénario** :
```
Contact écrit "commande"
→ Bot demande le numéro de commande
→ Stocke en variable
→ Affiche un récapitulatif personnalisé
→ Propose des actions selon le statut
```

**Nœuds** :

```
Nœud 1 — MESSAGE (entry point)
  config: {
    "body": "Bonjour {contact_name} ! 📦\nJe vais vous aider avec votre commande.\n\nPouvez-vous me donner votre numéro de commande ?",
    "typingDelaySeconds": 2
  }

Nœud 2 — QUESTION
  label: "Numéro de commande"
  config: {
    "body": "Entrez votre numéro de commande (ex: CMD-12345) :"
  }

Nœud 3 — ACTION
  label: "Sauvegarder N° commande"
  config: {
    "actionType": "set_variable",
    "key": "order_id",
    "value": "{session.last_message_text}"
  }

Nœud 4 — QUESTION
  label: "Type de problème"
  config: {
    "body": "Commande *{session.order_id}* enregistrée.\n\nQuel est le problème ?\n1️⃣ Retard de livraison\n2️⃣ Article manquant\n3️⃣ Produit endommagé\n4️⃣ Autre"
  }

Nœud 5 — CONDITION
  config: {}

Nœud 6 — ACTION
  label: "Problème: retard"
  config: {
    "actionType": "set_variable",
    "key": "problem_type",
    "value": "retard_livraison"
  }

Nœud 7 — ACTION
  label: "Problème: manquant"
  config: {
    "actionType": "set_variable",
    "key": "problem_type",
    "value": "article_manquant"
  }

Nœud 8 — ACTION
  label: "Problème: endommagé"
  config: {
    "actionType": "set_variable",
    "key": "problem_type",
    "value": "produit_endommage"
  }

Nœud 9 — ACTION
  label: "Problème: autre"
  config: {
    "actionType": "set_variable",
    "key": "problem_type",
    "value": "autre"
  }

Nœud 10 — MESSAGE
  label: "Récapitulatif final"
  config: {
    "body": "✅ *Récapitulatif de votre demande :*\n\n📋 Commande : {session.order_id}\n🔍 Problème : {session.problem_type}\n👤 Contact : {contact_name}\n📅 Date : {current_date} à {current_time}\n\nVotre dossier a été créé. Un agent spécialisé prendra contact sous 24h."
  }

Nœud 11 — ESCALATE
  config: {}
```

**Arêtes** :

| Source | Cible | Condition | sortOrder |
|--------|-------|-----------|-----------|
| Nœud 1 | Nœud 2 | `always` | 0 |
| Nœud 2 | Nœud 3 | `always` | 0 |
| Nœud 3 | Nœud 4 | `always` | 0 |
| Nœud 4 | Nœud 5 | `always` | 0 |
| Nœud 5 | Nœud 6 | `message_equals` = `"1"` | 0 |
| Nœud 5 | Nœud 7 | `message_equals` = `"2"` | 1 |
| Nœud 5 | Nœud 8 | `message_equals` = `"3"` | 2 |
| Nœud 5 | Nœud 9 | `always` | 3 |
| Nœud 6 | Nœud 10 | `always` | 0 |
| Nœud 7 | Nœud 10 | `always` | 0 |
| Nœud 8 | Nœud 10 | `always` | 0 |
| Nœud 9 | Nœud 10 | `always` | 0 |
| Nœud 10 | Nœud 11 | `always` | 0 |

---

### CAS 14 — Canal spécifique (scopeChannelType)

**Objectif** : Avoir des flux différents selon le canal de communication.

**Configuration** :

```
Flux A : "Bienvenue WhatsApp"
  scopeChannelType: "whatsapp"
  priority: 15

Flux B : "Bienvenue Telegram"
  scopeChannelType: "telegram"
  priority: 15

Flux C : "Bienvenue générique"
  scopeChannelType: null  (tous canaux)
  priority: 5
```

Quand un contact écrit via WhatsApp → seul le Flux A est évalué.
Quand un contact écrit via Telegram → seul le Flux B est évalué.
Quand un contact écrit via Messenger → seul le Flux C est évalué.

> On peut aussi combiner avec **`message_equals`** `channel_type` dans les arêtes d'un nœud CONDITION pour gérer plusieurs canaux dans un seul flux.

**Arête avec condition `channel_type`** :
```
Source: CONDITION
  Edge 1: conditionType=channel_type, conditionValue="whatsapp", sortOrder=0 → Nœud WhatsApp
  Edge 2: conditionType=channel_type, conditionValue="telegram", sortOrder=1 → Nœud Telegram
  Edge 3: conditionType=always, sortOrder=2 → Nœud Générique
```

---

## 6. Règles importantes et pièges à éviter

### ✅ Règle 1 — Toujours un nœud d'entrée
Chaque flux doit avoir **exactement un nœud** avec `isEntryPoint: true`.  
Sans nœud d'entrée, la session est immédiatement annulée (`CANCELLED`).

### ✅ Règle 2 — Les nœuds MESSAGE et ACTION DOIVENT avoir une arête `always`
Ces nœuds continuent automatiquement via l'arête `always`. Sans cette arête, le flux s'arrête silencieusement (aucune escalade, session bloquée).

### ✅ Règle 3 — Les nœuds CONDITION DOIVENT avoir une arête de fallback
Ajoutez toujours une arête `always` en **dernière position** (sortOrder le plus élevé) comme filet de sécurité. Sans fallback, si aucune condition ne matche → escalade automatique.

### ✅ Règle 4 — Un seul nœud END ou ESCALATE suffit comme terminaison
Ne dupliquez pas les nœuds END — une seule terminaison par branche suffit. Les branches convergentes peuvent pointer vers le même nœud END.

### ⚠️ Règle 5 — Limite anti-boucle : 50 étapes
Un flux ne peut pas exécuter plus de 50 nœuds par session. Les boucles infinies (MESSAGE → CONDITION → MESSAGE → ...) déclenchent une escalade automatique après 50 étapes. Concevez vos flux pour avoir un chemin de terminaison garanti.

### ⚠️ Règle 6 — Session exclusive WAITING_REPLY
Quand une session est en `WAITING_REPLY`, **tous les messages du contact** sont consommés par ce flux. Le dispatcher ne voit rien. Si le client envoie 3 messages, seul le **premier** est utilisé pour évaluer les conditions — les autres sont ignorés.

### ⚠️ Règle 7 — Priorité des flux
Si deux flux actifs peuvent tous les deux se déclencher sur le même message (ex: deux flux avec `INBOUND_MESSAGE`), c'est le flux avec la **priorité la plus haute** qui démarre. Utilisez la priorité pour établir une hiérarchie claire :
- Priorité 50+ → Flux critiques (hors horaires, urgences)
- Priorité 20-49 → Flux spécifiques (keywords, FAQ)
- Priorité 1-19 → Flux génériques (bienvenue, accueil)
- Priorité 0 → Flux de dernier recours

### ⚠️ Règle 8 — QUESTION + CONDITION vs QUESTION + CONDITION directe
Après un nœud QUESTION, le prochain message du client est stocké dans `session.variables.last_message_text`. Vous pouvez :
- Mettre un nœud CONDITION directement après (l'arête `always` sert de pont)
- Ou directement mettre les conditions sur les arêtes sortantes du QUESTION (sans nœud CONDITION intermédiaire)

Les deux approches fonctionnent. La CONDITION explicite est plus lisible pour les flux complexes.

### ⚠️ Règle 9 — Triggers polling (NO_RESPONSE, QUEUE_WAIT, INACTIVITY)
Ces triggers ne sont **pas temps-réel**. Le job cron tourne toutes les minutes. Un `timeoutSeconds: 60` peut en réalité attendre jusqu'à 2 minutes. Ne pas configurer des valeurs inférieures à 60 secondes.

### ⚠️ Règle 10 — Variables `{session.last_message_text}` vs le texte du message
La variable `{session.last_message_text}` dans un nœud ACTION capture le dernier message du client. Elle est disponible seulement si le nœud précédent (ou un ancêtre) était un nœud QUESTION. Dans les nœuds MESSAGE et CONDITION, la variable interne `last_message_text` (sans le préfixe `session.`) est utilisée par les arêtes — mais vous pouvez l'utiliser dans les textes via `{session.last_message_text}`.

---

## 7. Référence complète

### Types de nœuds (FlowNodeType)

| Type | Config JSON | Arête sortante requise |
|------|-------------|------------------------|
| `MESSAGE` | `{ body, typingDelaySeconds?, mediaUrl? }` | `always` (obligatoire) |
| `QUESTION` | `{ body, typingDelaySeconds? }` | Conditions évaluées à la réponse |
| `CONDITION` | `{}` | N conditions + 1 fallback `always` |
| `ACTION` | `{ actionType, key?, value? }` | `always` (obligatoire) |
| `WAIT` | `{ delaySeconds }` | `always` (obligatoire) |
| `ESCALATE` | `{ agentRef? }` | Aucune (terminal) |
| `END` | `{}` | Aucune (terminal) |
| `AB_TEST` | `{}` | N arêtes avec poids dans `conditionValue` |

### Types de déclencheurs (FlowTriggerType)

| Type | Déclenchement | Config |
|------|---------------|--------|
| `INBOUND_MESSAGE` | Tout message entrant | `{}` |
| `CONVERSATION_OPEN` | Premier message du contact | `{}` |
| `CONVERSATION_REOPEN` | Conversation rouverte | `{}` |
| `OUT_OF_HOURS` | Message hors horaires | `{}` |
| `KEYWORD` | Message contient un mot-clé | `{ "keywords": ["mot1", "mot2"] }` |
| `ON_ASSIGN` | Agent assigné à la conversation | `{}` |
| `NO_RESPONSE` | Pas de réponse depuis N sec | `{ "timeoutSeconds": 300 }` |
| `QUEUE_WAIT` | En attente queue depuis N sec | `{ "waitSeconds": 120 }` |
| `INACTIVITY` | Aucune activité depuis N sec | `{ "inactivitySeconds": 3600 }` |
| `SCHEDULE` | Cron expression | `{ "cronExpression": "0 9 * * 1-5" }` |

### Types de conditions (FlowEdge.conditionType)

| Type | conditionValue | Évaluation | Négation possible |
|------|---------------|------------|-------------------|
| `always` | — | Toujours vrai | Non (inutile) |
| `message_contains` | Sous-chaîne | Contenu dans le message | Oui |
| `message_equals` | Texte exact | Message identique (casse ignorée) | Oui |
| `message_matches_regex` | Expression regex | Test regex (flag `i`) | Oui |
| `contact_is_new` | — | Contact jamais vu dans FlowBot | Oui |
| `channel_type` | `"whatsapp"` etc. | Canal de la conversation | Oui |
| `agent_assigned` | — | Agent assigné à la conversation | Oui |
| `variable_equals` | `"CLE=VALEUR"` | Variable de session vaut la valeur | Oui |

### Variables de template

| Variable | Description |
|----------|-------------|
| `{contact_name}` | Nom du contact |
| `{contact_phone}` | ID/numéro du contact |
| `{agent_name}` | Nom de l'agent assigné |
| `{current_time}` | Heure actuelle HH:MM |
| `{current_date}` | Date JJ/MM/AAAA |
| `{wait_minutes}` | Minutes depuis dernier message |
| `{session.CLE}` | Variable définie via ACTION `set_variable` |

### Statuts de session

| Statut | Terminal ? | Reprise |
|--------|-----------|---------|
| `ACTIVE` | Non | Automatique |
| `WAITING_REPLY` | Non | Au prochain message client |
| `WAITING_DELAY` | Non | Par job cron (WAIT) |
| `COMPLETED` | **Oui** | — |
| `ESCALATED` | **Oui** | — |
| `EXPIRED` | **Oui** | — |
| `CANCELLED` | **Oui** | — |

### Actions disponibles (nœud ACTION)

| actionType | Effet | key requis | value requis |
|-----------|-------|-----------|-------------|
| `set_variable` | Stocke une valeur en session | Oui (nom de la var) | Oui (valeur) |
| `mark_as_read` | Marque le message WhatsApp comme lu | Non | Non |
| `send_typing` | Envoie indicateur "en train d'écrire" | Non | Non |
| `set_contact_known` | Marque le contact comme connu (`isKnownContact = true`) | Non | Non |
| `close_conversation` | Ferme la conversation côté CRM | Non | Non |

---

*Documentation générée depuis l'analyse du code source. Pour toute question, voir les fichiers source dans `src/flowbot/`.*
