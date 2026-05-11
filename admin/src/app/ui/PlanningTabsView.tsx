'use client';
import React, { useState } from 'react';
import WorkScheduleAdminView from '@/app/ui/WorkScheduleAdminView';
import PresenceView from '@/app/ui/PresenceView';
import SessionsView from '@/app/ui/SessionsView';

type Tab = 'work-schedule' | 'presence' | 'sessions';

const TABS: { id: Tab; label: string }[] = [
  { id: 'work-schedule', label: 'Plannings de travail' },
  { id: 'presence',      label: 'Présence du jour'    },
  { id: 'sessions',      label: 'Heures de travail'   },
];

export default function PlanningTabsView() {
  const [active, setActive] = useState<Tab>('work-schedule');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === t.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active === 'work-schedule' && <WorkScheduleAdminView />}
      {active === 'presence'      && <PresenceView />}
      {active === 'sessions'      && <SessionsView />}
    </div>
  );
}
