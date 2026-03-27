import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Mic, MicOff, Paperclip, Send, Smile, StickyNote, X } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useChatStore } from '@/store/chatStore';
import { Message } from '@/types/chat';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface CannedResponseItem {
  id: string;
  shortcut: string;
  title: string;
  content: string;
  category?: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onTypingStart: (chat_id: string) => void;
  onTypingStop: (chat_id: string) => void;
  chat_id?: string | null;
  isConnected: boolean;
  disabled?: boolean;
  onAddNote?: (content: string) => void | Promise<void>;
}

const TYPING_STOP_DELAY = 2000; // 2s
const MAX_RECORDING_SECONDS = 300; // 5 minutes

function computeAvgResponseTime(messages: Message[]): string | null {
  const delays: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.from_me) continue;

    // Find the first outgoing message after this incoming one
    for (let j = i + 1; j < messages.length; j++) {
      if (messages[j].from_me) {
        const delay = messages[j].timestamp.getTime() - msg.timestamp.getTime();
        if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
          delays.push(delay);
        }
        break;
      }
    }
  }

  // Use last 10 exchanges max
  const recent = delays.slice(-10);
  if (recent.length === 0) return null;

  const avgMs = recent.reduce((a, b) => a + b, 0) / recent.length;
  const totalSec = Math.round(avgMs / 1000);

  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

async function uploadMedia(chatId: string, file: File | Blob, fileName: string, caption?: string) {
  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('chat_id', chatId);
  if (caption) formData.append('caption', caption);

  const response = await fetch(`${API_URL}/messages/media`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Upload failed');
  }
  return response.json();
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onTypingStart,
  onTypingStop,
  chat_id,
  isConnected,
  disabled = false,
  onAddNote,
}) => {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewMimeRef = useRef<string>('audio/ogg');
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const isTyping = useRef(false);
  const storeMessages = useChatStore((s) => s.messages);
  const avgResponseTime = useMemo(() => computeAvgResponseTime(storeMessages), [storeMessages]);
  const replyToMessage = useChatStore((s) => s.replyToMessage);
  const clearReplyTo = useChatStore((s) => s.clearReplyTo);

  // ─── Note mode ───────────────────────────────────────────────────────────
  const [noteMode, setNoteMode] = useState(false);

  // ─── Canned responses ────────────────────────────────────────────────────
  const [cannedSuggestions, setCannedSuggestions] = useState<CannedResponseItem[]>([]);
  const [cannedSelectedIndex, setCannedSelectedIndex] = useState(0);
  const showCannedPopover = cannedSuggestions.length > 0;
  const cannedFetchTimer = useRef<NodeJS.Timeout | null>(null);

  const fetchCannedSuggestions = useCallback(async (prefix: string) => {
    if (cannedFetchTimer.current) clearTimeout(cannedFetchTimer.current);
    if (!prefix) { setCannedSuggestions([]); return; }
    cannedFetchTimer.current = setTimeout(async () => {
      try {
        const resp = await fetch(
          `${API_URL}/canned-responses/suggest?prefix=${encodeURIComponent(prefix)}`,
          { credentials: 'include' },
        );
        if (resp.ok) {
          const data: CannedResponseItem[] = await resp.json();
          setCannedSuggestions(data);
          setCannedSelectedIndex(0);
        }
      } catch {
        setCannedSuggestions([]);
      }
    }, 150);
  }, []);

  const applyCannedResponse = useCallback((item: CannedResponseItem) => {
    setMessage(item.content);
    setCannedSuggestions([]);
  }, []);

  const handleEmojiSelect = useCallback((emoji: { native: string }) => {
    setMessage((prev) => prev + emoji.native);
    setShowEmojiPicker(false);
  }, []);

  // Cleanup typing sur fermeture de page
  useEffect(() => {
    const handleUnload = () => {
      if (chat_id && isTyping.current) onTypingStop(chat_id);
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [chat_id, onTypingStop]);

  // Cleanup typing sur changement de conversation
  useEffect(() => {
    return () => {
      if (chat_id && isTyping.current) {
        isTyping.current = false;
        onTypingStop(chat_id);
      }
    };
  }, [chat_id, onTypingStop]);

  // Libérer les pistes micro sur fermeture de page
  useEffect(() => {
    const handleUnload = () => {
      mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  // Révoquer l'URL de prévisualisation à la destruction
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Close picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const handleSubmit = () => {
    if (!message.trim() || disabled) return;
    if (noteMode && onAddNote) {
      void onAddNote(message.trim());
      setMessage('');
      setNoteMode(false);
      return;
    }
    if (!isConnected) return;
    onSendMessage(message.trim());
    setMessage('');

    if (isTyping.current) {
      isTyping.current = false;
      onTypingStop(chat_id || '');
    }
  };

  const handleTyping = () => {
    logger.debug("Typing started", { chat_id });

    if (!isTyping.current) {
      isTyping.current = true;
      onTypingStart(chat_id ?? '');
    }

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }

    typingTimeout.current = setTimeout(() => {
      isTyping.current = false;
      onTypingStop(chat_id ?? "");
    }, TYPING_STOP_DELAY);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // --- File upload (Paperclip) ---
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chat_id) return;

    setIsUploading(true);
    try {
      await uploadMedia(chat_id, file, file.name);
      logger.debug('Media uploaded', { chat_id, fileName: file.name });
    } catch (err) {
      logger.error('Media upload failed', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- Voice recording (Mic) ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedMimeTypes = [
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/opus',
        'audio/webm;codecs=opus',
        'audio/webm',
      ];
      const mimeType = supportedMimeTypes.find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      if (!mimeType) {
        logger.error('No supported audio mime type for recording');
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      previewMimeRef.current = mimeType;
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          setPreviewBlob(blob);
          setPreviewUrl(url);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev + 1 >= MAX_RECORDING_SECONDS) {
            stopRecording();
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      logger.error('Microphone access denied', { error: err instanceof Error ? err.message : String(err) });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  };

  const sendVoicePreview = async () => {
    if (!previewBlob || !chat_id) return;
    setIsUploading(true);
    try {
      const mime = previewMimeRef.current;
      const normalizedMime = mime.split(';')[0].trim().toLowerCase();
      const extension = normalizedMime === 'audio/webm' ? 'webm' : normalizedMime === 'audio/opus' ? 'opus' : 'ogg';
      await uploadMedia(chat_id, previewBlob, `vocal_${Date.now()}.${extension}`);
      logger.debug('Voice message uploaded', { chat_id });
    } catch (err) {
      logger.error('Voice upload failed', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsUploading(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewBlob(null);
      setPreviewUrl(null);
      setRecordingDuration(0);
    }
  };

  const cancelVoicePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewBlob(null);
    setPreviewUrl(null);
    setRecordingDuration(0);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white border-t border-gray-200 p-3">
      <div className="max-w-4xl mx-auto">
        {/* Bannière "En réponse à..." */}
        {replyToMessage && (
          <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-gray-50 border-l-4 border-green-500 rounded-r-lg">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-green-600">
                {replyToMessage.from_me ? 'Moi' : (replyToMessage.from_name || 'Client')}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {replyToMessage.text || '[Média]'}
              </p>
            </div>
            <button
              type="button"
              onClick={clearReplyTo}
              className="p-1 text-gray-400 hover:text-gray-600 flex-shrink-0"
              title="Annuler la réponse"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-2">
          {onAddNote && (
            <button
              type="button"
              onClick={() => { setNoteMode((v) => !v); setMessage(''); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                noteMode
                  ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title="Note interne"
            >
              <StickyNote className="w-3.5 h-3.5" />
              Note interne
            </button>
          )}
        </div>

        {previewBlob && previewUrl ? (
          <div className="flex flex-col gap-2">
            <audio controls src={previewUrl} className="w-full h-10" />
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={cancelVoicePreview}
                className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void sendVoicePreview()}
                disabled={isUploading}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
              >
                {isUploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer
              </button>
            </div>
          </div>
        ) : isRecording ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={cancelRecording}
                className="p-3 text-red-500 hover:text-red-700"
                title="Annuler"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex-1 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-gray-600">Enregistrement... {formatDuration(recordingDuration)}</span>
              </div>
              <button
                type="button"
                onClick={stopRecording}
                className="bg-green-600 text-white p-3 rounded-lg hover:bg-green-700"
                title="Arrêter et prévisualiser"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            {recordingDuration >= MAX_RECORDING_SECONDS - 30 && (
              <span className="text-red-500 text-xs text-center">
                Arrêt automatique dans {MAX_RECORDING_SECONDS - recordingDuration}s
              </span>
            )}
          </div>
        ) : (
          <div className="flex items-end gap-3">
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || disabled || !isConnected}
              className="p-3 text-gray-500 hover:text-green-600 disabled:opacity-50"
            >
              {isUploading ? (
                <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Paperclip className="w-5 h-5" />
              )}
            </button>
            <div className="relative flex-1">
            {showCannedPopover && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {cannedSuggestions.map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyCannedResponse(item)}
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 flex flex-col gap-0.5 ${i === cannedSelectedIndex ? 'bg-green-50' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-green-700">{item.shortcut}</span>
                      <span className="text-xs text-gray-500">{item.title}</span>
                      {item.category && <span className="ml-auto text-xs text-gray-400">{item.category}</span>}
                    </div>
                    <p className="text-xs text-gray-600 truncate">{item.content}</p>
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={message}
              onChange={(e) => {
                const val = e.target.value;
                setMessage(val);
                if (!noteMode) {
                  handleTyping();
                  if (val.startsWith('/')) {
                    void fetchCannedSuggestions(val.split(' ')[0]);
                  } else {
                    setCannedSuggestions([]);
                  }
                }
              }}
              onFocus={() => { if (!noteMode) handleTyping(); }}
              onKeyDown={(e) => {
                if (showCannedPopover) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setCannedSelectedIndex((i) => Math.min(i + 1, cannedSuggestions.length - 1));
                    return;
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setCannedSelectedIndex((i) => Math.max(i - 1, 0));
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    applyCannedResponse(cannedSuggestions[cannedSelectedIndex]);
                    return;
                  }
                  if (e.key === 'Escape') {
                    setCannedSuggestions([]);
                    return;
                  }
                }
                handleKeyDown(e);
              }}
              placeholder={noteMode ? 'Rédigez une note interne (visible uniquement par les agents)...' : 'Tapez votre message...'}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent resize-none ${
                noteMode
                  ? 'border-yellow-300 bg-yellow-50 text-yellow-900 focus:ring-yellow-400 placeholder-yellow-500'
                  : 'border-gray-300 text-gray-500 focus:ring-green-500'
              }`}
              rows={noteMode ? 3 : 1}
              disabled={(!noteMode && (!isConnected || disabled)) || isUploading}
            />
            </div>
            <div className="relative" ref={emojiPickerRef}>
              <button
                type="button"
                onClick={() => setShowEmojiPicker((v) => !v)}
                className="p-3 text-gray-500 hover:text-green-600"
              >
                <Smile className="w-5 h-5" />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-14 right-0 z-50">
                  <Picker data={data} onEmojiSelect={handleEmojiSelect} locale="fr" theme="light" />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled || !isConnected || isUploading}
              className="p-3 text-gray-500 hover:text-green-600 disabled:opacity-50"
            >
              <Mic className="w-5 h-5" />
            </button>
            <button
              onClick={handleSubmit}
              disabled={!message.trim() || isUploading || (!noteMode && (!isConnected || disabled))}
              className={`p-3 rounded-lg transition-colors disabled:cursor-not-allowed ${
                noteMode
                  ? 'bg-yellow-500 text-white hover:bg-yellow-600 disabled:bg-gray-300'
                  : 'bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-300'
              }`}
            >
              {noteMode ? <StickyNote className="w-5 h-5" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        )}

        {!isConnected && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Connexion perdue. Tentative de reconnexion...
          </p>
        )}
        {avgResponseTime && (
          <p className="text-xs text-gray-500">Temps de reponse moyen: {avgResponseTime}</p>
        )}
      </div>
    </div>
  );
};

export default ChatInput;
