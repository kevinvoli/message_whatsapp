"use client";

import React, { useEffect, useState } from 'react';
import { Image, Video, FileText, Music, Send, X, Search, Layers } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

type AssetCategory = 'produit' | 'service' | 'promo' | 'info';
type AssetMediaType = 'image' | 'video' | 'document' | 'audio';

interface CatalogAsset {
  id: string;
  category: AssetCategory;
  mediaType: AssetMediaType;
  title: string;
  description: string | null;
  mediaUrl: string;
  textTemplate: string | null;
}

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  produit:  'Produits',
  service:  'Services',
  promo:    'Promotions',
  info:     'Informations',
};

const CATEGORY_COLORS: Record<AssetCategory, string> = {
  produit:  'bg-blue-50 text-blue-700 border-blue-200',
  service:  'bg-purple-50 text-purple-700 border-purple-200',
  promo:    'bg-orange-50 text-orange-700 border-orange-200',
  info:     'bg-gray-50 text-gray-700 border-gray-200',
};

const MEDIA_ICON: Record<AssetMediaType, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  image:    Image,
  video:    Video,
  document: FileText,
  audio:    Music,
};

interface Props {
  chatId: string;
  onSend: (mediaUrl: string, text: string) => void;
  onClose: () => void;
}

export default function CatalogModal({ onSend, onClose }: Props) {
  const [assets, setAssets] = useState<CatalogAsset[]>([]);
  const [activeCategory, setActiveCategory] = useState<AssetCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CatalogAsset | null>(null);
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/catalog`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setAssets(data as CatalogAsset[]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selected) setCustomText(selected.textTemplate ?? '');
  }, [selected]);

  const filtered = assets.filter((a) => {
    if (activeCategory !== 'all' && a.category !== activeCategory) return false;
    if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const categories = Array.from(new Set(assets.map((a) => a.category)));

  const handleSend = () => {
    if (!selected) return;
    onSend(selected.mediaUrl, customText);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-gray-900">Catalogue multimédia</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar catégories */}
          <div className="w-36 border-r border-gray-100 flex flex-col py-2 flex-shrink-0">
            <button
              onClick={() => setActiveCategory('all')}
              className={`text-left px-4 py-2 text-sm transition-colors ${activeCategory === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Tout
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-left px-4 py-2 text-sm transition-colors ${activeCategory === cat ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Liste assets */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 pt-3 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                <input
                  placeholder="Rechercher..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
              {filtered.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">Aucun contenu trouvé</p>
              )}
              {filtered.map((asset) => {
                const Icon = MEDIA_ICON[asset.mediaType];
                const isSelected = selected?.id === asset.id;
                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelected(isSelected ? null : asset)}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`p-2 rounded-lg border flex-shrink-0 ${CATEGORY_COLORS[asset.category]}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{asset.title}</p>
                      {asset.description && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{asset.description}</p>
                      )}
                      <span className={`inline-block text-xs px-1.5 py-0.5 rounded mt-1 border ${CATEGORY_COLORS[asset.category]}`}>
                        {CATEGORY_LABELS[asset.category]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Zone envoi si sélection */}
        {selected && (
          <div className="border-t border-gray-100 px-5 py-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Message à envoyer avec «{selected.title}»
            </p>
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={2}
              placeholder="Message d'accompagnement (optionnel)..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none"
            />
            <div className="flex justify-end">
              <button
                onClick={handleSend}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Send className="w-4 h-4" />
                Envoyer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
