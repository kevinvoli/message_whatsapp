import { WhatsappMessage, MessageDirection as OrmDirection, WhatsappMessageStatus } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import { Message, MessageProps } from './message.entity';
import { MessageDirection } from './message-direction.enum';
import { MessageStatus } from './message-status.enum';

/** Mappe l'enum ORM → enum domaine */
function toDomainDirection(d: OrmDirection): MessageDirection {
  return d === OrmDirection.IN ? MessageDirection.IN : MessageDirection.OUT;
}

/** Mappe l'enum domaine → enum ORM */
function toOrmDirection(d: MessageDirection): OrmDirection {
  return d === MessageDirection.IN ? OrmDirection.IN : OrmDirection.OUT;
}

function toDomainStatus(s: WhatsappMessageStatus): MessageStatus {
  return s as unknown as MessageStatus;
}

function toOrmStatus(s: MessageStatus): WhatsappMessageStatus {
  return s as unknown as WhatsappMessageStatus;
}

export class MessageMapper {
  static toDomain(orm: WhatsappMessage): Message {
    const props: MessageProps = {
      id: orm.id,
      chatId: orm.chat_id,
      channelId: orm.channel_id,
      direction: toDomainDirection(orm.direction),
      status: toDomainStatus(orm.status),
      fromMe: orm.from_me,
      from: orm.from,
      fromName: orm.from_name,
      timestamp: orm.timestamp,
      type: orm.type,
      source: orm.source,
      text: orm.text,
      provider: orm.provider,
      providerMessageId: orm.provider_message_id,
      messageId: orm.message_id,
      externalId: orm.external_id,
      posteId: orm.poste_id,
      commercialId: orm.commercial_id,
      contactId: orm.contact_id,
      quotedMessageId: orm.quoted_message_id,
      tenantId: orm.tenant_id,
      errorCode: orm.error_code,
      errorTitle: orm.error_title,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
      deletedAt: orm.deletedAt,
    };
    return Message.create(props);
  }

  static toOrm(domain: Message): Partial<WhatsappMessage> {
    const props = domain.toProps();
    return {
      id: props.id,
      chat_id: props.chatId,
      channel_id: props.channelId,
      direction: toOrmDirection(props.direction),
      status: toOrmStatus(props.status),
      from_me: props.fromMe,
      from: props.from,
      from_name: props.fromName,
      timestamp: props.timestamp,
      type: props.type,
      source: props.source,
      text: props.text,
      provider: props.provider,
      provider_message_id: props.providerMessageId,
      message_id: props.messageId,
      external_id: props.externalId ?? undefined,
      poste_id: props.posteId,
      commercial_id: props.commercialId,
      contact_id: props.contactId,
      quoted_message_id: props.quotedMessageId,
      tenant_id: props.tenantId,
      error_code: props.errorCode,
      error_title: props.errorTitle,
    };
  }
}
