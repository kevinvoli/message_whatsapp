'use client';

import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { FOLLOW_UP_TYPE_LABELS, FollowUpType } from '@/types/chat';
import { formatDate } from '@/lib/dateUtils';

interface ReminderDetail {
  follow_up_id: string;
  type: FollowUpType;
  scheduled_at: string;
}

interface ReminderToast extends ReminderDetail {
  id: string;
}

export default function FollowUpReminderToast() {
  const [toasts, setToasts] = useState<ReminderToast[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ReminderDetail;
      const toast: ReminderToast = {
        ...detail,
        id: Date.now().toString(),
      };
      setToasts((prev) => [toast, ...prev].slice(0, 5));
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 12000);
    };
    window.addEventListener('followup:reminder', handler);
    return () => window.removeEventListener('followup:reminder', handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-xs">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-white border border-orange-200 rounded-xl shadow-lg p-4 flex items-start gap-3 animate-slide-in"
        >
          <div className="flex-shrink-0 w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
            <Bell className="w-4 h-4 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Relance à traiter</p>
            <p className="text-xs text-gray-600 mt-0.5">
              {FOLLOW_UP_TYPE_LABELS[toast.type] ?? toast.type}
            </p>
            <p className="text-xs text-orange-600 mt-1 font-medium">
              Prévue le {formatDate(toast.scheduled_at)}
            </p>
          </div>
          <button
            onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
