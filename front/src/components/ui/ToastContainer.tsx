'use client';

import React from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useToastStore, ToastType } from '@/store/toastStore';

const STYLES: Record<ToastType, { bg: string; border: string; icon: React.ReactNode }> = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />,
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />,
  },
  warning: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    icon: <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />,
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />,
  },
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const style = STYLES[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-md pointer-events-auto ${style.bg} ${style.border}`}
          >
            {style.icon}
            <p className="flex-1 text-sm text-gray-800">{toast.message}</p>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
