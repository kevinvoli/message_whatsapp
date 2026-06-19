'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Onglet ouvert depuis un ancien déploiement : rechargement silencieux
    // pour récupérer le bundle courant.
    if (error?.message?.includes('Failed to find Server Action')) {
      window.location.reload();
      return;
    }
    console.error(error);
  }, [error]);

  if (error?.message?.includes('Failed to find Server Action')) {
    return null;
  }

  return (
    <html>
      <body style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#666' }}>Une erreur inattendue s&apos;est produite.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}
          >
            Recharger
          </button>
        </div>
      </body>
    </html>
  );
}
