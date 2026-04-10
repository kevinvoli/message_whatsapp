import React, { useState, useEffect } from 'react';
import { MessageCircle, User, Clock } from 'lucide-react';
import { CallStatus, Conversation, ConversationStatus } from '@/types/chat';
import { getStatusBadge } from '@/lib/utils';
import { CallButton } from '../conversation/callButton';
import { ConversationOptionsMenu } from '../conversation/conversationOptionMenu';
import { useChatStore } from '@/store/chatStore';
import { ProviderBadge, getProviderFromChatId } from '../ui/ProviderBadge';

const AVATAR_COLORS: Record<string, { bg: string; text: string }> = {
  whatsapp:  { bg: 'bg-green-100',  text: 'text-green-600'  },
  messenger: { bg: 'bg-blue-100',   text: 'text-blue-600'   },
  instagram: { bg: 'bg-purple-100', text: 'text-purple-600' },
  telegram:  { bg: 'bg-sky-100',    text: 'text-sky-600'    },
};

interface ChatHeaderProps {
    currentConv: Conversation;
    totalMessages: number;
}

function SlaCountdown({ deadline }: { deadline: Date }) {
    const [remaining, setRemaining] = useState(() => deadline.getTime() - Date.now());

    useEffect(() => {
        const id = setInterval(() => {
            setRemaining(deadline.getTime() - Date.now());
        }, 1000);
        return () => clearInterval(id);
    }, [deadline]);

    if (remaining <= 0) {
        return (
            <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                <Clock className="w-3 h-3" />
                SLA depasse
            </span>
        );
    }

    const totalSec = Math.floor(remaining / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const label = min > 0 ? `${min}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`;

    let colorClass = 'bg-green-100 text-green-700';
    if (min < 1) colorClass = 'bg-red-100 text-red-700';
    else if (min < 5) colorClass = 'bg-orange-100 text-orange-700';

    return (
        <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${colorClass}`}>
            <Clock className="w-3 h-3" />
            {label}
        </span>
    );
}

export default function ChatHeader({ currentConv, totalMessages }: ChatHeaderProps) {
    const { updateConversation, changeConversationStatus } = useChatStore();
    const provider = getProviderFromChatId(currentConv.chat_id);
    const avatarColor = AVATAR_COLORS[provider] ?? AVATAR_COLORS.whatsapp;

    const handleCallStatusChange = (
      _conversationId: string,
      callStatus: CallStatus,
      notes?: string,
    ) => {
      updateConversation({
        ...currentConv,
        call_status: callStatus,
        last_call_notes: notes,
        last_call_date: new Date(),
      });
    };

    const handleConversationStatusChange = (
      _conversationId: string,
      newStatus: ConversationStatus,
    ) => {
      changeConversationStatus(currentConv.chat_id, newStatus);
      updateConversation({
        ...currentConv,
        status: newStatus,
      });
    };

    return (
        <div className="bg-white border-b border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${avatarColor.bg} rounded-full flex items-center justify-center`}>
                        <User className={`w-6 h-6 ${avatarColor.text}`} />
                    </div>
                    <div>
                        <h2 className="font-semibold text-gray-900">{currentConv?.clientName}</h2>
                        <div className="flex items-center gap-2">
                            <p className="text-sm text-gray-500">{currentConv?.clientPhone}</p>
                            <span className="text-xs text-gray-400">•</span>
                            <ProviderBadge chatId={currentConv.chat_id} showLabel={true} />
                            <span className="text-xs text-gray-400">•</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(currentConv?.status || 'nouveau')}`}>
                                {currentConv?.status.replace('_', ' ')}
                            </span>
                            {currentConv?.readonly && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                    Lecture seule
                                </span>
                            )}
                            {currentConv?.first_response_deadline_at && (
                                <SlaCountdown deadline={new Date(currentConv.first_response_deadline_at)} />
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg">
                        <MessageCircle className="w-4 h-4" />
                        <span className="font-medium">{totalMessages} messages</span>
                    </div>
                    <CallButton conversation={currentConv}
                    onCallStatusChange={handleCallStatusChange} />
                    <ConversationOptionsMenu conversation={currentConv} onStatusChange={handleConversationStatusChange} />
                </div>
            </div>
        </div>
    );
}
