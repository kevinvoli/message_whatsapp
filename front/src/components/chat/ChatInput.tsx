import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Mic, MicOff, Paperclip, Send, Smile, X } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useChatStore } from '@/store/chatStore';
import { Message } from '@/types/chat';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onTypingStart: (chat_id: string) => void;
  onTypingStop: (chat_id: string) => void;
  chat_id?: string | null;
  isConnected: boolean;
  disabled?: boolean;
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
}) => {
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
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

  const handleEmojiSelect = useCallback((emoji: { native: string }) => {
    setMessage((prev) => prev + emoji.native);
    setShowEmojiPicker(false);
  }, []);

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

  return (
    <div className="bg-white border-t border-gray-200 p-3">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-2">
        </div>

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
  );
};

export default ChatInput;
