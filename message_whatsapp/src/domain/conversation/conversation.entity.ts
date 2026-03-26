import { DomainError } from 'src/domain/shared/domain.error';
import { ConversationStatus } from './conversation-status.enum';

export interface ConversationProps {
  id: string;
  chatId: string;
  name: string;
  type: string;
  status: ConversationStatus;
  contactClient: string;
  channelId?: string | null;
  posteId?: string | null;
  tenantId?: string | null;
  unreadCount: number;
  readOnly: boolean;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  unreadMention: boolean;
  notSpam: boolean;
  waitingClientReply: boolean;
  chatPic: string;
  chatPicFull: string;
  lastActivityAt?: Date | null;
  assignedAt?: Date | null;
  assignedMode?: 'ONLINE' | 'OFFLINE' | null;
  firstResponseDeadlineAt?: Date | null;
  lastClientMessageAt?: Date | null;
  lastPosteMessageAt?: Date | null;
  muteUntil?: Date | null;
  autoMessageId?: string | null;
  currentAutoMessageId?: string | null;
  autoMessageStatus?: string | null;
  autoMessageStep: number;
  lastAutoMessageSentAt?: Date | null;
  lastMsgClientChannelId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export class Conversation {
  readonly id: string;
  readonly chatId: string;
  readonly name: string;
  readonly type: string;
  private _status: ConversationStatus;
  readonly contactClient: string;
  readonly channelId: string | null;
  private _posteId: string | null;
  readonly tenantId: string | null;
  private _unreadCount: number;
  private _readOnly: boolean;
  readonly isPinned: boolean;
  readonly isMuted: boolean;
  readonly isArchived: boolean;
  readonly unreadMention: boolean;
  readonly notSpam: boolean;
  readonly waitingClientReply: boolean;
  readonly chatPic: string;
  readonly chatPicFull: string;
  readonly lastActivityAt: Date | null;
  readonly assignedAt: Date | null;
  readonly assignedMode: 'ONLINE' | 'OFFLINE' | null;
  readonly firstResponseDeadlineAt: Date | null;
  readonly lastClientMessageAt: Date | null;
  readonly lastPosteMessageAt: Date | null;
  readonly muteUntil: Date | null;
  readonly autoMessageId: string | null;
  readonly currentAutoMessageId: string | null;
  readonly autoMessageStatus: string | null;
  readonly autoMessageStep: number;
  readonly lastAutoMessageSentAt: Date | null;
  readonly lastMsgClientChannelId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;

  private constructor(props: ConversationProps) {
    this.id = props.id;
    this.chatId = props.chatId;
    this.name = props.name;
    this.type = props.type;
    this._status = props.status;
    this.contactClient = props.contactClient;
    this.channelId = props.channelId ?? null;
    this._posteId = props.posteId ?? null;
    this.tenantId = props.tenantId ?? null;
    this._unreadCount = props.unreadCount;
    this._readOnly = props.readOnly;
    this.isPinned = props.isPinned;
    this.isMuted = props.isMuted;
    this.isArchived = props.isArchived;
    this.unreadMention = props.unreadMention;
    this.notSpam = props.notSpam;
    this.waitingClientReply = props.waitingClientReply;
    this.chatPic = props.chatPic;
    this.chatPicFull = props.chatPicFull;
    this.lastActivityAt = props.lastActivityAt ?? null;
    this.assignedAt = props.assignedAt ?? null;
    this.assignedMode = props.assignedMode ?? null;
    this.firstResponseDeadlineAt = props.firstResponseDeadlineAt ?? null;
    this.lastClientMessageAt = props.lastClientMessageAt ?? null;
    this.lastPosteMessageAt = props.lastPosteMessageAt ?? null;
    this.muteUntil = props.muteUntil ?? null;
    this.autoMessageId = props.autoMessageId ?? null;
    this.currentAutoMessageId = props.currentAutoMessageId ?? null;
    this.autoMessageStatus = props.autoMessageStatus ?? null;
    this.autoMessageStep = props.autoMessageStep;
    this.lastAutoMessageSentAt = props.lastAutoMessageSentAt ?? null;
    this.lastMsgClientChannelId = props.lastMsgClientChannelId ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();
    this.deletedAt = props.deletedAt ?? null;
  }

  static create(props: ConversationProps): Conversation {
    if (!props.chatId) throw new DomainError('chatId est requis');
    if (!props.contactClient) throw new DomainError('contactClient est requis');
    return new Conversation(props);
  }

  get status(): ConversationStatus {
    return this._status;
  }

  get posteId(): string | null {
    return this._posteId;
  }

  get unreadCount(): number {
    return this._unreadCount;
  }

  get readOnly(): boolean {
    return this._readOnly;
  }

  assign(posteId: string): Conversation {
    if (this._status === ConversationStatus.FERME) {
      throw new DomainError('Impossible d\'assigner une conversation fermée');
    }
    return new Conversation({
      ...this.toProps(),
      posteId,
      status: ConversationStatus.ACTIF,
      assignedAt: new Date(),
    });
  }

  close(): Conversation {
    return new Conversation({
      ...this.toProps(),
      status: ConversationStatus.FERME,
    });
  }

  reopen(): Conversation {
    return new Conversation({
      ...this.toProps(),
      status: ConversationStatus.EN_ATTENTE,
    });
  }

  markReadOnly(): Conversation {
    return new Conversation({ ...this.toProps(), readOnly: true });
  }

  markReadWrite(): Conversation {
    return new Conversation({ ...this.toProps(), readOnly: false });
  }

  incrementUnread(): Conversation {
    return new Conversation({ ...this.toProps(), unreadCount: this._unreadCount + 1 });
  }

  resetUnread(): Conversation {
    return new Conversation({ ...this.toProps(), unreadCount: 0 });
  }

  isActive(): boolean {
    return this._status === ConversationStatus.ACTIF;
  }

  isClosed(): boolean {
    return this._status === ConversationStatus.FERME;
  }

  isWaiting(): boolean {
    return this._status === ConversationStatus.EN_ATTENTE;
  }

  toProps(): ConversationProps {
    return {
      id: this.id,
      chatId: this.chatId,
      name: this.name,
      type: this.type,
      status: this._status,
      contactClient: this.contactClient,
      channelId: this.channelId,
      posteId: this._posteId,
      tenantId: this.tenantId,
      unreadCount: this._unreadCount,
      readOnly: this._readOnly,
      isPinned: this.isPinned,
      isMuted: this.isMuted,
      isArchived: this.isArchived,
      unreadMention: this.unreadMention,
      notSpam: this.notSpam,
      waitingClientReply: this.waitingClientReply,
      chatPic: this.chatPic,
      chatPicFull: this.chatPicFull,
      lastActivityAt: this.lastActivityAt,
      assignedAt: this.assignedAt,
      assignedMode: this.assignedMode,
      firstResponseDeadlineAt: this.firstResponseDeadlineAt,
      lastClientMessageAt: this.lastClientMessageAt,
      lastPosteMessageAt: this.lastPosteMessageAt,
      muteUntil: this.muteUntil,
      autoMessageId: this.autoMessageId,
      currentAutoMessageId: this.currentAutoMessageId,
      autoMessageStatus: this.autoMessageStatus,
      autoMessageStep: this.autoMessageStep,
      lastAutoMessageSentAt: this.lastAutoMessageSentAt,
      lastMsgClientChannelId: this.lastMsgClientChannelId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      deletedAt: this.deletedAt,
    };
  }
}
