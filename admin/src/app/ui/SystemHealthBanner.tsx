'use client';

import React from 'react';
import { AlertTriangle, CheckCircle, Send, XCircle } from 'lucide-react';
import { AlertStatus } from '@/app/lib/api';
import { formatTime } from '@/app/lib/dateUtils';

interface Props {
    status: AlertStatus | null;
}

export default function SystemHealthBanner({ status }: Props) {
    const lastAt = status?.lastInboundAt
        ? formatTime(new Date(status.lastInboundAt))
        : '—';

    const lastAlert = status?.lastAlertAttempt;
    const lastAlertAt = lastAlert ? formatTime(new Date(lastAlert.triggeredAt)) : null;

    const alertSummary = lastAlert
        ? lastAlert.overallSuccess
            ? `Alerte envoyée à ${lastAlert.results.length} destinataire(s) à ${lastAlertAt}`
            : `Dernier envoi échoué à ${lastAlertAt} — vérifiez la config`
        : null;

    if (status?.alerting) {
        return (
            <div className="bg-red-600 text-white px-6 py-2 flex items-center gap-3 animate-pulse">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span className="font-semibold text-sm">
                    ALERTE SYSTÈME — Aucun message client depuis{' '}
                    <strong>{status.silenceMinutes} min</strong>.
                    Dernier message reçu à {lastAt}.{' '}
                    {alertSummary && (
                        <span className="opacity-80 font-normal">{alertSummary}.</span>
                    )}
                </span>
            </div>
        );
    }

    return (
        <div className="bg-green-600 text-white px-6 py-2 flex items-center gap-3">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span className="text-sm flex items-center gap-3">
                <span>
                    Système OK — Dernier message client reçu à{' '}
                    <strong>{lastAt}</strong>
                    {status ? ` (il y a ${status.silenceMinutes} min)` : ''}
                </span>
                {lastAlert && (
                    <span className="flex items-center gap-1 text-xs opacity-80 border-l border-green-400 pl-3">
                        {lastAlert.overallSuccess
                            ? <Send className="w-3 h-3" />
                            : <XCircle className="w-3 h-3 text-yellow-300" />
                        }
                        Dernière alerte {lastAlertAt} :{' '}
                        {lastAlert.overallSuccess ? 'envoyée' : 'échec'}
                    </span>
                )}
            </span>
        </div>
    );
}
