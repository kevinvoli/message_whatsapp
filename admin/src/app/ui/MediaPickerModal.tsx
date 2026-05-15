"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Image, Film, Music, FileText, ExternalLink } from 'lucide-react';
import { MediaAsset, MediaAssetType } from '@/app/lib/definitions';
import { getMediaAssets, getMediaCategories } from '@/app/lib/api';
import { Spinner } from '@/app/ui/Spinner';

const TYPE_COLORS: Record<MediaAssetType, string> = {
  image:    '#3B82F6',
  video:    '#8B5CF6',
  audio:    '#10B981',
  document: '#F59E0B',
};

const TYPE_LABELS: Record<MediaAssetType, string> = {
  image:    'Image',
  video:    'Vidéo',
  audio:    'Audio',
  document: 'Document',
};

function TypeIcon({ type, size = 24 }: { type: MediaAssetType; size?: number }) {
  const color = TYPE_COLORS[type];
  const props = { style: { color }, width: size, height: size };
  switch (type) {
    case 'image':    return <Image    {...props} />;
    case 'video':    return <Film     {...props} />;
    case 'audio':    return <Music    {...props} />;
    default:         return <FileText {...props} />;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)           return bytes + ' o';
  if (bytes < 1024 * 1024)   return (bytes / 1024).toFixed(0) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

// ─── Panneau d'aperçu ────────────────────────────────────────────────────────

function PreviewPanel({ asset }: { asset: MediaAsset | null }) {
  if (!asset) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-3 px-4 text-center">
        <Image className="w-12 h-12" />
        <p className="text-sm">Sélectionnez un média<br />pour voir l&apos;aperçu</p>
      </div>
    );
  }

  const color = TYPE_COLORS[asset.mediaType];

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto px-4 py-4">
      {/* Zone d'aperçu */}
      <div
        className="rounded-xl overflow-hidden flex items-center justify-center"
        style={{ minHeight: 180, backgroundColor: color + '18' }}
      >
        {asset.mediaType === 'image' && (
          <img
            src={asset.publicUrl}
            alt={asset.name}
            className="max-h-64 w-full object-contain rounded-xl"
          />
        )}
        {asset.mediaType === 'video' && (
          <video
            src={asset.publicUrl}
            controls
            className="max-h-64 w-full rounded-xl"
          />
        )}
        {asset.mediaType === 'audio' && (
          <div className="flex flex-col items-center gap-4 py-6 w-full px-4">
            <Music style={{ color, width: 48, height: 48 }} />
            <audio src={asset.publicUrl} controls className="w-full" />
          </div>
        )}
        {asset.mediaType === 'document' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <FileText style={{ color, width: 48, height: 48 }} />
            <span className="text-xs font-mono text-gray-500 bg-white px-2 py-1 rounded">
              {asset.originalName.split('.').pop()?.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Infos */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-900 break-all">{asset.name}</p>

        <div className="flex items-center gap-2">
          <span
            className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: color }}
          >
            {TYPE_LABELS[asset.mediaType]}
          </span>
          <span className="text-xs text-gray-500">{formatBytes(asset.fileSize)}</span>
        </div>

        {asset.category && (
          <p className="text-xs text-gray-500">
            <span className="font-medium">Catégorie :</span> {asset.category}
          </p>
        )}

        {asset.tags && asset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {asset.tags.map((tag) => (
              <span key={tag} className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        )}

        {asset.usageCount > 0 && (
          <p className="text-xs text-gray-400">
            Utilisé dans {asset.usageCount} lien{asset.usageCount > 1 ? 's' : ''}
          </p>
        )}

        <a
          href={asset.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700"
        >
          <ExternalLink className="w-3 h-3" /> Ouvrir en plein écran
        </a>
      </div>
    </div>
  );
}

// ─── Modal principal ─────────────────────────────────────────────────────────

interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
}

export default function MediaPickerModal({ open, onClose, onSelect }: MediaPickerModalProps) {
  const [assets,     setAssets]     = useState<MediaAsset[]>([]);
  const [pages,      setPages]      = useState(1);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [type,       setType]       = useState('all');
  const [category,   setCategory]   = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [selected,   setSelected]   = useState<MediaAsset | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMediaAssets({
        type:     type !== 'all' ? type : undefined,
        category: category || undefined,
        search:   search   || undefined,
        page,
        limit: 18,
      });
      setAssets(res.items);
      setPages(res.pages);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [type, category, search, page]);

  useEffect(() => {
    if (open) {
      void load();
      void getMediaCategories().then(setCategories).catch(() => []);
    }
  }, [open, load]);

  // Reset sélection à la fermeture
  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Sélectionner un média</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filtres */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap shrink-0">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Rechercher..."
            />
          </div>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setPage(1); }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="all">Tous types</option>
            <option value="image">Images</option>
            <option value="video">Vidéos</option>
            <option value="audio">Audio</option>
            <option value="document">Documents</option>
          </select>
          {categories.length > 0 && (
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Toutes catégories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* Corps : grille + aperçu côte à côte */}
        <div className="flex flex-1 overflow-hidden">

          {/* Grille */}
          <div className="flex-1 overflow-y-auto p-4 border-r border-gray-100">
            {loading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : assets.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">Aucun média disponible</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {assets.map((asset) => {
                  const isSelected = selected?.id === asset.id;
                  const color = TYPE_COLORS[asset.mediaType];
                  return (
                    <button
                      key={asset.id}
                      onClick={() => setSelected(asset)}
                      className={`rounded-xl border-2 overflow-hidden text-left transition-all focus:outline-none ${
                        isSelected
                          ? 'border-blue-500 shadow-md ring-2 ring-blue-100'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div
                        className="h-20 flex items-center justify-center relative"
                        style={{ backgroundColor: color + '22' }}
                      >
                        {asset.mediaType === 'image' ? (
                          <img
                            src={asset.publicUrl}
                            alt={asset.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <TypeIcon type={asset.mediaType} size={28} />
                        )}
                        {isSelected && (
                          <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                              <svg viewBox="0 0 12 12" className="w-3 h-3 text-white fill-white">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-medium text-gray-800 truncate" title={asset.name}>
                          {asset.name}
                        </p>
                        <p className="text-xs text-gray-400">{formatBytes(asset.fileSize)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex justify-center items-center gap-3 pt-4">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="text-sm px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                >
                  ← Préc
                </button>
                <span className="text-sm text-gray-500">{page} / {pages}</span>
                <button
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="text-sm px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                >
                  Suiv →
                </button>
              </div>
            )}
          </div>

          {/* Panneau aperçu */}
          <div className="w-56 shrink-0 flex flex-col border-l border-gray-100 bg-gray-50/60">
            <div className="px-4 py-3 border-b border-gray-100 shrink-0">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Aperçu</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              <PreviewPanel asset={selected} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 shrink-0">
          <p className="text-sm text-gray-500">
            {selected ? (
              <span className="text-blue-600 font-medium">✓ {selected.name}</span>
            ) : (
              'Aucun média sélectionné'
            )}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={() => { if (selected) { onSelect(selected); onClose(); } }}
              disabled={!selected}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Sélectionner
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
