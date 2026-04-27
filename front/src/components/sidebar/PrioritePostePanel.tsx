"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Phone, Flame } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';
import { useChatStore } from '@/store/chatStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

/** Seuil à partir duquel les priorités sont considérées critiques. */
const PRIORITY_CRITICAL_THRESHOLD = 3;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MissedCall {
  id: string;
  contact_id: string;
  commercial_id: string;
  called_at: string;
  outcome?: string | null;
  duration_sec?: number | null;
  notes?: string | null;
  treated: boolean;
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function PrioritePostePanel() {
  const [missedCalls, setMissedCalls]     = useState<MissedCall[]>([]);
  const [showMissed, setShowMissed]       = useState(true);
  const [showPriority, setShowPriority]   = useState(true);
  const [treating, setTreating]           = useState<Record<string, boolean>>({});

  const selectConversation = useChatStore((s) => s.selectConversation);
  const priorityConversations = useChatStore((s) =>
    s.conversations.filter((c) => c.is_priority === true),
  );

  const load = useCallback(async () => {
    const result = await Promise.allSettled([
      fetch(`${API_URL}/call-logs/mine/missed`, { credentials: 'include' }).then((r) => r.ok ? r.json() as Promise<MissedCall[]> : []),
    ]);

    const missedList = result[0].status === 'fulfilled' ? result[0].value : [];
    setMissedCalls(missedList);

    // Notifier les autres composants du niveau de criticité
    const total = missedList.length;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('poste:priority-update', {
        detail: { total, isCritical: total >= PRIORITY_CRITICAL_THRESHOLD },
      }));
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const handleTreat = async (callId: string) => {
    setTreating((prev) => ({ ...prev, [callId]: true }));
    try {
      const res = await fetch(`${API_URL}/call-logs/${callId}/treat`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (res.ok) setMissedCalls((prev) => prev.filter((c) => c.id !== callId));
    } catch { /* silencieux */ }
    finally { setTreating((prev) => { const n = { ...prev }; delete n[callId]; return n; }); }
  };

  const handleOpenChat = (chatId: string) => {
    selectConversation(chatId);
  };

  const total = missedCalls.length + priorityConversations.length;
  if (total === 0) return null;

  return (
    <div className="border-b border-orange-200 bg-orange-50 flex-shrink-0">
      {/* Header priorité */}
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <AlertTriangle className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
        <span className="text-xs font-semibold text-orange-800 flex-1">
          Priorités poste ({total})
        </span>
      </div>

      {/* Conversations prioritaires (rouverte après rapport soumis) */}
      {priorityConversations.length > 0 && (
        <div>
          <button
            onClick={() => setShowPriority((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1 bg-red-100 text-xs text-red-700 font-medium"
          >
            <span className="flex items-center gap-1">
              <Flame className="w-3 h-3" />
              Conversations prioritaires ({priorityConversations.length})
            </span>
            {showPriority ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showPriority && (
            <div className="divide-y divide-red-100 max-h-36 overflow-y-auto">
              {priorityConversations.map((conv) => (
                <div key={conv.chat_id} className="flex items-center justify-between px-3 py-1.5 gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-red-700 truncate">{conv.clientName}</p>
                    <p className="text-[10px] text-gray-400">{conv.last_activity_at ? formatDate(conv.last_activity_at.toISOString()) : ''}</p>
                  </div>
                  <button
                    onClick={() => handleOpenChat(conv.chat_id)}
                    className="text-[10px] px-2 py-0.5 bg-red-600 text-white rounded font-medium hover:bg-red-700 transition-colors flex-shrink-0"
                  >
                    Ouvrir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Appels en absence */}
      {missedCalls.length > 0 && (
        <div>
          <button
            onClick={() => setShowMissed((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1 bg-orange-100 text-xs text-orange-700 font-medium"
          >
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />
              Appels en absence ({missedCalls.length})
            </span>
            {showMissed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showMissed && (
            <div className="divide-y divide-orange-100 max-h-36 overflow-y-auto">
              {missedCalls.map((call) => (
                <div key={call.id} className="flex items-center justify-between px-3 py-1.5 gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono text-gray-700 truncate">{call.contact_id.slice(-8)}</p>
                    <p className="text-[10px] text-gray-400">{formatDate(call.called_at)}</p>
                  </div>
                  <button
                    onClick={() => void handleTreat(call.id)}
                    disabled={treating[call.id]}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-white border border-green-300 text-green-700 rounded hover:bg-green-50 transition-colors flex-shrink-0"
                    title="Marquer comme traité"
                  >
                    <Check className="w-3 h-3" />
                    Traité
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
