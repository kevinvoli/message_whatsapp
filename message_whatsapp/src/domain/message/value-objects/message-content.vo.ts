import { DomainError } from 'src/domain/shared/domain.error';

export type MessageContentType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'interactive'
  | 'template'
  | string;

/**
 * Value Object représentant le contenu d'un message.
 * Immutable : toute modification crée une nouvelle instance.
 */
export class MessageContent {
  private constructor(
    private readonly _type: MessageContentType,
    private readonly _text: string | null,
    private readonly _mediaUrl: string | null,
    private readonly _mimeType: string | null,
  ) {}

  static text(content: string): MessageContent {
    if (!content.trim()) throw new DomainError('Le texte du message ne peut pas être vide');
    return new MessageContent('text', content, null, null);
  }

  static media(
    type: MessageContentType,
    mediaUrl: string,
    mimeType: string,
    caption?: string,
  ): MessageContent {
    if (!mediaUrl) throw new DomainError('mediaUrl est requis pour un message media');
    return new MessageContent(type, caption ?? null, mediaUrl, mimeType);
  }

  static fromPersistence(
    type: MessageContentType,
    text: string | null,
    mediaUrl: string | null,
    mimeType: string | null,
  ): MessageContent {
    return new MessageContent(type, text, mediaUrl, mimeType);
  }

  get type(): MessageContentType {
    return this._type;
  }

  get text(): string | null {
    return this._text;
  }

  get mediaUrl(): string | null {
    return this._mediaUrl;
  }

  get mimeType(): string | null {
    return this._mimeType;
  }

  isText(): boolean {
    return this._type === 'text';
  }

  isMedia(): boolean {
    return ['image', 'video', 'audio', 'document', 'sticker'].includes(this._type);
  }

  equals(other: MessageContent): boolean {
    return (
      this._type === other._type &&
      this._text === other._text &&
      this._mediaUrl === other._mediaUrl
    );
  }
}
