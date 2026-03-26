import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { Conversation, ConversationProps } from './conversation.entity';
import { ConversationStatus } from './conversation-status.enum';

function toDomainStatus(s: WhatsappChatStatus): ConversationStatus {
  switch (s) {
    case WhatsappChatStatus.ACTIF:
      return ConversationStatus.ACTIF;
    case WhatsappChatStatus.EN_ATTENTE:
      return ConversationStatus.EN_ATTENTE;
    case WhatsappChatStatus.FERME:
      return ConversationStatus.FERME;
  }
}

function toOrmStatus(s: ConversationStatus): WhatsappChatStatus {
  switch (s) {
    case ConversationStatus.ACTIF:
      return WhatsappChatStatus.ACTIF;
    case ConversationStatus.EN_ATTENTE:
      return WhatsappChatStatus.EN_ATTENTE;
    case ConversationStatus.FERME:
      return WhatsappChatStatus.FERME;
  }
}

export class ConversationMapper {
  static toDomain(orm: WhatsappChat): Conversation {
    const props: ConversationProps = {
      id: orm.id,
      chatId: orm.chat_id,
      name: orm.name,
      type: orm.type,
      status: toDomainStatus(orm.status),
      contactClient: orm.contact_client,
      channelId: orm.channel_id,
      posteId: orm.poste_id,
      tenantId: orm.tenant_id,
      unreadCount: orm.unread_count,
      readOnly: orm.read_only,
      isPinned: orm.is_pinned,
      isMuted: orm.is_muted,
      isArchived: orm.is_archived,
      unreadMention: orm.unread_mention,
      notSpam: orm.not_spam,
      waitingClientReply: orm.waiting_client_reply,
      chatPic: orm.chat_pic,
      chatPicFull: orm.chat_pic_full,
      lastActivityAt: orm.last_activity_at,
      assignedAt: orm.assigned_at,
      assignedMode: orm.assigned_mode,
      firstResponseDeadlineAt: orm.first_response_deadline_at,
      lastClientMessageAt: orm.last_client_message_at,
      lastPosteMessageAt: orm.last_poste_message_at,
      muteUntil: orm.mute_until,
      autoMessageId: orm.auto_message_id,
      currentAutoMessageId: orm.current_auto_message_id,
      autoMessageStatus: orm.auto_message_status,
      autoMessageStep: orm.auto_message_step,
      lastAutoMessageSentAt: orm.last_auto_message_sent_at,
      lastMsgClientChannelId: orm.last_msg_client_channel_id,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    };
    return Conversation.create(props);
  }

  static toOrm(domain: Conversation): Partial<WhatsappChat> {
    const props = domain.toProps();
    return {
      id: props.id,
      chat_id: props.chatId,
      name: props.name,
      type: props.type,
      status: toOrmStatus(props.status),
      contact_client: props.contactClient,
      channel_id: props.channelId ?? undefined,
      poste_id: props.posteId ?? undefined,
      tenant_id: props.tenantId ?? undefined,
      unread_count: props.unreadCount,
      read_only: props.readOnly,
      is_pinned: props.isPinned,
      is_muted: props.isMuted,
      is_archived: props.isArchived,
      unread_mention: props.unreadMention,
      not_spam: props.notSpam,
      waiting_client_reply: props.waitingClientReply,
      chat_pic: props.chatPic,
      chat_pic_full: props.chatPicFull,
      last_activity_at: props.lastActivityAt ?? undefined,
      assigned_at: props.assignedAt,
      assigned_mode: props.assignedMode,
      first_response_deadline_at: props.firstResponseDeadlineAt,
      last_client_message_at: props.lastClientMessageAt,
      last_poste_message_at: props.lastPosteMessageAt,
      mute_until: props.muteUntil,
      auto_message_id: props.autoMessageId ?? undefined,
      current_auto_message_id: props.currentAutoMessageId ?? undefined,
      auto_message_status: props.autoMessageStatus ?? undefined,
      auto_message_step: props.autoMessageStep,
      last_auto_message_sent_at: props.lastAutoMessageSentAt,
      last_msg_client_channel_id: props.lastMsgClientChannelId ?? undefined,
    };
  }
}
