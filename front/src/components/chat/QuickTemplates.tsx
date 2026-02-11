import React from 'react';

export default function QuickTemplates() {
    return (
        <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-2">
            <button className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full whitespace-nowrap">
                👋 Salutation
            </button>
            <button className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full whitespace-nowrap">
                💰 Prix
            </button>
            <button className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full whitespace-nowrap">
                📅 Rendez-vous
            </button>
            <button className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full whitespace-nowrap">
                ✅ Confirmation
            </button>
        </div>
    );
}
