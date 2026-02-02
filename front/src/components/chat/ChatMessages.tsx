import React, { useEffect, useRef } from 'react';
import { Clock, Check, CheckCheck } from 'lucide-react';
import { Message } from '@/types/chat';
import { MediaBubble } from '../helper/mediaBubble';

interface ChatMessagesProps {
  messages: Message[];
}



const ChatMessages: React.FC<ChatMessagesProps> = ({ messages }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  console.log("message a affiche", messages);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = (audioEl: HTMLAudioElement) => {
    if (
      currentAudioRef.current &&
      currentAudioRef.current !== audioEl
    ) {
      currentAudioRef.current.pause();
    }
    currentAudioRef.current = audioEl;
  };

  console.log("le message a afficher coté chate", messages);


  const formatTime = (date: Date) => {
    try {
      // Vérifie si la date est valide avant de la formater
      const d = new Date(date);
      if (isNaN(d.getTime())) {
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


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // Si aucun message
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <p className="text-lg">Aucun message</p>
          <p className="text-sm mt-2">Envoyez le premier message pour démarrer la conversation</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
      {messages.map((msg, index) => {
        const messageText =
          msg.text && msg.text.trim().length > 0 ? msg.text : null;

        const messageFrom = msg.from_me ? 'commercial' : 'client';
        const messageTimestamp = msg.timestamp
          ? new Date(msg.timestamp)
          : new Date();

        const messageId = msg.id || `msg-fallback-${index}`;

        return (
          <div
            key={messageId}
            className={`flex ${messageFrom === 'commercial'
                ? 'justify-end'
                : 'justify-start'
              }`}
          >
            <div
              className={`max-w-xl px-4 py-2 rounded-2xl space-y-2 ${messageFrom === 'commercial'
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-800 border border-gray-200'
                }`}
            >
              {/* 📄 TEXTE */}
              {messageText && (
                <p className="whitespace-pre-wrap break-words">
                  {messageText}
                </p>
              )}

              {/* 🎙️ AUDIO / VOICE */}
              {msg.medias
  ?.filter((m) => m.type === 'audio' || m.type === 'voice')
  .map((audio, i) => (
    <MediaBubble key={i} fromMe={msg.from_me}>
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


              {/* 🖼️ IMAGE */}
              {msg.medias
                ?.filter((m) => m.type === 'image')
                .map((img, i) => (
                  <img
                    key={i}
                    src={img.url}
                    alt={img.caption || 'image'}
                    className="rounded-lg max-w-full"
                  />
                ))}

              {/* 🎬 VIDÉO */}
              {msg.medias
                ?.filter((m) => m.type === 'video')
                .map((vid, i) => (
                  <video
                    key={i}
                    controls
                    src={vid.url}
                    className="rounded-lg max-w-full"
                  />
                ))}

              {/* 📄 DOCUMENT */}
              {msg.medias
                ?.filter((m) => m.type === 'document')
                .map((doc, i) => (
                  <a
                    key={i}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm underline text-blue-600"
                  >
                    📎 {doc.caption || doc.file_name || 'Document'}
                  </a>
                ))}

              {/* ⏱️ FOOTER */}
              <div
                className={`flex items-center gap-1 text-xs ${messageFrom === 'commercial'
                    ? 'text-green-100'
                    : 'text-gray-500'
                  }`}
              >
                <span>{formatTime(messageTimestamp)}</span>
                {messageFrom === 'commercial' &&
                  renderStatusIcon(msg.status)}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>

  );
};

export default ChatMessages;