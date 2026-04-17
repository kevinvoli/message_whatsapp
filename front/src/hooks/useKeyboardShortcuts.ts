import { useEffect } from 'react';

/**
 * Raccourcis clavier globaux de l'application.
 * Les actions sont dispatched via CustomEvent pour découpler les composants.
 *
 * Ctrl+K  → focus barre de recherche
 * Ctrl+/  → ouvre les réponses rapides (canned responses)
 * Ctrl+Enter → envoie le message en cours
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+K — focus recherche
      if (ctrl && e.key === 'k') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('app:focus-search'));
        return;
      }

      // Ctrl+/ — ouvre les réponses rapides
      if (ctrl && e.key === '/') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('app:open-canned'));
        return;
      }

      // Ctrl+Enter — envoyer message
      if (ctrl && e.key === 'Enter') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('app:send-message'));
        return;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
