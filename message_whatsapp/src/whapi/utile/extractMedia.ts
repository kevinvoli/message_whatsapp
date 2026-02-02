import { ExtractedMedia, WhapiMessage } from "../interface/whapi-webhook.interface";

export function extractMedia(message: WhapiMessage): ExtractedMedia {
  switch (message.type) {

    case 'text':
      return {
        type: 'text',
        texte: message.text?.body ?? '',
      };

    case 'image':
      return {
        type: 'image',
        media_id: message.image?.id,
        mime_type: message.image?.mime_type,
        caption: message.image?.caption,
        file_size: message.image?.file_size,
      };

    case 'video':
    case 'gif':
    case 'short': {

      const media = message.video ?? message.gif ?? message.short;
      return {
        type: message.type,
        media_id: media?.id,
        mime_type: media?.mime_type,
        caption: media?.caption,
        seconds: media?.seconds,
      };
    }

    case 'audio':
    case 'voice': {
      const media = message.audio ?? message.voice;
      return {
        type: message.type,
        media_id: media?.id,
        mime_type: media?.mime_type,
        seconds: media?.seconds,
      };
    }

    case 'document':
      return {
        type: 'document',
        media_id: message.document?.id,
        mime_type: message.document?.mime_type,
        file_name: message.document?.filename,
        file_size: message.document?.file_size,
        caption: message.document?.caption,
      };

    case 'location':
    case 'live_location': {
      const loc = message.location ?? message.live_location;
      return {
        type: message.type,
        latitude: loc?.latitude,
        longitude: loc?.longitude,
      };
    }

    case 'contact':
      return {
        type: 'contact',
        payload: message.contact,
      };

    case 'contact_list':
      return {
        type: 'contact_list',
        payload: message.contact_list,
      };

    case 'interactive':
      return {
        type: 'interactive',
        texte: message.interactive?.body?.text,
        payload: message.interactive,
      };

    case 'poll':
      return {
        type: 'poll',
        payload: message.poll,
      };

    case 'order':
      return {
        type: 'order',
        payload: message.order,
      };

    case 'product':
      return {
        type: 'product',
        payload: message.product,
      };

    case 'catalog':
      return {
        type: 'catalog',
        payload: message.catalog,
      };

    case 'event':
      return {
        type: 'event',
        payload: message.event,
      };

    case 'system':
      return {
        type: 'system',
        texte: message.text?.body ?? '',
      };

    default:
      return {
        type: message.type,
      };
  }
}
