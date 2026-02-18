# Audit UX/UI — affichage des contacts

## 1. Vue globale et priorités visuelles
- **Cadre** : `ContactsListView` présente un panneau vertical avec un en-tête clair, des stats (total, appels par statut) et une barre de recherche + filtres, tous organisés dans des blocs blancs sur fond gris. La hiérarchie est bonne : titre + description → stats → outils → liste.
- **Lisibilité** : chaque fiche utilise une carte `bg-white` avec icône initiale, nom, téléphone, badges (`call_status`, `priority`) très visibles, puis trois lignes de méta (dernier appel, nombre d’appels, nb de messages), ce qui aide à scanner. Les couleurs sont cohérentes (verts oranges etc.) pour les statuts.

## 2. Données affichées et formatage
- `formatRelativeDate` (dans `front/src/lib/dateUtils.ts`) sert à formater `last_call_date`/`next_call_date`, ce qui rend la lecture du temps lisible (hier, il y a 2h…), mais il faut penser à un fallback `'-'` si la date est nulle (actuellement `formatRelativeDate` renvoie `'-'` sur `null`, donc OK).
- Les champs utilisés :
  * `contact.name`, `contact.contact`, `contact.call_status`, `contact.priority`, `contact.tags`, `contact.call_notes`, `contact.source`.
  * Statistiques : `contact.last_call_date`, `contact.call_count`, `contact.total_messages`, `contact.source`, `contact.next_call_date`.
  * Actions : bouton “Marquer comme appelé” ouvre un modal.
- **Manque** : aucune mention directe de `conversation`/`chat_id`, donc la liste ne permet pas d’identifier si un contact a une discussion ouverte. Si besoin, on pourrait afficher `contact.chat_id` ou une balise “Conversation active” tirée de `contact.chat_id`.

## 3. Interactions et filtres
- **Recherche & filtres** : input + bouton “Filtres” (toggle), qui affiche un panneau complet (statut d’appel, priorité, tri). Les filtres appliquent des tableaux de statut/priority, et un tri multi-critères (nom, dernier appel, prochain appel, priorité, date de création). Les boutons “croissant/décroissant” sont clairs.
- **Modale d’appel** : le bouton “Marquer comme appelé” charge un modal qui montre les infos du contact, permet de choisir un statut d’appel, d’ajouter des notes, puis appelle `onCallStatusChange`. C’est bien de séparer la confirmation ; on pourrait renforcer la hiérarchie visuelle (ex. faire ressortir le statut sélectionné).
- **Feedback** : pas d’indicateur de chargement ou de message de succès (mais la fonction `onCallStatusChange` est fournie par le parent `whatsapp/page.tsx`). Il faudrait vérifier que cette action met bien à jour le badge dans la liste (par exemple via un state global / rechargement).

## 4. Source des données et rafraîchissement
- `WebSocketEvents` (`front/src/components/WebSocketEvents.tsx`) initialize les stores `useContactStore`, avec `setContacts` (via l’événement `contact:event`). Ces contacts proviennent du backend par `WhatsappMessageGateway.sendContactsToClient`.
- `useContactStore` gère `contacts`, `selectedContact`, `loadContacts` et les opérations d’upsert/remove (`front/src/store/contactStore.ts`). Actuellement, la liste réelle ne déclenche aucun `loadContacts` (le store sert surtout à recevoir les événements), donc la seule source est `WebSocketEvents`.
- Les données contact affichées sont des dates converties via `new Date(...)` dans `transformToContact` (types). Il vaut la peine de vérifier que tous les champs (ex. `call_notes`, `call_count`) sont toujours définis pour éviter `undefined`.

## 5. Observations UX / risques
1. **Filtres détaillés** : bon niveau de control, mais le panneau est chargé et ne se referme pas automatiquement après sélection ; il faut cliquer à nouveau sur “Filtres”.
2. **Absence de pagination/virtualisation** : la liste affiche tous les contacts; si le corpus est grand, cela peut ralentir l’UI.
3. **Accessibilité** : les boutons de vote (croissant/décroissant) utilisent uniquement la couleur pour indiquer l’état actif ; ajouter un `aria-pressed` ou un label renforcerait l’accessibilité.
4. **Remontée des appels** : aucun indicateur de charge réseau (chargement/erreurs). Il faudrait éventuellement afficher un spinner lors du `onRefresh` si ce dernier fait une requête.

## 6. Recommandations
1. Ajouter dans la carte contact la date exacte de création (`createdAt`) ou un badge “Conversation en cours” si `chat_id` est connecté — sinon l’utilisateur ne sait pas si un chat a été ouvert.
2. Ajouter une petite animation/spinner lors du `onRefresh`/`onExport` pour signaler que l’action est prise en charge.
3. Si la liste est longue, envisager une pagination/filtrage côté serveur plutôt que tout charger, ou intégrer un `virtual scroll` (ex. `react-window`).
4. Documenter la liaison `contact.call_status` ↔ badges pour garantir la cohérence si le backend ajoute de nouveaux statuts (ajouter un “Unknown”).
5. Penser à un état “Chargement” lorsque la websocket n’a pas encore livré les contacts (actuellement la liste est vide).

Le contenu de cet audit est enregistré ici pour alimenter la prochaine itération de design.

## 7. Cohérence visuelle & doublons
- **Décalage de contextes** : sur la sidebar on affiche les contacts dans la vue “Contacts” (déclenchée par `viewMode === 'contacts'` dans `Sidebar`), alors qu’un panneau “principale” du même layout montre également la liste (`ContactsListView`). Cela crée un sentiment de duplication : l’utilisateur voit la même carte deux fois sur la page, ce qui affaiblit la hiérarchie. Il faudrait :
  1. Soit fusionner les deux vues (sidebar + colonne principale) en un seul flux de contacts,  
  2. Soit réserver la sidebar à une navigation compacte et déporter la liste détaillée dans la zone principale uniquement lorsque `viewMode === 'contacts'`.
- **Alignement avec la base de données** : la table `contact` contient `call_status`, `last_call_date`, `next_call_date`, `call_count`, `total_messages`, `conversion_status`, `source`, `priority`, `call_notes`, `chat_id`, `is_active`, `createdAt`, `updatedAt`. L’UI pourrait refléter davantage ces champs :
  - Afficher `conversion_status` comme un badge (“Prospect”, “Client”, etc.) à côté du nom pour savoir comment le contact évolue.  
  - Rendre visible `chat_id` ou écouter un `last_message_date` pour signaler s’il existe un chat associé en temps réel.  
  - Ajouter un indicateur “Actif / Inactif” (`is_active`) pour filtrer les contacts obsolètes (utiliser un petit badge gris).  
  - Utiliser `updatedAt` pour un “Mis à jour” secondaire, afin de savoir quand la fiche a changé (complément à “Dernier appel”).  
- **Suggestions UI** :  
  1. Remplacer les champs dupliqués dans la sidebar par des résumés (ex. un simple compteur “Contacts actifs: X”) et laisser la liste détaillée à la section principale, de façon à éviter la redondance.  
  2. Enrichir chaque carte de contact avec une ligne “Dernier message” (tirée de `total_messages`/`last_message_date`) et un badge “Conversion” basé sur `conversion_status`.  
  3. Ajouter une mini carte “Détails rapides” dans la sidebar (ou un tooltip) qui réutilise `call_notes`, `priority`, `source` pour éviter d’afficher la même carte complète deux fois.

Ces points sont également consignés dans le fichier pour cadrer la prochaine amélioration de l’interface contacts.
