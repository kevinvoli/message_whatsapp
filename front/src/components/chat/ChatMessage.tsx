import React, { useRef } from 'react';
import { User, CheckCheck, Clock, Check } from 'lucide-react';
import { Message } from '@/types/chat';
import { MediaBubble } from '../helper/mediaBubble';

interface ChatMessageProps {
  msg: Message;
  index: number;
}

export default function ChatMessage({ msg, index }: ChatMessageProps) {
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = (audioEl: HTMLAudioElement) => {
    if (currentAudioRef.current && currentAudioRef.current !== audioEl) {
      currentAudioRef.current.pause();
    }
    currentAudioRef.current = audioEl;
  };

  const formatTime = (date: Date) => {
    try {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) {
        return '--:--';
      }
      return d.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '--:--';
    }
  };

  const renderStatusIcon = (status?: string) => {
    switch (status) {
      case 'sending':
        return <Clock className="w-3 h-3" />;
      case 'sent':
        return <Check className="w-3 h-3" />;
      case 'delivered':
        return <CheckCheck className="w-3 h-3" />;
      case 'read':
        return <CheckCheck className="w-3 h-3 text-blue-300" />;
      default:
        return null;
    }
  };

  const messageText = msg.text && msg.text.trim().length > 0 ? msg.text : null;
  const hasMedia = Array.isArray(msg.medias) && msg.medias.length > 0;

  const messageFrom = msg.from_me ? 'commercial' : 'client';
  const messageTimestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
  const messageId = msg.id || `msg-fallback-${index}`;

  return (
    <div className={`flex ${messageFrom === 'commercial' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-md ${messageFrom === 'commercial' ? '' : 'flex items-start gap-2'}`}>
        {messageFrom !== 'commercial' && (
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-green-600" />
          </div>
        )}

        <div
          className={`px-4 py-2 rounded-lg ${
            messageFrom === 'commercial'
              ? 'bg-green-600 text-white rounded-br-none'
              : 'bg-white text-gray-900 rounded-bl-none shadow-sm'
          }`}
        >
          {messageText && <p className="text-sm">{messageText}</p>}

          {msg.medias
            ?.filter((m) => m.type === 'audio' || m.type === 'voice')
            .map((audio, i) => (
              <MediaBubble key={`audio-${messageId}-${i}`} fromMe={msg.from_me}>
                <div className="flex items-center gap-3 px-3 py-2">
                  <audio
                    controls
                    preload="metadata"
                    src={audio.url}
                    className="w-full h-8"
                    onPlay={(e) => handlePlay(e.currentTarget)}
                  />
                </div>
              </MediaBubble>
            ))}

          {msg.medias
            ?.filter((m) => m.type === 'image')
            .map((img, i) => (
              <img
                key={`img-${messageId}-${i}`}
                src={img.url}
                alt={img.caption || 'image'}
                className="rounded-lg max-w-full mt-2"
              />
            ))}

          {msg.medias
            ?.filter((m) => m.type === 'video')
            .map((vid, i) => (
              <video
                key={`video-${messageId}-${i}`}
                controls
                src={vid.url}
                className="rounded-lg max-w-full mt-2"
              />
            ))}

          {msg.medias
            ?.filter((m) => m.type === 'document')
            .map((doc, i) => (
              <a
                key={`doc-${messageId}-${i}`}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm underline text-blue-600 mt-2"
              >
                Document: {doc.caption || doc.file_name || 'Document'}
              </a>
            ))}

          {!messageText && !hasMedia && (
            <p className="text-sm italic opacity-80">[Message client]</p>
          )}

          <div
            className={`flex items-center gap-1 mt-1 text-xs ${
              messageFrom === 'commercial' ? 'text-green-100 justify-end' : 'text-gray-500'
            }`}
          >
            <span>{formatTime(messageTimestamp)}</span>
            {messageFrom === 'commercial' && renderStatusIcon(msg.status)}
          </div>
        </div>
      </div>
    </div>
  );
}
