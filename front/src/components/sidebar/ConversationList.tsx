import React, { useState, useCallback } from 'react';
import ConversationItem from './ConversationItem';
import ObligationProgressBar from './ObligationProgressBar';
import { BulkActionBar } from './BulkActionBar';
import { AlertTriangle } from 'lucide-react';
import { Conversation } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';
import styles from './ConversationList.module.css';

const ROTATION_BLOCKED_LABELS: Record<string, string> = {
  quality_check_failed:        'Répondez au dernier message de chaque conversation avant la rotation.',
  call_obligations_incomplete: 'Complétez vos obligations d\'appels pour débloquer la rotation.',
};

interface ConversationListProps {
    filteredConversations: Conversation[];
    filterStatus: string;
    selectedConv: string;
    selectedConversation: Conversation | null;
    onSelectConversation: (conv: Conversation) => void;
}

export default function ConversationList({
    filteredConversations,
    selectedConversation,
    onSelectConversation,
}: ConversationListProps) {
    const typingStatus      = useChatStore((state) => state.typingStatus);
    const windowRotating    = useChatStore((state) => state.windowRotating);
    const releasingChatIds  = useChatStore((state) => state.releasingChatIds);
    const rotationBlocked   = useChatStore((state) => state.rotationBlocked);
    const blockProgress     = useChatStore((state) => state.blockProgress);
    const releasingSet      = new Set(releasingChatIds);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const toggleCheck = useCallback((chatId: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(chatId)) next.delete(chatId);
            else next.add(chatId);
            return next;
        });
    }, []);

    const bulkMode = selectedIds.size > 0;

    return (
        <div className="flex-1 overflow-y-auto relative flex flex-col">
            {/* Obligations d'appels GICOP */}
            <ObligationProgressBar />

            {/* Bannière blocage de rotation */}
            {rotationBlocked && (
              <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-500" />
                <span>
                  <span className="font-semibold">
                    {blockProgress.validated}/{blockProgress.total} rapports soumis - rotation bloquee.
                  </span>{' '}
                  {ROTATION_BLOCKED_LABELS[rotationBlocked.reason] ?? 'Vérifiez les conditions de rotation.'}
                </span>
              </div>
            )}

            {/* Animation de rotation (flash discret) */}
            {windowRotating && (
                <div className="absolute inset-0 bg-white/40 pointer-events-none z-20 transition-opacity duration-300" />
            )}

            {bulkMode && (
                <div className="sticky top-0 z-10 bg-blue-50 border-b border-blue-200 px-3 py-1.5 flex items-center gap-2">
                    <span className="text-xs text-blue-700 font-medium flex-1">
                        {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''} — cliquez pour (dé)sélectionner
                    </span>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="text-xs text-blue-600 underline hover:no-underline"
                    >
                        Annuler
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto">
                {filteredConversations.map((conv) => {
                    const isReleasing = releasingSet.has(conv.chat_id);
                    return (
                        <div key={conv.chat_id} className={isReleasing ? styles.releasing : undefined}>
                            <ConversationItem
                                conversation={conv}
                                isSelected={selectedConversation?.id === conv.id}
                                isTyping={!!typingStatus[conv.chat_id]}
                                onClick={() => onSelectConversation(conv)}
                                bulkMode={bulkMode}
                                isChecked={selectedIds.has(conv.chat_id)}
                                onToggleCheck={toggleCheck}
                            />
                        </div>
                    );
                })}
            </div>

            {bulkMode && (
                <BulkActionBar
                    selectedIds={selectedIds}
                    onClear={() => setSelectedIds(new Set())}
                />
            )}
        </div>
    );
}
