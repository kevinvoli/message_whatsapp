import React from 'react';
import { Paperclip, Smile, Mic, Send, AlertCircle } from 'lucide-react';

interface MessageComposerProps {
    message: string;
    setMessage: (message: string) => void;
}

export default function MessageComposer({ message, setMessage }: MessageComposerProps) {
    return (
        <div className="bg-white border-t border-gray-200 p-4">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-2">
                    <button className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full whitespace-nowrap">
                        👋 Salutation
                    </button>
                    <button className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full whitespace-nowrap">
                        💰 Prix
                    </button>
                    <button className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full whitespace-nowrap">
                        📅 Rendez-vous
                    </button>
                    <button className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full whitespace-nowrap">
                        ✅ Confirmation
                    </button>
                </div>
                <div className="flex items-center gap-3">
                    <button className="p-3 text-gray-500 hover:text-green-600">
                        <Paperclip className="w-5 h-5" />
                    </button>
                    <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Tapez votre message..."
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button className="p-3 text-gray-500 hover:text-green-600">
                        <Smile className="w-5 h-5" />
                    </button>
                    <button className="p-3 text-gray-500 hover:text-green-600">
                        <Mic className="w-5 h-5" />
                    </button>
                    <button className="p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                        <Send className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-red-500 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Connexion perdue. Tentative de reconnexion...
                    </p>
                    <p className="text-xs text-gray-500">Temps de réponse moyen: 2.5 min</p>
                </div>
            </div>
        </div>
    );
}
