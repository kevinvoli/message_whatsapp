import React from 'react';
import { Conversation } from '@/lib/definitions';
import ChatMessage from './ChatMessage';

interface MessageListProps {
    currentConv: Conversation | undefined;
}

export default function MessageList({ currentConv }: MessageListProps) {
    return (
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
            <div className="max-w-4xl mx-auto space-y-3">
                {/* Indicateur de début de conversation */}
                <div className="text-center mb-6">
                    <div className="inline-block bg-white px-4 py-2 rounded-full shadow-sm">
                        <p className="text-xs text-gray-500">Début de la conversation - {currentConv?.time}</p>
                    </div>
                </div>

                {currentConv?.messages.map(msg => (
                    <ChatMessage key={msg.id} msg={msg} />
                ))}
            </div>
        </div>
    );
}
