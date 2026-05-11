'use client';
import React, { useState } from 'react';
import BroadcastsView from '@/app/modules/broadcasts/components/BroadcastsView';
import TemplatesView from '@/app/ui/templates/TemplatesView';

type Tab = 'broadcasts' | 'templates';

const TABS: { id: Tab; label: string }[] = [
  { id: 'broadcasts', label: 'Campagnes'          },
  { id: 'templates',  label: 'Templates WhatsApp' },
];

export default function DiffusionsTabsView() {
  const [active, setActive] = useState<Tab>('broadcasts');

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
      {active === 'broadcasts' && <BroadcastsView />}
      {active === 'templates'  && <TemplatesView />}
    </div>
  );
}
