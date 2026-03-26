import { DomainError } from 'src/domain/shared/domain.error';
import { MessageDirection } from './message-direction.enum';
import { MessageStatus, isStatusProgression } from './message-status.enum';

export interface MessageProps {
  id: string;
  chatId: string;
  channelId: string;
  direction: MessageDirection;
  status: MessageStatus;
  fromMe: boolean;
  from: string;
  fromName: string;
  timestamp: Date;
  type: string;
  source: string;
  text?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  messageId?: string | null;
  externalId?: string | null;
  posteId?: string | null;
  commercialId?: string | null;
  contactId?: string | null;
  quotedMessageId?: string | null;
  tenantId?: string | null;
  errorCode?: number | null;
  errorTitle?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export class Message {
  readonly id: string;
  readonly chatId: string;
  readonly channelId: string;
  readonly direction: MessageDirection;
  private _status: MessageStatus;
  readonly fromMe: boolean;
  readonly from: string;
  readonly fromName: string;
  readonly timestamp: Date;
  readonly type: string;
  readonly source: string;
  readonly text: string | null;
  readonly provider: string | null;
  readonly providerMessageId: string | null;
  readonly messageId: string | null;
  readonly externalId: string | null;
  readonly posteId: string | null;
  readonly commercialId: string | null;
  readonly contactId: string | null;
  readonly quotedMessageId: string | null;
  readonly tenantId: string | null;
  readonly errorCode: number | null;
  readonly errorTitle: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;

  private constructor(props: MessageProps) {
    this.id = props.id;
    this.chatId = props.chatId;
    this.channelId = props.channelId;
    this.direction = props.direction;
    this._status = props.status;
    this.fromMe = props.fromMe;
    this.from = props.from;
    this.fromName = props.fromName;
    this.timestamp = props.timestamp;
    this.type = props.type;
    this.source = props.source;
    this.text = props.text ?? null;
    this.provider = props.provider ?? null;
    this.providerMessageId = props.providerMessageId ?? null;
    this.messageId = props.messageId ?? null;
    this.externalId = props.externalId ?? null;
    this.posteId = props.posteId ?? null;
    this.commercialId = props.commercialId ?? null;
    this.contactId = props.contactId ?? null;
    this.quotedMessageId = props.quotedMessageId ?? null;
    this.tenantId = props.tenantId ?? null;
    this.errorCode = props.errorCode ?? null;
    this.errorTitle = props.errorTitle ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }

  static create(props: MessageProps): Message {
    if (!props.chatId) throw new DomainError('chatId est requis');
    if (!props.channelId) throw new DomainError('channelId est requis');
    if (!props.from) throw new DomainError('from (téléphone expéditeur) est requis');
    return new Message(props);
  }

  get status(): MessageStatus {
    return this._status;
  }

  updateStatus(newStatus: MessageStatus): Message {
    if (!isStatusProgression(this._status, newStatus)) {
      throw new DomainError(
        `Transition de statut invalide : ${this._status} → ${newStatus}`,
      );
    }
    const updated = new Message({ ...this.toProps(), status: newStatus });
    return updated;
  }

  isInbound(): boolean {
    return this.direction === MessageDirection.IN;
  }

  isOutbound(): boolean {
    return this.direction === MessageDirection.OUT;
  }

  isFailed(): boolean {
    return this._status === MessageStatus.FAILED;
  }

  isDeleted(): boolean {
    return this._status === MessageStatus.DELETED || this.deletedAt !== null;
  }

  toProps(): MessageProps {
    return {
      id: this.id,
      chatId: this.chatId,
      channelId: this.channelId,
      direction: this.direction,
      status: this._status,
      fromMe: this.fromMe,
      from: this.from,
      fromName: this.fromName,
      timestamp: this.timestamp,
      type: this.type,
      source: this.source,
      text: this.text,
      provider: this.provider,
      providerMessageId: this.providerMessageId,
      messageId: this.messageId,
      externalId: this.externalId,
      posteId: this.posteId,
      commercialId: this.commercialId,
      contactId: this.contactId,
      quotedMessageId: this.quotedMessageId,
      tenantId: this.tenantId,
      errorCode: this.errorCode,
      errorTitle: this.errorTitle,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      deletedAt: this.deletedAt,
    };
  }
}
