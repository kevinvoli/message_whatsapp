"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Search, X, MoreVertical, Copy, Trash2, Edit2, Image, Film, Music, FileText, Library } from 'lucide-react';
import { MediaAsset, MediaAssetType } from '@/app/lib/definitions';
import { getMediaAssets, uploadMediaAsset, updateMediaAsset, deleteMediaAsset, getMediaCategories } from '@/app/lib/api';
import { useToast } from '@/app/ui/ToastProvider';
import { Spinner } from '@/app/ui/Spinner';

const TYPE_COLORS: Record<MediaAssetType, string> = {
  image: '#3B82F6',
  video: '#8B5CF6',
  audio: '#10B981',
  document: '#F59E0B',
};

const TYPE_LABELS: Record<MediaAssetType, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
};

function TypeIcon({ type, size = 20 }: { type: MediaAssetType; size?: number }) {
  const color = TYPE_COLORS[type];
  const props = { style: { color }, width: size, height: size };
  switch (type) {
    case 'image': return <Image {...props} />;
    case 'video': return <Film {...props} />;
    case 'audio': return <Music {...props} />;
    default: return <FileText {...props} />;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}
// ─── Card ───────────────────────────────────────────────────────────────────

interface MediaCardProps {
  asset: MediaAsset;
  onEdit: (a: MediaAsset) => void;
  onDelete: (a: MediaAsset) => void;
  onCopyUrl: (url: string) => void;
}

function MediaCard({ asset, onEdit, onDelete, onCopyUrl }: MediaCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const color = TYPE_COLORS[asset.mediaType];

  return (
    <div className="relative rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden group">
      {/* Miniature */}
      <div className="h-32 flex items-center justify-center" style={{ backgroundColor: color + '22' }}>
        {asset.mediaType === 'image' ? (
          <img src={asset.publicUrl} alt={asset.name} className="h-full w-full object-cover" />
        ) : (
          <TypeIcon type={asset.mediaType} size={40} />
        )}
      </div>
      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-medium text-gray-900 truncate" title={asset.name}>{asset.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{formatBytes(asset.fileSize)}</p>
        {asset.category && <p className="text-xs text-gray-500 truncate">{asset.category}</p>}
        <div className="mt-1 flex items-center gap-1">
          <span className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: color }}>
            {TYPE_LABELS[asset.mediaType]}
          </span>
          {asset.usageCount > 0 && (
            <span className="text-xs text-gray-400">{asset.usageCount} lien{asset.usageCount > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
      {/* Menu */}
      <div className="absolute top-2 right-2">
        <button onClick={() => setMenuOpen(!menuOpen)} className="p-1 rounded bg-white/80 hover:bg-white shadow text-gray-600">
          <MoreVertical className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40" onMouseLeave={() => setMenuOpen(false)}>
            <button onClick={() => { setMenuOpen(false); onEdit(asset); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <Edit2 className="w-3.5 h-3.5" /> Renommer
            </button>
            <button onClick={() => { setMenuOpen(false); onCopyUrl(asset.publicUrl); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
              <Copy className="w-3.5 h-3.5" /> Copier URL
            </button>
            <button onClick={() => { setMenuOpen(false); onDelete(asset); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Supprimer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
// ─── Modal Upload ───────────────────────────────────────────────────────────

function UploadModal({ categories, onClose, onUploaded }: {
  categories: string[];
  onClose: () => void;
  onUploaded: (asset: MediaAsset) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const handleFile = (f: File) => {
    setFile(f);
    if (!name) setName(f.name);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const asset = await uploadMediaAsset({ file, name: name || file.name, category: category || undefined });
      addToast({ type: 'success', message: 'Media uploade avec succes' });
      onUploaded(asset);
    } catch (e: any) {
      addToast({ type: 'error', message: e.message ?? 'Erreur upload' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Uploader un nouveau media</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {file ? (
            <p className="text-sm text-green-600 font-medium">{file.name} ({formatBytes(file.size)})</p>
          ) : (
            <>
              <Upload className="mx-auto mb-2 w-10 h-10 text-gray-400" />
              <p className="text-sm text-gray-500">Glisser-deposer ou cliquer</p>
              <p className="text-xs text-gray-400 mt-1">JPG PNG WEBP GIF MP4 MP3 OGG PDF — max 16 Mo</p>
            </>
          )}
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700">Nom affiche</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Nom du fichier" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Categorie</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} list="categories-list" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Promotions, Produits..." />
            <datalist id="categories-list">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Annuler</button>
          <button onClick={handleSubmit} disabled={!file || uploading} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {uploading ? <Spinner /> : 'Uploader'}
          </button>
        </div>
      </div>
    </div>
  );
}
// ─── Modal Edition ───────────────────────────────────────────────────────────

function EditModal({ asset, categories, onClose, onSaved }: {
  asset: MediaAsset;
  categories: string[];
  onClose: () => void;
  onSaved: (a: MediaAsset) => void;
}) {
  const [name, setName] = useState(asset.name);
  const [category, setCategory] = useState(asset.category ?? '');
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateMediaAsset(asset.id, { name, category: category || undefined });
      addToast({ type: 'success', message: 'Media mis a jour' });
      onSaved(updated);
    } catch (e: any) {
      addToast({ type: 'error', message: e.message ?? 'Erreur' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Modifier le media</h2>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700">Nom</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Categorie</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} list="edit-categories" className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <datalist id="edit-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Annuler</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Spinner /> : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Vue principale ---

const ALL_TYPES = ['all', 'image', 'video', 'audio', 'document'] as const;
type FilterType = typeof ALL_TYPES[number];
const TYPE_TAB_LABELS: Record<FilterType, string> = { all: 'Tous', image: 'Images', video: 'Videos', audio: 'Audio', document: 'Documents' };

export default function MediathequeView() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [activeType, setActiveType] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [editingAsset, setEditingAsset] = useState<MediaAsset | null>(null);
  const { addToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMediaAssets({
        type: activeType !== 'all' ? activeType : undefined,
        category: category || undefined,
        search: search || undefined,
        page,
        limit: 24,
        sort,
      });
      setAssets(res.items);
      setTotal(res.total);
      setPages(res.pages);
    } catch (e: any) {
      addToast({ type: 'error', message: e.message ?? 'Erreur chargement' });
    } finally {
      setLoading(false);
    }
  }, [activeType, category, search, page, sort]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void getMediaCategories().then(setCategories).catch(() => []);
  }, []);

  const handleDelete = async (asset: MediaAsset) => {
    if (asset.usageCount > 0) {
      addToast({ type: 'error', message: `Ce media est utilise dans ${asset.usageCount} lien(s). Detachez-le d'abord.` });
      return;
    }
    if (!window.confirm('Supprimer ce media ?')) return;
    try {
      await deleteMediaAsset(asset.id);
      addToast({ type: 'success', message: 'Media supprime' });
      void load();
    } catch (e: any) {
      addToast({ type: 'error', message: e.message ?? 'Erreur suppression' });
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      addToast({ type: 'success', message: 'URL copiee !' });
    } catch {
      addToast({ type: 'error', message: 'Copie echouee' });
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 bg-gray-50">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Library className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Mediathèque</h1>
          <span className="text-sm text-gray-500">({total} fichier{total !== 1 ? 's' : ''})</span>
        </div>
        <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          <Upload className="w-4 h-4" /> Uploader
        </button>
      </div>
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Rechercher..." />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {ALL_TYPES.map((t) => (
            <button key={t} onClick={() => { setActiveType(t); setPage(1); }}
              className={activeType === t ? 'px-3 py-1.5 rounded-full text-sm font-medium bg-blue-600 text-white' : 'px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200'}
            >{TYPE_TAB_LABELS[t]}</button>
          ))}
          <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="ml-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">Toutes categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="createdAt">Date</option>
            <option value="name">Nom</option>
            <option value="fileSize">Taille</option>
            <option value="usageCount">Utilisation</option>
          </select>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : assets.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Library className="mx-auto w-12 h-12 mb-3" />
          <p>Aucun media</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {assets.map((asset) => (
            <MediaCard key={asset.id} asset={asset} onEdit={setEditingAsset} onDelete={handleDelete} onCopyUrl={handleCopyUrl} />
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="flex justify-center items-center gap-3 mt-6">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">Precedent</button>
          <span className="text-sm text-gray-600">Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40">Suivant</button>
        </div>
      )}
      {showUpload && (
        <UploadModal categories={categories} onClose={() => setShowUpload(false)} onUploaded={() => { setShowUpload(false); void load(); }} />
      )}
      {editingAsset && (
        <EditModal asset={editingAsset} categories={categories} onClose={() => setEditingAsset(null)} onSaved={(a) => { setEditingAsset(null); setAssets((prev) => prev.map((x) => x.id === a.id ? a : x)); }} />
      )}
    </div>
  );
}
