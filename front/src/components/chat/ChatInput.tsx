import React, { useState } from 'react';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isConnected: boolean;
  disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ 
  onSendMessage, 
  isConnected, 
  disabled = false 
}) => {
  const [message, setMessage] = useState('');

  const handleSubmit = () => {
    if (message.trim() && !disabled && isConnected) {
      onSendMessage(message.trim());
      setMessage('');
    }
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
          onChange={(e) => setMessage(e.target.value)}
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