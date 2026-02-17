export type WhapiFailureKind = 'transient' | 'permanent';

export class WhapiOutboundError extends Error {
  constructor(
    message: string,
    public readonly kind: WhapiFailureKind,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'WhapiOutboundError';
  }
}
