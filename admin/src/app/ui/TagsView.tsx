"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, PlusCircle, RefreshCw, Tag } from 'lucide-react';
import { ConversationTag } from '@/app/lib/definitions';
import { getTags, createTag, deleteTag } from '@/app/lib/api';
import { useToast } from '@/app/ui/ToastProvider';

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
  '#6b7280', '#0ea5e9',
];

export default function TagsView() {
  const { addToast } = useToast();
  const [items, setItems] = useState<ConversationTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('#3b82f6');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTags();
      setItems(data);
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur chargement.' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const tag = await createTag({ name: formName.trim(), color: formColor });
      setItems((prev) => [...prev, tag]);
      setFormName('');
      setFormColor('#3b82f6');
      setShowForm(false);
      addToast({ type: 'success', message: `Tag "${tag.name}" créé.` });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur création.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tag: ConversationTag) => {
    if (!confirm(`Supprimer le tag "${tag.name}" ? Il sera retiré de toutes les conversations.`)) return;
    try {
      await deleteTag(tag.id);
      setItems((prev) => prev.filter((t) => t.id !== tag.id));
      addToast({ type: 'success', message: `Tag "${tag.name}" supprimé.` });
    } catch (err) {
      addToast({ type: 'error', message: err instanceof Error ? err.message : 'Erreur suppression.' });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Tag className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Tags de conversation</h1>
          <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {items.length} tag{items.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <PlusCircle className="w-4 h-4" />
            Nouveau tag
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={(e) => void handleAdd(e)} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800">Créer un tag</h2>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Client chaud, Relance, Devis..."
                maxLength={50}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Couleur</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border border-gray-200"
                />
                <div className="flex gap-1 flex-wrap max-w-xs">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      className="w-6 h-6 rounded-full border-2 transition-all"
                      style={{
                        backgroundColor: c,
                        borderColor: formColor === c ? 'white' : 'transparent',
                        outline: formColor === c ? `2px solid ${c}` : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* Preview */}
          {formName && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Aperçu :</span>
              <span
                className="text-xs px-2 py-0.5 rounded text-white font-medium"
                style={{ backgroundColor: formColor }}
              >
                {formName}
              </span>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving || !formName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Création...' : 'Créer'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Tag className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>Aucun tag créé</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Aperçu</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Nom</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Couleur</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Créé le</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((tag) => (
                <tr key={tag.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span
                      className="text-xs px-2 py-0.5 rounded text-white font-medium"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{tag.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full border border-gray-200"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-gray-500 font-mono text-xs">{tag.color}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(tag.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => void handleDelete(tag)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
