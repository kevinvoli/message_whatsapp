import { API_BASE_URL, handleResponse } from './_http';

export interface SystemHealth {
  timestamp: string;
  status: 'healthy' | 'degraded';
  uptimeSeconds: number;
  nodeVersion: string;
  platform: string;
  pid: number;
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    externalMb: number;
    arrayBuffersMb: number;
    heapUsedPct: number;
    rssRamPct: number;
    system: {
      totalRamMb: number;
      freeRamMb: number;
      usedRamMb: number;
      ramUsedPct: number;
    };
  };
  services: {
    database: 'ok' | 'error';
    redis: 'ok' | 'error' | 'not_configured';
  };
}

export async function getSystemHealth(): Promise<SystemHealth> {
  return handleResponse<SystemHealth>(
    await fetch(`${API_BASE_URL}/admin/system/health`, { credentials: 'include' }),
  );
}
