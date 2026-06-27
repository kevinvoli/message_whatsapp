'use client';

import React, { useCallback, useEffect, useState } from 'react';
import GroupsCalendarView from '@/app/ui/groups/GroupsCalendarView';
import PresenceView from '@/app/ui/PresenceView';
import SessionsView from '@/app/ui/SessionsView';
import CommercialPlanningView from '@/app/ui/CommercialPlanningView';
import CalendarMonthView from '@/app/ui/groups/CalendarMonthView';
import AbsenceSummaryTable from '@/app/ui/groups/AbsenceSummaryTable';
import PlanningAuditView from '@/app/ui/groups/PlanningAuditView';
import SubGroupsGroupSelector from '@/app/ui/SubGroupsGroupSelector';
import BreakSupervisionTable from '@/app/ui/BreakSupervisionTable';
import DisconnectAlertsBanner from '@/app/ui/DisconnectAlertsBanner';
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
  | 'sous-groupes'
  | 'supervision';

const TABS: { id: Tab; label: string }[] = [
  { id: 'planning',     label: 'Plannings de travail'      },
  { id: 'presence',     label: 'Présence du jour'          },
  { id: 'imprevus',     label: 'Absences & remplacements'  },
  { id: 'calendrier',   label: 'Calendrier mensuel'        },
  { id: 'bilan',        label: 'Bilan absences'            },
  { id: 'historique',   label: 'Historique'                },
  { id: 'sessions',     label: 'Heures de travail'         },
  { id: 'sous-groupes', label: 'Sous-groupes & pauses'     },
  { id: 'supervision',  label: 'Supervision pauses'        },
];

interface PlanningTabsViewProps {
  initialTab?: Tab;
}

function SupervisionTab() {
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

export default function PlanningTabsView({ initialTab = 'planning' }: PlanningTabsViewProps) {
  const [active, setActive] = useState<Tab>(initialTab);

  // Synchronise l'onglet actif quand la prop change (navigation entre vues)
  useEffect(() => {
    setActive(initialTab);
  }, [initialTab]);

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

      {active === 'planning'     && <GroupsCalendarView />}
      {active === 'presence'     && <PresenceView />}
      {active === 'imprevus'     && <CommercialPlanningView />}
      {active === 'calendrier'   && <CalendarMonthView />}
      {active === 'bilan'        && <AbsenceSummaryTable />}
      {active === 'historique'   && <PlanningAuditView />}
      {active === 'sessions'     && <SessionsView />}
      {active === 'sous-groupes' && <SubGroupsGroupSelector />}
      {active === 'supervision'  && <SupervisionTab />}
    </div>
  );
}
