import {
  ProviderOutboundError,
  ProviderFailureKind,
} from 'src/common/errors/provider-outbound.error';

describe('ProviderOutboundError.classifyHttpStatus', () => {
  it('classifie 429 comme transient (rate limit)', () => {
    expect(ProviderOutboundError.classifyHttpStatus(429)).toBe<ProviderFailureKind>('transient');
  });

  it('classifie 500 comme transient (erreur serveur)', () => {
    expect(ProviderOutboundError.classifyHttpStatus(500)).toBe<ProviderFailureKind>('transient');
  });

  it('classifie 503 comme transient (service unavailable)', () => {
    expect(ProviderOutboundError.classifyHttpStatus(503)).toBe<ProviderFailureKind>('transient');
  });

  it('classifie 400 comme permanent (bad request)', () => {
    expect(ProviderOutboundError.classifyHttpStatus(400)).toBe<ProviderFailureKind>('permanent');
  });

  it('classifie 403 comme permanent (forbidden)', () => {
    expect(ProviderOutboundError.classifyHttpStatus(403)).toBe<ProviderFailureKind>('permanent');
  });

  it('classifie 404 comme permanent (not found)', () => {
    expect(ProviderOutboundError.classifyHttpStatus(404)).toBe<ProviderFailureKind>('permanent');
  });

  it('classifie 200 comme transient (cas par défaut — succès inattendu en erreur)', () => {
    expect(ProviderOutboundError.classifyHttpStatus(200)).toBe<ProviderFailureKind>('transient');
  });

  it('instancie correctement ProviderOutboundError', () => {
    const err = new ProviderOutboundError('whapi', 429, 'transient', 'rate limited');
    expect(err).toBeInstanceOf(ProviderOutboundError);
    expect(err.provider).toBe('whapi');
    expect(err.statusCode).toBe(429);
    expect(err.kind).toBe('transient');
    expect(err.message).toBe('rate limited');
    expect(err.name).toBe('ProviderOutboundError');
  });
});
