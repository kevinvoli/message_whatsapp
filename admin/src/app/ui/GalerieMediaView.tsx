"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { HardDrive, Film, Music, Mic, FileText, File, MapPin, ExternalLink } from 'lucide-react';
import { StoredMedia, StoredMediaType, GalerieFilterOptions, MediaDirection } from '@/app/lib/definitions';
import { getStoredMedias, getGalerieFilterOptions } from '@/app/lib/api';
import { useToast } from '@/app/ui/ToastProvider';
import { formatDate } from '@/app/lib/dateUtils';

// local_url est un chemin relatif stocké en DB (/uploads/media/...).
// Les fichiers sont servis par le backend (api.gicop.ci), pas par l'admin.
// On préfixe avec l'origine du backend en retirant le segment /api final.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/api\/?$/, '');
function mediaUrl(localUrl: string): string {
  return `${API_BASE}${localUrl}`;
}

function MediaTypeIcon({ type, size = 36 }: { type: StoredMediaType; size?: number }) {
  const props = { width: size, height: size };
  switch (type) {
    case 'video': return <Film {...props} className="text-purple-500" />;
    case 'audio': return <Music {...props} className="text-green-500" />;
    case 'voice': return <Mic {...props} className="text-green-600" />;
    case 'document': return <FileText {...props} className="text-amber-500" />;
    case 'location': return <MapPin {...props} className="text-red-500" />;
    default: return <File {...props} className="text-gray-400" />;
  }
}

function formatBytes(val: string | null): string {
  if (!val) return '';
  const bytes = parseInt(val, 10);
  if (isNaN(bytes)) return val;
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

function formatDuration(sec: number | null): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function StoredMediaCard({ media }: { media: StoredMedia }) {
  const isIN = media.message?.direction === 'IN';
  const directionLabel = isIN ? 'Client' : 'Agent';
  const directionClass = isIN ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700';
  const handleClick = () => {
    if (media.local_url) window.open(mediaUrl(media.local_url), '_blank');
  };
  return (
    <div onClick={handleClick} className="relative rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden group cursor-pointer hover:shadow-md hover:border-gray-300 transition-all">
      <div className="h-32 flex items-center justify-center bg-gray-50 overflow-hidden relative">
        {(media.media_type === 'image' || media.media_type === 'sticker') && media.local_url ? (
          <img src={mediaUrl(media.local_url)} alt={media.file_name ?? media.media_type} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <MediaTypeIcon type={media.media_type} size={40} />
            {media.duration_seconds != null && (
              <span className="text-xs text-gray-500">{formatDuration(media.duration_seconds)}</span>
            )}
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <ExternalLink className="text-white drop-shadow w-6 h-6" />
        </div>
      </div>
      <div className="p-3 space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className={'inline-block rounded-full px-2 py-0.5 text-xs font-medium ' + directionClass}>{directionLabel}</span>
          <span className="text-xs text-gray-400 uppercase">{media.media_type}</span>
        </div>
        {media.file_name && (
          <p className="text-xs font-medium text-gray-800 truncate" title={media.file_name}>{media.file_name}</p>
        )}
        <p className="text-xs text-gray-400">
          {formatBytes(media.file_size)}{media.downloaded_at ? ' · ' + formatDate(media.downloaded_at) : ''}
        </p>
        {media.channel && (
          <p className="text-xs text-gray-500 truncate">{media.channel.label ?? media.channel.phone_number ?? 'Canal'}</p>
        )}
        {media.message?.poste && (
          <p className="text-xs text-gray-500 truncate">Poste : {media.message.poste.name}</p>
        )}
        {media.message?.direction === 'IN' && media.message.from_name && (
          <p className="text-xs text-gray-400 truncate">De : {media.message.from_name}</p>
        )}
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white overflow-hidden animate-pulse">
          <div className="h-32 bg-gray-100" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-gray-100 rounded w-2/3" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

const TYPE_TABS: { value: string; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'audio', label: 'Audios' },
  { value: 'document', label: 'Documents' },
  { value: 'voice', label: 'Vocaux' },
  { value: 'sticker', label: 'Stickers' },
];

const DIRECTION_TABS: { value: MediaDirection | ''; label: string }[] = [
  { value: '', label: 'Tous' },
  { value: 'IN', label: 'Recus' },
  { value: 'OUT', label: 'Envoyes' },
];

export default function GalerieMediaView() {
  const [items, setItems] = useState<StoredMedia[]>([]);
  const [total, setTotal] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [activeType, setActiveType] = useState('');
  const [channelId, setChannelId] = useState('');
  const [posteId, setPosteId] = useState('');
  const [direction, setDirection] = useState<MediaDirection | ''>('');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [filterOptions, setFilterOptions] = useState<GalerieFilterOptions>({ channels: [], postes: [] });
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    void getGalerieFilterOptions()
      .then(setFilterOptions)
      .catch(() => addToast({ type: 'error', message: 'Impossible de charger les filtres' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getStoredMedias({
        channelId: channelId || undefined,
        posteId: posteId || undefined,
        direction: direction || undefined,
        mediaType: activeType || undefined,
        page, limit: 24, sort, order,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalSize(res.totalSize ?? 0);
      setPages(res.pages);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur chargement';
      addToast({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  }, [activeType, channelId, posteId, direction, page, sort, order, addToast]);

  useEffect(() => { void load(); }, [load]);

  const resetPage = () => setPage(1);

  return (
    <div className="flex-1 overflow-auto p-6 bg-gray-50">
      <div className="flex items-center gap-3 mb-6">
        <HardDrive className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Galerie medias</h1>
        <span className="text-sm text-gray-500">({total} media{total !== 1 ? 's' : ''} stocke{total !== 1 ? 's' : ''})</span>
        {totalSize > 0 && (
          <span className="text-sm text-gray-400 flex items-center gap-1">
            · <HardDrive className="w-3.5 h-3.5" /> {formatBytes(String(totalSize))}
          </span>
        )}
      </div>
      <div className="mb-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {TYPE_TABS.map((t) => (
            <button key={t.value} onClick={() => { setActiveType(t.value); resetPage(); }}
              className={activeType === t.value ? 'px-3 py-1.5 rounded-full text-sm font-medium bg-blue-600 text-white' : 'px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200'}
            >{t.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {DIRECTION_TABS.map((d) => (
            <button key={d.value} onClick={() => { setDirection(d.value); resetPage(); }}
              className={direction === d.value ? 'px-3 py-1.5 rounded-full text-sm font-medium bg-indigo-600 text-white' : 'px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200'}
            >{d.label}</button>
          ))}
          <select value={channelId} onChange={(e) => { setChannelId(e.target.value); resetPage(); }} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">Tous les canaux</option>
            {filterOptions.channels.map((c) => (
              <option key={c.id} value={c.id}>{c.label ?? c.phone_number ?? c.id}</option>
            ))}
          </select>
          <select value={posteId} onChange={(e) => { setPosteId(e.target.value); resetPage(); }} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="">Tous les postes</option>
            {filterOptions.postes.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
            ))}
          </select>
          <select value={sort + '-' + order} onChange={(e) => { const idx = e.target.value.lastIndexOf('-'); setSort(e.target.value.substring(0, idx)); setOrder(e.target.value.substring(idx + 1) as 'asc' | 'desc'); resetPage(); }} className="ml-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
            <option value="createdAt-desc">Date (recent)</option>
            <option value="createdAt-asc">Date (ancien)</option>
            <option value="fileSize-desc">Taille (grande)</option>
            <option value="fileSize-asc">Taille (petite)</option>
          </select>
        </div>
      </div>
      {loading ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <HardDrive className="mx-auto w-12 h-12 mb-3" />
          <p>Aucun media stocke ne correspond a vos filtres</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((media) => (
            <StoredMediaCard key={media.id} media={media} />
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="flex justify-center items-center gap-3 mt-6">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Precedent</button>
          <span className="text-sm text-gray-600">Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50">Suivant</button>
        </div>
      )}
    </div>
  );
}
