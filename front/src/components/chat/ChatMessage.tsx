import React, { useRef } from 'react';
import { User, CheckCheck, Clock, Check, FileText, Download, MapPin, AlertCircle } from 'lucide-react';
import { Message } from '@/types/chat';
import { MediaBubble } from '../helper/mediaBubble';
import { formatTime } from '@/lib/dateUtils';

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

export default function ChatMessage({ msg, index }: ChatMessageProps) {
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

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

  return (
    <div className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-md ${isFromMe ? '' : 'flex items-start gap-2'}`}>
        {!isFromMe && (
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-green-600" />
          </div>
        )}

        <div
          className={`px-4 py-2 rounded-lg ${
            isFromMe
              ? 'bg-green-600 text-white rounded-br-none'
              : 'bg-white text-gray-900 rounded-bl-none shadow-sm'
          }`}
        >
          {/* Images */}
          {imageMedias.map((img, i) => (
            <MediaBubble key={`img-${messageId}-${i}`} fromMe={isFromMe}>
              <a href={img.url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={img.url}
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
          ))}

          {/* Videos */}
          {videoMedias.map((vid, i) => (
            <MediaBubble key={`video-${messageId}-${i}`} fromMe={isFromMe}>
              <video
                controls
                preload="metadata"
                src={vid.url}
                className="max-w-full max-h-80"
              />
              {vid.caption && (
                <p className={`text-xs px-3 py-2 ${isFromMe ? 'text-green-100' : 'text-gray-500'}`}>
                  {vid.caption}
                </p>
              )}
            </MediaBubble>
          ))}

          {/* Audio / Voice */}
          {audioMedias.map((audio, i) => (
            <MediaBubble key={`audio-${messageId}-${i}`} fromMe={isFromMe}>
              <div className="flex items-center gap-2 px-3 py-2">
                <audio
                  controls
                  preload="metadata"
                  src={audio.url}
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
          ))}

          {/* Documents */}
          {documentMedias.map((doc, i) => (
            <MediaBubble key={`doc-${messageId}-${i}`} fromMe={isFromMe}>
              <a
                href={doc.url}
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
          ))}

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
