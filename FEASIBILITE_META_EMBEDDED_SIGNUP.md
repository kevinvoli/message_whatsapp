# Faisabilité — Meta Embedded Signup (Option 2)
## Connexion automatique de canaux WhatsApp Business via OAuth Meta

**Version** : 1.0
**Date** : Mars 2026
**Statut** : Document de faisabilité — base pour cahier des charges

---

## 1. Objectif

Permettre à un administrateur d'ajouter un nouveau numéro WhatsApp Business **directement depuis le panel admin**, sans manipulation manuelle de tokens ni de `phone_number_id`, via le flux OAuth officiel de Meta (Embedded Signup).

### Résultat attendu
Quand un admin clique "Connecter un numéro WhatsApp" :
1. Une popup Facebook Login s'ouvre
2. L'utilisateur connecte son compte Meta Business
3. Il sélectionne son WhatsApp Business Account (WABA)
4. Le système récupère automatiquement les numéros de téléphone disponibles
5. Le canal est créé en base de données, prêt à envoyer/recevoir des messages

---

## 2. Contexte technique du projet existant

### Architecture actuelle
```
admin/          → Next.js 16 / React 19 (panel admin)
message_whatsapp/ → NestJS + TypeORM + MySQL (backend API, port 3002)
front/          → Next.js (agents commerciaux)
```

### URLs de production
- API backend : `https://api.gicops.volibi.online`
- Panel admin : `https://admin.gicops.volibi.online`
- Webhooks Meta : `https://api.gicops.volibi.online/webhooks/whatsapp`

### Auth admin actuelle
- JWT (`jwt-admin` strategy) via cookie de session
- `AdminGuard` protège tous les endpoints `/channel`

### Canal Meta actuel (flux manuel)
L'admin saisit manuellement :
- `token` (access_token Meta, ~24h ou 60 jours)
- `channel_id` = `phone_number_id`

Le backend stocke dans `whapi_channels` :
```
provider = 'meta'
token = access_token (TEXT)
token_expires_at = datetime (ajouté récemment)
external_id = phone_number_id
channel_id = phone_number_id
```

---

## 3. Flux Meta Embedded Signup — Description complète

### 3.1 Vue d'ensemble du flux OAuth

```
┌─────────────────────────────────────────────────────────────────┐
│  PANEL ADMIN                                                    │
│                                                                 │
│  [Connecter un numéro WhatsApp]  ←── Bouton dans ChannelsView  │
└───────────────┬─────────────────────────────────────────────────┘
                │ 1. Ouvre popup Facebook Login
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  FACEBOOK OAUTH POPUP (hébergé par Meta)                       │
│                                                                 │
│  → L'admin se connecte avec son compte Facebook/Meta           │
│  → Sélectionne le Business Manager                             │
│  → Sélectionne le WhatsApp Business Account (WABA)             │
│  → Autorise les permissions demandées                          │
└───────────────┬─────────────────────────────────────────────────┘
                │ 2. Retourne un `code` OAuth (dans l'URL ou postMessage)
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  PANEL ADMIN (JavaScript)                                      │
│                                                                 │
│  → Reçoit le code via window.addEventListener('message')       │
│  → Envoie le code au backend : POST /channel/meta/oauth        │
└───────────────┬─────────────────────────────────────────────────┘
                │ 3. Échange du code
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND NestJS                                                 │
│                                                                 │
│  → POST /channel/meta/oauth reçoit le code                     │
│  → Appelle Meta : GET /oauth/access_token (user_access_token)  │
│  → Appelle Meta : GET /me/businesses (liste WABAs)             │
│  → Appelle Meta : GET /{waba_id}/phone_numbers (numéros)       │
│  → Souscrit app au WABA : POST /{waba_id}/subscribed_apps      │
│  → Retourne la liste des numéros au frontend                   │
└───────────────┬─────────────────────────────────────────────────┘
                │ 4. Admin sélectionne un numéro
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  PANEL ADMIN                                                    │
│                                                                 │
│  → Affiche les numéros disponibles                             │
│  → Admin clique sur le numéro à activer                        │
│  → POST /channel/meta/confirm { phone_number_id, waba_id }     │
└───────────────┬─────────────────────────────────────────────────┘
                │ 5. Création du canal
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND NestJS                                                 │
│                                                                 │
│  → Génère un System User Token permanent pour ce WABA          │
│  → Crée l'entrée dans whapi_channels                           │
│  → Crée le mapping dans provider_channels                      │
│  → Canal prêt à envoyer/recevoir des messages                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Appels API Meta détaillés

#### Étape A — Échange du code OAuth contre user_access_token
```
GET https://graph.facebook.com/v22.0/oauth/access_token
  ?client_id={META_APP_ID}
  &client_secret={META_APP_SECRET}
  &redirect_uri={REDIRECT_URI}
  &code={code_reçu}

→ { "access_token": "...", "token_type": "bearer", "expires_in": 5184000 }
```

#### Étape B — Lister les WABA accessibles
```
GET https://graph.facebook.com/v22.0/me/businesses
  Authorization: Bearer {user_access_token}

→ { "data": [{ "id": "waba_id", "name": "Mon Business" }] }
```

#### Étape C — Lister les numéros de téléphone du WABA
```
GET https://graph.facebook.com/v22.0/{waba_id}/phone_numbers
  ?fields=id,display_phone_number,verified_name,code_verification_status,quality_rating
  Authorization: Bearer {user_access_token}

→ {
    "data": [{
      "id": "phone_number_id",
      "display_phone_number": "+33 6 12 34 56 78",
      "verified_name": "Mon Entreprise",
      "quality_rating": "GREEN"
    }]
  }
```

#### Étape D — Souscrire l'app au WABA (pour recevoir les webhooks)
```
POST https://graph.facebook.com/v22.0/{waba_id}/subscribed_apps
  Authorization: Bearer {user_access_token}

→ { "success": true }
```

#### Étape E — Créer un System User Token permanent (optionnel mais recommandé)
Via Meta Business Manager API ou manuellement dans Business Manager.
Permet d'éviter la dépendance au token utilisateur (qui expire).

---

## 4. Prérequis Meta

### 4.1 Configuration de l'app Meta for Developers

| Élément | Valeur actuelle | Requis pour Embedded Signup |
|---------|-----------------|----------------------------|
| App ID | 1612420806668400 | ✅ Existant |
| App Secret | Configuré | ✅ Existant |
| Type d'app | Business | ✅ Requis |
| WhatsApp Business API | Activé | ✅ Existant |
| Facebook Login for Business | ❌ Non configuré | ⚠️ À activer |
| Valid OAuth Redirect URIs | ❌ Non configuré | ⚠️ À configurer |
| Domaines autorisés | ❌ Non configuré | ⚠️ À configurer |

### 4.2 Permissions OAuth à demander
```
whatsapp_business_management    → Gérer les WABA et numéros
whatsapp_business_messaging     → Envoyer/recevoir des messages
business_management             → Accéder aux Business Managers
```

### 4.3 URLs à configurer dans Meta for Developers
```
Valid OAuth Redirect URIs :
  https://api.gicops.volibi.online/channel/meta/oauth/callback

App Domains :
  gicops.volibi.online
  api.gicops.volibi.online
  admin.gicops.volibi.online
```

### 4.4 Facebook Login SDK (frontend)
Le Embedded Signup utilise le SDK JavaScript de Facebook :
```html
<script async defer src="https://connect.facebook.net/fr_FR/sdk.js"></script>
```
Initialisé avec :
```javascript
FB.init({ appId: META_APP_ID, version: 'v22.0' });
```

---

## 5. Travaux à réaliser

### 5.1 Backend NestJS — Nouveaux endpoints

#### `POST /channel/meta/oauth`
Reçoit le code OAuth, fait l'échange, retourne la liste des WABA et numéros.
```typescript
// Payload reçu
{ code: string }

// Réponse
{
  sessionToken: string,  // token temporaire pour la session OAuth
  businesses: [{
    wabaId: string,
    name: string,
    phoneNumbers: [{
      phoneNumberId: string,
      displayPhone: string,
      verifiedName: string,
      qualityRating: string
    }]
  }]
}
```

#### `POST /channel/meta/confirm`
Crée le canal définitivement après sélection du numéro par l'admin.
```typescript
// Payload reçu
{
  sessionToken: string,    // valide la session OAuth
  phoneNumberId: string,
  wabaId: string,
}

// Réponse : Channel (comme le POST /channel existant)
```

### 5.2 Backend NestJS — Nouveau service

**Fichier** : `src/channel/meta-oauth.service.ts`

Responsabilités :
- Échange du code OAuth
- Appels Graph API (businesses, phone_numbers, subscribed_apps)
- Stockage temporaire de la session OAuth (en mémoire ou Redis)
- Création du canal via le `ChannelService` existant

### 5.3 Variables d'environnement à ajouter

```bash
# URL de callback OAuth (doit correspondre à ce qui est configuré dans Meta for Developers)
META_OAUTH_REDIRECT_URI=https://api.gicops.volibi.online/channel/meta/oauth/callback

# Durée de vie de la session OAuth temporaire (en secondes)
META_OAUTH_SESSION_TTL=600
```

### 5.4 Frontend Admin — Nouveaux composants

#### Bouton "Connecter via Meta" dans ChannelsView
```tsx
<button onClick={handleEmbeddedSignup}>
  Connecter un numéro WhatsApp
</button>
```

#### Logique du popup Facebook
```tsx
const handleEmbeddedSignup = () => {
  FB.login((response) => {
    if (response.authResponse?.code) {
      // Envoyer le code au backend
      connectMetaChannel(response.authResponse.code);
    }
  }, {
    config_id: META_CONFIG_ID,  // ID de la config Embedded Signup
    response_type: 'code',
    override_default_response_type: true,
  });
};
```

#### Modal de sélection du numéro
Après retour du backend → afficher la liste des numéros disponibles → admin clique → création du canal.

#### Nouvelle variable d'env admin
```bash
NEXT_PUBLIC_META_APP_ID=1612420806668400
NEXT_PUBLIC_META_CONFIG_ID=...  # ID de la configuration Embedded Signup (Meta for Developers)
```

### 5.5 Migration base de données

Ajouter dans `whapi_channels` pour tracer l'origine OAuth :
```sql
ALTER TABLE whapi_channels ADD COLUMN waba_id VARCHAR(64) NULL;
ALTER TABLE whapi_channels ADD COLUMN oauth_connected_at DATETIME NULL;
```

---

## 6. Sécurité

### 6.1 Validation du state OAuth (CSRF)
Générer un `state` aléatoire avant le redirect, vérifier qu'il correspond au retour.

### 6.2 Session OAuth temporaire
Le `user_access_token` reçu après échange du code ne doit jamais être envoyé au frontend.
Stocker côté backend (en mémoire avec TTL de 10 minutes) et retourner un `sessionToken` opaque.

### 6.3 Vérification de domaine
Meta vérifie que le `redirect_uri` correspond exactement à ce qui est déclaré dans l'app.

### 6.4 System User Token (recommandé)
Après connexion OAuth, générer un **System User Token** via Business Manager API.
Ce token est permanent (ne expire pas) et n'est pas lié au compte personnel de l'admin.

---

## 7. Limitations et contraintes connues

| Contrainte | Impact | Mitigation |
|-----------|--------|-----------|
| L'app Meta doit être en mode "Live" (pas "Development") pour des comptes extérieurs | Bloquant pour des clients tiers | Soumettre l'app à la review Meta |
| Review Meta obligatoire pour les permissions `whatsapp_business_management` | Délai 1-4 semaines | Anticiper dans le planning |
| Le numéro doit être vérifié et enregistré dans un WABA | L'admin doit avoir fait cette étape en amont dans Meta Business Manager | Documentation utilisateur |
| Un seul `phone_number_id` par numéro de téléphone dans le système | Contrainte existante (UNIQUE sur external_id) | Déjà géré |
| Token utilisateur OAuth expire | Si pas de System User Token, le canal cesse de fonctionner après expiration | Implémenter System User Token ou le refresh automatique existant |

---

## 8. Estimation de charge (développement)

| Tâche | Complexité | Estimation |
|-------|-----------|------------|
| Configuration app Meta for Developers | Faible | 0.5 jour |
| Review Meta (permissions) | Externe | 1-4 semaines |
| Backend : MetaOAuthService + endpoints | Moyenne | 2-3 jours |
| Backend : migration BDD + module | Faible | 0.5 jour |
| Frontend : bouton + popup FB SDK | Moyenne | 1-2 jours |
| Frontend : modal sélection numéro | Faible | 1 jour |
| Tests end-to-end | Moyenne | 1-2 jours |
| **Total développement** | | **6-9 jours** |
| **Review Meta (bloquant)** | | **1-4 semaines** |

---

## 9. Dépendances externes

| Dépendance | Version | Usage |
|-----------|---------|-------|
| Facebook JS SDK | v22.0 | Popup login + Embedded Signup |
| Meta Graph API | v22.0 | Échange token, liste numéros |
| Meta Business Manager | — | Création WABA, System User |
| Meta for Developers Console | — | Config app, permissions |

---

## 10. Ordre d'implémentation recommandé

```
Phase 0 (Pré-requis, avant tout développement)
├── Activer "Facebook Login for Business" sur l'app Meta
├── Configurer les OAuth Redirect URIs
├── Créer la "configuration" Embedded Signup (donne le META_CONFIG_ID)
└── Soumettre la demande de review pour les permissions WhatsApp

Phase 1 — Backend (peut démarrer en parallèle de la review)
├── MetaOAuthService (échange code, liste numéros, souscription WABA)
├── Endpoints POST /channel/meta/oauth et POST /channel/meta/confirm
├── Stockage session temporaire
└── Migration BDD (waba_id, oauth_connected_at)

Phase 2 — Frontend Admin
├── Intégration Facebook JS SDK dans le layout admin
├── Bouton "Connecter un numéro WhatsApp" dans ChannelsView
├── Logique popup + réception du code
└── Modal de sélection du numéro

Phase 3 — Tests & Mise en production
├── Tests avec un compte Meta de test
├── Tests avec un vrai WABA
└── Déploiement + documentation utilisateur
```

---

## 11. Questions ouvertes (à trancher pour le cahier des charges)

1. **System User Token** : doit-on le générer automatiquement via API ou laisser l'admin le configurer manuellement dans Meta Business Manager ?
2. **Multi-WABA** : un admin peut-il connecter des numéros de plusieurs WABA différents dans la même instance ?
3. **Révocation** : que se passe-t-il si l'admin révoque l'accès depuis Meta Business Manager ? Faut-il un mécanisme de détection ?
4. **Logs d'audit** : faut-il tracer qui a connecté quel numéro et quand ?
5. **Notifications** : faut-il notifier l'admin par email/interface quand un numéro est déconnecté ou que la qualité baisse ?

---

## 12. Références

- [Meta Embedded Signup — Documentation officielle](https://developers.facebook.com/docs/whatsapp/embedded-signup)
- [WhatsApp Business Management API](https://developers.facebook.com/docs/whatsapp/business-management-api)
- [Facebook Login for Business](https://developers.facebook.com/docs/facebook-login/business-login)
- [Graph API — Phone Numbers](https://developers.facebook.com/docs/whatsapp/business-management-api/phone-numbers)
- [System Users — Meta Business API](https://developers.facebook.com/docs/marketing-api/system-users)
