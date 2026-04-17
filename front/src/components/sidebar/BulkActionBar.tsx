'use client';
import React, { useState } from 'react';
import { X, CheckCircle, Clock, XCircle, ArrowRight, Loader2 } from 'lucide-react';
import { ConversationStatus } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';

interface BulkActionBarProps {
  selectedIds: Set<string>;
  onClear: () => void;
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({ selectedIds, onClear }) => {
  const [loading, setLoading] = useState(false);
  const { conversations, changeConversationStatus } = useChatStore();

  const count = selectedIds.size;

  const applyStatus = async (status: ConversationStatus) => {
    setLoading(true);
    const selectedConvs = conversations.filter((c) => selectedIds.has(c.chat_id));
    for (const conv of selectedConvs) {
      if (conv.status !== status) {
        changeConversationStatus(conv.chat_id, status);
      }
    }
    setLoading(false);
    onClear();
  };

  const actions: { label: string; status: ConversationStatus; icon: React.ReactNode; color: string }[] = [
    { label: 'Activer', status: 'actif', icon: <CheckCircle className="w-4 h-4" />, color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Attente', status: 'attente', icon: <Clock className="w-4 h-4" />, color: 'bg-orange-500 hover:bg-orange-600' },
    { label: 'Fermer', status: 'fermé', icon: <XCircle className="w-4 h-4" />, color: 'bg-red-600 hover:bg-red-700' },
    { label: 'Convertir', status: 'converti', icon: <ArrowRight className="w-4 h-4" />, color: 'bg-green-600 hover:bg-green-700' },
  ];

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 bg-gray-900 text-white px-3 py-2.5 shadow-lg">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium flex-1">
          {count} conversation{count > 1 ? 's' : ''} sélectionnée{count > 1 ? 's' : ''}
        </span>
        <button
          onClick={onClear}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
          title="Désélectionner tout"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {actions.map((action) => (
          <button
            key={action.status}
            onClick={() => applyStatus(action.status)}
            disabled={loading}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${action.color} disabled:opacity-50`}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
};
