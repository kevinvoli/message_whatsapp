'use client';
import React, { useEffect, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface CannedResponse {
  id: string;
  shortcode: string;
  title: string;
  body: string;
  category: string | null;
}

interface CannedResponseMenuProps {
  prefix: string;
  posteId?: string | null;
  onSelect: (body: string) => void;
  onClose: () => void;
}

export const CannedResponseMenu: React.FC<CannedResponseMenuProps> = ({
  prefix,
  posteId,
  onSelect,
  onClose,
}) => {
  const [suggestions, setSuggestions] = useState<CannedResponse[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ prefix });
    if (posteId) params.set('poste_id', posteId);

    fetch(`${API_URL}/canned-responses/suggest?${params}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setSuggestions(data);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [prefix, posteId]);

  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && suggestions.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        if (suggestions[activeIndex]) onSelect(suggestions[activeIndex].body);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [suggestions, activeIndex, onSelect, onClose]);

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto z-40"
    >
      <div className="px-3 py-1.5 border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          Réponses rapides — ↑↓ pour naviguer, Entrée pour sélectionner
        </span>
      </div>
      {suggestions.map((s, i) => (
        <button
          key={s.id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(s.body);
          }}
          className={`w-full px-3 py-2.5 text-left transition-colors border-b border-gray-50 last:border-0 ${
            i === activeIndex ? 'bg-green-50' : 'hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-green-700 bg-green-100 px-1.5 py-0.5 rounded flex-shrink-0">
              /{s.shortcode}
            </span>
            <span className="text-sm font-medium text-gray-800 truncate">{s.title}</span>
            {s.category && (
              <span className="ml-auto text-xs text-gray-400 flex-shrink-0">{s.category}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate pl-0.5">{s.body}</p>
        </button>
      ))}
    </div>
  );
};
