import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/store/chatStore';

/**
 * Gère la recherche de conversations côté serveur.
 * Debounce 300 ms pour éviter de spammer à chaque frappe.
 * Skip le premier render (WebSocketEvents.tsx gère le chargement initial).
 */
export function useConversationSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const { loadConversations } = useChatStore();
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      loadConversations(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, loadConversations]);

  return { searchQuery, setSearchQuery };
}
