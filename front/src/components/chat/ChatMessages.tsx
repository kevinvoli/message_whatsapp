import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Conversation, ConversationNote, Message } from '@/types/chat';
import ChatMessage from './ChatMessage';
import { formatDateLong, formatTime } from '@/lib/dateUtils';
import { StickyNote, Trash2 } from 'lucide-react';

interface ChatMessagesProps {
  messages: Message[];
  currentConv: Conversation;
  notes: ConversationNote[];
  onDeleteNote: (noteId: string) => void;
  searchTerm?: string;
  onMatchCountChange?: (count: number) => void;
}

type TimelineItem =
  | { kind: 'message'; ts: number; msg: Message; index: number }
  | { kind: 'note'; ts: number; note: ConversationNote };

const ChatMessages: React.FC<ChatMessagesProps> = ({ messages, currentConv, notes, onDeleteNote, searchTerm = '', onMatchCountChange }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleQuotedClick = useCallback((targetId: string) => {
    const el = document.querySelector(`[data-message-id="${targetId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedId(targetId);
    highlightTimerRef.current = setTimeout(() => setHighlightedId(null), 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, notes]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  // Merge messages and notes sorted by time
  const timeline: TimelineItem[] = [
    ...messages.map((msg, index): TimelineItem => ({
      kind: 'message',
      ts: msg.timestamp?.getTime() ?? 0,
      msg,
      index,
    })),
    ...notes.map((note): TimelineItem => ({
      kind: 'note',
      ts: note.createdAt?.getTime() ?? 0,
      note,
    })),
  ].sort((a, b) => a.ts - b.ts);

  const filteredTimeline = normalizedSearch
    ? timeline.filter((item) => {
        if (item.kind === 'message') {
          return item.msg.text?.toLowerCase().includes(normalizedSearch);
        }
        return item.note.content.toLowerCase().includes(normalizedSearch);
      })
    : timeline;

  useEffect(() => {
    if (onMatchCountChange) onMatchCountChange(normalizedSearch ? filteredTimeline.length : 0);
  }, [filteredTimeline.length, normalizedSearch, onMatchCountChange]);

  if (filteredTimeline.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <p className="text-lg">{normalizedSearch ? 'Aucun résultat' : 'Aucun message'}</p>
          <p className="text-sm mt-2">
            {normalizedSearch
              ? `Aucun message ne contient "${searchTerm}"`
              : 'Envoyez le premier message pour démarrer la conversation'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
      <div className="max-w-4xl mx-auto space-y-3">
        <div className="text-center mb-6">
          <div className="inline-block bg-white px-4 py-2 rounded-full shadow-sm">
            <p className="text-xs text-gray-500">Début de la conversation - {formatDateLong(currentConv?.createdAt)}</p>
          </div>
        </div>
        {filteredTimeline.map((item) => {
          if (item.kind === 'message') {
            return (
              <ChatMessage
                key={item.msg.id}
                msg={item.msg}
                index={item.index}
                onQuotedClick={handleQuotedClick}
                isHighlighted={highlightedId === item.msg.id}
                searchTerm={normalizedSearch}
              />
            );
          }
          // Note interne
          const note = item.note;
          return (
            <div key={note.id} className="flex justify-center">
              <div className="relative max-w-md w-full bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 shadow-sm group">
                <div className="flex items-center gap-1.5 mb-1">
                  <StickyNote className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-yellow-700">Note interne</span>
                  {note.authorName && (
                    <span className="text-xs text-yellow-600">— {note.authorName}</span>
                  )}
                  <button
                    onClick={() => onDeleteNote(note.id)}
                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-yellow-500 hover:text-red-500"
                    title="Supprimer la note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{note.content}</p>
                <p className="text-xs text-yellow-500 mt-1 text-right">{formatTime(note.createdAt)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessages;
