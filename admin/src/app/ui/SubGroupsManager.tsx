'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Trash2,
  Clock,
  Loader2,
  X,
  AlertTriangle,
} from 'lucide-react';
import { CommercialSubGroup } from '@/app/lib/definitions';
import {
  getSubGroups,
  createSubGroup,
  updateSubGroup,
  deleteSubGroup,
} from '@/app/lib/api/commercial-groups.api';

// ─── Props ───────────────────────────────────────────────────────────────────

interface SubGroupsManagerProps {
  groupId: string;
  groupName: string;
  onClose?: () => void;
  /** Rendu inline sans overlay modal. Par défaut: false. */
  inline?: boolean;
}

// ─── Modal création sous-groupe ──────────────────────────────────────────────

interface SubGroupFormModalProps {
  parentGroupId: string;
  onClose: () => void;
  onSaved: () => void;
}

function SubGroupFormModal({ parentGroupId, onClose, onSaved }: SubGroupFormModalProps) {
  const [name, setName]        = useState('');
  const [description, setDesc] = useState('');
  const [saving, setSaving]    = useState(false);
  const [error, setError]      = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Le nom est requis.'); return; }
    setSaving(true);
    setError(null);
    try {
      await createSubGroup({
        parentGroupId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-gray-900">Nouveau sous-groupe</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Fermer">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nom *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Équipe matin"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              rows={2}
              placeholder="Description optionnelle"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Créer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Vue principale ──────────────────────────────────────────────────────────

export default function SubGroupsManager({ groupId, groupName, onClose, inline = false }: SubGroupsManagerProps) {
  const [subGroups, setSubGroups]             = useState<CommercialSubGroup[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [showCreate, setShowCreate]           = useState(false);
  const [togglingId, setTogglingId]           = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sg = await getSubGroups(groupId);
      setSubGroups(sg);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  const handleToggleActive = async (sg: CommercialSubGroup) => {
    setTogglingId(sg.id);
    try {
      await updateSubGroup(sg.id, { isActive: !sg.isActive });
      void load();
    } catch { /* silencieux */ }
    finally { setTogglingId(null); }
  };

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(null);
    setTogglingId(id);
    try {
      await deleteSubGroup(id);
      void load();
    } catch { /* silencieux */ }
    finally { setTogglingId(null); }
  };

  const panelContent = (
    <div className={
      inline
        ? 'bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col'
        : 'bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[85vh]'
    }>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-base font-semibold text-gray-900">Sous-groupes</h3>
            <p className="text-xs text-gray-500">{groupName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
            aria-label="Créer un sous-groupe"
          >
            <Plus className="w-4 h-4" /> Créer
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100" aria-label="Fermer">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading && subGroups.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement…
          </div>
        ) : subGroups.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucun sous-groupe configuré.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {subGroups.map((sg) => (
              <div key={sg.id} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 text-sm">{sg.name}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        sg.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {sg.isActive ? 'Actif' : 'Inactif'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {sg.memberCount} membre{sg.memberCount !== 1 ? 's' : ''}
                      </span>
                      {sg.breakSchedules.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-700">
                          <Clock className="w-3 h-3" />
                          {sg.breakSchedules.length} plage{sg.breakSchedules.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {sg.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{sg.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => void handleToggleActive(sg)}
                      disabled={togglingId === sg.id}
                      className={`px-2 py-1 rounded text-xs border disabled:opacity-50 ${
                        sg.isActive
                          ? 'text-amber-600 border-amber-200 hover:bg-amber-50'
                          : 'text-green-600 border-green-200 hover:bg-green-50'
                      }`}
                      aria-label={sg.isActive ? `Désactiver ${sg.name}` : `Activer ${sg.name}`}
                    >
                      {togglingId === sg.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : sg.isActive ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(sg.id)}
                      disabled={togglingId === sg.id}
                      className="p-1.5 rounded disabled:opacity-50 text-gray-400 hover:text-red-600 hover:bg-red-50"
                      aria-label={`Supprimer ${sg.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {inline ? (
        panelContent
      ) : (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          {panelContent}
        </div>
      )}

      {showCreate && (
        <SubGroupFormModal
          parentGroupId={groupId}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); void load(); }}
        />
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 text-sm">Supprimer ce sous-groupe ?</p>
                <p className="text-xs text-gray-500 mt-1">
                  Cette action est irréversible. Les plages de pause associées seront supprimées.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={() => void handleDelete(confirmDeleteId)}
                className="px-4 py-2 text-sm rounded-lg text-white bg-red-600 hover:bg-red-700"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
