# Prompt prêt-à-l’usage pour générer la nouvelle page Contacts

Utilise ce prompt tel quel auprès d’un modèle capable de consommer un fichier : tu pourras lui passer successivement les fichiers listés ci-dessous (en complétant par leur contenu brut) puis inclure ce prompt comme “instructions”. Le modèle doit se baser sur les entités et composants existants pour créer `front/src/app/contacts/page.tsx`.

```
Prompt :
- Suit les bonnes pratiques de prompt-engineering : donne un plan, explicite les données sources, précise les composants à générer, mentionne les dépendances (Tailwind/classes, lucide-react, utils de date).
- La page Contacts est un composant client React `ContactsPage` qui s’intègre dans notre layout Next.js (typo Geists, palette gray/green/blue). Elle doit utiliser `use client`, `useContactStore`, `useChatStore`, `formatRelativeDate`, `formatDate`.
- Structure : layout deux colonnes (`className="grid grid-cols-[280px_1fr] gap-6"`). Volet gauche sticky (panneau filtres/stats + mini liste de contacts) ; colonne principale pour la fiche détaillée + actions + log/historique.
- Données disponibles :
  * `Contact`: `id`, `name`, `contact`, `chat_id`, `call_status`, `last_call_date`, `next_call_date`, `call_count`, `total_messages`, `last_message_date`, `conversion_status`, `priority`, `source`, `call_notes`, `is_active`, `createdAt`, `updatedAt`.
  * `Conversation`: `clientName`, `clientPhone`, `lastMessage.timestamp`, `status`, `priority`, `tags`, `source`, `last_client_message_at`, `last_poste_message_at`, `read_only`, `createdAt`, `updatedAt`.
  * `Message`: `text`, `timestamp`, `from_me`, `medias`.
- La page finalisée expose :
  1. `SidebarFilters` (search, selecteurs `call_status`, `priority`, `conversion_status`, tri `last_call`/`next_call`/`name`), stats (`total`, `à rappeler`, `appels manqués`, `prospects chauds`).
  2. `ContactsFeed` (liste verticale stylisée comme dans l’actuel `ContactsListView`, avec avatar initial, badges `call_status` + `priority`, diversité de champs temporels).
  3. `ContactDetails` (fiche centrale) : avatar + nom + téléphone + badges (call_status/priority/conversion). Timeline (dernier appel, prochain appel, dernier message, créé, mis à jour). Section “Informations” (source, chat_id, `is_active`, notes, `updatedAt`). Section “Actions” (boutons Appeler, Voir conversation, Export, Modal/drawer pour modifier `call_status`/notes). Section “Historique” (log des messages & appels, date, type).
- Les composants doivent utiliser les icônes `Phone`, `PhoneCall`, `Clock`, `Tag`, `Calendar`, `MessageSquare` de `lucide-react`.
- Les styles doivent réutiliser les classes Tailwind déjà présentes (`rounded-2xl bg-white shadow-lg p-6 flex gap-4 text-sm text-gray-600`, etc.). Les badges doivent avoir les mêmes couleurs (verts, jaunes, rouges, bleus).
- Prévoyez un état `loading`/`empty` (afficher un texte explicite si `contacts.length === 0`, spinner si les stores ne sont pas encore remplis).
- Génère également les fichiers suivants si nécessaires : `front/src/components/contacts/ContactCard.tsx`, `front/src/components/contacts/ContactTimeline.tsx`, `front/src/components/contacts/ContactFilters.tsx` pour organiser la structure.
- Inclure un commentaire dans le code mentionnant que les données proviennent du backend WebSocket (via `useContactStore()`).
- Rappeler à la fin du prompt de renvoyer uniquement le code complet (sans explication).  
```

Fichiers à fournir au modèle (avec leur contenu complet avant le prompt) :
- `front/src/types/chat.ts`
- `front/src/components/sidebar/Sidebar.tsx`
- `front/src/components/ContactsListView.tsx`
- `front/src/components/chat/ChatHeader.tsx` (pour la palette et la typographie)
- `front/src/lib/dateUtils.ts`

Ce prompt est prêt : il suffit de joindre les fichiers ci-dessus et ce texte pour générer un composant cohérent. Tu veux que je prépare un script qui concatène les fichiers + ce prompt vers l’IA ? 
