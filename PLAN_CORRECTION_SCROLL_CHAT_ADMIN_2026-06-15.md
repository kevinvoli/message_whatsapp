# Plan de correction — Auto-scroll forcé dans le chat admin (Conversations)

Date : 2026-06-15
Bug : sur une conversation avec beaucoup de messages, l'admin est ramené en
permanence vers le dernier message — impossible de scroller vers le haut pour
lire l'historique.

---

## 1. Fichier concerné

`admin/src/app/ui/ConversationsView.tsx`

---

## 2. Cause racine

### A. Auto-scroll inconditionnel à chaque changement de `messages`

```ts
// ligne 175-182
useEffect(() => {
    // Scroll to bottom when messages change
    scrollToBottom();
}, [messages]);

const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
};
```

Ce `useEffect` se déclenche à **chaque** mutation de `messages`, sans vérifier si
l'utilisateur est déjà en train de lire l'historique plus haut.

### B. Polling qui réassigne `messages` toutes les 3 secondes

```ts
// ligne 382-396
const pollMessages = useCallback(async () => {
    if (!selectedChat) return;
    try {
        const count = await getMessageCount(selectedChat.chat_id);
        if (count !== messageCountRef.current) {
            const fetched = await getMessagesForChat(selectedChat.chat_id);
            messageCountRef.current = fetched.length;
            setMessages(fetched);   // ← nouvelle référence de tableau
        }
    } catch {
        // Silent fail
    }
}, [selectedChat]);

useRealtimePolling(pollMessages, { interval: 3000, enabled: !!selectedChat });
```

Dès qu'un nouveau message arrive côté serveur (très fréquent sur une conversation
active), `setMessages(fetched)` remplace le tableau → déclenche le `useEffect` A →
`scrollToBottom()` → l'utilisateur est ramené en bas, peu importe où il avait scrollé.

### C. Aucune détection de la position de scroll de l'utilisateur

Le conteneur scrollable (`ligne 924`, `<div className="flex-1 overflow-y-auto ...">`)
n'a pas de ref ni de listener `onScroll`. Il n'existe aucun état `isAtBottom` pour
conditionner l'auto-scroll.

---

## 3. Plan d'action — `frontend-dev`

### Étape 1 — Ref + tracking de la position de scroll
- Ajouter `const messagesContainerRef = useRef<HTMLDivElement>(null);` et le poser
  sur le conteneur scrollable (ligne 924).
- Ajouter un état `const [isAtBottom, setIsAtBottom] = useState(true);`
- `onScroll` sur ce conteneur : calculer
  `distanceToBottom = scrollHeight - scrollTop - clientHeight` et mettre
  `setIsAtBottom(distanceToBottom < 150)` (seuil ~150px pour tolérer les petits écarts).

### Étape 2 — Conditionner l'auto-scroll (corrige le bug principal)
- Remplacer le `useEffect([messages])` (ligne 175-178) :
  ```ts
  useEffect(() => {
      if (isAtBottom) {
          scrollToBottom();
      }
  }, [messages, isAtBottom]);
  ```
- Conséquence : pendant que l'admin lit l'historique (scrollé vers le haut), le
  polling continue de mettre à jour `messages` en arrière-plan mais ne provoque
  plus de saut de scroll. Dès qu'il revient en bas, l'auto-scroll reprend.

### Étape 3 — Forcer le scroll au changement de conversation
- Dans le `useEffect([selectedChat])` (ligne 164-173), réinitialiser
  `setIsAtBottom(true)` avant `fetchMessages(...)` pour garantir que l'ouverture
  d'une nouvelle conversation affiche bien le dernier message.

### Étape 4 — Garder le scroll forcé sur les actions de l'admin
- `handleSendMessage` (ligne 307-362) et `handleSendMedia` (ligne 364-378) appellent
  déjà `scrollToBottom()` directement — comportement voulu (l'admin qui envoie un
  message doit voir son message). Ajouter `setIsAtBottom(true)` à ces deux endroits
  pour rester cohérent avec l'étape 2 (sinon le prochain message entrant ne
  re-scrollerait pas si `isAtBottom` était resté `false`).

### Étape 5 (optionnel, confort) — Indicateur "nouveaux messages"
- Si `isAtBottom === false` et que `messages` change (nouveau message reçu),
  afficher un petit badge flottant "Nouveaux messages ↓" en bas du conteneur,
  cliquable pour `scrollToBottom()` + `setIsAtBottom(true)`. Non bloquant, à faire
  seulement si le temps le permet.

---

## 4. Tests manuels (skill `/verify`)
- Ouvrir une conversation avec beaucoup de messages, scroller vers le haut, attendre
  >3s (un cycle de polling) → la position de scroll ne doit plus bouger.
- Recevoir un nouveau message pendant qu'on lit l'historique → pas de saut.
- Revenir en bas manuellement, recevoir un nouveau message → auto-scroll reprend.
- Changer de conversation → scroll initial bien en bas.
- Envoyer un message → scroll en bas + reste en bas pour les messages suivants.

---

## 5. Fichiers impactés
- `admin/src/app/ui/ConversationsView.tsx` (lignes 164-182, 307-394, 924)
