# Plan d'implémentation — Liens de campagne WhatsApp (Click-to-Chat)

## Objectif

Permettre à l'admin de générer des liens `wa.me` paramétrés à placer dans des publicités Meta.
Quand un prospect clique le lien, WhatsApp s'ouvre avec :
- le numéro du canal configuré par l'admin comme destinataire,
- un message prédéfini déjà saisi dans la zone de texte,
- l'utilisateur n'a plus qu'à appuyer sur **Envoyer**.

Le message entrant est traité comme une conversation normale par le système de dispatch existant, **et automatiquement attribué à la campagne source** pour un suivi précis.

---

## Architecture générale

```
Admin crée un CampaignLink
  └─ sélectionne un canal (WhapiChannel)
  └─ saisit le message prédéfini
  └─ le système génère :
       • URL directe  : https://wa.me/<phone>?text=<message_encodé>
       • URL trackée  : https://<domain>/api/campaign/t/<code>
            └─ log CampaignLinkClick (ip_hash, user_agent, timestamp)
            └─ incrémente click_count
            └─ redirige (302) vers URL directe

Publicité Meta
  → URL trackée
    → CampaignLinkClick créé (pending)
    → WhatsApp s'ouvre (message prédéfini)
    → Client envoie le message
      → Webhook entrant
        → message matche predefined_message d'un lien actif
        → WhatsappChat.campaign_link_id = link.id
        → CampaignLinkClick.converted = true (clics récents < 24h)
        → dispatch normal vers agent
```

---

## Epic 1 — Backend socle (NestJS)

### US 1.0 — Ajout du numéro de téléphone sur le canal

**Fichier :** `src/channel/entities/channel.entity.ts`

```typescript
@Column({ name: 'phone_number', type: 'varchar', length: 32, nullable: true })
phone_number: string | null;
```

**Migration :** `AddPhoneNumberToChannel<timestamp>`

```sql
ALTER TABLE whapi_channels ADD COLUMN phone_number VARCHAR(32) NULL;
```

> Pour Whapi : extrait automatiquement depuis `channel_id` (format `<phone>@s.whatsapp.net`).
> Pour Meta : saisi manuellement par l'admin dans les paramètres du canal.

---

### US 1.1 — Entité `CampaignLink`

**Fichier :** `src/campaign-link/entities/campaign-link.entity.ts`

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID PK | Clé primaire |
| `name` | varchar(100) | Nom lisible (ex : "Pub Ramadan") |
| `channel_id` | varchar(100) FK | Canal WhatsApp cible |
| `predefined_message` | text | Message pré-rempli |
| `short_code` | varchar(16) UNIQUE | Code URL de tracking (généré auto, 8 chars) |
| `direct_url` | text | URL `wa.me` directe |
| `tracked_url` | text | URL trackée via notre serveur |
| `click_count` | int default 0 | Compteur total (dénormalisé pour perf) |
| `conversion_count` | int default 0 | Nombre de clics convertis en message (dénormalisé) |
| `is_active` | boolean default true | Activer/désactiver |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

---

### US 1.2 — Entité `CampaignLinkClick` *(suivi précis)*

**Fichier :** `src/campaign-link/entities/campaign-link-click.entity.ts`

Chaque passage par l'URL trackée crée une ligne dans cette table.

| Colonne | Type | Description |
|---|---|---|
| `id` | UUID PK | Clé primaire |
| `campaign_link_id` | UUID FK | Lien de campagne source |
| `clicked_at` | timestamp | Date/heure du clic (auto) |
| `ip_hash` | varchar(64) | SHA-256 de l'IP (RGPD — jamais l'IP brute) |
| `user_agent` | text nullable | Navigateur / OS / device |
| `device_type` | varchar(16) nullable | `mobile` / `desktop` / `tablet` (déduit du user_agent) |
| `converted` | boolean default false | `true` si le client a réellement envoyé le message |
| `converted_at` | timestamp nullable | Horodatage de la conversion |
| `chat_id` | varchar(100) nullable | `whatsapp_chat.chat_id` si converti |

**Index :** `(campaign_link_id, clicked_at)` pour les requêtes analytiques.

**Migration :** `CreateCampaignLinkClick<timestamp>`

```sql
CREATE TABLE campaign_link_click (
  id          CHAR(36)      PRIMARY KEY,
  campaign_link_id CHAR(36) NOT NULL,
  clicked_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_hash     VARCHAR(64)   NULL,
  user_agent  TEXT          NULL,
  device_type VARCHAR(16)   NULL,
  converted   TINYINT(1)    NOT NULL DEFAULT 0,
  converted_at TIMESTAMP    NULL,
  chat_id     VARCHAR(100)  NULL,
  INDEX IDX_click_link_date (campaign_link_id, clicked_at),
  FOREIGN KEY (campaign_link_id) REFERENCES campaign_link(id) ON DELETE CASCADE
);
```

---

### US 1.3 — Attribution de conversation à une campagne *(suivi précis)*

**Principe :** quand un message entrant correspond exactement au `predefined_message` d'un lien actif,
la conversation est automatiquement attribuée à cette campagne.

**Champ à ajouter sur `WhatsappChat` :**

```typescript
@Column({ name: 'campaign_link_id', type: 'char', length: 36, nullable: true })
campaign_link_id: string | null;
```

**Migration :** `AddCampaignLinkToChat<timestamp>`

**Hook d'attribution dans le webhook entrant :**

Fichier : `src/whatsapp_message/whatsapp_message.service.ts` (méthode de traitement du message entrant)

```
Lors d'un nouveau message client :
  1. Si chat.campaign_link_id est déjà défini → skip (déjà attribué)
  2. Chercher un CampaignLink actif dont predefined_message == message.text (trim + lowercase)
  3. Si trouvé :
       a. SET chat.campaign_link_id = link.id
       b. Trouver le CampaignLinkClick le plus récent pour ce lien
          où converted = false ET clicked_at > NOW() - 24h
       c. SET click.converted = true, click.converted_at = NOW(), click.chat_id = chat.chat_id
       d. INCREMENT link.conversion_count (UPDATE atomique)
```

> **Fenêtre de conversion :** 24h — un clic non converti dans les 24h est considéré perdu.
> Ce délai est raisonnable car le prospect clique et envoie dans la même session.

---

### US 1.4 — Service `CampaignLinkService`

**Fichier :** `src/campaign-link/campaign-link.service.ts`

```typescript
// Génère un short_code unique de 8 chars alphanumériques
private generateShortCode(): Promise<string>

// Construit les deux URLs
private buildUrls(phone: string, message: string, code: string): { direct_url, tracked_url }

// CRUD
create(dto: CreateCampaignLinkDto): Promise<CampaignLink>
findAll(): Promise<CampaignLink[]>
findOne(id: string): Promise<CampaignLink>
update(id: string, dto: UpdateCampaignLinkDto): Promise<CampaignLink>
remove(id: string): Promise<void>

// Tracking — appelé à chaque passage par l'URL trackée
track(shortCode: string, ip: string, userAgent: string): Promise<string>
  // → crée CampaignLinkClick, incrémente click_count, retourne direct_url

// Attribution — appelé depuis le webhook entrant
tryAttribute(messageText: string, chatId: string): Promise<void>

// Analytics — données agrégées pour le dashboard
getStats(linkId: string, from: Date, to: Date): Promise<CampaignLinkStats>
getClickHistory(linkId: string, page: number): Promise<CampaignLinkClick[]>
```

---

### US 1.5 — Controller `CampaignLinkController`

**Fichier :** `src/campaign-link/campaign-link.controller.ts`

| Méthode | Route | Guard | Description |
|---|---|---|---|
| `POST` | `/campaign-links` | AdminGuard | Créer un lien |
| `GET` | `/campaign-links` | AdminGuard | Lister tous les liens |
| `GET` | `/campaign-links/:id` | AdminGuard | Détail d'un lien |
| `PATCH` | `/campaign-links/:id` | AdminGuard | Modifier |
| `DELETE` | `/campaign-links/:id` | AdminGuard | Supprimer |
| `GET` | `/campaign-links/:id/analytics` | AdminGuard | Stats agrégées `?from=&to=` |
| `GET` | `/campaign-links/:id/clicks` | AdminGuard | Historique des clics (paginé) |
| `GET` | `/campaign/t/:code` | Public | Tracking + redirection `302` |

**Détail de l'endpoint public `/campaign/t/:code` :**
1. Récupère le lien par `short_code`
2. Vérifie `is_active = true` (sinon `404`)
3. Hash de l'IP (`SHA-256`)
4. Déduit `device_type` depuis `User-Agent`
5. Crée un `CampaignLinkClick` (non bloquant — fire-and-forget si latence)
6. Incrémente `click_count` (UPDATE atomique)
7. Répond `302 Found` → `direct_url`

**DTO de réponse analytics :**
```typescript
interface CampaignLinkStats {
  total_clicks: number;
  total_conversions: number;
  conversion_rate: number;          // conversions / clicks (%)
  unique_clicks: number;            // clics avec ip_hash distinct
  clicks_by_day: { date: string; clicks: number; conversions: number }[];
  clicks_by_device: { device_type: string; count: number }[];
}
```

---

### US 1.6 — Module `CampaignLinkModule`

- `TypeOrmModule.forFeature([CampaignLink, CampaignLinkClick, WhapiChannel, WhatsappChat])`
- Exports `CampaignLinkService` (consommé par `WhatsappMessageModule` pour l'attribution)
- Enregistré dans `AppModule`

---

### US 1.7 — DTOs

**`CreateCampaignLinkDto`**
```typescript
{
  name: string;
  channel_id: string;           // UUID du canal
  predefined_message: string;
  is_active?: boolean;          // défaut true
}
```

**`UpdateCampaignLinkDto`** — PartialType de `CreateCampaignLinkDto`

---

## Epic 2 — Mise à jour du canal (numéro de téléphone)

### US 2.1 — Formulaire de canal (admin)

Ajouter le champ **Numéro de téléphone** dans le formulaire d'édition d'un canal existant.

Format : international sans `+` ni espaces (ex : `2250101234567`).

Pour Whapi, pré-remplir automatiquement depuis `channel_id` (extraction de la partie avant `@`).

---

## Epic 3 — Admin UI — Gestion des liens (Next.js)

### US 3.1 — Page liste `/admin/campaign-links`

Tableau avec colonnes :
- Nom de la campagne
- Canal associé
- Message prédéfini (tronqué 60 chars)
- **Clics totaux**
- **Conversions** (+ taux en %)
- Statut (actif / inactif)
- Actions : Voir détail / Modifier / Supprimer / Copier URL trackée

### US 3.2 — Formulaire création/édition

Champs :
- **Nom de la campagne**
- **Canal** (select avec numéro de téléphone affiché)
- **Message prédéfini** (textarea)
- **Actif** (toggle)

À la sauvegarde, bloc URLs :
```
URL directe   : https://wa.me/2250101234567?text=...   [Copier]  [Tester ↗]
URL de suivi  : https://domain.com/api/campaign/t/abc12345  [Copier]
```

---

## Epic 4 — Admin UI — Dashboard analytique par lien *(suivi précis)*

### US 4.1 — Page analytique `/admin/campaign-links/:id/analytics`

**Bloc KPIs (en haut de page) :**

| KPI | Valeur |
|---|---|
| Clics totaux | `click_count` |
| Clics uniques | (ip_hash distincts) |
| Conversions | `conversion_count` |
| Taux de conversion | `conversion_count / click_count × 100 %` |

**Graphique temporel :**
- Axe X : jours (fenêtre configurable : 7j / 30j / 90j)
- Axe Y : nombre de clics (barre) + conversions (courbe superposée)
- Permet de visualiser les pics liés aux diffusions de publicités Meta

**Répartition par appareil :**
- Camembert : `mobile` / `desktop` / `tablet` / `inconnu`

**Filtre de période :**
- Sélecteur `Du` … `Au` (date range picker)
- Boutons rapides : Aujourd'hui / 7 derniers jours / 30 jours / Tout

---

### US 4.2 — Tableau des clics récents

Tableau paginé (20 par page) avec colonnes :

| Colonne | Description |
|---|---|
| Date & heure | `clicked_at` formaté |
| Appareil | `device_type` (icône mobile/desktop) |
| Converti | Badge vert "Converti" ou gris "En attente" |
| Converti le | `converted_at` si converti |
| Conversation | Lien vers la conversation si `chat_id` présent |

---

### US 4.3 — Badge campagne dans les conversations

Dans la vue conversation (admin et front commercial) :

- Si `chat.campaign_link_id` est défini, afficher un badge **"Via campagne : [nom du lien]"**
  en haut du header de conversation.
- Permet à l'agent de savoir que le client vient d'une publicité et d'adapter son discours.

---

## Ordre d'implémentation recommandé

| Priorité | Epic | User Story | Estimation |
|---|---|---|---|
| P0 | Backend | US 1.0 — `phone_number` sur canal + migration | 1h |
| P0 | Backend | US 1.1 — Entité `CampaignLink` + migration | 1h |
| P0 | Backend | US 1.2 — Entité `CampaignLinkClick` + migration | 1h |
| P0 | Backend | US 1.3 — Attribution conversation + champ `campaign_link_id` | 2h |
| P0 | Backend | US 1.4 — Service complet | 3h |
| P0 | Backend | US 1.5 — Controller + endpoint public | 1h |
| P0 | Backend | US 1.6 — Module | 30min |
| P0 | Backend | US 1.7 — DTOs | 30min |
| P1 | Admin | US 2.1 — Champ phone sur canal | 1h |
| P1 | Admin | US 3.1 — Page liste campagnes | 2h |
| P1 | Admin | US 3.2 — Formulaire + affichage URLs | 2h |
| P1 | Admin | US 4.1 — Dashboard analytique (KPIs + graphique) | 3h |
| P1 | Admin | US 4.2 — Tableau clics récents | 2h |
| P2 | Admin/Front | US 4.3 — Badge campagne dans conversations | 1h |

**Total estimé : ~21h**

---

## Points techniques importants

### Format du numéro pour wa.me

```
Numéro CI     : +225 01 01 23 45 67
Format wa.me  : 2250101234567
URL générée   : https://wa.me/2250101234567?text=Bonjour%20je%20suis%20...
```

### Extraction du numéro depuis channel_id (Whapi)

```typescript
const phone = channel.channel_id?.split('@')[0] ?? null;
// "2250101234567@s.whatsapp.net" → "2250101234567"
```

### Hachage de l'IP (RGPD)

```typescript
import { createHash } from 'crypto';
const ip_hash = createHash('sha256').update(rawIp + process.env.IP_SALT).digest('hex');
// IP_SALT = secret fixe en .env — jamais retrouvable sans lui
```

### Déduction du device_type depuis User-Agent

```typescript
function detectDevice(ua: string): 'mobile' | 'desktop' | 'tablet' | 'unknown' {
  if (!ua) return 'unknown';
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|android|iphone/i.test(ua)) return 'mobile';
  return 'desktop';
}
```

### Matching du message pour l'attribution

```typescript
// Comparaison robuste : trim + lowercase + normalisation des espaces
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const isMatch = normalize(incomingText) === normalize(link.predefined_message);
```

> **Limite connue :** si deux campagnes ont le même message prédéfini,
> l'attribution va au lien actif le plus récent. L'admin doit différencier les messages.

### Variables d'environnement nécessaires

```env
APP_URL=https://votre-domaine.com   # pour construire tracked_url
IP_SALT=secret_aleatoire_fixe        # pour le hachage RGPD des IPs
```

### Sécurité endpoint public

L'endpoint `/campaign/t/:code` est public mais :
- Rate-limiting : max 20 req/min par IP (NestJS Throttler)
- Valide `is_active = true` avant de rediriger
- Ne renvoie aucune donnée interne — uniquement `302`
- Enregistrement du clic en arrière-plan (ne bloque pas la redirection)

---

## Ce qui N'est PAS dans ce plan (hors périmètre)

- QR code généré automatiquement (peut être ajouté facilement avec `qrcode` npm)
- Intégration native avec l'API Meta Ads (via Meta Marketing API)
- Alertes automatiques si le taux de conversion chute en dessous d'un seuil
- Export CSV des clics par campagne
