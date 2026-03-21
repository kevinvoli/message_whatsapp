# Cahier des charges — Uniformisation des providers dans l'Admin Panel et le Front Chat

**Date :** 2026-03-18
**Projet :** Application de démutualisation et dispatching de conversations
**Stack :** NestJS (backend) · Next.js (admin + front chat)
**Scope :** Mettre tous les providers au même niveau d'implémentation dans le panel admin et le front

---

## 1. Contexte et état actuel

L'application supporte 5 providers de messagerie :

| Provider | Identifiant interne |
|---|---|
| WhatsApp via Whapi | `whapi` |
| WhatsApp via Meta Cloud API | `meta` |
| Facebook Messenger | `messenger` |
| Instagram Direct | `instagram` |
| Telegram | `telegram` |

### 1.1 État du backend

Le backend est **complet pour tous les providers** :
- Création/édition/suppression de canaux ✅
- Ingestion webhook (routes dédiées par provider) ✅
- Normalisation via adaptateurs ✅
- Envoi de texte et médias ✅
- Routage via `OutboundRouterService` ✅

### 1.2 État du panel admin

Le panel admin ne supporte que **Whapi** et **Meta** :

- `definitions.ts` : le type `Channel` ne connaît que `'whapi' | 'meta'`
- `ChannelsView.tsx` : le formulaire de création/édition ne propose que Whapi et Meta dans le sélecteur de provider
- Aucune interface pour créer/configurer un canal Telegram, Messenger ou Instagram

### 1.3 État du front chat

Le front chat est **provider-agnostique** mais manque d'indicateurs visuels :

- Aucun badge/icône de provider dans la liste des conversations
- Aucune différenciation visuelle selon le canal d'entrée d'un message
- Pas de mention du provider dans le détail d'une conversation

---

## 2. Objectifs

1. **Panel admin** : supporter les 5 providers dans toutes les vues de gestion des canaux (création, édition, affichage, liste)
2. **Front chat** : afficher le provider d'une conversation/message de façon visuelle et cohérente
3. **Cohérence** : même niveau de polish UI pour tous les providers, mêmes patterns d'UX

---

## 3. Spécifications — Panel Admin

### 3.1 Types TypeScript (`admin/src/app/lib/definitions.ts`)

Mettre à jour le type `Channel` :

```typescript
export type ProviderType = 'whapi' | 'meta' | 'messenger' | 'instagram' | 'telegram';

export type Channel = {
  id: string;
  provider: ProviderType | null;
  external_id: string | null;   // Rôle selon provider (voir tableau §3.3)
  channel_id: string;           // Identifiant interne Whapi uniquement
  token: string;
  tokenExpiresAt: string | null; // Meta, Messenger, Instagram uniquement
  name?: string | null;          // Nom lisible du canal (optionnel)
  // ... autres champs existants
};
```

### 3.2 Sélecteur de provider (`ChannelsView.tsx`)

Remplacer le sélecteur actuel (2 options) par les 5 providers :

| Valeur | Label affiché | Icône |
|---|---|---|
| `whapi` | WhatsApp (Whapi) | 💬 ou logo WhatsApp |
| `meta` | WhatsApp (Meta Cloud) | logo WhatsApp |
| `messenger` | Facebook Messenger | logo Messenger |
| `instagram` | Instagram Direct | logo Instagram |
| `telegram` | Telegram | logo Telegram |

### 3.3 Formulaire de création/édition — champs par provider

Chaque provider a ses propres champs requis. Le formulaire doit être **dynamique** : les champs affichés changent selon le provider sélectionné.

#### Provider : `whapi`
| Champ | Label | Type | Requis | Description |
|---|---|---|---|---|
| `token` | Token Whapi | text | ✅ | Token d'API du channel Whapi |

> **Comportement** : à la soumission, le backend appelle `getChannel()` pour valider le token et récupère `external_id` automatiquement.

#### Provider : `meta`
| Champ | Label | Type | Requis | Description |
|---|---|---|---|---|
| `token` | Token d'accès | text | ✅ | Token Meta (sera échangé contre un token long-lived) |
| `channel_id` | ID du numéro de téléphone | text | ✅ | `phone_number_id` dans l'API Meta |
| `external_id` | Numéro de téléphone | text | ✅ | Ex : `+2250700000000` |
| `is_business` | Compte Business | checkbox | ✅ | Toujours coché pour Meta Cloud API |

> **Token expiry** : afficher la date d'expiration et un bouton "Rafraîchir le token" quand `tokenExpiresAt` est renseigné.

#### Provider : `messenger`
| Champ | Label | Type | Requis | Description |
|---|---|---|---|---|
| `token` | Token de page Facebook | text | ✅ | Token court → échangé automatiquement en token long-lived |
| `external_id` | Page ID | text | ✅ | ID de la page Facebook |
| `channel_id` | App ID Meta | text | ✅ | Identifiant de l'application Meta |

> **Token expiry** : même comportement que Meta (affichage + refresh).

#### Provider : `instagram`
| Champ | Label | Type | Requis | Description |
|---|---|---|---|---|
| `token` | Token Instagram | text | ✅ | Token court → échangé automatiquement |
| `external_id` | Instagram Account ID | text | ✅ | `ig_account_id` (IGSID du compte) |
| `channel_id` | App ID Meta | text | ✅ | Identifiant de l'application Meta |

> **Limitation connue** : Instagram ne supporte pas l'envoi d'audio. L'afficher comme note informative dans le formulaire.
> **Token expiry** : même comportement que Meta.

#### Provider : `telegram`
| Champ | Label | Type | Requis | Description |
|---|---|---|---|---|
| `token` | Token du bot | text | ✅ | Token fourni par @BotFather |

> **Comportement** : à la soumission, le backend valide le token via `getMe()` et enregistre le webhook automatiquement. Afficher le nom du bot récupéré en confirmation.
> **Pas de token expiry** pour Telegram.

### 3.4 Liste des canaux (`ChannelsView.tsx` — vue tableau)

Colonnes à afficher :

| Colonne | Description |
|---|---|
| Provider | Icône + nom du provider |
| Nom / Identifiant | `external_id` ou `channel_id` selon le provider |
| Statut token | Valide / Expiré / N/A (avec couleur) |
| Date d'expiration | `tokenExpiresAt` formaté ou `–` |
| Actions | Éditer · Rafraîchir token (si applicable) · Supprimer |

Règles d'affichage du statut token :

| Provider | Statut token |
|---|---|
| `whapi` | N/A |
| `telegram` | N/A |
| `meta` / `messenger` / `instagram` | Valide (vert) si `tokenExpiresAt > now`, Expiré (rouge) sinon |

### 3.5 Page de détail d'un canal (optionnelle mais recommandée)

Afficher en lecture seule :
- Tous les champs du canal
- Statut de la connexion (appel de vérification live si possible)
- Historique de rafraîchissement de token
- Bouton webhook : copier l'URL de webhook à configurer côté provider

**URLs de webhook par provider** (à afficher pour faciliter la configuration) :

| Provider | URL webhook |
|---|---|
| `whapi` | `{BASE_URL}/webhooks/whapi` |
| `meta` | `{BASE_URL}/webhooks/meta` |
| `messenger` | `{BASE_URL}/webhooks/messenger` |
| `instagram` | `{BASE_URL}/webhooks/instagram` |
| `telegram` | Configuré automatiquement par le backend |

---

## 4. Spécifications — Front Chat

### 4.1 Badge provider dans la liste des conversations

Dans `ConversationItem.tsx` (sidebar), afficher une icône du provider à côté du nom/numéro du contact.

| Provider | Icône | Couleur badge |
|---|---|---|
| `whapi` | Logo WhatsApp | Vert (#25D366) |
| `meta` | Logo WhatsApp | Vert (#25D366) |
| `messenger` | Logo Messenger | Bleu dégradé (#0084FF) |
| `instagram` | Logo Instagram | Violet/rose (#C13584) |
| `telegram` | Logo Telegram | Bleu (#0088CC) |

**Implémentation** :
- Icône petite (16×16 ou 20×20 px) placée à côté de l'avatar ou du nom
- Tooltip au survol : nom complet du provider

### 4.2 Format du destinataire selon le provider

Dans l'en-tête de la conversation et dans les infos de contact, le format de l'identifiant varie :

| Provider | Format chat_id | Affichage recommandé |
|---|---|---|
| `whapi` / `meta` | `2250700000000` | Numéro de téléphone formaté |
| `messenger` | `{PSID}@messenger` | Extraire PSID, label "Messenger" |
| `instagram` | `{IGSID}@instagram` | Extraire IGSID, label "Instagram" |
| `telegram` | `{CHAT_ID}@telegram` | Extraire Chat ID, label "Telegram" |

### 4.3 Indicateur de provider dans la zone de saisie

En bas de la zone de chat (près du bouton d'envoi), afficher une petite indication du canal utilisé pour cette conversation. Ex : « Envoi via Telegram » ou icône discrète du provider.

### 4.4 Limitation des médias selon le provider

Afficher ou désactiver les boutons d'envoi de médias en fonction des capacités du provider :

| Provider | Texte | Image | Vidéo | Audio | Document | Sticker |
|---|---|---|---|---|---|---|
| `whapi` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `meta` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `messenger` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `instagram` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `telegram` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> Pour Instagram, désactiver les boutons audio et document avec un tooltip explicatif.

---

## 5. Spécifications — Backend (ajustements mineurs)

### 5.1 API `GET /channel` — enrichissement de la réponse

S'assurer que la réponse inclut tous les champs nécessaires au front et à l'admin :

```json
{
  "id": "uuid",
  "provider": "telegram",
  "external_id": "123456789",
  "channel_id": "",
  "token": "***masked***",
  "tokenExpiresAt": null,
  "name": "Mon Bot Support",
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-15T00:00:00Z"
}
```

> **Sécurité** : le `token` ne doit jamais être renvoyé en clair dans les réponses GET. Le masquer ou l'exclure du DTO de réponse.

### 5.2 Endpoint de vérification de canal

Ajouter (ou documenter s'il existe) :

```
POST /channel/:id/verify
```

Vérifie que le token est toujours valide en appelant l'API du provider correspondant. Retourne `{ valid: boolean, details?: object }`.

### 5.3 Endpoint de copie de l'URL webhook

Ajouter un champ `webhookUrl` dans la réponse de `GET /channel/:id` :

```json
{
  "webhookUrl": "https://api.example.com/webhooks/telegram"
}
```

Calculé dynamiquement selon le `provider` du canal.

### 5.4 Validation Telegram — retourner le nom du bot

Lors du `POST /channel` avec provider `telegram`, inclure dans la réponse le nom du bot récupéré via `getMe()` :

```json
{
  "channel": { ... },
  "botInfo": {
    "username": "mon_bot_support",
    "first_name": "Support Bot"
  }
}
```

---

## 6. Priorité et ordre d'implémentation recommandé

### Phase 1 — Types et modèles (admin)
- [ ] Mettre à jour `definitions.ts` : type `ProviderType` et type `Channel` complet
- [ ] Mettre à jour `api.ts` si des appels sont filtrés/castés sur les providers

### Phase 2 — Formulaire de création de canal (admin)
- [ ] Ajouter les 5 providers dans le sélecteur
- [ ] Rendre le formulaire dynamique (champs conditionnels par provider)
- [ ] Ajouter les labels et descriptions des champs
- [ ] Ajouter la note informative pour Instagram (pas d'audio)
- [ ] Ajouter la confirmation avec nom du bot pour Telegram

### Phase 3 — Liste et détail des canaux (admin)
- [ ] Ajouter icône de provider dans le tableau
- [ ] Afficher le statut du token avec code couleur
- [ ] Gérer le bouton "Rafraîchir le token" pour meta/messenger/instagram
- [ ] Ajouter la colonne date d'expiration

### Phase 4 — Badge provider (front chat)
- [ ] Créer un composant `ProviderBadge` réutilisable
- [ ] L'intégrer dans `ConversationItem.tsx`
- [ ] L'intégrer dans l'en-tête de conversation

### Phase 5 — Limitations médias (front chat)
- [ ] Passer les infos de provider/canal à la zone de saisie
- [ ] Désactiver conditionnellement les boutons de médias
- [ ] Ajouter les tooltips d'explication

### Phase 6 — Indicateur d'envoi (front chat)
- [ ] Afficher le canal utilisé dans la zone de saisie
- [ ] Indicateur discret du provider actif

### Phase 7 — Ajustements backend (si besoin)
- [ ] Masquer le token dans les réponses GET
- [ ] Ajouter `webhookUrl` dans la réponse de détail de canal
- [ ] Endpoint `POST /channel/:id/verify`
- [ ] Retourner `botInfo` pour Telegram

---

## 7. Assets visuels requis

Logos des providers à intégrer (SVG recommandé pour la scalabilité) :

| Provider | Source recommandée |
|---|---|
| WhatsApp | Logo officiel WhatsApp |
| Messenger | Logo officiel Meta Messenger |
| Instagram | Logo officiel Instagram |
| Telegram | Logo officiel Telegram |

Placer les SVG dans :
- `admin/public/icons/providers/` (admin)
- `front/public/icons/providers/` (front)

Ou utiliser une librairie d'icônes comme **react-icons** (`FaWhatsapp`, `FaTelegram`, `FaInstagram`, `FaFacebookMessenger`) pour éviter de gérer les assets manuellement.

---

## 8. Critères d'acceptation

### Admin Panel
- [ ] Un admin peut créer un canal pour chacun des 5 providers via le formulaire
- [ ] Le formulaire affiche les bons champs selon le provider sélectionné
- [ ] La liste des canaux affiche clairement le provider de chaque canal avec une icône
- [ ] Les canaux Meta/Messenger/Instagram affichent la date d'expiration et un bouton de refresh
- [ ] Les canaux Telegram et Whapi n'affichent pas de date d'expiration
- [ ] L'URL de webhook est visible/copiable pour faciliter la configuration

### Front Chat
- [ ] Chaque conversation dans la sidebar affiche un badge indiquant son provider
- [ ] Les boutons de médias incompatibles (ex: audio sur Instagram) sont désactivés
- [ ] L'utilisateur voit quel canal il utilise lorsqu'il répond dans une conversation

---

## 9. Hors scope

Les éléments suivants sont **hors scope** de ce cahier des charges :

- Implémentation de nouvelles fonctionnalités backend pour les providers (le backend est considéré complet)
- Système d'authentification OAuth / Meta Embedded Signup (documenté dans `PLAN_META_EMBEDDED_SIGNUP.md`)
- Rapports / analytics par provider
- Gestion des templates de messages (WhatsApp Business)
- Dispatch automatique vers un provider spécifique (la logique de dispatch existe déjà)
