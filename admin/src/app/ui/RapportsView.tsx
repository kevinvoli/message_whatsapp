import React from 'react';
import UnderDevelopmentView from './UnderDevelopmentView';
import { RefreshCw } from 'lucide-react';

export default function RapportsView({ onRefresh }: { onRefresh?: () => void }) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end">
                {onRefresh && (
                    <button
                        type="button"
                        onClick={onRefresh}
                        title="Rafraîchir"
                        aria-label="Rafraîchir"
                        className="p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                )}
            </div>
            <UnderDevelopmentView sectionName="Rapports" />
        </div>
    );
}
