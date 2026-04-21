'use client';

import { useEffect, useState } from 'react';
import {
  ClientMapping,
  CommercialMapping,
  getClientMappings,
  upsertClientMapping,
  deleteClientMapping,
  getCommercialMappings,
  upsertCommercialMapping,
  deleteCommercialMapping,
} from '../lib/api/integration.api';

type Tab = 'clients' | 'commercials';

export default function IntegrationView() {
  const [tab, setTab] = useState<Tab>('clients');
  const [clientMappings, setClientMappings] = useState<ClientMapping[]>([]);
  const [commercialMappings, setCommercialMappings] = useState<CommercialMapping[]>([]);
  const [loading, setLoading] = useState(true);

  // Client form
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientForm, setClientForm] = useState({ contact_id: '', external_id: '', phone: '' });
  const [clientSaving, setClientSaving] = useState(false);

  // Commercial form
  const [showCommercialModal, setShowCommercialModal] = useState(false);
  const [commercialForm, setCommercialForm] = useState({ commercial_id: '', external_id: '', name: '' });
  const [commercialSaving, setCommercialSaving] = useState(false);

  useEffect(() => {
    Promise.all([getClientMappings(), getCommercialMappings()])
      .then(([c, co]) => { setClientMappings(c); setCommercialMappings(co); })
      .finally(() => setLoading(false));
  }, []);

  const saveClient = async () => {
    if (!clientForm.contact_id || !clientForm.external_id) return;
    setClientSaving(true);
    try {
      const saved = await upsertClientMapping({
        contact_id: clientForm.contact_id,
        external_id: parseInt(clientForm.external_id),
        phone: clientForm.phone || undefined,
      });
      setClientMappings((prev) => {
        const idx = prev.findIndex((m) => m.id === saved.id);
        return idx >= 0 ? prev.map((m, i) => (i === idx ? saved : m)) : [saved, ...prev];
      });
      setShowClientModal(false);
      setClientForm({ contact_id: '', external_id: '', phone: '' });
    } finally {
      setClientSaving(false);
    }
  };

  const saveCommercial = async () => {
    if (!commercialForm.commercial_id || !commercialForm.external_id) return;
    setCommercialSaving(true);
    try {
      const saved = await upsertCommercialMapping({
        commercial_id: commercialForm.commercial_id,
        external_id: parseInt(commercialForm.external_id),
        name: commercialForm.name || undefined,
      });
      setCommercialMappings((prev) => {
        const idx = prev.findIndex((m) => m.id === saved.id);
        return idx >= 0 ? prev.map((m, i) => (i === idx ? saved : m)) : [saved, ...prev];
      });
      setShowCommercialModal(false);
      setCommercialForm({ commercial_id: '', external_id: '', name: '' });
    } finally {
      setCommercialSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Chargement…</div>;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Intégration ERP</h2>
        <p className="text-sm text-gray-500 mt-1">
          Correspondance entre les identifiants internes (UUID) et les identifiants externes (entiers) de votre ERP.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-medium">Fonctionnement</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-700">
          <li>Webhook entrant ERP : <code className="bg-blue-100 px-1 rounded">POST /integration/erp</code> (header <code className="bg-blue-100 px-1 rounded">x-integration-secret</code>)</li>
          <li>Webhook sortant vers ERP : variable d&apos;environnement <code className="bg-blue-100 px-1 rounded">INTEGRATION_ERP_URL</code></li>
          <li>Les mappings permettent de convertir UUID ↔ ID entier dans les payloads envoyés à l&apos;ERP.</li>
        </ul>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['clients', 'commercials'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'clients' ? `Clients (${clientMappings.length})` : `Commerciaux (${commercialMappings.length})`}
          </button>
        ))}
      </div>

      {tab === 'clients' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowClientModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              + Ajouter un mapping
            </button>
          </div>
          {clientMappings.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun mapping client.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">UUID Contact</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">ID ERP</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Téléphone</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {clientMappings.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{m.contact_id}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{m.external_id}</td>
                      <td className="px-4 py-3 text-gray-600">{m.phone_normalized ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => { void deleteClientMapping(m.id); setClientMappings((prev) => prev.filter((x) => x.id !== m.id)); }}
                          className="text-red-500 hover:underline text-xs"
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'commercials' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowCommercialModal(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              + Ajouter un mapping
            </button>
          </div>
          {commercialMappings.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun mapping commercial.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">UUID Commercial</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">ID ERP</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Nom</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {commercialMappings.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{m.commercial_id}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{m.external_id}</td>
                      <td className="px-4 py-3 text-gray-600">{m.commercial_name ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => { void deleteCommercialMapping(m.id); setCommercialMappings((prev) => prev.filter((x) => x.id !== m.id)); }}
                          className="text-red-500 hover:underline text-xs"
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal client */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold">Nouveau mapping client</h3>
            <label className="block text-sm font-medium text-gray-700">
              UUID Contact (interne)
              <input type="text" value={clientForm.contact_id}
                onChange={(e) => setClientForm((f) => ({ ...f, contact_id: e.target.value }))}
                className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              ID ERP (entier)
              <input type="number" value={clientForm.external_id}
                onChange={(e) => setClientForm((f) => ({ ...f, external_id: e.target.value }))}
                className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Téléphone (optionnel)
              <input type="text" value={clientForm.phone}
                onChange={(e) => setClientForm((f) => ({ ...f, phone: e.target.value }))}
                className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setShowClientModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
              <button onClick={() => void saveClient()} disabled={clientSaving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {clientSaving ? 'Sauvegarde…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal commercial */}
      {showCommercialModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-semibold">Nouveau mapping commercial</h3>
            <label className="block text-sm font-medium text-gray-700">
              UUID Commercial (interne)
              <input type="text" value={commercialForm.commercial_id}
                onChange={(e) => setCommercialForm((f) => ({ ...f, commercial_id: e.target.value }))}
                className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              ID ERP (entier)
              <input type="number" value={commercialForm.external_id}
                onChange={(e) => setCommercialForm((f) => ({ ...f, external_id: e.target.value }))}
                className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Nom (optionnel)
              <input type="text" value={commercialForm.name}
                onChange={(e) => setCommercialForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </label>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setShowCommercialModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
              <button onClick={() => void saveCommercial()} disabled={commercialSaving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {commercialSaving ? 'Sauvegarde…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
