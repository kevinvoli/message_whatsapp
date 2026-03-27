'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Tag, X, Plus, Loader2 } from 'lucide-react';
import { ConversationTag } from '@/types/chat';

interface TagDropdownProps {
  chatId: string;
  currentTags: ConversationTag[];
  onTagsChange: (tags: ConversationTag[]) => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export function TagDropdown({ chatId, currentTags, onTagsChange }: TagDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [allTags, setAllTags] = useState<ConversationTag[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadAllTags = async () => {
    if (allTags.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/tags`, { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as ConversationTag[];
        setAllTags(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    if (!isOpen) void loadAllTags();
    setIsOpen((v) => !v);
  };

  const currentIds = new Set(currentTags.map((t) => t.id));

  const addTag = async (tag: ConversationTag) => {
    await fetch(`${API_URL}/conversations/${encodeURIComponent(chatId)}/tags/${tag.id}`, {
      method: 'POST',
      credentials: 'include',
    });
    onTagsChange([...currentTags, tag]);
  };

  const removeTag = async (tag: ConversationTag) => {
    await fetch(`${API_URL}/conversations/${encodeURIComponent(chatId)}/tags/${tag.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    onTagsChange(currentTags.filter((t) => t.id !== tag.id));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        title="Gérer les tags"
        className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
      >
        <Tag className="w-3.5 h-3.5" />
        <span>Tags</span>
        {currentTags.length > 0 && (
          <span className="ml-1 bg-green-100 text-green-700 rounded-full px-1.5 font-semibold">
            {currentTags.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-9 z-30 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2">
          {/* Tags actuels */}
          {currentTags.length > 0 && (
            <div className="px-3 pb-2 border-b border-gray-100 flex flex-wrap gap-1">
              {currentTags.map((tag) => (
                <span
                  key={tag.id}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded text-white font-medium"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => void removeTag(tag)}
                    className="opacity-70 hover:opacity-100"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Tous les tags disponibles */}
          <div className="px-3 pt-2">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
              Ajouter un tag
            </p>
            {loading ? (
              <div className="flex justify-center py-3">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            ) : allTags.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Aucun tag disponible</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {allTags
                  .filter((t) => !currentIds.has(t.id))
                  .map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => void addTag(tag)}
                      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded text-white font-medium opacity-80 hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: tag.color }}
                    >
                      <Plus className="w-3 h-3" />
                      {tag.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
