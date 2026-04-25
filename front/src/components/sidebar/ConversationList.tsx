import React, { useState, useCallback } from 'react';
import ConversationItem from './ConversationItem';
import ObligationProgressBar from './ObligationProgressBar';
import { BulkActionBar } from './BulkActionBar';
import { Conversation } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';
import styles from './ConversationList.module.css';

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
