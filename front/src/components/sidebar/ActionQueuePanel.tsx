'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCircle, ChevronRight, Loader2, Phone, RefreshCw, SkipForward, Users } from 'lucide-react';
import { ActionTaskItem, ActionTaskSource, getMyActionQueue, saveTaskResult } from '@/lib/actionQueueApi';
import { formatRelativeDate } from '@/lib/dateUtils'; 

const SOURCE_CONFIG: Record<ActionTaskSource, { label: string; icon: React.ElementType; color: string }> = {
  missed_call:        { label: 'Appel en absence', icon: Phone,    color: 'text-red-600'    },
  unanswered_message: { label: 'Message non répondu', icon: Bell,  color: 'text-orange-500' },
  prospect_no_order:  { label: 'Prospect sans commande', icon: Users, color: 'text-blue-600' },
  cancelled_order:    { label: 'Commande annulée', icon: ChevronRight, color: 'text-purple-600' },
  inactive_client:    { label: 'Client inactif', icon: Users, color: 'text-gray-500' },
  order_error:        { label: 'Erreur commande', icon: Bell, color: 'text-red-500' },
};

function useCountdown(dueAt: string | null): { label: string; isUrgent: boolean; isOverdue: boolean } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!dueAt) return { label: '', isUrgent: false, isOverdue: false };

  const dueMs   = new Date(dueAt).getTime();
  const diffMs  = dueMs - now;
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec <= 0) {
    const overSec = Math.abs(diffSec);
    const mm      = String(Math.floor(overSec / 60)).padStart(2, '0');
    const ss      = String(overSec % 60).padStart(2, '0');
    return { label: `Dépassé de ${mm}:${ss}`, isUrgent: true, isOverdue: true };
  }

  const mm  = String(Math.floor(diffSec / 60)).padStart(2, '0');
  const ss  = String(diffSec % 60).padStart(2, '0');
  const isUrgent = diffSec < 5 * 60;
  return { label: `${mm}:${ss} restant`, isUrgent, isOverdue: false };
}

function MissedCallCountdown({ dueAt }: { dueAt: string | null }) {
  const { label, isUrgent, isOverdue } = useCountdown(dueAt);
  if (!label) return null;

  const colorClass = isOverdue
    ? 'text-red-700 font-bold animate-pulse'
    : isUrgent
    ? 'text-red-600 font-semibold'
    : 'text-orange-500';

  return (
    <p className={`text-xs mt-0.5 tabular-nums ${colorClass}`}>
      {isOverdue ? '⚠ ' : ''}SLA : {label}
    </p>
  );
}

export default function ActionQueuePanel() {
  const [items, setItems]     = useState<ActionTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await getMyActionQueue()); }
    catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const markDone = async (item: ActionTaskItem) => {
    const key = `${item.entityId}::${item.source}`;
    setSaving((p) => ({ ...p, [key]: true }));
    try {
      await saveTaskResult(item.entityId, item.source, { status: 'done' });
      setItems((prev) => prev.filter((i) => !(i.entityId === item.entityId && i.source === item.source)));
    } catch { /* silencieux */ }
    finally { setSaving((p) => { const n = { ...p }; delete n[key]; return n; }); }
  };

  const skipItem = async (item: ActionTaskItem) => {
    const key = `${item.entityId}::${item.source}`;
    setSaving((p) => ({ ...p, [key]: true }));
    try {
      await saveTaskResult(item.entityId, item.source, { status: 'skipped' });
      setItems((prev) => prev.filter((i) => !(i.entityId === item.entityId && i.source === item.source)));
    } catch { /* silencieux */ }
    finally { setSaving((p) => { const n = { ...p }; delete n[key]; return n; }); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <p className="font-semibold text-gray-900 text-sm">Files d&apos;action</p>
          <p className="text-xs text-gray-400">{items.length} tâche(s) en attente</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="p-1 rounded hover:bg-gray-100 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Chargement…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm gap-2">
            <CheckCircle className="w-8 h-8 text-green-400" />
            <span>Aucune tâche en attente</span>
          </div>
        ) : (
          items.map((item) => {
            const key      = `${item.entityId}::${item.source}`;
            const cfg      = SOURCE_CONFIG[item.source];
            const Icon     = cfg.icon;
            const isBusy   = saving[key];
            const isMissed = item.source === 'missed_call';
            return (
              <div key={key} className={`px-4 py-3 hover:bg-gray-50 ${isMissed ? 'border-l-2 border-red-400' : ''}`}>
                <div className="flex items-start gap-3">
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-0.5">{cfg.label}</p>
                    <p className="text-sm font-semibold text-gray-900 truncate">{item.contactName ?? item.contactPhone ?? item.entityId}</p>
                    {item.contactPhone && item.contactName && <p className="text-xs text-gray-400">{item.contactPhone}</p>}
                    {isMissed && item.dueAt ? (<MissedCallCountdown dueAt={item.dueAt} />)
                      : item.dueAt ? (<p className="text-xs text-orange-500 mt-0.5">Échéance : {formatRelativeDate(item.dueAt)}</p>)
                      : null}
                    {item.notes && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.notes}</p>}
                    {item.attemptCount > 0 && <p className="text-xs text-gray-400">{item.attemptCount} tentative(s)</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => void markDone(item)} disabled={isBusy} className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50" title="Marquer traité">
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => void skipItem(item)} disabled={isBusy} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 disabled:opacity-50" title="Ignorer">
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
