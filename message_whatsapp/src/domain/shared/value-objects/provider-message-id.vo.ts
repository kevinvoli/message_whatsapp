import { DomainError } from 'src/domain/shared/domain.error';

/**
 * Value Object représentant l'identifiant d'un message côté provider
 * (Whapi, Meta, Telegram…).
 * Inclut le provider pour éviter les collisions inter-providers.
 */
export class ProviderMessageId {
  private constructor(
    private readonly _provider: string,
    private readonly _id: string,
  ) {}

  static create(provider: string, id: string): ProviderMessageId {
    if (!provider) throw new DomainError('ProviderMessageId: provider requis');
    if (!id) throw new DomainError('ProviderMessageId: id requis');
    return new ProviderMessageId(provider.toLowerCase(), id.trim());
  }

  static fromPersistence(provider: string, id: string): ProviderMessageId {
    return new ProviderMessageId(provider, id);
  }

  get provider(): string {
    return this._provider;
  }

  get id(): string {
    return this._id;
  }

  equals(other: ProviderMessageId): boolean {
    return this._provider === other._provider && this._id === other._id;
  }

  toString(): string {
    return `${this._provider}:${this._id}`;
  }
}
