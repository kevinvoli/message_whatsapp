import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleResponse, API_BASE_URL } from '@/app/lib/api/_http';

interface MockResponseInit {
  ok?: boolean;
  status?: number;
  statusText?: string;
  contentType?: string | null;
  jsonBody?: unknown;
  jsonThrows?: boolean;
}

function makeResponse(opts: MockResponseInit): Response {
  const headers = {
    get: (name: string) => {
      if (name.toLowerCase() === 'content-type') {
        return opts.contentType ?? null;
      }
      return null;
    },
  };
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    statusText: opts.statusText ?? '',
    headers,
    json: opts.jsonThrows
      ? () => Promise.reject(new Error('parse failed'))
      : () => Promise.resolve(opts.jsonBody),
  } as unknown as Response;
}

describe('handleResponse', () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { ...originalLocation, replace: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
    vi.restoreAllMocks();
  });

  it('renvoie le JSON pour une réponse 200 OK', async () => {
    const response = makeResponse({
      ok: true,
      status: 200,
      contentType: 'application/json',
      jsonBody: { hello: 'world' },
    });
    const data = await handleResponse<{ hello: string }>(response);
    expect(data).toEqual({ hello: 'world' });
  });

  it('redirige vers /login en cas de 401', async () => {
    const response = makeResponse({
      ok: false,
      status: 401,
      contentType: 'application/json',
      jsonBody: { message: 'unauthorized' },
    });
    await expect(handleResponse(response)).rejects.toThrow('unauthorized');
    expect(window.location.replace).toHaveBeenCalledWith('/login');
  });

  it('throw avec le message du body JSON sur erreur 500', async () => {
    const response = makeResponse({
      ok: false,
      status: 500,
      contentType: 'application/json',
      jsonBody: { message: 'Internal' },
    });
    await expect(handleResponse(response)).rejects.toThrow('Internal');
  });

  it('throw avec JSON.stringify si pas de message dans body', async () => {
    const body = { code: 'ERR_42' };
    const response = makeResponse({
      ok: false,
      status: 400,
      contentType: 'application/json',
      jsonBody: body,
    });
    await expect(handleResponse(response)).rejects.toThrow(JSON.stringify(body));
  });

  it('throw avec statusText si pas de content-type JSON', async () => {
    const response = makeResponse({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      contentType: 'text/html',
    });
    await expect(handleResponse(response)).rejects.toThrow('Bad Gateway');
  });

  it('throw avec un message générique si statusText vide et pas de JSON', async () => {
    const response = makeResponse({
      ok: false,
      status: 503,
      statusText: '',
      contentType: 'text/plain',
    });
    await expect(handleResponse(response)).rejects.toThrow(/Status: 503/);
  });

  it('throw avec statusText quand le parsing JSON échoue', async () => {
    const response = makeResponse({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      contentType: 'application/json',
      jsonThrows: true,
    });
    await expect(handleResponse(response)).rejects.toThrow('Server Error');
  });

  it("ne tente pas de parser le body sur 204 No Content", async () => {
    const response = makeResponse({
      ok: false,
      status: 204,
      statusText: 'No Content',
      contentType: 'application/json',
    });
    await expect(handleResponse(response)).rejects.toThrow('No Content');
  });
});

describe('API_BASE_URL', () => {
  it('est défini', () => {
    expect(typeof API_BASE_URL).toBe('string');
    expect(API_BASE_URL.length).toBeGreaterThan(0);
  });
});
