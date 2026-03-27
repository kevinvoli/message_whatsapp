import React, { useRef, useState } from 'react';
import { User, CheckCheck, Clock, Check, FileText, Download, MapPin, AlertCircle, Reply } from 'lucide-react';
import { Message } from '@/types/chat';
import { MediaBubble } from '../helper/mediaBubble';
import { formatTime } from '@/lib/dateUtils';
import { resolveMediaUrl } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';

interface ChatMessageProps {
  msg: Message;
  index: number;
  onQuotedClick?: (targetId: string) => void;
  isHighlighted?: boolean;
  searchTerm?: string;
}

function HighlightText({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === term.toLowerCase()
          ? <mark key={i} className="bg-yellow-300 text-gray-900 rounded-sm px-0.5">{part}</mark>
          : part,
      )}
    </>
  );
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ChatMessage({ msg, index, onQuotedClick, isHighlighted = false, searchTerm = '' }: ChatMessageProps) {
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const setReplyTo = useChatStore((s) => s.setReplyTo);

  const handlePlay = (audioEl: HTMLAudioElement) => {
    if (currentAudioRef.current && currentAudioRef.current !== audioEl) {
      currentAudioRef.current.pause();
    }
    currentAudioRef.current = audioEl;
  };

  const META_ERROR_LABELS: Record<number, string> = {
    131026: "Numéro absent de WhatsApp",
    131047: "Fenêtre 24h expirée — utilisez un template",
    131048: "Signalé comme spam par le destinataire",
    131051: "Type de message non supporté",
    131052: "Média expiré — renvoyez-le",
    130429: "Limite de débit — réessayez dans quelques minutes",
    131000: "Erreur Meta interne — réessayez",
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
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-300" />;
      default:
        return null;
    }
  };

  const messageText = msg.text && msg.text.trim().length > 0 ? msg.text : null;
  const hasMedia = Array.isArray(msg.medias) && msg.medias.length > 0;
  const isFromMe = msg.from_me;
  const messageTimestamp = msg.timestamp ? new Date(msg.timestamp) : null;
  const messageId = msg.id || `msg-fallback-${index}`;

  const audioMedias = msg.medias?.filter((m) => m.type === 'audio' || m.type === 'voice') ?? [];
  const imageMedias = msg.medias?.filter((m) => m.type === 'image') ?? [];
  const videoMedias = msg.medias?.filter((m) => m.type === 'video') ?? [];
  const documentMedias = msg.medias?.filter((m) => m.type === 'document') ?? [];
  const locationMedias = msg.medias?.filter((m) => m.type === 'location') ?? [];

  // Messages système : bulle centrée, style neutre
  if (msg.type === 'system') {
    return (
      <div data-message-id={messageId} className="flex justify-center my-1">
        <div className="bg-gray-100 text-gray-500 text-xs rounded-full px-4 py-1 max-w-sm text-center">
          {messageText ?? '[Message système]'}
        </div>
      </div>
    );
  }

  return (
    <div
      data-message-id={messageId}
      className={`flex ${isFromMe ? 'justify-end' : 'justify-start'} transition-transform duration-200 ${isHighlighted ? 'scale-[1.02]' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`relative max-w-md ${isFromMe ? '' : 'flex items-start gap-2'}`}>
        {!isFromMe && (
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-green-600" />
          </div>
        )}

        {/* Bouton Reply au hover */}
        {isHovered && (
          <button
            onClick={() => setReplyTo(msg)}
            className={`absolute top-1 ${isFromMe ? '-left-8' : '-right-8'} p-1 text-gray-400 hover:text-green-600 transition-colors`}
            title="Répondre"
          >
            <Reply className="w-4 h-4" />
          </button>
        )}

        <div
          className={`px-4 py-2 rounded-lg transition-all duration-300 ${
            isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-1' : ''
          } ${
            isFromMe
              ? 'bg-green-600 text-white rounded-br-none'
              : 'bg-white text-gray-900 rounded-bl-none shadow-sm'
          }`}
        >
          {/* Bloc citation si ce message est une réponse */}
          {msg.quotedMessage ? (
            <div
              className={`mb-2 pl-2 border-l-2 rounded text-xs cursor-pointer ${
                isFromMe
                  ? 'border-green-300 bg-green-500/30 text-green-100'
                  : 'border-green-500 bg-gray-50 text-gray-600'
              } px-2 py-1`}
              onClick={() => msg.quotedMessage?.id && onQuotedClick?.(msg.quotedMessage.id)}
            >
              <p className="font-semibold mb-0.5">
                {msg.quotedMessage.from_me ? 'Moi' : (msg.quotedMessage.from_name || 'Client')}
              </p>
              <p className="truncate">
                {msg.quotedMessage.text || '[Média]'}
              </p>
            </div>
          ) : msg.quotedMessage === null && (msg as any).quotedMessageId ? (
            <div className={`mb-2 pl-2 border-l-2 border-gray-400 rounded text-xs px-2 py-1 italic ${isFromMe ? 'bg-green-500/20 text-green-200' : 'bg-gray-50 text-gray-400'}`}>
              Message supprimé
            </div>
          ) : null}
          {/* Images */}
          {imageMedias.map((img, i) => {
            const src = resolveMediaUrl(img.url);
            return (
              <MediaBubble key={`img-${messageId}-${i}`} fromMe={isFromMe}>
                <a href={src ?? undefined} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={src ?? undefined}
                    alt={img.caption || 'image'}
                    className="max-w-full max-h-80 object-cover cursor-pointer"
                    loading="lazy"
                  />
                </a>
                {img.caption && (
                  <p className={`text-xs px-3 py-2 ${isFromMe ? 'text-green-100' : 'text-gray-500'}`}>
                    {img.caption}
                  </p>
                )}
              </MediaBubble>
            );
          })}

          {/* Videos */}
          {videoMedias.map((vid, i) => {
            const src = resolveMediaUrl(vid.url);
            return (
              <MediaBubble key={`video-${messageId}-${i}`} fromMe={isFromMe}>
                <video
                  controls
                  preload="metadata"
                  src={src ?? undefined}
                  className="max-w-full max-h-80"
                />
                {vid.caption && (
                  <p className={`text-xs px-3 py-2 ${isFromMe ? 'text-green-100' : 'text-gray-500'}`}>
                    {vid.caption}
                  </p>
                )}
              </MediaBubble>
            );
          })}

          {/* Audio / Voice */}
          {audioMedias.map((audio, i) => {
            const src = resolveMediaUrl(audio.url);
            return (
              <MediaBubble key={`audio-${messageId}-${i}`} fromMe={isFromMe}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <audio
                    controls
                    preload="metadata"
                    src={src ?? undefined}
                    className="w-full h-8"
                    onPlay={(e) => handlePlay(e.currentTarget)}
                  />
                </div>
                {audio.duration && audio.duration > 0 && (
                  <p className={`text-xs px-3 pb-1 ${isFromMe ? 'text-green-200' : 'text-gray-400'}`}>
                    {formatDuration(audio.duration)}
                  </p>
                )}
              </MediaBubble>
            );
          })}

          {/* Documents */}
          {documentMedias.map((doc, i) => {
            const src = resolveMediaUrl(doc.url);
            return (
              <MediaBubble key={`doc-${messageId}-${i}`} fromMe={isFromMe}>
              <a
                href={src ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 transition-colors hover:opacity-90"
              >
                <div className={`p-2 rounded-lg ${isFromMe ? 'bg-green-500/30' : 'bg-gray-200'}`}>
                  <FileText className={`w-5 h-5 ${isFromMe ? 'text-white' : 'text-gray-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isFromMe ? 'text-white' : 'text-gray-900'}`}>
                    {doc.file_name || doc.caption || 'Document'}
                  </p>
                  {(doc.file_size || doc.mime_type) && (
                    <p className={`text-xs ${isFromMe ? 'text-green-200' : 'text-gray-400'}`}>
                      {[formatFileSize(doc.file_size), doc.mime_type?.split('/')[1]?.toUpperCase()]
                        .filter(Boolean)
                        .join(' - ')}
                    </p>
                  )}
                </div>
                <Download className={`w-4 h-4 flex-shrink-0 ${isFromMe ? 'text-green-200' : 'text-gray-400'}`} />
              </a>
            </MediaBubble>
            );
          })}

          {/* Location */}
          {locationMedias.map((loc, i) => (
            <MediaBubble key={`loc-${messageId}-${i}`} fromMe={isFromMe}>
              <a
                href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 transition-colors hover:opacity-90"
              >
                <MapPin className={`w-5 h-5 ${isFromMe ? 'text-white' : 'text-red-500'}`} />
                <span className={`text-sm ${isFromMe ? 'text-white' : 'text-gray-700'}`}>
                  Position: {Number(loc.latitude).toFixed(4)}, {Number(loc.longitude).toFixed(4)}
                </span>
              </a>
            </MediaBubble>
          ))}

          {/* Message système centré (changement de numéro, etc.) */}
          {msg.type === 'system' && messageText && (
            <p className="text-xs italic opacity-90 text-center py-0.5">{messageText}</p>
          )}

          {/* Sticker placeholder */}
          {msg.type === 'sticker' && (
            <p className="text-sm italic opacity-70">🎭 Sticker WhatsApp</p>
          )}

          {/* Contact partagé */}
          {msg.type === 'contacts' && messageText && (
            <p className="text-sm">{messageText}</p>
          )}

          {/* Type non supporté */}
          {(msg.type === 'unsupported' || msg.type === 'unknown') && (
            <p className="text-xs italic opacity-70">⚠️ Type de message non supporté</p>
          )}

          {/* Text (types classiques) */}
          {msg.type !== 'system' &&
            msg.type !== 'sticker' &&
            msg.type !== 'unsupported' &&
            msg.type !== 'unknown' &&
            msg.type !== 'contacts' &&
            messageText && (
              <p className="text-sm whitespace-pre-wrap break-words">
                <HighlightText text={messageText} term={searchTerm} />
              </p>
            )}

          {/* Fallback for empty messages */}
          {!messageText && !hasMedia &&
            msg.type !== 'system' &&
            msg.type !== 'sticker' &&
            msg.type !== 'unsupported' &&
            msg.type !== 'unknown' && (
              <p className="text-sm italic opacity-80">[Message vide]</p>
            )}

          {/* Réaction emoji (posée par le client sur ce message) */}
          {msg.reaction_emoji && (
            <div className={`mt-1 flex ${isFromMe ? 'justify-end' : 'justify-start'}`}>
              <span className="text-base bg-white/20 rounded-full px-1.5 py-0.5 shadow-sm">
                {msg.reaction_emoji}
              </span>
            </div>
          )}

          {/* Label d'erreur de livraison Meta */}
          {isFromMe && msg.status === 'error' && (msg.error_code || msg.error_title) && (
            <div className="mt-1 flex items-center gap-1 text-xs text-red-300">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span>
                {msg.error_code && META_ERROR_LABELS[msg.error_code]
                  ? META_ERROR_LABELS[msg.error_code]
                  : (msg.error_title ?? 'Message non délivré')}
              </span>
            </div>
          )}

          {/* Timestamp + status */}
          <div
            className={`flex items-center gap-1 mt-1 text-xs ${
              isFromMe ? 'text-green-100 justify-end' : 'text-gray-500'
            }`}
          >
            <span>{formatTime(messageTimestamp)}</span>
            {isFromMe && renderStatusIcon(msg.status)}
          </div>
        </div>
      </div>
    </div>
  );
}

