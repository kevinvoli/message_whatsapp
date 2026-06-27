'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { DisconnectAlert } from '@/app/lib/definitions';
import { formatTime } from '@/app/lib/dateUtils';

interface DisconnectAlertsBannerProps {
  alerts?: DisconnectAlert[];
}

export default function DisconnectAlertsBanner({ alerts = [] }: DisconnectAlertsBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
        <p className="text-sm font-semibold text-red-700">
          {alerts.length} déconnexion{alerts.length > 1 ? 's' : ''} anormalement longue{alerts.length > 1 ? 's' : ''}
        </p>
      </div>
      <ul className="space-y-1.5">
        {alerts.map((a) => (
          <li
            key={a.commercialId}
            className="flex items-center justify-between text-xs text-red-700 bg-red-100 rounded-lg px-3 py-2"
          >
            <span className="font-medium">{a.commercialName}</span>
            <span className="text-red-500">
              Depuis {formatTime(a.disconnectedSince)} — {a.totalDisconnectMinutes} min
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
