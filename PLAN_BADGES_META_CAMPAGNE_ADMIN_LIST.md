# PLAN : Badges campagne Meta dans la liste des conversations - Panel Admin

> Date : 2026-06-03
> Branche : `production`

---

## 1. Contexte et etat actuel

### Ce que fait le front commercial

Dans `front/src/components/sidebar/ConversationItem.tsx`, chaque item affiche :

| Indicateur | Condition | Rendu |
|---|---|---|
| Badge "Pub Meta" | `conversation.isCtwa === true` | Badge bleu arrondi avec icone, ligne 149-156 |
| Badge statut | `conversation.status` | Vert / gris / orange |
| Badge Provider | prefix `chat_id` | WhatsApp / Messenger / etc. |
| Badge Tags | `conversation.tags[]` | Badges gris |
| Unread count | `conversation.unreadCount > 0` | Badge vert rond |

---

### Ce que fait l'admin actuellement

**Dans la liste** (`admin/src/app/ui/ConversationsView.tsx:634-673`) :

| Indicateur | Affiche ? | Notes |
|---|---|---|
| Avatar + initiale | oui | ligne 642 |
| Nom | oui | ligne 647 |
| Badge Provider | oui | `ProviderBadge`, ligne 648 |
| Icone Lock | oui | lecture seule, ligne 649-651 |
| Apercu dernier message | oui | ligne 653-659 |
| Statut + Poste + Canal | oui | texte simple, ligne 661 |
| Dates debut/fin | oui | ligne 663-665 |
| Badge Unread count | oui | ligne 667-671 |
| **Badge "Pub Meta"** | **non** | manquant |
| **Badge "Via campagne"** | **non** | manquant (present dans panneau detail seulement) |

**Dans le panneau de detail** (onglet "Conversation", conversation selectionnee) :
- Pilule "Debut de la conversation - {date}" : ligne 891
- Carte Meta Ad avec image + headline : lignes 895-915 - **deja code, ne s'affiche pas**

---

### Diagnostic principal : `normalizeWhatsappChat()` ne transmet pas les champs

`admin/src/app/lib/api.ts:552-610` — Les champs `isCtwa`, `metaAdReferral` et `campaign_link_id`
sont dans le type `Partial<WhatsappChat>` mais **absents du retour** de `normalizeWhatsappChat()`.
Resultat : `chat.isCtwa` et `chat.metaAdReferral` sont toujours `undefined` dans l'UI.

---

## 2. Perimetre des User Stories

### US-1 : Badge "Pub Meta" dans la liste
**Condition :** `chat.isCtwa === true`
**Rendu :** Badge bleu avec icone `BadgeCheck` (deja importe ligne 5)
**Position :** Ligne separee sous le nom, avec `flex-wrap` pour eviter la compression du nom

### US-2 : Badge "Via campagne" dans la liste
**Condition :** `chat.campaign_link_id` present
**Rendu :** Badge orange avec icone `Link2` (deja importe ligne 5)
**Position :** Meme ligne que le badge "Pub Meta", avec `flex-wrap`

### US-3 : Image de campagne dans l'onglet conversation
**Condition :** `selectedChat.metaAdReferral?.imageUrl` non null
**Position :** Dans l'onglet "Conversation", juste sous la pilule "Debut de la conversation", avant le premier message
**Rendu :** Carte bleue centree, image pleine largeur, headline en dessous
**Etat :** Code deja present (lignes 895-915), bloque par le manque de donnees depuis `normalizeWhatsappChat()`
**Action requise :** Corriger la condition et debloquer via Tache 1

---

## 3. Taches techniques

### Tache 1 - Corriger `normalizeWhatsappChat` [BLOQUANT pour US-1/2/3]

**Fichier :** `admin/src/app/lib/api.ts`
**Lignes :** 569-610 (objet retourne par `normalizeWhatsappChat`)

Ajouter dans l'objet retourne (sans cast `as any` car `Partial<WhatsappChat>` contient deja ces champs) :

```typescript
campaign_link_id: chat.campaign_link_id ?? null,
isCtwa: chat.isCtwa ?? false,
metaAdReferral: chat.metaAdReferral ?? null,
```

**Verification avant/apres :**

```bash
# Verifier que les champs arrivent bien dans la reponse JSON du backend
curl -s "http://localhost:3000/chats?limit=5" | jq '.data[0] | {isCtwa, campaign_link_id, metaAdReferral}'
```

Si `isCtwa` est `null` ou absent dans la reponse JSON -> verifier le serializer backend
(probable `ClassSerializerInterceptor` ou DTO qui exclut ces champs).

---

### Tache 2 - Badges dans la liste [US-1 + US-2]

**Fichier :** `admin/src/app/ui/ConversationsView.tsx`
**Position :** Inserer une nouvelle ligne de badges entre l'apercu du message (ligne 659) et la ligne statut/poste/canal (ligne 660)

**Pourquoi une ligne separee :** La ligne `nom + ProviderBadge + Lock` est deja chargee.
Ajouter deux badges supplementaires sur la meme ligne risque de compresser le nom sur les
petits ecrans. Une ligne dediee avec `flex-wrap` est plus robuste.

**Code a inserer apres la ligne 659 :**

```tsx
{(chat.isCtwa || chat.campaign_link_id) && (
  <div className="flex flex-wrap gap-1 mt-0.5">
    {chat.isCtwa && (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
        <BadgeCheck className="w-2.5 h-2.5" />
        Pub Meta
      </span>
    )}
    {chat.campaign_link_id && (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-700">
        <Link2 className="w-2.5 h-2.5" />
        Campagne
      </span>
    )}
  </div>
)}
```

> `BadgeCheck` et `Link2` sont deja importes ligne 5 de `ConversationsView.tsx` - aucun import a ajouter.
> Note semantique : `BadgeCheck` evoque "valide/certifie" plutot que "publicite". L'icone `Megaphone`
> serait plus explicite mais necessite un import supplementaire. Decision retenue : `BadgeCheck` pour
> rester zero-import. A revoir si l'icone semble inadequate visuellement.

---

### Tache 3 - Corriger la condition Meta Ad dans l'onglet conversation [US-3]

**Fichier :** `admin/src/app/ui/ConversationsView.tsx`
**Lignes :** 895-915

**Probleme actuel :** La condition `(selectedChat?.isCtwa || selectedChat?.metaAdReferral)` peut
afficher la carte "Client venant d'une publicite Meta" sans image ni headline si `isCtwa === true`
mais `metaAdReferral` est null (abonnement CTWA sans donnees de pub enregistrees). Cela donne
une carte bleue vide, ce qui est inutile visuellement.

**Correction recommandee :** Remplacer **uniquement la condition** ligne 895 - ne pas toucher
au reste du bloc (le contenu image/headline est correct et deja en production).

```tsx
{/* Avant (ligne 895) : */}
{(selectedChat?.isCtwa || selectedChat?.metaAdReferral) && (

{/* Apres : */}
{(selectedChat.metaAdReferral?.imageUrl || selectedChat.metaAdReferral?.headline) && (
```

Le reste du bloc (lignes 896-914) reste identique - ne pas le modifier.

Cette modification est independante de la Tache 1 mais n'est utile qu'une fois les donnees
transmises correctement.

---

## 4. Recapitulatif des fichiers modifies

| Fichier | Taches | Modifications |
|---|---|---|
| `admin/src/app/lib/api.ts` | Tache 1 | +3 lignes dans `normalizeWhatsappChat()` |
| `admin/src/app/ui/ConversationsView.tsx` | Taches 2 et 3 | +1 bloc badges liste + correction condition Meta Ad |

**Aucune migration SQL** - les colonnes existent.
**Aucun nouveau composant** - badges inline.
**Aucune modification backend** si les champs sont deja serialises (verifier avec le curl ci-dessus).

---

## 5. Structure visuelle attendue

**Dans la liste (panneau gauche) :**

```
+-------------------------------------------------------------+
| [Avatar]  Jean Dupont  [WhatsApp] [Lock]               [3] |
|           Bonjour, je voudrais...                           |
|           [Pub Meta] [Campagne]                             |  <- nouvelle ligne
|           actif . Poste: Poste 1 . Canal: Canal A           |
|           Debut: 03/06/2026 . Fin: 03/06/2026 12:34         |
+-------------------------------------------------------------+
```

**Dans l'onglet conversation (panneau droit), apres selection :**

```
        +-------------------------------------------+
        |  Debut de la conversation - 3 juin 2026   |  <- pilule existante
        +-------------------------------------------+
        +-------------------------------------------+
        |    Client venant d'une publicite Meta     |  <- carte bleue (si image/headline)
        |  +-------------------------------------+  |
        |  |        [image campagne Meta]        |  |
        |  +-------------------------------------+  |
        |           Titre de la publicite            |
        +-------------------------------------------+
        [Message 1 de la conversation...]
```

---

## 6. Ordre d'execution

1. Verifier le backend : `curl -s "http://localhost:3000/chats?limit=5" | jq '.data[0] | {isCtwa, campaign_link_id, metaAdReferral}'`
2. **Tache 1** - Ajouter les 3 champs dans `normalizeWhatsappChat()` (bloquant)
3. **Tache 3** - Remplacer uniquement la condition de la carte Meta Ad
4. **Tache 2** - Ajouter la ligne de badges dans la liste
5. Verifier le build : `npm run build --prefix admin` (ou `tsc` si disponible)
