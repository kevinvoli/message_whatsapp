'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { DisconnectAlert } from '@/app/lib/definitions';

interface DisconnectAlertsBannerProps {
  alerts?: DisconnectAlert[];
}

export default function DisconnectAlertsBanner({ alerts = [] }: DisconnectAlertsBannerProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-red-700">Alertes déconnexions</p>
        <p className="text-xs text-red-500 mt-1">
          En cours d&apos;implémentation (Sprint 3) — {alerts.length} alerte{alerts.length !== 1 ? 's' : ''} active{alerts.length !== 1 ? 's' : ''}.
        </p>
      </div>
    </div>
  );
}
