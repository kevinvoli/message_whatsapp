'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface Label {
  id: string;
  name: string;
  color: string;
  description?: string | null;
}

interface LabelMenuProps {
  chatId: string;
  onClose: () => void;
}

export const LabelMenu: React.FC<LabelMenuProps> = ({ chatId, onClose }) => {
  const [labels, setLabels] = useState<Label[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/labels`, { credentials: 'include' }).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch(`${API_URL}/conversations/${encodeURIComponent(chatId)}/labels`, {
        credentials: 'include',
      }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([allLabels, chatLabels]) => {
        if (Array.isArray(allLabels)) setLabels(allLabels);
        if (Array.isArray(chatLabels)) {
          setAssigned(new Set(chatLabels.map((l: Label) => l.id)));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [chatId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const toggleLabel = async (labelId: string) => {
    if (toggling) return;
    setToggling(labelId);

    const isAssigned = assigned.has(labelId);
    const method = isAssigned ? 'DELETE' : 'POST';

    try {
      const res = await fetch(
        `${API_URL}/conversations/${encodeURIComponent(chatId)}/labels/${labelId}`,
        { method, credentials: 'include' },
      );
      if (res.ok || res.status === 204) {
        setAssigned((prev) => {
          const next = new Set(prev);
          if (isAssigned) next.delete(labelId);
          else next.add(labelId);
          return next;
        });
      }
    } catch {
    } finally {
      setToggling(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute right-0 top-12 z-20 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1"
    >
      <div className="px-3 py-1.5 border-b border-gray-100">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Labels</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        </div>
      ) : labels.length === 0 ? (
        <p className="text-xs text-gray-400 px-3 py-3 text-center">Aucun label disponible</p>
      ) : (
        labels.map((label) => {
          const isAssigned = assigned.has(label.id);
          return (
            <button
              key={label.id}
              type="button"
              onClick={() => toggleLabel(label.id)}
              disabled={toggling === label.id}
              className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0 border border-white shadow-sm"
                style={{ backgroundColor: label.color }}
              />
              <span className="flex-1 text-left text-sm text-gray-700">{label.name}</span>
              {toggling === label.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              ) : isAssigned ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : null}
            </button>
          );
        })
      )}
    </div>
  );
};
