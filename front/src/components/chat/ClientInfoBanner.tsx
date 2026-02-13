import React from 'react';
import { Target, Star, Users, Calendar } from 'lucide-react';
import { Conversation, getPriorityColor } from '@/types/chat';
import { logger } from '@/lib/logger';

interface ClientInfoBannerProps {
    currentConv: Conversation;
}


export default function ClientInfoBanner({ currentConv }: ClientInfoBannerProps) {

logger.debug("Client info banner rendered", {
  chat_id: currentConv?.chat_id,
});

    return (
        <div className="flex items-center gap-4 text-xs text-gray-600 bg-blue-50 p-3 rounded-lg">
            <div className="flex items-center gap-1">
                <Target className="w-4 h-4 text-blue-600" />
                <span>Source: <strong>{currentConv?.source}</strong></span>
            </div>
            <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-500" />
                <span>Priorité: <strong className={getPriorityColor(currentConv?.priority || 'basse')}>{currentConv?.priority}</strong></span>
            </div>
            <div className="flex items-center gap-1">
                <Users className="w-4 h-4 text-purple-600" />
                <span>Assigné: <strong>{currentConv?.poste?.name }</strong></span>
            </div>
            <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4 text-green-600" />
                <span>Dernier contact: <strong>{currentConv?.lastMessage?.timestamp.toDateString()} </strong></span>
            </div>
        </div>
    );
}
