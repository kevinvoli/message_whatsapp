import React, { useRef, useState } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onTypingStart: (chat_id: string) => void;
  onTypingStop: (chat_id: string) => void;
  chat_id: string;
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
        onTypingStop(chat_id);
      }
    }
  };

  const handleTyping = () => {
    console.log("typing",chat_id);
    
    if (!isTyping.current) {
      isTyping.current = true;
      onTypingStart(chat_id);
    }

    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }

    typingTimeout.current = setTimeout(() => {
      isTyping.current = false;
      onTypingStop(chat_id);
    }, TYPING_STOP_DELAY);
  };


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-white border-t border-gray-200 p-4">
      <div className="flex items-end gap-2">
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
          rows={2}
          disabled={disabled || !isConnected}
        />
        <button
          onClick={handleSubmit}
          disabled={!message.trim() || disabled || !isConnected}
          className="bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
      {!isConnected && (
        <p className="text-xs text-red-500 mt-2">Connexion perdue. Tentative de reconnexion...</p>
      )}
    </div>
  );
};

export default ChatInput;