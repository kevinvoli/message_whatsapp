import React, { useRef, useState, useEffect } from 'react';
import { MessageCircle, User, Clock, Search, X } from 'lucide-react';
import { CallStatus, Conversation, ConversationStatus } from '@/types/chat';
import { getStatusBadge } from '@/lib/utils';
import { CallButton } from '../conversation/callButton';
import { ConversationOptionsMenu } from '../conversation/conversationOptionMenu';
import { useChatStore } from '@/store/chatStore';

interface ChatHeaderProps {
    currentConv: Conversation;
    totalMessages: number;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    matchCount?: number;
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

export default function ChatHeader({ currentConv, totalMessages, searchTerm, onSearchChange, matchCount }: ChatHeaderProps) {
    const { updateConversation, changeConversationStatus } = useChatStore();
    const [searchOpen, setSearchOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const toggleSearch = () => {
        if (searchOpen) {
            onSearchChange('');
            setSearchOpen(false);
        } else {
            setSearchOpen(true);
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    };

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
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-gray-900">{currentConv?.clientName}</h2>
                        <div className="flex items-center gap-2">
                            <p className="text-sm text-gray-500">{currentConv?.clientPhone}</p>
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
                    <button
                        type="button"
                        onClick={toggleSearch}
                        title={searchOpen ? 'Fermer la recherche' : 'Rechercher dans les messages'}
                        className={`p-1.5 rounded-lg transition-colors ${searchOpen ? 'bg-green-100 text-green-700' : 'text-gray-400 hover:text-green-600 hover:bg-gray-100'}`}
                    >
                        <Search className="w-4 h-4" />
                    </button>
                    <CallButton conversation={currentConv}
                    onCallStatusChange={handleCallStatusChange} />
                    <ConversationOptionsMenu conversation={currentConv} onStatusChange={handleConversationStatusChange} />
                </div>
            </div>

            {searchOpen && (
                <div className="flex items-center gap-2 mt-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchTerm}
                            onChange={(e) => onSearchChange(e.target.value)}
                            placeholder="Rechercher dans les messages..."
                            className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400 bg-gray-50"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => onSearchChange('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                    {searchTerm && (
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                            {matchCount ?? 0} résultat{(matchCount ?? 0) !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
