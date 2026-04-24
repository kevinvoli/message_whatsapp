"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, MessageCircle, Phone } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';
import { useChatStore } from '@/store/chatStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

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

interface UnansweredChat {
  chat_id: string;
  contact_client: string;
  unread_count: number;
  last_activity_at: string;
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function PrioritePostePanel() {
  const [missedCalls, setMissedCalls]     = useState<MissedCall[]>([]);
  const [unanswered, setUnanswered]       = useState<UnansweredChat[]>([]);
  const [showMissed, setShowMissed]       = useState(true);
  const [showUnanswered, setShowUnanswered] = useState(true);
  const [treating, setTreating]           = useState<Record<string, boolean>>({});

  const selectConversation = useChatStore((s) => s.selectConversation);

  const load = useCallback(async () => {
    const [missed, unans] = await Promise.allSettled([
      fetch(`${API_URL}/call-logs/mine/missed`, { credentials: 'include' }).then((r) => r.ok ? r.json() as Promise<MissedCall[]> : []),
      fetch(`${API_URL}/chats/mine/unanswered`, { credentials: 'include' }).then((r) => r.ok ? r.json() as Promise<UnansweredChat[]> : []),
    ]);
    if (missed.status === 'fulfilled') setMissedCalls(missed.value);
    if (unans.status  === 'fulfilled') setUnanswered(unans.value);
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

  const total = missedCalls.length + unanswered.length;
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

      {/* Messages non répondus */}
      {unanswered.length > 0 && (
        <div>
          <button
            onClick={() => setShowUnanswered((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1 bg-orange-100 text-xs text-orange-700 font-medium"
          >
            <span className="flex items-center gap-1">
              <MessageCircle className="w-3 h-3" />
              Messages non répondus ({unanswered.length})
            </span>
            {showUnanswered ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {showUnanswered && (
            <div className="divide-y divide-orange-100 max-h-36 overflow-y-auto">
              {unanswered.map((chat) => (
                <div key={chat.chat_id} className="flex items-center justify-between px-3 py-1.5 gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-700 truncate">{chat.contact_client}</p>
                    <p className="text-[10px] text-gray-400">{formatDate(chat.last_activity_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">
                      {chat.unread_count}
                    </span>
                    <button
                      onClick={() => handleOpenChat(chat.chat_id)}
                      className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors"
                    >
                      Ouvrir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
