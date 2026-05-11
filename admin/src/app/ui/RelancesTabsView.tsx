'use client';
import React, { useState } from 'react';
import FollowUpsView from '@/app/ui/FollowUpsView';
import RelanceConfigView from '@/app/ui/RelanceConfigView';

type Tab = 'follow-ups' | 'relance-config';

const TABS: { id: Tab; label: string }[] = [
  { id: 'follow-ups',     label: 'Relances'              },
  { id: 'relance-config', label: 'Configuration relances' },
];

export default function RelancesTabsView() {
  const [active, setActive] = useState<Tab>('follow-ups');

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
      {active === 'follow-ups'     && <FollowUpsView />}
      {active === 'relance-config' && <RelanceConfigView />}
    </div>
  );
}
