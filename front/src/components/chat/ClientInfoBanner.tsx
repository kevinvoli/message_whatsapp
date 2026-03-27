import React from 'react';
import { Target, Star, Users, Calendar, Ban } from 'lucide-react';
import { Conversation, getPriorityColor } from '@/types/chat';
import { formatDate } from '@/lib/dateUtils';
import { logger } from '@/lib/logger';
import { useContactStore } from '@/store/contactStore';

interface ClientInfoBannerProps {
    currentConv: Conversation;
}

export default function ClientInfoBanner({ currentConv }: ClientInfoBannerProps) {
  logger.debug("Client info banner rendered", { chat_id: currentConv?.chat_id });

  const contact = useContactStore((s) =>
    s.contacts.find((c) => c.chat_id === currentConv?.chat_id),
  );

  return (
    <div className="flex items-center flex-wrap gap-4 text-xs text-gray-600 bg-blue-50 p-3 rounded-lg">
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
        <span>Assigné: <strong>{currentConv?.poste?.name}</strong></span>
      </div>
      <div className="flex items-center gap-1">
        <Calendar className="w-4 h-4 text-green-600" />
        <span>
          Dernière activité:{' '}
          <strong>{currentConv?.last_activity_at ? formatDate(currentConv.last_activity_at) : '-'}</strong>
        </span>
      </div>
      {contact?.marketing_opt_out && (
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
          <Ban className="w-3.5 h-3.5" />
          <span>Opt-out marketing</span>
        </div>
      )}
    </div>
  );
}
