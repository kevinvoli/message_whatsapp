"use client";

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Poste, PostePanelConfig } from '@/app/lib/definitions';
import { getPostePanelConfig, updatePostePanelConfig } from '@/app/lib/api/postes.api';
import { useToast } from '@/app/ui/ToastProvider';

const MEDIA_TYPES: { value: string; label: string }[] = [
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audios' },
  { value: 'document', label: 'Documents' },
  { value: 'voice', label: 'Vocaux' },
  { value: 'sticker', label: 'Stickers' },
  { value: 'gif', label: 'GIFs' },
];

interface Props {
  poste: Poste;
  onClose: () => void;
}

export default function PosteMediaPanelModal({ poste, onClose }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  useEffect(() => {
    getPostePanelConfig(poste.id)
      .then((config: PostePanelConfig) => {
        setEnabled(config.enabled);
        setSelectedTypes(config.types);
      })
      .catch(() => {
        addToast({ type: 'error', message: 'Erreur lors du chargement de la configuration' });
      })
      .finally(() => setLoading(false));
  }, [poste.id, addToast]);

  const toggleType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleSave = async () => {
    if (enabled && selectedTypes.length === 0) {
      addToast({ type: 'error', message: 'Selectionnez au moins un type de media' });
      return;
    }
    setSaving(true);
    try {
      await updatePostePanelConfig(poste.id, { enabled, types: selectedTypes });
      addToast({ type: 'success', message: 'Panneau mis a jour' });
      onClose();
    } catch {
      addToast({ type: 'error', message: 'Erreur lors de la sauvegarde' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-5">
          <h2 className="text-lg font-semibold text-gray-900">
            Panneau medias &mdash; {poste.name}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                  <div className={'h-6 w-11 rounded-full transition-colors ' + (enabled ? 'bg-blue-600' : 'bg-gray-300')} />
                  <div className={'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ' + (enabled ? 'translate-x-5' : 'translate-x-0')} />
                </div>
                <span className="text-sm font-medium text-gray-700">Activer le panneau medias pour ce poste</span>
              </label>
              <div className={'mt-4 ' + (!enabled ? 'pointer-events-none opacity-50' : '')}>
                <p className="mb-3 text-sm font-medium text-gray-700">Types de medias a afficher :</p>
                <div className="grid grid-cols-2 gap-2">
                  {MEDIA_TYPES.map(({ value, label }) => (
                    <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50">
                      <input type="checkbox" checked={selectedTypes.includes(value)} onChange={() => toggleType(value)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Annuler</button>
          <button onClick={() => void handleSave()} disabled={saving || loading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Sauvegarde...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
