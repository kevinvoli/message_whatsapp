// lib/utils.ts
import { Message } from '@/types/chat';

// Définit le type pour les données brutes d'un message reçues (par ex. d'une API)
interface RawMessageData {
  id?: string | number;
  text?: string;
  timestamp?: string | number | Date;
  from_me?: boolean;
  status?:  "sending" | "sent" | "delivered" | "read" | "error";
  direction?: 'IN' | 'OUT';
  from: string; // Le numéro de téléphone de l'expéditeur
  from_name?: string;
  chat_id:string;
}

export const createMessage = (data: RawMessageData): Message => ({
  id: String(data.id || `msg_${new Date().getTime()}`),
  text: data.text || '',
  timestamp: new Date(data.timestamp || Date.now()),
  from: data.from ,
  status: data.status || 'sent',
  direction: data.direction || 'IN',
  
  from_name: data.from_name || (data.from_me ? 'Agent' : 'Client'),
  from_me: !!data.from_me,
  chat_id: data.chat_id
});

export const getStatusBadge = (
  status:
    | 'nouveau'
    | 'en_cours'
    | 'attente'
    | 'en attente'
    | 'actif'
    | 'converti'
    | string,
) => {
    const styles = {
      nouveau: 'bg-blue-100 text-blue-800',
      en_cours: 'bg-yellow-100 text-yellow-800',
      actif: 'bg-yellow-100 text-yellow-800',
      attente: 'bg-gray-100 text-gray-800',
      'en attente': 'bg-gray-100 text-gray-800',
      converti: 'bg-green-100 text-green-800'
    };
    return styles[status as keyof typeof styles] || styles.nouveau;
  };
