import React, { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { User, CheckCheck, Clock, Check, FileText, Download, MapPin, AlertCircle, Reply } from 'lucide-react';

const LocationMapThumb = dynamic(() => import('./LocationMapThumb'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-100 flex items-center justify-center"><MapPin className="w-6 h-6 text-gray-400" /></div>,
});
import { Message } from '@/types/chat';
import { MediaBubble } from '../helper/mediaBubble';
import { formatTime } from '@/lib/dateUtils';
import { resolveMediaUrl } from '@/lib/utils';
import { useChatStore } from '@/store/chatStore';
import { getProviderFromChatId } from '../ui/ProviderBadge';

const AVATAR_COLORS: Record<string, { bg: string; text: string }> = {
  whatsapp:  { bg: 'bg-green-100',  text: 'text-green-600'  },
  messenger: { bg: 'bg-blue-100',   text: 'text-blue-600'   },
  instagram: { bg: 'bg-purple-100', text: 'text-purple-600' },
  telegram:  { bg: 'bg-sky-100',    text: 'text-sky-600'    },
};

interface ChatMessageProps {
  msg: Message;
  index: number;
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

function LocationCard({ lat, lng, isFromMe }: { lat: number; lng: number; isFromMe: boolean }) {
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  return (
    <div className="overflow-hidden rounded-lg w-64 shadow-sm">
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="block" style={{ height: 130 }}>
        <LocationMapThumb lat={lat} lng={lng} />
      </a>
      <div className={`px-3 py-2 ${isFromMe ? 'bg-green-600' : 'bg-white border border-gray-100'}`}>
        <p className={`text-sm font-medium ${isFromMe ? 'text-white' : 'text-gray-900'}`}>
          Localisation partagée
        </p>
        <p className={`text-xs mt-0.5 ${isFromMe ? 'text-green-200' : 'text-gray-400'}`}>
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>
      </div>
    </div>
  );
}

export default function ChatMessage({ msg, index }: ChatMessageProps) {
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const provider = getProviderFromChatId(msg.chat_id);
  const avatarColor = AVATAR_COLORS[provider] ?? AVATAR_COLORS.whatsapp;

  const handlePlay = (audioEl: HTMLAudioElement) => {
    if (currentAudioRef.current && currentAudioRef.current !== audioEl) {
      currentAudioRef.current.pause();
    }
    currentAudioRef.current = audioEl;
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

  const hasMedia = Array.isArray(msg.medias) && msg.medias.length > 0;
  const hasLocationMedia = msg.medias?.some((m) => m.type === 'location' || m.type === 'live_location') ?? false;
  // Ne pas afficher le texte fallback si le message a un média location (évite "[Localisation]" en doublon)
  const messageText = msg.text && msg.text.trim().length > 0 && !hasLocationMedia ? msg.text : null;
  const isFromMe = msg.from_me;
  const messageTimestamp = msg.timestamp ? new Date(msg.timestamp) : null;
  const messageId = msg.id || `msg-fallback-${index}`;

  const audioMedias = msg.medias?.filter((m) => m.type === 'audio' || m.type === 'voice') ?? [];
  const imageMedias = msg.medias?.filter((m) => m.type === 'image') ?? [];
  const videoMedias = msg.medias?.filter((m) => m.type === 'video') ?? [];
  const documentMedias = msg.medias?.filter((m) => m.type === 'document') ?? [];
  const locationMedias = msg.medias?.filter((m) => m.type === 'location' || m.type === 'live_location') ?? [];
  const stickerMedias = msg.medias?.filter((m) => m.type === 'sticker') ?? [];

  return (
    <div
      className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`relative max-w-md ${isFromMe ? '' : 'flex items-start gap-2'}`}>
        {!isFromMe && (
          <div className={`w-8 h-8 ${avatarColor.bg} rounded-full flex items-center justify-center flex-shrink-0`}>
            <User className={`w-5 h-5 ${avatarColor.text}`} />
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
          className={`px-4 py-2 rounded-lg ${
            isFromMe
              ? 'bg-green-600 text-white rounded-br-none'
              : 'bg-white text-gray-900 rounded-bl-none shadow-sm'
          }`}
        >
          {/* Bloc citation si ce message est une réponse */}
          {msg.quotedMessage && (
            <div
              className={`mb-2 pl-2 border-l-2 rounded text-xs ${
                isFromMe
                  ? 'border-green-300 bg-green-500/30 text-green-100'
                  : 'border-green-500 bg-gray-50 text-gray-600'
              } px-2 py-1`}
            >
              <p className="font-semibold mb-0.5">
                {msg.quotedMessage.from_me ? 'Moi' : (msg.quotedMessage.from_name || 'Client')}
              </p>
              <p className="truncate">
                {msg.quotedMessage.text || '[Média]'}
              </p>
            </div>
          )}
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

          {/* Stickers */}
          {stickerMedias.map((sticker, i) => {
            const src = resolveMediaUrl(sticker.url);
            return (
              <div key={`sticker-${messageId}-${i}`} className="p-1">
                <img
                  src={src ?? undefined}
                  alt="sticker"
                  className="w-24 h-24 object-contain"
                  loading="lazy"
                />
              </div>
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

          {/* Location — aperçu style WhatsApp */}
          {locationMedias.map((loc, i) => {
            const lat = loc.latitude != null ? Number(loc.latitude) : null;
            const lng = loc.longitude != null ? Number(loc.longitude) : null;
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
              return (
                <div key={`loc-${messageId}-${i}`} className="flex items-center gap-2 p-2 bg-black/10 rounded">
                  <MapPin className="w-4 h-4" />
                  <span className="text-sm">Localisation</span>
                </div>
              );
            }
            return (
              <LocationCard key={`loc-${messageId}-${i}`} lat={lat} lng={lng} isFromMe={isFromMe} />
            );
          })}

          {/* Text */}
          {messageText && <p className="text-sm whitespace-pre-wrap break-words">{messageText}</p>}

          {/* Fallback for empty messages */}
          {!messageText && !hasMedia && (
            <p className="text-sm italic opacity-80">[Message vide]</p>
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

