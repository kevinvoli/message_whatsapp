import React, { useRef, useState } from 'react';
import { AlertCircle, Mic, Paperclip, Send, Smile } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onTypingStart: (chat_id: string) => void;
  onTypingStop: (chat_id: string) => void;
  chat_id?: string | null;
  isConnected: boolean;
  disabled?: boolean;
}

const TYPING_STOP_DELAY = 2000; // 2s

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onTypingStart,
  onTypingStop,
  chat_id,
  isConnected,
  disabled = false,
}) => {
  const [message, setMessage] = useState('');
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const isTyping = useRef(false);


  const handleSubmit = () => {
    if (message.trim() && !disabled && isConnected) {
      onSendMessage(message.trim());
      setMessage('');

      // 🔕 stop typing immédiatement
      if (isTyping.current) {
        isTyping.current = false;
        onTypingStop(chat_id || '');
      }
    }
  };

  const handleTyping = () => {
    console.log("typing", chat_id);

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

  return (
    <div className="bg-white border-t border-gray-200 p-3">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-2">
        </div>
        <div className="flex items-end gap-3">
          <button className="p-3 text-gray-500 hover:text-green-600">
            <Paperclip className="w-5 h-5" />
          </button>
          <textarea
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              // handleTyping();
            }}
            onFocus={handleTyping}
            onKeyDown={handleKeyDown}
            placeholder="Tapez votre message..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none text-gray-500"
            rows={1}
            disabled={disabled || !isConnected}
          />
          <button className="p-3 text-gray-500 hover:text-green-600">
            <Smile className="w-5 h-5" />
          </button>
          <button className="p-3 text-gray-500 hover:text-green-600">
            <Mic className="w-5 h-5" />
          </button>
          <button
            onClick={handleSubmit}
            disabled={!message.trim() || disabled || !isConnected}
            className="bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <div>

        </div>
        {!isConnected && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Connexion perdue. Tentative de reconnexion...
          </p>
        )}
        <p className="text-xs text-gray-500">Temps de réponse moyen: 2.5 min</p>
      </div>
    </div>
  );
};

export default ChatInput;