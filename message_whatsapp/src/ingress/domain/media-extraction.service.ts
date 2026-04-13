import { Injectable } from '@nestjs/common';
import {
  ExtractedMedia,
  WhapiRawMedia,
} from 'src/whapi/interface/whapi-webhook.interface';
import { UnifiedMessage } from 'src/webhooks/normalization/unified-message';

/**
 * TICKET-04-B — Extraction des métadonnées média depuis un message unifié.
 *
 * Service sans I/O — testable purement en isolation.
 * Produit un tableau `ExtractedMedia[]` à partir d'un `UnifiedMessage`.
 * La persistance est déléguée à `MediaPersistenceService`.
 */
@Injectable()
export class MediaExtractionService {
  private static readonly MEDIA_TYPES = new Set([
    'image', 'video', 'audio', 'voice', 'document',
    'gif', 'short', 'location', 'live_location',
  ]);

  /**
   * Extrait les médias d'un message unifié.
   * Retourne un tableau vide si le message ne contient aucun média.
   */
  extract(message: UnifiedMessage): ExtractedMedia[] {
    if (!message.media && !message.location) return [];

    if (message.location) {
      return [
        {
          type: 'location',
          latitude: message.location.latitude,
          longitude: message.location.longitude,
        },
      ];
    }

    if (message.media) {
      const rawType =
        message.type === 'interactive' || message.type === 'button'
          ? 'interactive'
          : message.type;
      const normalizedType = (
        MediaExtractionService.MEDIA_TYPES.has(rawType) ? rawType : 'text'
      ) as ExtractedMedia['type'];

      return [
        {
          type: normalizedType,
          media_id: message.media.id,
          mime_type: message.media.mimeType,
          caption: message.media.caption,
          file_name: message.media.fileName,
          file_size: message.media.fileSize,
          seconds: message.media.seconds,
          payload: { link: message.media.link } as WhapiRawMedia,
        },
      ];
    }

    return [];
  }
}
