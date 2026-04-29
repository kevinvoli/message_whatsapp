import { vi, describe, it, expect, beforeEach } from 'vitest';

// Doit être hoisted AVANT l'import de contactApi car apiBaseUrl est évalué au chargement du module
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3002';
});

const mockAxiosGet  = vi.fn();
const mockAxiosPost = vi.fn();
const mockAxiosPatch = vi.fn();

vi.mock('axios', () => ({
  default: {
    get:   (...args: unknown[]) => mockAxiosGet(...args),
    post:  (...args: unknown[]) => mockAxiosPost(...args),
    patch: (...args: unknown[]) => mockAxiosPatch(...args),
  },
}));

import {
  searchClients,
  getClientDossier,
  getClientTimeline,
  getCrmFields,
  setCrmFields,
  updateContactCallStatus,
} from '../contactApi';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchClients', () => {
  it('appelle GET /clients avec les bons paramètres', async () => {
    mockAxiosGet.mockResolvedValue({ data: { data: [], total: 0 } });
    await searchClients({ search: 'dupont', limit: 10, offset: 0 });
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining('search=dupont'),
      expect.objectContaining({ withCredentials: true }),
    );
  });

  it('inclut my_portfolio si true', async () => {
    mockAxiosGet.mockResolvedValue({ data: { data: [], total: 0 } });
    await searchClients({ my_portfolio: true });
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining('my_portfolio=true'),
      expect.any(Object),
    );
  });

  it('retourne les données de la réponse', async () => {
    const payload = { data: [{ id: '1', name: 'Jean' }], total: 1 };
    mockAxiosGet.mockResolvedValue({ data: payload });
    const result = await searchClients({});
    expect(result).toEqual(payload);
  });

  it('construit l\'URL avec les paramètres de pagination', async () => {
    mockAxiosGet.mockResolvedValue({ data: { data: [], total: 0 } });
    await searchClients({ limit: 20, offset: 40 });
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining('limit=20'),
      expect.any(Object),
    );
  });
});

describe('getClientDossier', () => {
  it('appelle GET /clients/:id/dossier', async () => {
    mockAxiosGet.mockResolvedValue({ data: { contact: {}, stats: {} } });
    await getClientDossier('contact-uuid');
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining('/clients/contact-uuid/dossier'),
      expect.any(Object),
    );
  });
});

describe('getClientTimeline', () => {
  it('appelle GET avec limit par défaut 30', async () => {
    mockAxiosGet.mockResolvedValue({ data: [] });
    await getClientTimeline('c-1');
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining('limit=30'),
      expect.any(Object),
    );
  });

  it('respecte un limit custom', async () => {
    mockAxiosGet.mockResolvedValue({ data: [] });
    await getClientTimeline('c-1', 50);
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining('limit=50'),
      expect.any(Object),
    );
  });
});

describe('getCrmFields', () => {
  it('appelle GET /contacts/:id/crm-fields avec tenant_id', async () => {
    mockAxiosGet.mockResolvedValue({ data: [] });
    await getCrmFields('contact-1', 'tenant-1');
    expect(mockAxiosGet).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id=tenant-1'),
      expect.any(Object),
    );
  });
});

describe('setCrmFields', () => {
  it('appelle POST avec les valeurs', async () => {
    mockAxiosPost.mockResolvedValue({ data: {} });
    await setCrmFields('contact-1', 'tenant-1', [{ field_key: 'age', value: 30 }]);
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/contacts/contact-1/crm-fields'),
      { values: [{ field_key: 'age', value: 30 }] },
      expect.any(Object),
    );
  });
});

describe('updateContactCallStatus', () => {
  it('appelle PATCH /contact/:id/call-status', async () => {
    mockAxiosPatch.mockResolvedValue({ data: { ok: true } });
    await updateContactCallStatus('c-1', 'answered', 'Bon contact', 'interested', 120);
    expect(mockAxiosPatch).toHaveBeenCalledWith(
      expect.stringContaining('/contact/c-1/call-status'),
      expect.objectContaining({ call_status: 'answered', duration_sec: 120 }),
      expect.any(Object),
    );
  });

  it('retourne les données de la réponse', async () => {
    mockAxiosPatch.mockResolvedValue({ data: { updated: true } });
    const result = await updateContactCallStatus('c-1', 'missed');
    expect(result).toEqual({ updated: true });
  });
});
