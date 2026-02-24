'use client';

import React from 'react';
import { useContactStore } from '@/store/contactStore';
import { CallLog, CallStatus, getCallStatusLabel } from '@/types/chat';
import { formatRelativeDate, formatDate } from '@/lib/dateUtils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(sec?: number | null): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}min ${s}s` : `${s}s`;
}

const outcomeLabel: Record<string, string> = {
  répondu:        'Répondu',
  messagerie:     'Messagerie',
  pas_de_réponse: 'Pas de réponse',
  occupé:         'Occupé',
};

const statusDot: Record<CallStatus, { bg: string; text: string }> = {
  appelé:        { bg: '#ecfdf5', text: '#059669' },
  à_appeler:     { bg: '#eff6ff', text: '#2563eb' },
  rappeler:      { bg: '#fff7ed', text: '#ea580c' },
  non_joignable: { bg: '#f9fafb', text: '#6b7280' },
};

// ── Composant ─────────────────────────────────────────────────────────────────

export function CallLogHistory() {
  const { selectedContact, callLogs } = useContactStore();

  if (!selectedContact) return null;

  const logs: CallLog[] = callLogs[selectedContact.id] ?? [];

  return (
    <div style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb', marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' }}>
          Historique des appels
        </h3>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>
          {logs.length} appel{logs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {logs.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 14, textAlign: 'center', padding: '16px 0', margin: 0 }}>
          Aucun appel enregistré
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {logs.map((log, idx) => {
            const colors = statusDot[log.call_status] ?? statusDot['à_appeler'];
            const duration = formatDuration(log.duration_sec);
            const outcome = log.outcome ? outcomeLabel[log.outcome] ?? log.outcome : null;

            return (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '12px 0',
                  borderBottom: idx < logs.length - 1 ? '1px solid #f3f4f6' : 'none',
                }}
              >
                {/* Badge statut */}
                <span style={{
                  background: colors.bg,
                  color: colors.text,
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 10px',
                  flexShrink: 0,
                  marginTop: 2,
                }}>
                  {getCallStatusLabel(log.call_status)}
                </span>

                {/* Détails */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.commercial_name}
                    </p>
                    <span
                      title={formatDate(log.called_at)}
                      style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}
                    >
                      {formatRelativeDate(log.called_at)}
                    </span>
                  </div>

                  {/* Métadonnées secondaires */}
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>
                    {[
                      outcome && `Résultat : ${outcome}`,
                      duration && `Durée : ${duration}`,
                      log.notes && `Note : ${log.notes}`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Aucun détail'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
