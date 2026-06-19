'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import IdleWarningModal from '@/components/IdleWarningModal';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

interface ClientSettings {
  idleDisconnectMinutes: number;
  idleWarningSeconds: number;
  hasDedicatedChannel: boolean;
}

const DEFAULTS: ClientSettings = {
  idleDisconnectMinutes: 15,
  idleWarningSeconds: 10,
  hasDedicatedChannel: false,
};

const IdleAndCooldownWrapper: React.FC = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ClientSettings>(DEFAULTS);

  useEffect(() => {
    if (!user) return;
    fetch(`${API_BASE_URL}/auth/me/settings`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data: ClientSettings | null) => {
        if (data) setSettings(data);
      })
      .catch(() => {});
  }, [user]);

  const { showWarning, idleSeconds, remainingSeconds, resetActivity } = useIdleTimer(
    user && !settings.hasDedicatedChannel ? settings.idleDisconnectMinutes : 0,
    settings.idleWarningSeconds,
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

  if (!user || settings.hasDedicatedChannel) return null;

  return (
    <>
      {showWarning && (
        <IdleWarningModal
          idleSeconds={idleSeconds}
          remainingSeconds={remainingSeconds}
          onStillHere={resetActivity}
        />
      )}
    </>
  );
};

export default IdleAndCooldownWrapper;
