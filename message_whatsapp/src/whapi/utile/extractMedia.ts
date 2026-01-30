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
    case 'short':
      return {
        type: message.type,
        media_id: message.video?.id ?? message.gif?.id ?? message.short?.id,
        mime_type:
          message.video?.mime_type ??
          message.gif?.mime_type ??
          message.short?.mime_type,
        caption:
          message.video?.caption ??
          message.gif?.caption ??
          message.short?.caption,
        seconds:
          message.video?.seconds ??
          message.gif?.seconds ??
          message.short?.seconds,
      };

    case 'audio':
    case 'voice':
      return {
        type: message.type,
        media_id: message.audio?.id ?? message.voice?.id,
        mime_type:
          message.audio?.mime_type ?? message.voice?.mime_type,
        seconds:
          message.audio?.seconds ?? message.voice?.seconds,
      };

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
    case 'live_location':
      return {
        type: message.type,
        latitude: message.location?.latitude ?? message.live_location?.latitude,
        longitude:
          message.location?.longitude ?? message.live_location?.longitude,
      };

    // case 'contact':
    //   return {
    //     type: 'contact',
    //     raw: message.contact,
    //   };

    // case 'contact_list':
    //   return {
    //     type: 'contact_list',
    //     raw: message.contact_list,
    //   };

    case 'interactive':
    case 'buttons':
    case 'list':
    case 'poll':
    case 'order':
    case 'product':
    case 'catalog':
    case 'event':
    case 'system':
      return {
        type: message.type,
        texte:
          message.text?.body ??
          message.interactive?.body?.text ??
          '',
        raw: message,
      };

    default:
      return {
        type: message.type,
        raw: message,
      };
  }
}
