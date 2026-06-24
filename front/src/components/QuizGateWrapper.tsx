'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthProvider';
import { useChatStore } from '@/store/chatStore';
import { getQuizToday } from '@/lib/api';
import QuizGateModal from '@/components/QuizGateModal';

interface GateState {
  blocked: boolean;
  sessionTitle: string;
  questionsCount: number;
  requirePass: boolean;
}

const QUIZ_ROUTES = ['/quiz'];

const QuizGateWrapper: React.FC = () => {
  const { user } = useAuth();
  const quizDoneToday = useChatStore((s) => s.quizDoneToday);
  const setQuizDoneToday = useChatStore((s) => s.setQuizDoneToday);
  const pathname = usePathname();
  const [gate, setGate] = useState<GateState>({ blocked: false, sessionTitle: '', questionsCount: 0, requirePass: false });

  const isQuizRoute = QUIZ_ROUTES.some((r) => pathname?.startsWith(r));

  useEffect(() => {
    if (!user || isQuizRoute) return;

    // Si déjà soumis dans cette session (store) → pas besoin de refetch
    if (quizDoneToday) {
      setGate({ blocked: false, sessionTitle: '', questionsCount: 0, requirePass: false });
      return;
    }

    getQuizToday()
      .then((data) => {
        const shouldBlock =
          data.sessionActive &&
          !data.isExempt &&
          !data.alreadySubmittedToday;

        if (data.alreadySubmittedToday) {
          setQuizDoneToday(true);
        }

        setGate({
          blocked: shouldBlock,
          sessionTitle: data.session?.title ?? 'QCM du jour',
          questionsCount: data.session?.questions?.length ?? 0,
          requirePass: data.requirePass ?? false,
        });
      })
      .catch(() => {
        // En cas d'erreur réseau → ne pas bloquer (fail open)
        setGate({ blocked: false, sessionTitle: '', questionsCount: 0, requirePass: false });
      });
  }, [user, isQuizRoute, quizDoneToday, setQuizDoneToday]);

  // Sur les routes quiz, ne jamais bloquer
  if (!user || isQuizRoute || !gate.blocked) return null;

  return (
    <QuizGateModal
      sessionTitle={gate.sessionTitle}
      questionsCount={gate.questionsCount}
      requirePass={gate.requirePass}
    />
  );
};

export default QuizGateWrapper;
