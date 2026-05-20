'use client';
import React, { useState } from 'react';
import GroupsCalendarView from '@/app/ui/groups/GroupsCalendarView';
import PresenceView from '@/app/ui/PresenceView';
import SessionsView from '@/app/ui/SessionsView';
import CommercialPlanningView from '@/app/ui/CommercialPlanningView';
import CalendarMonthView from '@/app/ui/groups/CalendarMonthView';
import AbsenceSummaryTable from '@/app/ui/groups/AbsenceSummaryTable';
import PlanningAuditView from '@/app/ui/groups/PlanningAuditView';

type Tab = 'planning' | 'presence' | 'imprevus' | 'calendrier' | 'bilan' | 'historique' | 'sessions';

const TABS: { id: Tab; label: string }[] = [
  { id: 'planning',    label: 'Plannings de travail'      },
  { id: 'presence',    label: 'Présence du jour'          },
  { id: 'imprevus',    label: 'Absences & remplacements'  },
  { id: 'calendrier',  label: 'Calendrier mensuel'        },
  { id: 'bilan',       label: 'Bilan absences'            },
  { id: 'historique',  label: 'Historique'                },
  { id: 'sessions',    label: 'Heures de travail'         },
];

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
      {active === 'planning'   && <GroupsCalendarView />}
      {active === 'presence'   && <PresenceView />}
      {active === 'imprevus'   && <CommercialPlanningView />}
      {active === 'calendrier' && <CalendarMonthView />}
      {active === 'bilan'      && <AbsenceSummaryTable />}
      {active === 'historique' && <PlanningAuditView />}
      {active === 'sessions'   && <SessionsView />}
    </div>
  );
}
