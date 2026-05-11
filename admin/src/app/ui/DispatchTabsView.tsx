'use client';
import React, { useState } from 'react';
import QueueView from '@/app/modules/dispatch/components/QueueView';
import DispatchView from '@/app/modules/dispatch/components/DispatchView';
import CapacityView from '@/app/ui/CapacityView';
import ContextsView from '@/app/modules/contexts/components/ContextsView';

type Tab = 'queue' | 'dispatch' | 'capacity' | 'contexts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'queue',    label: "File d'attente"       },
  { id: 'dispatch', label: 'Règles dispatch'      },
  { id: 'capacity', label: 'Capacité conversations' },
  { id: 'contexts', label: 'Contextes'            },
];

export default function DispatchTabsView() {
  const [active, setActive] = useState<Tab>('queue');

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200 flex-wrap">
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
      {active === 'queue'    && <QueueView onRefresh={() => {}} />}
      {active === 'dispatch' && <DispatchView onRefresh={() => {}} />}
      {active === 'capacity' && <CapacityView />}
      {active === 'contexts' && <ContextsView />}
    </div>
  );
}
