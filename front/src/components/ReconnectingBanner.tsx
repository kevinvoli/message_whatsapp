'use client';

import { useSocket } from '@/contexts/SocketProvider';

export default function ReconnectingBanner() {
  const { isReconnecting } = useSocket();

  if (!isReconnecting) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-medium py-2 shadow-md">
      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
      Reconnexion en cours…
    </div>
  );
}
