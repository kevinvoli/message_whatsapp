import React from 'react';
import { BarChart3 } from 'lucide-react';

interface UnderDevelopmentViewProps {
    sectionName: string;
}

export default function UnderDevelopmentView({ sectionName }: UnderDevelopmentViewProps) {
    return (
        <div className="bg-white p-12 rounded-lg shadow-sm border border-gray-200 text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Section {sectionName}</h3>
            <p className="text-gray-600">Cette section est en cours de développement</p>
        </div>
    );
}
