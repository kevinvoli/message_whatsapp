import React, { useState } from 'react';
import { User } from 'lucide-react';

interface ContactAvatarProps {
  src?: string | null;
  name?: string | null;
  provider?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { container: 'w-8 h-8',  icon: 'w-4 h-4', text: 'text-xs' },
  md: { container: 'w-10 h-10', icon: 'w-6 h-6', text: 'text-sm' },
  lg: { container: 'w-12 h-12', icon: 'w-6 h-6', text: 'text-sm' },
};

const AVATAR_COLORS: Record<string, { bg: string; text: string }> = {
  whatsapp:  { bg: 'bg-green-100',  text: 'text-green-600'  },
  messenger: { bg: 'bg-blue-100',   text: 'text-blue-600'   },
  instagram: { bg: 'bg-purple-100', text: 'text-purple-600' },
  telegram:  { bg: 'bg-sky-100',    text: 'text-sky-600'    },
};

export function ContactAvatar({ src, name, provider = 'whatsapp', size = 'md', className = '' }: ContactAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const colors = AVATAR_COLORS[provider] ?? AVATAR_COLORS.whatsapp;
  const sz = SIZES[size];

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name ?? 'Contact'}
        className={`${sz.container} rounded-full object-cover flex-shrink-0 ${className}`}
        onError={() => setImgError(true)}
        referrerPolicy="no-referrer"
      />
    );
  }

  if (name?.trim()) {
    const initial = name.trim()[0].toUpperCase();
    return (
      <div className={`${sz.container} ${colors.bg} rounded-full flex items-center justify-center flex-shrink-0 ${className}`}>
        <span className={`${sz.text} font-semibold ${colors.text}`}>{initial}</span>
      </div>
    );
  }

  return (
    <div className={`${sz.container} ${colors.bg} rounded-full flex items-center justify-center flex-shrink-0 ${className}`}>
      <User className={`${sz.icon} ${colors.text}`} />
    </div>
  );
}
