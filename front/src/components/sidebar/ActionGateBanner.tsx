'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Info, ShieldAlert, X } from 'lucide-react';
import { getGateStatus, GateResult } from '@/lib/actionGateApi';

const POLL_MS = 60_000;

const STATUS_CONFIG = {
  block:            { bg: 'bg-red-600',    text: 'text-white',     icon: ShieldAlert, label: 'Action bloquée' },
  redirect_to_task: { bg: 'bg-orange-500', text: 'text-white',     icon: AlertTriangle, label: 'Tâche prioritaire' },
  warn:             { bg: 'bg-yellow-400', text: 'text-gray-900',  icon: AlertTriangle, label: 'Attention requise' },
  allow:            { bg: 'bg-green-500',  text: 'text-white',     icon: Info,         label: 'Opérationnel' },
} as const;

export default function ActionGateBanner() {
  const [gate, setGate]           = useState<GateResult | null>(null);
  const [expanded, setExpanded]   = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await getGateStatus();
      setGate(result);
      if (result.status !== 'allow') setDismissed(false);
    } catch {
      // silencieux — ne pas crasher si le gate est indisponible
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  if (!gate || gate.status === 'allow' || dismissed) return null;

  const cfg  = STATUS_CONFIG[gate.status];
  const Icon = cfg.icon;
  const allItems = [...gate.blockers, ...gate.warnings];

  return (
    <div className={`${cfg.bg} ${cfg.text} text-sm`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 font-medium truncate">
          {cfg.label}
          {gate.primaryLabel ? ` — ${gate.primaryLabel}` : ''}
        </span>

        {allItems.length > 1 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="p-0.5 rounded hover:bg-black/10"
            title={expanded ? 'Réduire' : 'Voir tout'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}

        <button
          onClick={() => setDismissed(true)}
          className="p-0.5 rounded hover:bg-black/10"
          title="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {expanded && allItems.length > 1 && (
        <div className="border-t border-white/20 px-3 py-2 space-y-1">
          {allItems.map((item) => (
            <div key={item.code} className="flex items-center gap-2 text-xs opacity-90">
              <span className="font-mono bg-black/10 px-1 rounded text-[10px]">{item.count}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
