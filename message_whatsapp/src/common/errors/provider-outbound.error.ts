export type ProviderFailureKind = 'permanent' | 'transient';

/**
 * Erreur unifiée pour tous les providers outbound (Whapi, Meta, Telegram, Messenger, Instagram).
 * - `permanent` : ne pas réessayer (ex: 400, 401, 403)
 * - `transient`  : peut être réessayé (ex: 429, 5xx, timeout)
 */
export class ProviderOutboundError extends Error {
  constructor(
    public readonly provider: string,
    public readonly statusCode: number,
    public readonly kind: ProviderFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderOutboundError';
  }

  static classifyHttpStatus(statusCode: number): ProviderFailureKind {
    if (statusCode === 429) return 'transient';   // rate limit
    if (statusCode >= 500) return 'transient';    // erreur serveur
    if (statusCode >= 400) return 'permanent';    // erreur client
    return 'transient';
  }
}
