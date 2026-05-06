# Plan — Templates Meta HSM : création, validation et paramétrage relances

**Date :** 2026-05-06  
**Périmètre :**
1. L'admin crée et gère les templates depuis la plateforme (basés sur les modèles fournis par Meta)
2. L'admin soumet les templates à Meta pour validation et reçoit le résultat
3. L'admin peut prévisualiser un template avant soumission
4. Tout message sortant hors fenêtre de 24h est forcé en template
5. L'envoi automatique de templates pour les relances est **paramétrable par l'admin** (désactivé par défaut)

---

## État des lieux

### Ce qui existe déjà

| Composant | État |
|-----------|------|
| Entité `WhatsappTemplate` (DB1) | Existe — champs de base présents |
| `WhatsappTemplateService` — CRUD local | Existe |
| Endpoints admin `GET/POST/DELETE /admin/templates` | Existent |
| `CommunicationMetaService.sendTemplateMessage()` | Opérationnel |
| `OutboundRouterService.sendTemplateMessage()` | Opérationnel |
| Webhook handler `template-status.handler.ts` | Partiel |
| `last_client_message_at` dans `WhatsappChat` | Existe |

### Ce qui manque

| Manque | Impact |
|--------|--------|
| Modèles de base Meta proposés à la création | Admin crée dans le vide sans structure guidée |
| Soumission du template à Meta API depuis le backend | Templates jamais envoyés à Meta |
| Réception et affichage du résultat de validation | Admin ne sait pas si son template est approuvé |
| Aperçu du rendu avant soumission | Impossible de vérifier le rendu |
| Tracking fenêtre 24h Meta | Pas de gate texte libre / template |
| Gate dans `OutboundRouterService` hors fenêtre | Messages texte envoyés même si fenêtre expirée |
| Paramètre admin "relances automatiques" | Envoi auto non contrôlable |
| Mapping `FollowUpType → template` configurable | Aucun lien entre relance et template |

---

## Epic 1 — Gestion des templates depuis l'admin

### Principe

L'admin crée un template en choisissant d'abord un **modèle de base fourni par Meta** (structure prédéfinie selon la catégorie), puis remplit le contenu, prévisualise et soumet à Meta.

Meta propose ces structures de base :

| Modèle de base | Catégorie | Composants inclus |
|----------------|-----------|-------------------|
| Texte simple | UTILITY / MARKETING | Body uniquement |
| Texte + bouton CTA | MARKETING | Body + bouton lien URL |
| Texte + bouton appel | MARKETING | Body + bouton appel téléphonique |
| Image + texte | MARKETING | Header image + Body |
| Vidéo + texte | MARKETING | Header vidéo + Body |
| Document + texte | UTILITY | Header document + Body |
| Texte + réponses rapides | MARKETING | Body + boutons quick reply |
| OTP / Code | AUTHENTICATION | Body avec code uniquement |

---

### US1.1 — Migration : enrichissement de l'entité WhatsappTemplate

**Migration à créer :** `AddTemplateMetaSubmitFields<timestamp>`

Colonnes à ajouter sur `whatsapp_template` :

| Colonne | Type | Description |
|---------|------|-------------|
| `base_model` | varchar(50) nullable | Modèle de base choisi (ex: `text_simple`, `image_body`, `text_cta`) |
| `header_text` | varchar(60) nullable | Texte du header si `header_type = TEXT` |
| `header_example` | varchar(255) nullable | URL exemple si header image/vidéo/document |
| `body_example_variables` | json nullable | Variables sample pour Meta : `["Prénom", "valeur2"]` |
| `submitted_at` | datetime nullable | Date de soumission à Meta |
| `submission_error` | text nullable | Message d'erreur retourné par Meta |
| `rejected_reason` | varchar(255) nullable | Motif de rejet (déjà présent ? sinon à ajouter) |

**Fichiers :** `src/database/migrations/`, `src/whatsapp-template/entities/whatsapp-template.entity.ts`

---

### US1.2 — Endpoint : liste des modèles de base disponibles

**Objectif :** Fournir à l'UI admin la liste des modèles de base pour guider la création.

**Nouvel endpoint :** `GET /admin/templates/base-models`

Retourne un tableau statique (pas de BDD) :

```json
[
  {
    "key": "text_simple",
    "label": "Texte simple",
    "category": "UTILITY",
    "components": ["BODY"]
  },
  {
    "key": "text_cta",
    "label": "Texte + bouton lien",
    "category": "MARKETING",
    "components": ["BODY", "BUTTONS_URL"]
  },
  {
    "key": "image_body",
    "label": "Image + texte",
    "category": "MARKETING",
    "components": ["HEADER_IMAGE", "BODY"]
  }
  ...
]
```

**Fichier :** `src/whatsapp-template/whatsapp-template.controller.ts`

---

### US1.3 — Endpoint : modification d'un template

**Objectif :** Permettre à l'admin de modifier un template tant qu'il n'est pas encore soumis ou après un rejet.

**Règle métier :**
- Modification autorisée si `status = PENDING` et `submitted_at IS NULL`
- Modification autorisée si `status = REJECTED` (pour corriger et re-soumettre)
- Modification bloquée si `status = APPROVED`, `PAUSED`, `DISABLED`

**Endpoint existant à enrichir :** `PUT /admin/templates/:id`  
Ajouter la validation du statut avant mise à jour.

**Fichier :** `src/whatsapp-template/whatsapp-template.service.ts`

---

### US1.4 — Service : soumission du template à Meta

**Objectif :** Envoyer le template à Meta pour validation depuis le backend.

**Nouveau endpoint :** `POST /admin/templates/:id/submit`

**Logique dans `WhatsappTemplateService.submitToMeta(id)` :**

```
1. Charger le template
2. Vérifier que status = PENDING et submitted_at IS NULL
   (ou status = REJECTED pour re-soumission)
3. Charger le canal lié (channel_id) → external_id = waba_id, token
4. Construire le payload Meta :
   POST https://graph.facebook.com/v22.0/{waba_id}/message_templates
   {
     "name": template.name,
     "language": template.language,
     "category": template.category,
     "components": [
       { "type": "HEADER", "format": "TEXT"|"IMAGE"|"VIDEO"|"DOCUMENT", ... },
       { "type": "BODY",   "text": body_text,
         "example": { "body_text": [body_example_variables] }
       },
       { "type": "FOOTER", "text": footer_text },
       { "type": "BUTTONS", "buttons": [...] }
     ]
   }
5. Si succès Meta :
   → Sauvegarder meta_template_id retourné
   → submitted_at = NOW()
   → status = PENDING (Meta traitera en async via webhook)
6. Si erreur Meta :
   → submission_error = message d'erreur
   → status reste PENDING (admin peut corriger et re-soumettre)
```

**Fichiers :** `src/whatsapp-template/whatsapp-template.service.ts`, `src/whatsapp-template/whatsapp-template.controller.ts`

---

### US1.5 — Webhook : réception du résultat de validation Meta

**Objectif :** Mettre à jour automatiquement le statut du template quand Meta répond.

**Améliorations sur `template-status.handler.ts` :**

1. **Idempotence** — ne pas retraiter si le statut est déjà à jour
2. **Sauvegarde du motif** — stocker `rejected_reason` si `event = REJECTED`
3. **Notification admin** — émettre un événement SSE ou marquer un flag `notification_unread = true` pour que l'UI admin affiche une alerte

**Webhook Meta reçu :**
```json
{
  "event": "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED",
  "message_template_name": "relance_sans_reponse",
  "message_template_id": 123456789,
  "reason": "..." // présent si REJECTED
}
```

**Fichier :** `src/webhooks/adapters/meta-event-handlers/template-status.handler.ts`

---

### US1.6 — UI admin : gestion complète des templates

**Fichier :** `admin/src/app/ui/templates/TemplatesView.tsx`

**Écran de liste :**
- Tableau avec colonnes : nom, catégorie, langue, statut (badge coloré), date soumission, actions
- Statuts et couleurs : PENDING (gris), APPROVED (vert), REJECTED (rouge), PAUSED (orange)
- Boutons par ligne : Modifier (si éditable), Soumettre à Meta (si non soumis), Aperçu, Supprimer

**Écran de création / modification :**
1. **Étape 1** : Choisir un modèle de base (grille de cartes avec icône + description)
2. **Étape 2** : Remplir le contenu selon le modèle choisi :
   - Nom du template (snake_case, lettres et underscores uniquement — règle Meta)
   - Langue (fr, en, etc.)
   - Contenu header si applicable (texte ou URL exemple)
   - Body (avec variables `{{1}}`, `{{2}}`...)
   - Variables exemple pour chaque `{{n}}`
   - Footer (optionnel)
   - Boutons (si modèle avec boutons)
3. **Aperçu** en temps réel à droite (bulle WhatsApp avec variables remplacées par les exemples)
4. Bouton "Enregistrer" → status PENDING, pas encore soumis
5. Bouton "Soumettre à Meta" → appelle `POST /admin/templates/:id/submit`

**Composant aperçu :** `admin/src/app/ui/templates/TemplatePreview.tsx`
- Rendu style bulle WhatsApp
- Header (image placeholder ou texte)
- Body avec variables remplacées par les exemples
- Footer grisé
- Boutons cliquables visuellement (non fonctionnels)

---

## Epic 2 — Gate 24h Meta : messages hors fenêtre → templates uniquement

### US2.1 — Migration : tracking fenêtre 24h sur WhatsappChat

**Migration :** Ajouter `customer_window_expires_at DATETIME NULL` sur `whatsapp_chat`

**Mise à jour automatique** dans le service qui traite les messages entrants :
```typescript
chat.customerWindowExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
```

**Fichiers :** migration + service messages entrants (webhook)

---

### US2.2 — Gate dans OutboundRouterService

**Logique à ajouter dans `sendTextMessage()` :**

```
Si canal provider = 'meta' :
  Si customer_window_expires_at IS NULL OU < NOW() :
    Lever BadRequestException('META_WINDOW_EXPIRED')
```

Les envois via `sendTemplateMessage()` ne sont jamais bloqués.

**Fichier :** `src/communication_whapi/outbound-router.service.ts`

---

### US2.3 — UI commercial : sélecteur de template quand fenêtre expirée

**Comportement dans l'interface chat :**
- Si fenêtre expirée → zone de saisie texte désactivée
- Bandeau : *"Fenêtre 24h expirée — utilisez un template pour reprendre contact"*
- Bouton "Envoyer un template" → ouvre `TemplateSelectorModal`

**`TemplateSelectorModal` :**
- Liste les templates APPROVED du canal
- Pour chaque template : aperçu du body + champs de saisie des variables
- Bouton "Envoyer"

**Fichiers :** `front/src/components/chat/ChatInput.tsx`, nouveau `front/src/components/chat/TemplateSelectorModal.tsx`

---

## Epic 3 — Paramétrage des relances automatiques (désactivé par défaut)

### Principe

L'envoi automatique d'un template WhatsApp au client lors d'une relance est **optionnel et configurable** par l'admin. Par défaut, une relance notifie uniquement le commercial (comportement actuel). L'admin peut activer l'envoi automatique et définir quel template utiliser par type de relance.

---

### US3.1 — Paramètre global : activation des relances automatiques

**Nouvel endpoint admin :** `GET/PUT /admin/settings/auto-relance`

**Paramètre en base** (table `platform_settings` ou équivalent) :

| Clé | Type | Défaut | Description |
|-----|------|--------|-------------|
| `auto_relance_enabled` | boolean | `false` | Active/désactive l'envoi automatique |

**Comportement dans `FollowUpReminderService` :**
- Si `auto_relance_enabled = false` → comportement actuel conservé (notification commercial uniquement)
- Si `auto_relance_enabled = true` → envoi du template au client si mapping configuré

---

### US3.2 — Mapping FollowUpType → template (configurable par l'admin)

**Nouvelle entité `follow_up_template_mapping` :**

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | PK |
| `follow_up_type` | enum (FollowUpType) | Type de relance |
| `template_id` | UUID (FK → whatsapp_template) | Template à utiliser |
| `active` | tinyint | 1 = actif |
| `created_at` / `updated_at` | timestamp | |

**Contrainte :** un seul mapping actif par `follow_up_type`.

**Endpoints admin :**
- `GET /admin/follow-up-template-mappings` — liste des mappings
- `PUT /admin/follow-up-template-mappings/:follow_up_type` — associer un template à un type
- `DELETE /admin/follow-up-template-mappings/:follow_up_type` — supprimer l'association

**UI admin :** tableau avec une ligne par type de relance, colonne "Template associé" (dropdown templates APPROVED), toggle "Actif".

**Fichiers :** nouvelle entité + service + controller dans `src/follow-up/`

---

### US3.3 — Envoi conditionnel du template dans FollowUpReminderService

**Logique :**

```
Pour chaque relance due :
  Si auto_relance_enabled = true :
    Chercher mapping actif pour follow_up.type
    Si mapping trouvé et template APPROVED :
      Récupérer numéro client (contact.phone ou chat.chat_id)
      Récupérer channel Meta actif du poste
      OutboundRouterService.sendTemplateMessage({...})
      Enregistrer provider_message_id sur la relance
  Toujours :
    Notifier le commercial (toast WebSocket — comportement actuel)
    reminded_at = NOW()
```

**Anti-doublon :** ne pas envoyer si `last_template_sent_at > NOW() - 24h`

**Migration :** ajouter `last_template_sent_at DATETIME NULL` et `template_provider_message_id VARCHAR(100) NULL` sur `follow_up`

**Fichier :** `src/follow-up/follow_up_reminder.service.ts`

---

## Récapitulatif des sprints

### Sprint 1 — Templates (P0) — fonctionnalité principale

| ID | Tâche | Fichier(s) |
|----|-------|-----------|
| T1.1 | Migration enrichissement `whatsapp_template` | `migrations/` + entity |
| T1.2 | Endpoint `GET /admin/templates/base-models` | controller |
| T1.3 | Validation modification selon statut (`PUT /admin/templates/:id`) | service + controller |
| T1.4 | Service `submitToMeta()` + endpoint `POST /admin/templates/:id/submit` | service + controller |
| T1.5 | Webhook handler idempotent + `rejected_reason` | `template-status.handler.ts` |
| T1.6 | Composant `TemplatePreview` (aperçu bulle WhatsApp) | `admin/.../TemplatePreview.tsx` |
| T1.7 | Page `TemplatesView` (liste + création guidée par modèle + aperçu live) | `admin/.../TemplatesView.tsx` |

### Sprint 2 — Gate 24h (P1)

| ID | Tâche | Fichier(s) |
|----|-------|-----------|
| T2.1 | Migration `customer_window_expires_at` sur `whatsapp_chat` | `migrations/` + entity |
| T2.2 | Mise à jour `customer_window_expires_at` à chaque message entrant | service webhook |
| T2.3 | Gate `META_WINDOW_EXPIRED` dans `OutboundRouterService` | `outbound-router.service.ts` |
| T2.4 | Indicateur fenêtre + `TemplateSelectorModal` dans l'UI commercial | `ChatInput.tsx` + modal |

### Sprint 3 — Relances paramétrables (P2)

| ID | Tâche | Fichier(s) |
|----|-------|-----------|
| T3.1 | Paramètre `auto_relance_enabled` (settings) + endpoint admin | `platform_settings` / service |
| T3.2 | Entité + migration `follow_up_template_mapping` | `migrations/` + entité |
| T3.3 | Endpoints admin mapping FollowUpType → template + UI admin | service + controller + UI |
| T3.4 | Migration `last_template_sent_at` + `template_provider_message_id` sur `follow_up` | `migrations/` + entity |
| T3.5 | Envoi conditionnel dans `FollowUpReminderService` | `follow_up_reminder.service.ts` |

---

## Flux cible

```
[Admin — Sprint 1]
  Choisit modèle de base → Remplit body/header/variables → Aperçu en direct
  → Enregistre (status=PENDING)
  → Clique "Soumettre à Meta"
  → Backend : POST graph.facebook.com/{waba_id}/message_templates
  → Meta répond en async via webhook → status = APPROVED / REJECTED
  → Admin voit le résultat dans l'interface (badge + motif si rejet)

[Commercial — Sprint 2]
  Ouvre une conversation avec fenêtre expirée
  → Zone de saisie désactivée + bandeau "Fenêtre expirée"
  → Ouvre TemplateSelectorModal → Choisit template → Renseigne variables → Envoie

[Admin active les relances auto — Sprint 3]
  Active "Relances automatiques" dans les paramètres
  → Configure : relance_sans_reponse → template "relance_sans_reponse_fr"
  → FollowUpReminderService détecte relance due :
       Si auto_relance_enabled → envoie template au client
       Toujours → notifie le commercial par toast
```

---

## Points de vigilance

| Risque | Mitigation |
|--------|-----------|
| Nom de template invalide (Meta n'accepte que snake_case) | Validation côté formulaire admin + message d'erreur clair |
| Template rejeté par Meta | Afficher motif + permettre modification et re-soumission |
| Variables manquantes à l'envoi | Vérifier que tous les `{{n}}` ont une valeur avant envoi |
| Doublon d'envoi si cron relance | Guard `last_template_sent_at < NOW() - 24h` |
| Token Meta expiré | `MetaTokenService.refreshExpiringTokens()` déjà en place |
