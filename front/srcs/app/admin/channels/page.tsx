'use client';

import { useEffect, useState } from 'react';

// Interfaces pour typer les données
interface Channel {
  id: string;
  channel_id: string;
  token: string;
  version: string;
  ip: string;
}

interface NewChannel {
  token: string;
}

export default function AdminChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [newChannel, setNewChannel] = useState<NewChannel>({ token: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fonction pour récupérer les canaux
  const fetchChannels = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/channel'); // Assurez-vous que l'URL de l'API est correcte
      if (!response.ok) {
        throw new Error('Failed to fetch channels');
      }
      const data = await response.json();
      setChannels(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour créer un nouveau canal
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/channel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newChannel),
      });

      if (!response.ok) {
        throw new Error('Failed to create channel');
      }

      setNewChannel({ token: '' }); // Réinitialiser le formulaire
      fetchChannels(); // Recharger la liste
    } catch (err) {
      setError(err.message);
    }
  };

  // Charger les données au montage du composant
  useEffect(() => {
    fetchChannels();
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Gestion des Canaux WhatsApp</h1>

      {/* Formulaire d'ajout */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Ajouter un nouveau canal</h2>
        <form onSubmit={handleCreateChannel} className="flex gap-2">
          <input
            type="text"
            value={newChannel.token}
            onChange={(e) => setNewChannel({ token: e.target.value })}
            placeholder="Entrez le token Whapi.cloud"
            className="input input-bordered w-full max-w-xs"
            required
          />
          <button type="submit" className="btn btn-primary">
            Ajouter
          </button>
        </form>
      </div>

      {/* Affichage des erreurs */}
      {error && <p className="text-red-500">Erreur : {error}</p>}

      {/* Liste des canaux */}
      <div>
        <h2 className="text-xl font-semibold mb-2">Canaux existants</h2>
        {loading ? (
          <p>Chargement...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>ID du Canal</th>
                  <th>Token (partiel)</th>
                  <th>Version</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel) => (
                  <tr key={channel.id}>
                    <td>{channel.channel_id}</td>
                    <td>{`${channel.token.substring(0, 10)}...`}</td>
                    <td>{channel.version}</td>
                    <td>{channel.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
