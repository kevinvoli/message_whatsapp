# Plan — Fermeture conversation réservée à l'admin

**Date :** 2026-06-16  
**Branche :** production  
**Objectif :** Retirer aux commerciaux la capacité de fermer une conversation. Seul l'admin peut fermer. L'admin doit avoir un bouton pour le faire.

---

## Contexte

### Chemins de fermeture actuels

| Chemin | Initiateur | Statut cible |
|--------|-----------|--------------|
| Menu "options" commercial | Commercial (WebSocket) | ❌ À bloquer |
| PATCH /chats/:chat_id [AdminGuard] | Admin (REST) | ✅ Déjà correct — guard en place |
| Cron ReadOnlyEnforcementJob | Système | ✅ Inchangé |
| Dispatcher SLA (réouverture auto) | Système | ✅ Inchangé |

### Problème côté admin

L'endpoint `PATCH /chats/:chat_id` accepte `status` dans le DTO mais `patchChat()` dans `admin/src/app/lib/api.ts:1089-1097` n'expose que `read_only` et `is_archived`. Il n'existe pas non plus de bouton "Fermer" dans l'UI admin.

---

## Tâches

### US-1 — Retirer "fermé" du menu commercial (front)

**Fichier :** `front/src/components/conversation/conversationOptionMenu.tsx`

**Ligne clé :** 86 — tableau des options : `['actif', 'attente', 'converti', 'fermé']`

**Action :** Supprimer `'fermé'` du tableau. Le composant filtre les options selon ce tableau, donc aucune autre modification n'est nécessaire dans ce fichier.

```diff
- const options = ['actif', 'attente', 'converti', 'fermé'];
+ const options = ['actif', 'attente', 'converti'];
```

Vérifier également que les confirmations (lignes 20-21) n'ont plus de référence à `'fermé'` si elles sont hard-codées sur cette valeur.

---

### US-2 — Bloquer la fermeture via WebSocket côté backend

**Fichier :** `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts`

**Zone :** Handler `CONVERSATION_STATUS_CHANGE`, lignes 635-678

**Action :** Ajouter un guard explicite qui rejette toute tentative de passer à `status = 'fermé'` via le WebSocket commercial (le WS est exclusivement utilisé par les commerciaux — les admins utilisent l'API REST).

```typescript
// À ajouter AVANT le check no_close (après la vérification du tenant)
if (newStatus === WhatsappChatStatus.FERME) {
  this.logger.warn(
    `WS_STATUS_CHANGE_FORBIDDEN chat=${chatId} status=fermé — fermeture réservée à l'admin`,
  );
  return; // rejeter silencieusement
}
```

Cela garantit une défense en profondeur : même si le frontend envoyait le statut "fermé" (bug, manipulation), il serait refusé.

---

### US-3 — Exposer `status` dans `patchChat()` côté admin

**Fichier :** `admin/src/app/lib/api.ts`

**Ligne :** 1089-1097

**Action :** Étendre le type du paramètre `data` pour inclure `status`.

```diff
- async function patchChat(chatId: string, data: Partial<{ read_only: boolean; is_archived: boolean }>)
+ async function patchChat(chatId: string, data: Partial<{ read_only: boolean; is_archived: boolean; status: string }>)
```

Vérifier aussi que `UpdateWhatsappChatDto` côté backend accepte bien `status` (déjà confirmé — `whatsapp_chat.controller.ts:82-85`).

---

### US-4 — Ajouter le bouton "Fermer" dans l'UI admin

**Fichier principal :** à identifier — chercher où l'admin affiche le détail d'une conversation ou la liste des conversations actives.

Candidats probables :
- `admin/src/app/ui/ConversationsView.tsx` — vue liste avec badges statut (lignes 270-293)
- Un composant de détail de conversation admin (à vérifier)

**Action :** Ajouter un bouton "Fermer la conversation" visible uniquement quand `chat.status !== 'fermé'`.

```tsx
{chat.status !== 'fermé' && (
  <button
    onClick={() => handleCloseConversation(chat.chat_id)}
    className="..."
  >
    Fermer la conversation
  </button>
)}
```

Avec le handler :
```tsx
async function handleCloseConversation(chatId: string) {
  if (!confirm('Fermer cette conversation ?')) return;
  await patchChat(chatId, { status: 'fermé' });
  // Rafraîchir la liste
}
```

---

## Fichiers à modifier (récapitulatif)

| Fichier | Tâche | Type |
|---------|-------|------|
| `front/src/components/conversation/conversationOptionMenu.tsx:86` | US-1 : retirer 'fermé' du tableau options | Front commercial |
| `message_whatsapp/src/whatsapp_message/whatsapp_message.gateway.ts:635-678` | US-2 : guard WS anti-fermeture | Backend |
| `admin/src/app/lib/api.ts:1089-1097` | US-3 : exposer `status` dans `patchChat()` | Admin |
| `admin/src/app/ui/ConversationsView.tsx` (ou composant détail) | US-4 : bouton Fermer | Admin UI |

---

## Points d'attention

- **Réouverture automatique** : le dispatcher SLA peut rouvrir des conversations fermées (step 0). Ce comportement est inchangé — ne pas y toucher.
- **Cron ReadOnlyEnforcementJob** : fermeture système via fenêtre glissante — inchangé.
- **Flag `no_close`** : le canal peut bloquer la fermeture — ce guard est orthogonal, on le conserve.
- **Confirmation UX** : garder une boîte de confirmation avant la fermeture côté admin (irréversible pour le commercial).
- **Zéro migration SQL** : aucun changement de schéma — les statuts existent déjà.

---

## Ordre d'implémentation recommandé

1. US-2 (backend) — défense en profondeur en premier
2. US-1 (front commercial) — UX côté commercial
3. US-3 (admin api.ts) — prérequis pour US-4
4. US-4 (admin UI) — bouton Fermer pour l'admin
