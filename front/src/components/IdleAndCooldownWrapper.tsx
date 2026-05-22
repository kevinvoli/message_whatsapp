'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useChatStore } from '@/store/chatStore';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import IdleWarningModal from '@/components/IdleWarningModal';
import ReadCooldownModal from '@/components/ReadCooldownModal';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

interface ClientSettings {
  readCooldownSeconds: number;
  idleDisconnectMinutes: number;
  idleWarningSeconds: number;
}

const DEFAULTS: ClientSettings = {
  readCooldownSeconds: 120,
  idleDisconnectMinutes: 15,
  idleWarningSeconds: 10,
};

const IdleAndCooldownWrapper: React.FC = () => {
  const { user } = useAuth();
  const showCooldownModal = useChatStore((s) => s.showCooldownModal);
  const setCooldownModal = useChatStore((s) => s.setCooldownModal);
  const cooldownRemainingMs = useChatStore((s) => s.cooldownRemainingMs);
  const setCooldownConfig = useChatStore((s) => s.setCooldownConfig);
  const isLoading = useChatStore((s) => s.isLoading);
  const clearSelectedConversation = useChatStore((s) => s.clearSelectedConversation);

  const [settings, setSettings] = useState<ClientSettings>(DEFAULTS);

  useEffect(() => {
    if (!user) return;
    fetch(`${API_BASE_URL}/auth/me/settings`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((data: ClientSettings | null) => {
        if (data) {
          setSettings(data);
          setCooldownConfig(data.readCooldownSeconds);
        }
      })
      .catch(() => {});
  }, [user, setCooldownConfig]);

  const { showWarning, idleSeconds, remainingSeconds, resetActivity } = useIdleTimer(
    user ? settings.idleDisconnectMinutes : 0,
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
          onClose={() => {
            setCooldownModal(false);
            // Si une conversation est encore en chargement quand le modal se ferme,
            // on réinitialise complètement la sélection (comme si rien n'avait été cliqué)
            // pour éviter un loader bloqué et restaurer le unreadCount original
            if (isLoading) {
              clearSelectedConversation();
            }
          }}
        />
      )}
    </>
  );
};

export default IdleAndCooldownWrapper;
