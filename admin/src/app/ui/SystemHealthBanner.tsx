'use client';

import React from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { SystemHealthStatus } from '@/app/lib/api';
import { formatTime } from '@/app/lib/dateUtils';

interface Props {
    status: SystemHealthStatus | null;
}

export default function SystemHealthBanner({ status }: Props) {
    const lastAt = status?.lastInboundAt
        ? formatTime(new Date(status.lastInboundAt))
        : '—';

    if (status?.alerting) {
        return (
            <div className="bg-red-600 text-white px-6 py-2 flex items-center gap-3 animate-pulse">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span className="font-semibold text-sm">
                    ALERTE SYSTEME — Aucun message client depuis{' '}
                    <strong>{status.silenceMinutes} min</strong>.
                    Dernier message recu a {lastAt}. Verifiez le serveur WhatsApp.
                </span>
            </div>
        );
    }

    return (
        <div className="bg-green-600 text-white px-6 py-2 flex items-center gap-3">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm">
                Systeme OK — Dernier message client recu a{' '}
                <strong>{lastAt}</strong>
                {status ? ` (il y a ${status.silenceMinutes} min)` : ''}
            </span>
        </div>
    );
}
