import React from 'react';
import { MessageCircle, User, Phone, MoreVertical } from 'lucide-react';
import { Conversation } from '@/types/chat';
import { getStatusBadge } from '@/lib/utils';


interface ChatHeaderProps {
    currentConv: Conversation;
    totalMessages: number;
}

export default function ChatHeader({ currentConv, totalMessages }: ChatHeaderProps) {
  console.log("la conv selecte ============================", currentConv);
  
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
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg">
                        <MessageCircle className="w-4 h-4" />
                        <span className="font-medium">{totalMessages} messages</span>
                    </div>
                    <Phone className="w-5 h-5 text-gray-600 cursor-pointer hover:text-green-600" />
                    <MoreVertical className="w-5 h-5 text-gray-600 cursor-pointer hover:text-green-600" />
                </div>
            </div>
        </div>
    );
}
