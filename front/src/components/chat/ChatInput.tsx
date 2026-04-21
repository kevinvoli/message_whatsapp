import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, MapPin, Mic, Paperclip, Send, Smile, Sparkles, Wand2, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { logger } from '@/lib/logger';
import { useChatStore } from '@/store/chatStore';
import { Message } from '@/types/chat';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { CannedResponseMenu } from './CannedResponseMenu';
import { useAuth } from '@/contexts/AuthProvider';

const LocationPickerModal = dynamic(() => import('./LocationPickerModal'), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onTypingStart: (chat_id: string) => void;
  onTypingStop: (chat_id: string) => void;
  chat_id?: string | null;
  isConnected: boolean;
  disabled?: boolean;
  windowExpired?: boolean;
  conversationClosed?: boolean;
  lastClientMessageAt?: Date | null;
  firstResponseDeadlineAt?: Date | null;
}

const TYPING_STOP_DELAY = 2000; // 2s

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

async function sendLocation(chatId: string, latitude: number, longitude: number) {
  const response = await fetch(`${API_URL}/messages/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ chat_id: chatId, latitude, longitude }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || 'Erreur envoi localisation');
  }
  return response.json();
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
  windowExpired = false,
  conversationClosed = false,
  lastClientMessageAt,
  firstResponseDeadlineAt,
}) => {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [showRewriteMenu, setShowRewriteMenu] = useState(false);
  const [suggestions, setSuggestions] = useState<{ text: string; rationale: string }[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const rewriteMenuRef = useRef<HTMLDivElement>(null);
  const [isSendingLocation, setIsSendingLocation] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
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
  const { user } = useAuth();

  const cannedPrefix = message.startsWith('/') ? message.slice(1) : null;

  // Raccourcis clavier globaux
  useEffect(() => {
    const onOpenCanned = () => { if (!disabled) setMessage(prev => prev.startsWith('/') ? prev : '/' + prev); };
    const onSendMsg = () => { handleSubmit(); };
    document.addEventListener('app:open-canned', onOpenCanned);
    document.addEventListener('app:send-message', onSendMsg);
    return () => {
      document.removeEventListener('app:open-canned', onOpenCanned);
      document.removeEventListener('app:send-message', onSendMsg);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, message]);

  const handleEmojiSelect = useCallback((emoji: { native: string }) => {
    setMessage((prev) => prev + emoji.native);
    setShowEmojiPicker(false);
  }, []);

  const handleFetchSuggestions = async () => {
    if (!chat_id) return;
    setLoadingSuggestions(true);
    setShowSuggestions(true);
    try {
      const res = await fetch(`${API_URL}/ai/suggestions/${chat_id}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as { text: string; rationale: string }[];
        setSuggestions(data);
      }
    } catch { /* silencieux */ } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleRewrite = async (mode: 'correct' | 'improve' | 'formal' | 'short') => {
    if (!message.trim()) return;
    setShowRewriteMenu(false);
    setIsRewriting(true);
    try {
      const res = await fetch(`${API_URL}/ai/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: message, mode }),
      });
      if (res.ok) {
        const data = await res.json() as { result: string };
        if (data.result) setMessage(data.result);
      }
    } catch {
      // silencieux
    } finally {
      setIsRewriting(false);
    }
  };

  useEffect(() => {
    if (!showRewriteMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rewriteMenuRef.current && !rewriteMenuRef.current.contains(e.target as Node)) {
        setShowRewriteMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showRewriteMenu]);

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
    if (message.trim() && !disabled && isConnected) {
      onSendMessage(message.trim());
      setMessage('');

      if (isTyping.current) {
        isTyping.current = false;
        onTypingStop(chat_id || '');
      }
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

  // --- Location sharing ---
  const handleConfirmLocation = useCallback(async (lat: number, lng: number) => {
    if (!chat_id) return;
    setIsSendingLocation(true);
    try {
      await sendLocation(chat_id, lat, lng);
      logger.debug('Location sent', { chat_id });
    } catch (err) {
      logger.error('Location send failed', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsSendingLocation(false);
    }
  }, [chat_id]);

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

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size > 0 && chat_id) {
          setIsUploading(true);
          try {
            const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
            const extension = normalizedMime === 'audio/webm'
              ? 'webm'
              : normalizedMime === 'audio/opus'
                ? 'opus'
                : 'ogg';
            await uploadMedia(chat_id, blob, `vocal_${Date.now()}.${extension}`);
            logger.debug('Voice message uploaded', { chat_id });
          } catch (err) {
            logger.error('Voice upload failed', { error: err instanceof Error ? err.message : String(err) });
          } finally {
            setIsUploading(false);
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
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

  // Conversation fermée → bannière dédiée (prioritaire sur windowExpired)
  if (conversationClosed) {
    const hoursSinceClient = lastClientMessageAt
      ? Math.floor((Date.now() - new Date(lastClientMessageAt).getTime()) / 3_600_000)
      : null;

    const slaExceeded =
      firstResponseDeadlineAt && new Date() > new Date(firstResponseDeadlineAt);

    return (
      <div className="bg-red-50 border-t border-red-300 p-4">
        <div className="max-w-4xl mx-auto flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-red-700">Conversation fermée — consultation uniquement</p>
            <p className="text-xs text-red-600">
              {hoursSinceClient !== null
                ? `Le client n'a pas envoyé de message depuis plus de ${hoursSinceClient}h (seuil de fermeture automatique dépassé).`
                : "Le client n'a pas envoyé de message depuis plus de 24h (seuil de fermeture automatique dépassé)."}
            </p>
            {slaExceeded && (
              <p className="text-xs text-red-600 font-semibold">
                ⚠ SLA dépassé — le délai de première réponse ({new Date(firstResponseDeadlineAt!).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}) n&apos;a pas été respecté.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fenêtre de messagerie expirée → afficher uniquement la bannière, pas l'input
  if (windowExpired) {
    return (
      <div className="bg-orange-50 border-t border-orange-200 p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3 text-orange-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold">Fenêtre de messagerie expirée</p>
            <p className="text-xs text-orange-600">
              Le client n&apos;a pas écrit depuis plus de 23h. En attente d&apos;un message de sa part pour reprendre la conversation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    {showLocationPicker && (
      <LocationPickerModal
        onClose={() => setShowLocationPicker(false)}
        onConfirm={(lat, lng) => void handleConfirmLocation(lat, lng)}
      />
    )}
    <div className="bg-white border-t border-gray-200 p-3">
      <div className="max-w-4xl mx-auto">
        {/* Suggestions IA */}
        {showSuggestions && (
          <div className="mb-2 p-2 bg-purple-50 border border-purple-200 rounded-xl">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Suggestions IA
              </span>
              <button
                type="button"
                onClick={() => setShowSuggestions(false)}
                className="text-purple-400 hover:text-purple-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {loadingSuggestions ? (
              <div className="flex items-center gap-2 py-1">
                <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-purple-500">Génération en cours…</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setMessage(s.text); setShowSuggestions(false); }}
                    title={s.rationale}
                    className="text-left text-xs px-2.5 py-1.5 bg-white border border-purple-200 rounded-lg hover:bg-purple-100 text-gray-700 truncate"
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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

        {isRecording ? (
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
              title="Envoyer"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="relative flex items-end gap-3">
            {cannedPrefix !== null && (
              <CannedResponseMenu
                prefix={cannedPrefix}
                posteId={user?.poste_id ?? user?.posteId ?? undefined}
                onSelect={(body) => {
                  setMessage(body);
                }}
                onClose={() => setMessage('')}
              />
            )}
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => setShowLocationPicker(true)}
              disabled={isSendingLocation || disabled || !isConnected}
              title="Partager une localisation"
              className="p-3 text-gray-500 hover:text-green-600 disabled:opacity-50"
            >
              {isSendingLocation ? (
                <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <MapPin className="w-5 h-5" />
              )}
            </button>
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
            {!message.trim() && (
              <button
                type="button"
                onClick={() => void handleFetchSuggestions()}
                disabled={disabled || !isConnected || loadingSuggestions}
                title="Suggestions IA"
                className="p-3 text-gray-400 hover:text-purple-600 disabled:opacity-50"
              >
                {loadingSuggestions ? (
                  <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
              </button>
            )}
            <textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                handleTyping();
              }}
              onFocus={handleTyping}
              onKeyDown={handleKeyDown}
              placeholder="Tapez votre message..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none text-gray-500"
              rows={1}
              disabled={disabled || !isConnected || isUploading}
            />
            {message.trim().length > 0 && (
              <div className="relative" ref={rewriteMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowRewriteMenu((v) => !v)}
                  disabled={isRewriting || disabled}
                  title="Réécrire avec l'IA"
                  className="p-3 text-gray-400 hover:text-purple-600 disabled:opacity-50"
                >
                  {isRewriting ? (
                    <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Wand2 className="w-5 h-5" />
                  )}
                </button>
                {showRewriteMenu && (
                  <div className="absolute bottom-14 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-44">
                    {(
                      [
                        { mode: 'correct', label: 'Corriger' },
                        { mode: 'improve', label: 'Améliorer' },
                        { mode: 'formal',  label: 'Formaliser' },
                        { mode: 'short',   label: 'Raccourcir' },
                      ] as const
                    ).map(({ mode, label }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => void handleRewrite(mode)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
              disabled={!message.trim() || disabled || !isConnected || isUploading}
              className="bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
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
    </>
  );
};

export default ChatInput;
