"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Image, Film, Music, FileText } from 'lucide-react';
import { MediaAsset, MediaAssetType } from '@/app/lib/definitions';
import { getMediaAssets, getMediaCategories } from '@/app/lib/api';
import { Spinner } from '@/app/ui/Spinner';

const TYPE_COLORS: Record<MediaAssetType, string> = {
  image: '#3B82F6',
  video: '#8B5CF6',
  audio: '#10B981',
  document: '#F59E0B',
};

function TypeIcon({ type, size = 24 }: { type: MediaAssetType; size?: number }) {
  const color = TYPE_COLORS[type];
  const props = { style: { color }, width: size, height: size };
  switch (type) {
    case 'image': return <Image {...props} />;
    case 'video': return <Film {...props} />;
    case 'audio': return <Music {...props} />;
    default: return <FileText {...props} />;
  }
}

interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
}

export default function MediaPickerModal({ open, onClose, onSelect }: MediaPickerModalProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MediaAsset | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMediaAssets({
        type: type !== 'all' ? type : undefined,
        category: category || undefined,
        search: search || undefined,
        page,
        limit: 20,
      });
      setAssets(res.items);
      setTotal(res.total);
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Selectionner un media</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        {/* Filtres */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Rechercher..." />
          </div>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="all">Tous types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="audio">Audio</option>
            <option value="document">Documents</option>
          </select>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Toutes categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Grille */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : assets.length === 0 ? (
            <div className="text-center py-10 text-gray-400">Aucun media disponible</div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => setSelected(asset)}
                  className={`rounded-xl border-2 overflow-hidden text-left transition-all ${
                    selected?.id === asset.id
                      ? 'border-blue-500 shadow-lg shadow-blue-100'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="h-24 flex items-center justify-center" style={{ backgroundColor: TYPE_COLORS[asset.mediaType] + '22' }}>
                    {asset.mediaType === 'image' ? (
                      <img src={asset.publicUrl} alt={asset.name} className="h-full w-full object-cover" />
                    ) : (
                      <TypeIcon type={asset.mediaType} size={32} />
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-gray-800 truncate">{asset.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex justify-center items-center gap-3 px-6 py-2 border-t border-gray-100">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="text-sm px-3 py-1 border rounded disabled:opacity-40">Prec</button>
            <span className="text-sm text-gray-500">{page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="text-sm px-3 py-1 border rounded disabled:opacity-40">Suiv</button>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Annuler</button>
          <button
            onClick={() => { if (selected) { onSelect(selected); onClose(); } }}
            disabled={!selected}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Selectionner
          </button>
        </div>
      </div>
    </div>
  );
}
