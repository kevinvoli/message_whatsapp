import React from 'react';

export type Provider = 'whatsapp' | 'messenger' | 'instagram' | 'telegram';

const PROVIDER_CONFIG: Record<Provider, { label: string; bgColor: string; textColor: string; dotColor: string }> = {
  whatsapp:  { label: 'WhatsApp',   bgColor: 'bg-green-50',   textColor: 'text-green-700',  dotColor: 'bg-green-500' },
  messenger: { label: 'Messenger',  bgColor: 'bg-blue-50',    textColor: 'text-blue-700',   dotColor: 'bg-blue-500' },
  instagram: { label: 'Instagram',  bgColor: 'bg-purple-50',  textColor: 'text-purple-700', dotColor: 'bg-purple-500' },
  telegram:  { label: 'Telegram',   bgColor: 'bg-sky-50',     textColor: 'text-sky-700',    dotColor: 'bg-sky-500' },
};

/**
 * Dérive le provider depuis le chat_id.
 * - "{id}@messenger" → messenger
 * - "{id}@instagram" → instagram
 * - "{id}@telegram"  → telegram
 * - sinon            → whatsapp (whapi ou meta)
 */
export function getProviderFromChatId(chatId: string): Provider {
  if (chatId.endsWith('@messenger')) return 'messenger';
  if (chatId.endsWith('@instagram')) return 'instagram';
  if (chatId.endsWith('@telegram')) return 'telegram';
  return 'whatsapp';
}

interface ProviderBadgeProps {
  chatId: string;
  showLabel?: boolean;
}

export function ProviderBadge({ chatId, showLabel = false }: ProviderBadgeProps) {
  const provider = getProviderFromChatId(chatId);
  const cfg = PROVIDER_CONFIG[provider];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${cfg.bgColor} ${cfg.textColor}`}
      title={cfg.label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
      {showLabel && cfg.label}
    </span>
  );
}
