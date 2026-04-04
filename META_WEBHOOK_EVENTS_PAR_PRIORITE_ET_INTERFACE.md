# Événements Webhook Meta — Classement par Priorité et par Interface

> Ce fichier est un guide opérationnel dérivé du bilan complet (`META_WEBHOOK_EVENTS_BILAN.md`).
> Il classe chaque événement pertinent selon **où il doit être implémenté** et **quand**.
>
> **Interfaces concernées :**
> - 🛡️ **Admin** — Panel d'administration (`admin/`)
> - 💬 **Commercial** — Interface des agents commerciaux (`front/`)
> - ⚙️ **Backend** — Traitement serveur uniquement (`message_whatsapp/`)
> - 🔔 **Les deux** — Admin + Commercial

---

## État d'implémentation actuel (audit 2026-04-03)

| # | Événement | Statut | Notes |
|---|-----------|--------|-------|
| 1 | `account_update` | ❌ Non implémenté | |
| 2 | `business_status_update` | ❌ Non implémenté | |
| 3 | `failed` (codes d'erreur lisibles) | ⚠️ Partiel | Code en base, pas de traduction dans le frontend |
| 4 | `referral` | ❌ Non implémenté | |
| 5 | `phone_number_quality_update` | ❌ Non implémenté | |
| 6 | `account_alerts` | ❌ Non implémenté | |
| 7 | `message_template_status_update` | ⚠️ Souscrit mais ignoré | Souscrit dans `meta-token.service.ts` L229, handler absent |
| 8 | `calls` | ❌ Non implémenté | |
| 9 | `reaction` | ❌ Non implémenté | Instagram ignore explicitement les réactions (L31) |
| 10 | `user_preferences` | ❌ Non implémenté | |
| 11 | `system` (changement numéro) | ❌ Non implémenté | |
| 12 | `flows` | ❌ Non implémenté | |
| 13 | `message_template_quality_update` | ❌ Non implémenté | |
| 14 | Statuts visuels (✓ ✓✓ 🔵) | ✅ **Implémenté** | `ChatMessage.tsx` — was listed as missing, incorrect |
| 15 | `sticker` | ✅ **Implémenté** | `MetaAdapter.resolveMedia()` + `ChatMessage.tsx` — was listed as missing, incorrect |
| 16 | `contacts` | ❌ Non implémenté | |
| 17 | `unsupported` | ❌ Non implémenté | |

---

## Sommaire

- [🔴 CRITIQUE — Action immédiate](#-critique--action-immédiate)
- [🟠 HAUTE — Sprint suivant](#-haute--sprint-suivant)
- [🟡 MOYENNE — Backlog priorisé](#-moyenne--backlog-priorisé)
- [🟢 BASSE — Backlog futur](#-basse--backlog-futur)
- [⚪ NON PERTINENT — Ignorer](#-non-pertinent--ignorer)

---

## 🔴 CRITIQUE — Action immédiate

> Ces événements doivent être implémentés en premier. Leur absence crée des pannes silencieuses
> ou des pertes de données sans que personne ne soit averti.

---

### 1. `account_update` — Désactivation / restriction du compte Meta

**Champ webhook** : `account_update`
**Interface principale** : 🛡️ Admin
**Backend** : ⚙️ Oui (stocker + alerter)

**Ce que ça déclenche** :

| Événement Meta | Action Admin | Action Backend |
|---------------|--------------|----------------|
| `DISABLED_ACCOUNT` | 🔴 Bannière d'alerte critique visible sur toutes les pages admin | Email + notification push admin immédiate |
| `BANNED_ACCOUNT` | 🔴 Bannière d'alerte critique + blocage des envois | Email + notification push admin immédiate |
| `RESTRICTION_ADDED` | 🟠 Alerte orange dans le tableau de bord | Logger + notifier admin |
| `RESTRICTION_REMOVED` | ✅ Notification verte "Restriction levée" | Mettre à jour le statut en base |
| `VERIFIED_ACCOUNT` | ✅ Afficher le badge de vérification sur le canal | Mettre à jour le statut en base |

**Affichage Admin suggéré** :
```
┌─────────────────────────────────────────────────────────┐
│ 🔴 COMPTE META DÉSACTIVÉ                                │
│ Le canal "+213 XX XX XX XX" a été désactivé par Meta.   │
│ Les envois de messages sont bloqués.                    │
│ [Voir dans Meta Business Manager]                       │
└─────────────────────────────────────────────────────────┘
```

**Données à stocker en base** :
```sql
ALTER TABLE whapi_channels ADD COLUMN meta_account_status VARCHAR(32) DEFAULT 'ACTIVE';
ALTER TABLE whapi_channels ADD COLUMN meta_account_status_updated_at DATETIME;
```

---

### 2. `business_status_update` — Désactivation du Business Manager

**Champ webhook** : `business_status_update`
**Interface principale** : 🛡️ Admin
**Backend** : ⚙️ Oui (stocker + alerter)

**Ce que ça déclenche** :

| Statut Meta | Action Admin | Action Backend |
|-------------|--------------|----------------|
| `DISABLED` | 🔴 Bannière critique — TOUTES les intégrations Meta coupées (WA + IG + Messenger) | Bloquer tous les envois sortants Meta |
| `RESTRICTED` | 🟠 Alerte orange — fonctionnalités partiellement limitées | Logger + notifier |
| `ACTIVE` | ✅ Mettre à jour le statut | Débloquer les envois |

> ⚠️ Plus grave que `account_update` : un Business Manager désactivé coupe
> **toutes** les plateformes Meta simultanément (WhatsApp, Instagram, Messenger).

---

### 3. Statut `failed` — Erreurs de livraison lisibles pour l'agent commercial

**Champ webhook** : `messages` (déjà souscrit) → `statuses[].status === 'failed'`
**Interface principale** : 💬 Commercial
**Backend** : ⚙️ Mapper les codes en messages humains

**Ce qui manque actuellement** : Le code d'erreur est stocké en base mais l'agent commercial
voit juste "❌ Échec" sans savoir pourquoi.

**Affichage Commercial suggéré** :
```
┌──────────────────────────────────────────────────────────┐
│ ❌ Message non délivré                                   │
│ Raison : Fenêtre de 24h expirée.                        │
│ → Utilisez un template pour recontacter ce client.      │
└──────────────────────────────────────────────────────────┘
```

**Mapping des codes à implémenter côté frontend** :

| Code Meta | Message pour l'agent |
|-----------|---------------------|
| `131026` | "Ce numéro n'est pas sur WhatsApp" |
| `131047` | "Fenêtre 24h expirée — utilisez un template" |
| `131048` | "Message signalé comme spam par le destinataire" |
| `131051` | "Type de message non supporté par ce destinataire" |
| `131052` | "Le fichier média a expiré — renvoyez-le" |
| `130429` | "Limite de débit atteinte — réessayez dans quelques minutes" |
| `131000` | "Erreur Meta interne — réessayez" |

---

## 🟠 HAUTE — Sprint suivant

> Ces événements ont un fort impact métier. Leur absence crée des pertes d'information
> importantes ou des risques opérationnels.

---

### 4. `referral` — Origine publicitaire d'une conversation (Click-to-WhatsApp)

**Champ webhook** : `messages` (déjà souscrit) → propriété `referral` sur le 1er message
**Interface principale** : 🔔 Les deux (Admin pour stats, Commercial pour contexte)
**Backend** : ⚙️ Ajouter le champ dans `MetaMessageBase` + sauvegarder

**Ce que ça déclenche** :

**Côté Commercial — Contexte de la conversation** :
```
┌──────────────────────────────────────────────────────────┐
│ 📢 Ce client vient d'une publicité                      │
│ Campagne : "Offre spéciale Ramadan"                     │
│ Message pub : "Réponse garantie en moins de 2h"         │
└──────────────────────────────────────────────────────────┘
```
→ Affiché en haut de la fiche conversation (une seule fois, au premier message).

**Côté Admin — Statistiques ROI** :
- Tableau "Conversations par source" : Organique / Pub A / Pub B
- Taux de conversion par campagne publicitaire
- Nombre de ventes issues de chaque publicité

**Modification backend** :
```typescript
// src/whapi/interface/whatsapp-whebhook.interface.ts
export interface MetaMessageBase {
  from: string;
  id: string;
  timestamp: string;
  type: MetaMessageType;
  referral?: {             // ← AJOUTER
    source_url: string;
    source_type: 'ad' | 'post' | 'unknown';
    source_id: string;
    headline?: string;
    body?: string;
    media_type?: string;
    image_url?: string;
  };
}
```

---

### 5. `phone_number_quality_update` — Tier et qualité du numéro

**Champ webhook** : `phone_number_quality_update`
**Interface principale** : 🛡️ Admin
**Backend** : ⚙️ Stocker le tier + alerter

**Ce que ça déclenche** :

| Événement | Action Admin | Action Backend |
|-----------|--------------|----------------|
| Tier descend (`TIER_10K` → `TIER_1K`) | 🔴 Alerte rouge : "Capacité d'envoi réduite à 1 000 conversations/jour" | Logger + email admin |
| `FLAGGED` | 🟠 Alerte orange : "Numéro signalé — risque de restriction" | Logger + email admin |
| `UNFLAGGED` | ✅ Notification : "Qualité revenue à la normale" | Mettre à jour en base |
| Tier monte | ✅ Notification positive | Mettre à jour en base |

**Affichage Admin suggéré** (dans la page du canal) :
```
Canal WhatsApp +213 XX XX XX XX
├── Statut : ✅ Actif
├── Tier de messagerie : TIER_10K  (10 000 conversations/jour)
└── Qualité : 🟢 Bonne
```

---

### 6. `account_alerts` — Alertes préventives avant sanction

**Champ webhook** : `account_alerts`
**Interface principale** : 🛡️ Admin
**Backend** : ⚙️ Logger + alerter

**Ce que ça déclenche** :

| Sévérité | Action Admin |
|----------|-------------|
| `HIGH` | 🔴 Notification push + email immédiat — "Action requise sous 24h" |
| `MEDIUM` | 🟠 Badge d'avertissement dans le dashboard |
| `LOW` | 🟡 Entrée dans le journal des alertes |

**Affichage Admin — Centre de notifications** :
```
🔔 Alertes Meta (2 non lues)
├── 🔴 [HIGH] Compte signalé — taux de blocage en hausse   il y a 1h
└── 🟠 [MEDIUM] Numéro +213 XX approche de la limite TIER  il y a 3h
```

---

### 7. `message_template_status_update` — Statut des templates HSM

> ⚠️ **Audit 2026-04-03** : Ce webhook est déjà **souscrit** dans `meta-token.service.ts` (L229) mais **aucun handler n'existe** dans le contrôleur. Le payload arrive et est ignoré silencieusement.

**Champ webhook** : `message_template_status_update`
**Interface principale** : 🛡️ Admin
**Backend** : ⚙️ Bloquer l'envoi si template PAUSED/DISABLED

**Ce que ça déclenche** :

| Statut | Action Admin | Action Backend |
|--------|--------------|----------------|
| `APPROVED` | ✅ Template marqué "Actif" dans la liste | Déverrouiller l'utilisation |
| `REJECTED` | 🔴 Alerte + raison du rejet affichée | Bloquer l'utilisation |
| `PAUSED` | 🟠 Badge orange sur le template | **Stopper les MessageAuto qui l'utilisent** |
| `DISABLED` | 🔴 Badge rouge — template archivé | **Stopper les MessageAuto + alerter** |
| `FLAGGED` | 🟡 Badge jaune — sous surveillance | Loguer |

**Affichage Admin — Gestion des templates** :
```
Templates HSM
├── ✅ confirmation_rdv        [APPROVED]  🟢 Qualité : Bonne
├── 🟠 promo_ete               [PAUSED]    ⚠️ Signalé par les destinataires
└── 🔴 relance_client          [DISABLED]  ✖️ Désactivé par Meta
```

> ⚠️ Impact direct sur les `MessageAuto` : un template `PAUSED` fait échouer
> silencieusement tous les envois automatiques qui l'utilisent.

---

## 🟡 MOYENNE — Backlog priorisé

> Ces événements améliorent significativement l'expérience utilisateur
> ou la conformité, sans être bloquants à court terme.

---

### 8. `calls` — Appels WhatsApp manqués

**Champ webhook** : `calls`
**Interface principale** : 💬 Commercial + 🛡️ Admin (statistiques)
**Backend** : ⚙️ Créer une tâche de rappel

> Meta ne permet pas de recevoir/passer des appels via l'API — il notifie seulement
> qu'un appel a eu lieu. L'appel réel passe par l'infrastructure WhatsApp.

**Ce que ça déclenche** :

| Statut appel | Action Commercial | Action Admin |
|-------------|-------------------|--------------|
| `missed` | 🔔 Notification "📞 Appel manqué" sur la conversation + ticket de rappel | Compteur appels manqués / canal |
| `answered` | Entrée dans l'historique de la conversation | Statistiques durée d'appel |
| `ringing` | Indicateur "📞 En train d'appeler..." en temps réel | — |
| `hung_up` | Entrée dans l'historique | — |

**Affichage Commercial — Dans la conversation** :
```
📞 Appel manqué — aujourd'hui à 14h32
   [Créer une tâche de rappel]
```

**Affichage Admin — Tableau de bord** :
```
Appels manqués aujourd'hui : 7
Agents disponibles : 3/5
```

---

### 9. `reaction` — Réactions emoji sur les messages

**Champ webhook** : `messages` (déjà souscrit) → `type: "reaction"`
**Interface principale** : 💬 Commercial
**Backend** : ⚙️ Sauvegarder la réaction liée au message

**Ce que ça déclenche** :
- Le client pose un 👍 sur la réponse de l'agent → afficher l'emoji sous le message
- Le client retire la réaction (`emoji: ""`) → retirer l'affichage

**Affichage Commercial** (sous les messages concernés) :
```
Agent : "Votre commande est confirmée pour demain à 10h."
                                                        👍 1
```

**Valeur** : Signal d'approbation / désaccord sans que le client ait besoin d'écrire.
Permet à l'agent de savoir immédiatement si la réponse a été bien reçue.

---

### 10. `user_preferences` — Opt-in / Opt-out marketing (RGPD)

**Champ webhook** : `user_preferences`
**Interface principale** : 🛡️ Admin (conformité) + 💬 Commercial (info sur le contact)
**Backend** : ⚙️ Bloquer l'envoi de templates MARKETING aux clients opt-out

**Ce que ça déclenche** :

| Préférence | Action Backend | Action Commercial | Action Admin |
|-----------|---------------|-------------------|--------------|
| `marketing_opt_in: false` | Bloquer les templates `MARKETING` pour ce contact | Afficher "🚫 Ne souhaite pas recevoir de marketing" sur la fiche | Compteur opt-out |
| `messaging_opt_in: false` | Bloquer TOUS les messages initiés | Afficher "🚫 Contact injoignable" | Alerte si contact opt-out total |

**Affichage Commercial — Fiche contact** :
```
Jean Dupont — +213 XX XX XX XX
├── 📧 Opt-in messages : ✅
└── 📢 Opt-in marketing : 🚫 Refusé le 15/03/2026
```

> ⚠️ Envoyer des templates `MARKETING` à un contact opt-out peut entraîner
> des signalements et dégrader la qualité du numéro.

---

### 11. `message_template_quality_update` — Score de qualité des templates

**Champ webhook** : `message_template_quality_update`
**Interface principale** : 🛡️ Admin
**Backend** : ⚙️ Logger + alerter si RED

**Ce que ça déclenche** :

| Score | Action Admin |
|-------|-------------|
| `GREEN` → `YELLOW` | 🟡 Alerte : "Template *[nom]* sous surveillance — réduire l'envoi" |
| `GREEN` → `RED` | 🔴 Alerte urgente : "Template *[nom]* à risque de suspension" |
| `RED` → `GREEN` | ✅ Notification : "Qualité du template *[nom]* rétablie" |

**Affichage Admin — Détail du template** :
```
Template : confirmation_rdv
├── Statut : ✅ APPROVED
├── Score qualité : 🟡 YELLOW  ← En hausse depuis 3 jours
├── Taux de signalement : 2.3%  (seuil dangereux : 3%)
└── ⚠️ Action recommandée : Réviser le contenu du template
```

---

### 12. `system` (dans `messages`) — Changement de numéro client

**Champ webhook** : `messages` (déjà souscrit) → `type: "system"`, `system.type: "user_changed_number"`
**Interface principale** : 🛡️ Admin + 💬 Commercial (notification dans la conversation)
**Backend** : ⚙️ Lier les conversations de l'ancien vers le nouveau numéro

**Ce que ça déclenche** :

**Côté Commercial — Dans la conversation** :
```
⚙️ Ce contact a changé de numéro WhatsApp.
   Ancien : +213 50 XXX XXX
   Nouveau : +213 55 XXX XXX
   [Mettre à jour le contact]
```

**Côté Backend** :
- Créer une liaison entre l'ancien et le nouveau `chat_id` en base
- Optionnel : fusionner l'historique des deux numéros

---

### 13. `flows` — WhatsApp Flows (formulaires natifs)

**Champ webhook** : `flows` (statut du flow) + réponses via `messages` → `interactive.type: "nfm_reply"`
**Interface principale** : 🛡️ Admin (gestion des flows) + ⚙️ Backend (traiter les réponses)

**Ce que ça déclenche** :

**Côté Commercial — Réponse à un Flow reçue** :
```
📋 Formulaire rempli par le client
├── Prénom : Ahmed
├── Disponibilité : Lundi 14h ou Mercredi 10h
└── Objet : Demande de devis
   [Voir le formulaire complet]
```

**Côté Admin — Gestion des flows** :
```
Flows actifs
├── ✅ qualification_lead     [PUBLISHED]
├── 🟠 prise_rdv              [THROTTLED]  ← Limité par Meta
└── 🔴 satisfaction_client    [BLOCKED]    ← Bloqué par Meta
```

**Cas d'usage concrets pour cette app** :
- Qualification du lead (nom, besoin, budget) → remplace 5 messages texte
- Sélection de créneau RDV → remplace un échange allers-retours
- Questionnaire de satisfaction post-conversation

---

### 14. Progression visuelle des statuts

> ✅ **Audit 2026-04-03 : DÉJÀ IMPLÉMENTÉ** — Ce point était listé comme "ce qui manque" dans la version précédente. L'implémentation est en place.

**Champ webhook** : `messages` (déjà souscrit) → `statuses[]`
**Interface principale** : 💬 Commercial
**Backend** : ✅ Déjà en base
**Frontend** : ✅ `ChatMessage.tsx` affiche la progression complète : sending → ✓ → ✓✓ (grises) → ✓✓ (bleues) → ❌

**Affichage Commercial actuel** :
```
"Votre commande est prête"     ✓      (envoyé)
"N'hésitez pas à nous appeler" ✓✓     (délivré, coches grises)
"Bonne journée !"              ✓✓🔵   (lu, coches bleues)
```

---

## 🟢 BASSE — Backlog futur

> Améliorations cosmétiques ou cas d'usage secondaires.
> À implémenter quand les priorités plus hautes sont terminées.

---

### 15. `sticker` — Afficher les stickers WhatsApp

> ✅ **Audit 2026-04-03 : DÉJÀ IMPLÉMENTÉ** — Ce point était listé comme "à implémenter" dans la version précédente. L'implémentation est en place.

**Champ webhook** : `messages` (déjà souscrit) → `type: "sticker"`
**Interface principale** : 💬 Commercial
**État** : ✅ `MetaAdapter.resolveMedia()` mappe le type `sticker`, `ChatMessage.tsx` l'affiche comme image WebP.

---

### 16. `contacts` — Afficher les fiches de contact partagées

**Champ webhook** : `messages` (déjà souscrit) → `type: "contacts"`
**Interface principale** : 💬 Commercial
**Effort** : Faible

**Affichage Commercial** :
```
👤 Jean Dupont
   📱 +33 6 12 34 56 78
   [Copier le numéro]
```

---

### 17. `unsupported` — Placeholder pour types non supportés

**Champ webhook** : `messages` (déjà souscrit) → `type: "unsupported"`
**Interface principale** : 💬 Commercial
**Effort** : Très faible — remplacer "type inconnu" par un message explicite

**Affichage Commercial** :
```
⚠️ Type de message non supporté par cette interface.
   Ouvrez WhatsApp pour voir ce message.
```

---

### 18. `message_template_components_update` + `template_category_update`

**Interface principale** : 🛡️ Admin (alertes financières)
**Ce que ça déclenche** :
- Template recatégorisé `UTILITY` → `MARKETING` : coût d'envoi plus élevé
- Afficher dans l'admin : "⚠️ Recatégorisation détectée — vérifiez la facturation"

---

### 19. `message_echoes` — Audit des messages sortants

**Interface principale** : 🛡️ Admin (audit log)
**Pertinent si** : Plusieurs systèmes envoient des messages au même numéro
(ex: votre app + quelqu'un qui envoie directement depuis le dashboard Meta).

---

### 20. `tracking_events` — Analytics publicitaires avancées

**Interface principale** : 🛡️ Admin (tableaux de bord marketing)
**Ce que ça ajoute** : Complète les données `referral` avec le suivi post-conversation
(clics, conversions) pour un tunnel publicitaire complet.

---

### 21. `history` — Récupération de l'historique lors d'une migration

**Interface principale** : 🛡️ Admin (outil de migration)
**Pertinent uniquement lors de** : migration d'un numéro ou onboarding d'un client
ayant des conversations existantes.

---

## ⚪ NON PERTINENT — Ignorer pour cette application

Ces champs ne correspondent pas au modèle métier actuel (plateforme multi-agents B2B).

| Champ | Raison |
|-------|--------|
| `group_lifecycle_update` | Les groupes sont filtrés dans l'app |
| `group_participants_update` | Idem |
| `group_settings_update` | Idem |
| `group_status_update` | Idem |
| `messaging_handovers` | Pas de bot concurrent dans l'architecture actuelle |
| `smb_message_echoes` | Doublon de `message_echoes` (version PME) |
| `smb_app_state_sync` | Spécifique PME, non pertinent |
| `partner_solutions` | Réservé aux BSPs (partenaires officiels Meta) |
| `payment_configuration_update` | WhatsApp Pay non disponible dans les marchés cibles |
| `security` | Réservé aux partenaires Meta officiels |
| `account_settings_update` | Changements trop rares pour justifier un webhook |
| `business_capability_update` | Pertinent uniquement si multi-WABA |
| `automatic_events` | Événements automatiques sans action requise |
| `phone_number_name_update` | Changement de nom peu fréquent, opérationnel |
| `account_review_update` | Utile seulement si soumissions de révision fréquentes |

---

## Récapitulatif visuel par interface

### 🛡️ Panel Admin — Ce qu'il faut implémenter

```
PRIORITÉ CRITIQUE
├── account_update              → Bannière désactivation/restriction compte
└── business_status_update      → Bannière désactivation Business Manager

PRIORITÉ HAUTE
├── phone_number_quality_update → Tier actuel + alertes qualité numéro
├── account_alerts              → Centre de notifications Meta
└── message_template_status_update → Tableau de bord templates (statut + blocage auto)

PRIORITÉ MOYENNE
├── user_preferences            → Compteur opt-out + conformité RGPD
├── message_template_quality_update → Score qualité par template
└── flows                       → Gestion des WhatsApp Flows

PRIORITÉ BASSE
├── message_template_components_update → Alertes recatégorisation (coût)
├── template_category_update    → Alertes changement catégorie
├── message_echoes              → Audit log des envois
├── tracking_events             → Dashboard ROI publicitaire
└── history                     → Outil de migration
```

### 💬 Interface Commerciale — Ce qu'il faut implémenter

```
PRIORITÉ CRITIQUE
└── failed status (codes d'erreur lisibles) → "Fenêtre 24h expirée" etc.

PRIORITÉ HAUTE
└── referral                    → Bannière origine pub dans la conversation

PRIORITÉ MOYENNE
├── calls (appels manqués)      → Notification + bouton "Créer rappel"
├── reaction                    → Emoji sous les messages
├── system (changement numéro)  → Notification dans la conversation
└── flows (réponses nfm_reply)  → Affichage formulaire rempli

PRIORITÉ BASSE (UX)
├── Statuts visuels (✓ ✓✓ 🔵)  → Indicateurs de lecture sous les messages
├── sticker                     → Afficher l'image WebP
├── contacts                    → Afficher la fiche contact
└── unsupported                 → Placeholder "Message non supporté"
```

### ⚙️ Backend uniquement — Sans affichage direct

```
PRIORITÉ CRITIQUE
└── account_update/business_status_update → Bloquer les envois si compte désactivé

PRIORITÉ HAUTE
├── referral                    → Sauvegarder source_url, source_id, headline en base
└── message_template_status_update → Bloquer MessageAuto si template PAUSED/DISABLED

PRIORITÉ MOYENNE
├── user_preferences            → Bloquer templates MARKETING pour opt-out
└── system (user_changed_number) → Lier ancien/nouveau numéro en base
```

---

*Dérivé de `META_WEBHOOK_EVENTS_BILAN.md` — mis à jour 2026-04-03 (audit complet du code)*
