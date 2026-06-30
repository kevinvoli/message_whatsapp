'use client';
import React from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  badge?: number;
  disabled?: boolean;
  disabledTitle?: string;
}

interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  size?: 'sm' | 'md';
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  size = 'md',
}: TabsProps<T>) {
  const sizeClasses = size === 'sm' ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm';

  return (
    <div className="flex border-b border-gray-200">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const isDisabled = tab.disabled === true;

        let stateClasses: string;
        if (isDisabled) {
          stateClasses = 'border-b-2 border-transparent text-gray-300 cursor-not-allowed';
        } else if (isActive) {
          stateClasses = 'border-b-2 border-primary text-primary';
        } else {
          stateClasses =
            'border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300';
        }

        return (
          <button
            key={tab.id}
            type="button"
            disabled={isDisabled}
            title={isDisabled && tab.disabledTitle ? tab.disabledTitle : undefined}
            onClick={() => {
              if (!isDisabled) {
                onChange(tab.id);
              }
            }}
            className={`flex items-center gap-1.5 font-medium transition-colors ${sizeClasses} ${stateClasses}`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
