'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useChatStore } from '@/store/chatStore';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import IdleWarningModal from '@/components/IdleWarningModal';
import ReadCooldownModal from '@/components/ReadCooldownModal';

const IDLE_DISCONNECT_MINUTES_DEFAULT = 15;
const IDLE_WARNING_SECONDS_DEFAULT = 10;

const IdleAndCooldownWrapper: React.FC = () => {
  const { user } = useAuth();
  const showCooldownModal = useChatStore((s) => s.showCooldownModal);
  const setCooldownModal = useChatStore((s) => s.setCooldownModal);
  const cooldownRemainingMs = useChatStore((s) => s.cooldownRemainingMs);

  const idleMinutes = IDLE_DISCONNECT_MINUTES_DEFAULT;
  const warningSeconds = IDLE_WARNING_SECONDS_DEFAULT;

  const { showWarning, idleSeconds, remainingSeconds, resetActivity } = useIdleTimer(
    user ? idleMinutes : 0,
    warningSeconds,
  );

  useEffect(() => {
    if (!user) return;
    const onActivity = () => resetActivity();
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('keydown', onActivity);
    return () => {
      window.removeEventListener('mousemove', onActivity);
      window.removeEventListener('keydown', onActivity);
    };
  }, [user, resetActivity]);

  if (!user) return null;

  return (
    <>
      {showWarning && (
        <IdleWarningModal
          idleSeconds={idleSeconds}
          remainingSeconds={remainingSeconds}
          onStillHere={resetActivity}
        />
      )}
      {showCooldownModal && (
        <ReadCooldownModal
          remainingMs={cooldownRemainingMs()}
          onClose={() => setCooldownModal(false)}
        />
      )}
    </>
  );
};

export default IdleAndCooldownWrapper;
