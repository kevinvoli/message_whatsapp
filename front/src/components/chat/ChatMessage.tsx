import React from 'react';
import { User, CheckCheck, CheckCircle } from 'lucide-react';
import { Message } from '@/lib/definitions';

interface ChatMessageProps {
    msg: Message;
}

export default function ChatMessage({ msg }: ChatMessageProps) {
    return (
        <div className={`flex ${msg.sent ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-md ${msg.sent ? '' : 'flex items-start gap-2'}`}>
                {!msg.sent && (
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-green-600" />
                    </div>
                )}
                <div className={`px-4 py-2 rounded-lg ${
                    msg.sent 
                        ? 'bg-green-600 text-white rounded-br-none' 
                        : 'bg-white text-gray-900 rounded-bl-none shadow-sm'
                }`}>
                    <p className="text-sm">{msg.text}</p>
                    <div className={`flex items-center gap-1 mt-1 text-xs ${
                        msg.sent ? 'text-green-100 justify-end' : 'text-gray-500'
                    }`}>
                        <span>{msg.time}</span>
                        {msg.sent && (
                            msg.status === 'read' ? <CheckCheck className="w-3 h-3 text-blue-300" /> :
                            msg.status === 'delivered' ? <CheckCheck className="w-3 h-3" /> :
                            <CheckCircle className="w-3 h-3" />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
