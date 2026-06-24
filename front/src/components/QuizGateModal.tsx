'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList } from 'lucide-react';

interface QuizGateModalProps {
  sessionTitle: string;
  questionsCount: number;
  requirePass: boolean;
}

const QuizGateModal: React.FC<QuizGateModalProps> = ({ sessionTitle, questionsCount, requirePass }) => {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
          <ClipboardList className="h-8 w-8 text-blue-600" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">QCM du jour obligatoire</h2>
        <p className="mb-1 text-sm font-medium text-gray-700">{sessionTitle}</p>
        <p className="mb-2 text-sm text-gray-500">
          {questionsCount} question{questionsCount > 1 ? 's' : ''}
        </p>
        <p className="mb-6 text-sm text-gray-500">
          {requirePass
            ? 'Vous devez obtenir le score de passage pour accéder aux conversations.'
            : 'À compléter avant d\'accéder aux conversations.'}
        </p>
        <button
          onClick={() => router.push('/quiz')}
          className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          Commencer le QCM
        </button>
      </div>
    </div>
  );
};

export default QuizGateModal;
