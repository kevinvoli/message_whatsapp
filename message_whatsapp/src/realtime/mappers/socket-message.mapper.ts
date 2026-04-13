import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';

export function resolveMessageText(message: WhatsappMessage): string | null {
  const rawText = typeof message.text === 'string' ? message.text.trim() : '';
  if (rawText) return message.text ?? rawText;

  const media = message.medias?.[0];
  const type = message.type ?? media?.media_type ?? null;

  if (media?.caption && media.caption.trim().length > 0) {
    return media.caption;
  }

  switch (type) {
    case 'image':
      return '[Photo]';
    case 'video':
    case 'gif':
    case 'short':
      return '[Video]';
    case 'audio':
    case 'voice':
      return '[Message vocal]';
    case 'document':
      return media?.file_name ?? '[Document]';
    case 'location':
    case 'live_location':
      return '[Localisation]';
    case 'interactive':
    case 'buttons':
    case 'button':
    case 'list':
      return '[Message interactif]';
    default:
      return media ? '[Media]' : null;
  }
}

export function resolveMediaUrl(
  message: WhatsappMessage,
  media: { provider_media_id?: string | null; media_id: string },
  directUrl: string | null,
): string | null {
  const channelQuery = message.channel_id
    ? `?channelId=${encodeURIComponent(message.channel_id)}`
    : '';

  if (message.provider === 'meta') {
    const providerMediaId = media.provider_media_id ?? media.media_id;
    if (!providerMediaId) return null;
    return `/messages/media/meta/${providerMediaId}${channelQuery}`;
  }

  if (directUrl) {
    if (directUrl.startsWith('/')) return directUrl;
    try {
      const parsed = new URL(directUrl);
      if (parsed.pathname.startsWith('/messages/media/')) {
        return `${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // URL invalide → retourner telle quelle
    }
  }

  return directUrl ?? null;
}

export function mapMessage(message: WhatsappMessage) {
  return {
    id: message.id,
    chat_id: message.chat.chat_id,
    from_me: message.from_me,
    text: resolveMessageText(message) ?? undefined,
    timestamp: message.timestamp ?? message.createdAt,
    status: message.status,
    from: message.from,
    from_name: message.from_name,
    poste_id: message.poste_id,
    direction: message.direction,
    types: message.type,
    medias:
      message.medias?.map((m) => ({
        id: m.media_id,
        type: m.media_type,
        url: resolveMediaUrl(message, m, m.url ?? null),
        mime_type: m.mime_type,
        caption: m.caption,
        file_name: m.file_name,
        file_size: m.file_size,
        seconds: m.duration_seconds,
        latitude: m.latitude,
        longitude: m.longitude,
      })) ?? [],
    dedicated_channel_id: message.dedicated_channel_id ?? null,
    quotedMessage: message.quotedMessage
      ? {
          id: message.quotedMessage.id,
          text: resolveMessageText(message.quotedMessage) ?? undefined,
          from_name: message.quotedMessage.from_name,
          from_me: message.quotedMessage.from_me,
        }
      : undefined,
  };
}
