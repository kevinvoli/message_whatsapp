'use client';

import React from 'react';
import { Contact } from '@/types/chat';
import { formatDate, formatRelativeDate } from '@/lib/dateUtils';

interface ContactTimelineProps {
  contact: Contact;
}

interface Pill {
  label: string;
  value: string | null;
  relative?: string;
}

export function ContactTimeline({ contact }: ContactTimelineProps) {
  const pills: Pill[] = [
    {
      label: 'Dernier appel',
      value: formatDate(contact.last_call_date),
      relative: contact.last_call_date ? formatRelativeDate(contact.last_call_date) : undefined,
    },
    {
      label: 'Prochain appel',
      value: formatDate(contact.next_call_date),
      relative: contact.next_call_date ? formatRelativeDate(contact.next_call_date) : undefined,
    },
    {
      label: 'Dernier message',
      value: formatDate(contact.last_message_date),
      relative: contact.last_message_date
        ? formatRelativeDate(contact.last_message_date)
        : undefined,
    },
    {
      label: 'Créé',
      value: formatDate(contact.createdAt),
      relative: formatRelativeDate(contact.createdAt),
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((pill, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-sm bg-blue-50 text-gray-800"
        >
          <strong className="font-semibold">{pill.label}</strong>
          <span className="text-gray-400">·</span>
          <span>{pill.relative ?? pill.value ?? '-'}</span>
        </span>
      ))}
    </div>
  );
}
