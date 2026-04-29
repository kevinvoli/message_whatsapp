import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockAxiosGet = vi.fn();

vi.mock('axios', () => ({
  default: {
    get: (...args: unknown[]) => mockAxiosGet(...args),
  },
}));

import { getGateStatus } from '../actionGateApi';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3002';
});

describe('getGateStatus', () => {
  it('appelle GET /commercial-action-gate/status', async () => {
    const payload = {
      status: 'allow', primaryCode: null, primaryLabel: null,
      blockers: [], warnings: [], checkedAt: '2026-04-29T10:00:00Z',
    };
    mockAxiosGet.mockResolvedValue({ data: payload });
    const result = await getGateStatus();
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/commercial-action-gate/status'),
      expect.objectContaining({ withCredentials: true }),
    );
    expect(result).toEqual(payload);
  });

  it('retourne status "block" avec blockers', async () => {
    const payload = {
      status: 'block', primaryCode: 'NO_CALLS', primaryLabel: 'Appels manquants',
      blockers: [{ code: 'NO_CALLS', label: 'Appels manquants', count: 3 }],
      warnings: [], checkedAt: '2026-04-29T10:00:00Z',
    };
    mockAxiosGet.mockResolvedValue({ data: payload });
    const result = await getGateStatus();
    expect(result.status).toBe('block');
    expect(result.blockers).toHaveLength(1);
  });

  it('propage l\'erreur axios', async () => {
    mockAxiosGet.mockRejectedValue(new Error('Network Error'));
    await expect(getGateStatus()).rejects.toThrow('Network Error');
  });
});
