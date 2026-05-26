# Plan — Exclusion des postes dédiés de la règle "Lecture messages"

**Date :** 2026-05-26
**Statut :** ✅ Backend déjà implémenté — 1 action UI restante
**Priorité :** P2 — documentation / clarté admin

---

## Contexte

La règle **"Lecture messages"** (section `LectureSeuleView.tsx`) limite le nombre de
messages qu'un commercial peut marquer comme lus par minute via le paramètre
`maxReadMessagesPerMinute` (1–60, défaut 1). Elle empêche le traitement automatique
trop rapide sur le pool de postes partagés.

Les postes dédiés (`WhapiChannel.poste_id IS NOT NULL`) ont un usage administratif
différent : leurs commerciaux ne doivent pas être soumis à cette limitation.

---

## État actuel du code

### Backend — déjà exclu ✅

**Fichier :** `message_whatsapp/src/whatsapp_message/message-read.service.ts`

```typescript
async markConversationAsRead(
  commercialId: string,
  chatId: string,
  isDedicated = false,     // ← flag injecté par la gateway
): Promise<{ markedCount: number }> {
  // ...
  if (isDedicated) {
    granted = messages.length;   // ← tous les messages, sans limite
  } else {
    const settings = await this.settingsRepository.findOne({ ... });
    const maxPerMinute = settings?.maxReadMessagesPerMinute ?? 1;
    granted = this.rateLimiter.consumeUpTo(commercialId, messages.length, maxPerMinute);
  }
  // ...
}
```

Le rate limit est contourné quand `isDedicated = true` — la valeur `granted` est égale
au nombre total de messages à lire sans passer par `MessageReadRateLimiterService`.

**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

Détection à la connexion du commercial :
```typescript
const isDedicated = posteId
  ? (await this.channelRepository.count({ where: { poste_id: posteId } })) > 0
  : false;
```

Ce flag est stocké dans `connectedAgents` et transmis à chaque appel de
`markConversationAsRead()` via l'événement socket `conversation:read`.

**Conclusion backend :** l'exclusion est complète et correcte.
Aucune modification backend nécessaire.

---

## Gap identifié — UI admin

**Fichier :** `admin/src/app/ui/LectureSeuleView.tsx`

La section "Lecture messages" affiche uniquement :

> *"Limite le nombre de messages qu'un commercial peut marquer comme lus par minute.
> Permet de freiner le traitement automatique trop rapide."*

L'admin ne sait pas que les postes dédiés ignorent ce paramètre. Si un admin
constate que des commerciaux sur postes dédiés marquent des messages en masse malgré
une limite configurée à 1/min, il peut croire à un bug alors que c'est le comportement
voulu.

---

## Correction à apporter

### US-1 — Ajouter une note explicative dans `LectureSeuleView.tsx` (P2)

**Fichier :** `admin/src/app/ui/LectureSeuleView.tsx`
**Section :** `SectionCard` "Lecture messages" (ligne ~170)

Ajouter une note visuelle sous le texte de description, ou sous le champ input,
indiquant que cette règle ne s'applique pas aux postes dédiés :

```tsx
<p className="mt-1 text-[11px] text-gray-400">
  Min: 1 — Max: 60 messages par minute
</p>
{/* Ajouter : */}
<p className="mt-2 text-[11px] text-blue-500">
  Les postes à canal dédié ignorent cette limite — leurs commerciaux lisent
  tous les messages sans restriction.
</p>
```

Ou via un bandeau `InfoBadge` dans la `description` du `SectionCard` :

```
description="Limite le nombre de messages qu'un commercial peut marquer comme lus
par minute. Permet de freiner le traitement automatique trop rapide.
⚠ Non applicable aux postes à canal dédié."
```

---

## Récapitulatif

| Composant | État | Action |
|---|---|---|
| `message-read.service.ts` | ✅ Déjà exclu — `if (isDedicated) granted = all` | Aucune |
| `whatsapp_message.gateway.ts` | ✅ Détection correcte — `count({ where: { poste_id } }) > 0` | Aucune |
| `message-read-rate-limiter.service.ts` | ✅ Non appelé pour les dédiés | Aucune |
| `LectureSeuleView.tsx` | ⚠ Pas de mention de l'exclusion | Ajouter note UI |

---

## Ordre d'implémentation

```
US-1 (LectureSeuleView.tsx — note UI) — 5 min
```

Aucune migration, aucun changement backend, aucun test supplémentaire nécessaire.
