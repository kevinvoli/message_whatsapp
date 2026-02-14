import { randomUUID } from 'crypto';
import { WhapiMessage } from './payload.js';

export function generateMessage(chatId: string): WhapiMessage {
  return {
    id: randomUUID(),
    from_me: false,
    type: 'text',
    chat_id: chatId,
    timestamp: Math.floor(Date.now() / 1000), // ⚠ secondes
    source: 'mobile',
    from: chatId.split('@')[0],
    from_name: `Bot Stress ${Math.random().toString(36).slice(2)}`,
    text: {
      body: `Message de test ${Math.random().toString(36).slice(2)}`,
    },
  };
}
export function generateChatIds(count: number): string[] {
  return Array.from({ length: count }, () => {
    const phone = generateIvoryCoastNumber();
    // return `${phone}@s.whatsapp.net`;
    return `0717121618@s.whatsapp.net`
  });
}

function generateIvoryCoastNumber(): string {
  // 07xxxxxxxx ou 01xxxxxxxx (exemples réalistes)
  const prefixes = ['07', '01', '05'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

  const rest = Math.floor(10000000 + Math.random() * 90000000);

  return `225${prefix}${rest}`;
}