import React from 'react';
import { User, Image, Video, Mic, FileText, MapPin, Sparkles, Layers } from 'lucide-react';
import { Conversation } from '@/types/chat';
import { TypingIndicator } from '../ui/typingIndicator';
import { getStatusBadge } from '@/lib/utils';
import { formatConversationTime } from '@/lib/dateUtils';

type PlaceholderMeta = {
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const renderLastMessagePreview = (conversation: Conversation) => {
  const text = conversation.lastMessage?.text?.trim();
  if (!text) {
    return (
      <p className="text-sm text-gray-500 truncate">
        Aucun message pour le moment
      </p>
    );
  }

  const placeholder = getMediaPlaceholder(text);
  if (placeholder) {
    const Icon = placeholder.icon;
    return (
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <Icon className="w-3 h-3 text-gray-400" />
        <span className="font-medium text-gray-800">{placeholder.label}</span>
      </div>
    );
  }

  return (
    <p className="text-sm text-gray-500 truncate">
      {text}
    </p>
  );
};

const getMediaPlaceholder = (text: string): PlaceholderMeta | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null;
  }
  const content = trimmed.slice(1, -1).replace(/_/g, ' ').replace(/client/gi, '').trim();
  const normalized = content.toLowerCase();

  if (normalized.includes('photo')) {
    return { label: 'Photo', icon: Image };
  }
  if (/video|gif|short/.test(normalized)) {
    return { label: 'Vidéo', icon: Video };
  }
  if (normalized.includes('vocal') || normalized.includes('audio')) {
    return { label: 'Message vocal', icon: Mic };
  }
  if (normalized.includes('document')) {
    return { label: 'Document', icon: FileText };
  }
  if (normalized.includes('localisation') || normalized.includes('location')) {
    return { label: 'Localisation', icon: MapPin };
  }
  if (/interactive|bouton|button|liste|list|réponse|reponse/.test(normalized)) {
    return { label: 'Message interactif', icon: Sparkles };
  }

  if (content.length === 0) {
    return { label: 'Média', icon: Layers };
  }

  return { label: capitalize(content), icon: Layers };
};

const capitalize = (value: string) => {
  if (value.length === 0) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  isTyping?: boolean; // 👈 AJOUT
  onClick: () => void;
}

const ConversationItem: React.FC<ConversationItemProps> = ({
  conversation, isSelected, isTyping, onClick }) => {


  return (
    <div
      onClick={onClick}
      className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${isSelected ? 'bg-green-50 border-l-4 border-l-green-600' : 'hover:bg-gray-50'
        }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 relative">
          <User className="w-6 h-6 text-green-600" />
          {conversation.priority === 'haute' && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xs">!</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-gray-800 truncate">{conversation.clientName}</h3>
            <span className="text-xs text-gray-500">
              {conversation.lastMessage ? formatConversationTime(conversation.lastMessage.timestamp) : "NA"}
            </span>
          </div>
          <p className="text-sm text-gray-600 truncate">{conversation.clientPhone}</p>
          <div className="mt-1">
            {isTyping ? (
              <TypingIndicator />
            ) : (
              renderLastMessagePreview(conversation)
            )}
          </div>


          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(conversation.status)}`}>
              {conversation.status.replace('_', ' ')}
            </span>
            {/* <span className="text-xs text-gray-500">{conversation.status}</span> */}
            {conversation?.tags?.map((tag, idx) => (
              <span key={idx} className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>

        </div>
        {conversation.unreadCount > 0 && (
          <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0">
             <span className="text-xs text-white font-bold">{conversation.unreadCount}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConversationItem;
