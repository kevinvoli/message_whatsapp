'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { SystemHealthStatus } from '@/app/lib/api';
import { formatTime } from '@/app/lib/dateUtils';

interface Props {
    status: SystemHealthStatus | null;
}

export default function SystemHealthBanner({ status }: Props) {
    if (!status?.alerting) return null;

    const lastAt = status.lastInboundAt
        ? formatTime(new Date(status.lastInboundAt))
        : '—';

    return (
        <div className="bg-red-600 text-white px-6 py-3 flex items-center gap-3 animate-pulse">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span className="font-semibold text-sm">
                ALERTE SYSTEME — Aucun message client depuis{' '}
                <strong>{status.silenceMinutes} min</strong>.
                Dernier message recu a {lastAt}. Verifiez le serveur WhatsApp.
            </span>
        </div>
    );
}
