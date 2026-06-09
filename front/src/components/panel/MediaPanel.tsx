'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Images, X, Film, Music, Mic, FileText } from 'lucide-react';
import { getPanelMedia } from '@/lib/api';
import { PanelMedia, PanelMediaResponse } from '@/types/media-panel';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/api\/?$/, '');

function mediaUrl(localUrl: string): string {
  return `${API_BASE}${localUrl}`;
}

interface PanelMediaCardProps {
  item: PanelMedia;
}

function PanelMediaCard({ item }: PanelMediaCardProps) {
  const url = mediaUrl(item.local_url);
  const isIn = item.message?.direction === 'IN';
  const fromName = item.message?.from_name || (isIn ? 'Client' : 'Agent');
  const fileName = item.file_name || item.media_type;

  const renderThumbnail = () => {
    switch (item.media_type) {
      case 'image':
      case 'sticker':
        return (
          <img
            src={url}
            alt={fileName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        );
      case 'video':
        return (
          <div className="flex h-full w-full items-center justify-center">
            <Film className="h-8 w-8 text-violet-500" />
          </div>
        );
      case 'audio':
        return (
          <div className="flex h-full w-full items-center justify-center">
            <Music className="h-8 w-8 text-green-500" />
          </div>
        );
      case 'voice':
        return (
          <div className="flex h-full w-full items-center justify-center">
            <Mic className="h-8 w-8 text-green-600" />
          </div>
        );
      default:
        return (
          <div className="flex h-full w-full items-center justify-center">
            <FileText className="h-8 w-8 text-amber-500" />
          </div>
        );
    }
  };

  return (
    <div
      className="cursor-pointer overflow-hidden rounded-lg border border-gray-100 hover:border-blue-300 transition-colors"
      onClick={() => window.open(url, '_blank')}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') window.open(url, '_blank'); }}
    >
      <div className="h-24 bg-gray-50">
        {renderThumbnail()}
      </div>
      <div className="p-1.5">
        <p className="truncate text-xs font-medium text-gray-700" title={fileName}>{fileName}</p>
        <span
          className={`inline-block mt-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${isIn ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}
        >
          {isIn ? 'Client' : 'Agent'} {fromName !== (isIn ? 'Client' : 'Agent') ? `- ${fromName}` : ''}
        </span>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-lg border border-gray-100">
      <div className="h-24 bg-gray-200" />
      <div className="p-1.5">
        <div className="h-3 w-3/4 rounded bg-gray-200" />
        <div className="mt-1 h-3 w-1/2 rounded bg-gray-200" />
      </div>
    </div>
  );
}

interface MediaPanelProps {
  onClose: () => void;
}

export default function MediaPanel({ onClose }: MediaPanelProps) {
  const [items, setItems] = useState<PanelMedia[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (p: number, append = false) => {
    if (p === 1) setLoading(true); else setLoadingMore(true);
    try {
      const data: PanelMediaResponse = await getPanelMedia(p, 30);
      if (append) {
        setItems(prev => [...prev, ...data.items]);
      } else {
        setItems(data.items);
      }
      setTotal(data.total);
      setPage(p);
      setPages(data.pages);
    } catch {
      // silent
    } finally {
      if (p === 1) setLoading(false); else setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  const handleLoadMore = () => {
    if (page < pages && !loadingMore) {
      void fetchPage(page + 1, true);
    }
  };

  return (
    <aside className="w-72 shrink-0 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Images className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Medias</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Fermer le panneau medias"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Corps */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full items-center justify-center py-12 text-center">
            <div>
              <Images className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-2 text-sm text-gray-400">Aucun media disponible</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {items.map(item => <PanelMediaCard key={item.id} item={item} />)}
            </div>
            {page < pages && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="mt-3 w-full rounded-lg border border-gray-200 py-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingMore ? 'Chargement...' : 'Charger plus'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-2 text-center text-xs text-gray-400">
        {total} media{total !== 1 ? 's' : ''}
      </div>
    </aside>
  );
}
