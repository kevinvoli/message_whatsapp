// lib/utils.ts
import { Message } from '@/types/chat';
import { StartupSnapshot } from 'node:v8';

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