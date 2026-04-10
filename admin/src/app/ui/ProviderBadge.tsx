'use client';

import React from 'react';

export type Provider = 'whatsapp' | 'messenger' | 'instagram' | 'telegram';

const PROVIDER_CONFIG: Record<Provider, {
  label: string;
  bgColor: string;
  textColor: string;
  dotColor: string;
  avatarBg: string;
  avatarText: string;
}> = {
  whatsapp:  { label: 'WhatsApp',  bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', dotColor: 'bg-emerald-500', avatarBg: 'bg-emerald-100', avatarText: 'text-emerald-700' },
  messenger: { label: 'Messenger', bgColor: 'bg-blue-50',    textColor: 'text-blue-700',    dotColor: 'bg-blue-500',    avatarBg: 'bg-blue-100',    avatarText: 'text-blue-700'    },
  instagram: { label: 'Instagram', bgColor: 'bg-purple-50',  textColor: 'text-purple-700',  dotColor: 'bg-purple-500',  avatarBg: 'bg-purple-100',  avatarText: 'text-purple-700'  },
  telegram:  { label: 'Telegram',  bgColor: 'bg-sky-50',     textColor: 'text-sky-700',     dotColor: 'bg-sky-500',     avatarBg: 'bg-sky-100',     avatarText: 'text-sky-700'     },
};

/**
 * Dérive le provider depuis le chat_id.
 * - "{id}@messenger" → messenger
 * - "{id}@instagram" → instagram
 * - "{id}@telegram"  → telegram
 * - sinon            → whatsapp
 */
export function getProviderFromChatId(chatId: string | undefined | null): Provider {
  if (!chatId) return 'whatsapp';
  if (chatId.endsWith('@messenger')) return 'messenger';
  if (chatId.endsWith('@instagram')) return 'instagram';
  if (chatId.endsWith('@telegram')) return 'telegram';
  return 'whatsapp';
}

export function getAvatarColors(chatId: string | undefined | null): { bg: string; text: string } {
  const cfg = PROVIDER_CONFIG[getProviderFromChatId(chatId)];
  return { bg: cfg.avatarBg, text: cfg.avatarText };
}

interface ProviderBadgeProps {
  chatId: string | undefined | null;
  showLabel?: boolean;
  className?: string;
}

export function ProviderBadge({ chatId, showLabel = true, className = '' }: ProviderBadgeProps) {
  const provider = getProviderFromChatId(chatId);
  const cfg = PROVIDER_CONFIG[provider];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${cfg.bgColor} ${cfg.textColor} ${className}`}
      title={cfg.label}
    >
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${cfg.dotColor}`} />
      {showLabel && cfg.label}
    </span>
  );
}
