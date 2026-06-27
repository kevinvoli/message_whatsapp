'use client';

import React, { useCallback, useEffect, useState } from 'react';
import GroupsCalendarView from '@/app/ui/groups/GroupsCalendarView';
import PresenceView from '@/app/ui/PresenceView';
import SessionsView from '@/app/ui/SessionsView';
import CommercialPlanningView from '@/app/ui/CommercialPlanningView';
import CalendarMonthView from '@/app/ui/groups/CalendarMonthView';
import AbsenceSummaryTable from '@/app/ui/groups/AbsenceSummaryTable';
import PlanningAuditView from '@/app/ui/groups/PlanningAuditView';
import BreakSupervisionTable from '@/app/ui/BreakSupervisionTable';
import DisconnectAlertsBanner from '@/app/ui/DisconnectAlertsBanner';
import DisconnectHistoryView from '@/app/ui/DisconnectHistoryView';
import { getBreakSupervision, getDisconnectAlerts } from '@/app/lib/api/commercial-groups.api';
import { BreakSupervisionRow, DisconnectAlert } from '@/app/lib/definitions';
import { Loader2, RefreshCw } from 'lucide-react';

type Tab =
  | 'planning'
  | 'presence'
  | 'imprevus'
  | 'calendrier'
  | 'bilan'
  | 'historique'
  | 'sessions'
  | 'supervision';

const TABS: { id: Tab; label: string }[] = [
  { id: 'planning',    label: 'Plannings de travail'     },
  { id: 'presence',   label: 'Présence du jour'         },
  { id: 'imprevus',   label: 'Absences & remplacements' },
  { id: 'calendrier', label: 'Calendrier mensuel'       },
  { id: 'bilan',      label: 'Bilan absences'           },
  { id: 'historique', label: 'Historique'               },
  { id: 'sessions',   label: 'Heures de travail'        },
  { id: 'supervision',label: 'Supervision pauses'       },
];

type SupervisionSubTab = 'deconnexions' | 'pauses';

const SUPERVISION_SUB_TABS: { id: SupervisionSubTab; label: string }[] = [
  { id: 'deconnexions', label: 'Déconnexions anormales' },
  { id: 'pauses',       label: 'Supervision des pauses' },
];

function BreakSupervisionTab() {
  const [rows, setRows]       = useState<BreakSupervisionRow[]>([]);
  const [alerts, setAlerts]   = useState<DisconnectAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, a] = await Promise.all([getBreakSupervision(), getDisconnectAlerts()]);
      setRows(r);
      setAlerts(a);
    } catch { /* silencieux */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Mise à jour toutes les minutes — actualisez manuellement si besoin.
        </p>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          aria-label="Actualiser la supervision"
        >
          {loading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />
          }
          Actualiser
        </button>
      </div>
      <DisconnectAlertsBanner alerts={alerts} />
      <BreakSupervisionTable rows={rows} />
    </div>
  );
}

function SupervisionTab() {
  const [subTab, setSubTab] = useState<SupervisionSubTab>('deconnexions');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {SUPERVISION_SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              subTab === t.id
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'deconnexions' && <DisconnectHistoryView />}
      {subTab === 'pauses'       && <BreakSupervisionTab />}
    </div>
  );
}

export default function PlanningTabsView() {
  const [active, setActive] = useState<Tab>('planning');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === t.id
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === 'planning'    && <GroupsCalendarView />}
      {active === 'presence'    && <PresenceView />}
      {active === 'imprevus'    && <CommercialPlanningView />}
      {active === 'calendrier'  && <CalendarMonthView />}
      {active === 'bilan'       && <AbsenceSummaryTable />}
      {active === 'historique'  && <PlanningAuditView />}
      {active === 'sessions'    && <SessionsView />}
      {active === 'supervision' && <SupervisionTab />}
    </div>
  );
}
