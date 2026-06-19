import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

/** Correspondance MIME → extension fichier */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'application/pdf': 'pdf',
  'application/octet-stream': 'bin',
};

function mimeToExt(mimeType: string): string {
  // Normaliser : ignorer les paramètres (ex: audio/ogg; codecs=opus → audio/ogg)
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return MIME_TO_EXT[base] ?? 'bin';
}

export interface StoredMedia {
  /** Chemin absolu sur disque : uploads/media/{YYYY}/{MM}/{DD}/{tenant}/{mediaId}.{ext} */
  localPath: string;
  /** URL relative servie par Nginx : /media/{YYYY}/{MM}/{DD}/{tenant}/{mediaId}.{ext} */
  localUrl: string;
}

@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);

  /**
   * Persiste un buffer média sur disque et retourne le chemin + l'URL relative.
   *
   * @param buffer    - Contenu binaire du fichier
   * @param mimeType  - Type MIME (ex: image/jpeg, audio/ogg)
   * @param mediaId   - Identifiant unique du média (UUID de WhatsappMedia)
   * @param tenantId  - ID du tenant ; null/undefined → dossier 'default'
   */
  async store(
    buffer: Buffer,
    mimeType: string,
    mediaId: string,
    tenantId: string | null | undefined,
  ): Promise<StoredMedia> {
    const now = new Date();
    const yyyy = now.getFullYear().toString();
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const dd   = String(now.getDate()).padStart(2, '0');
    const tenant = tenantId ?? 'default';
    const ext    = mimeToExt(mimeType);

    const relativePath = `${yyyy}/${mm}/${dd}/${tenant}/${mediaId}.${ext}`;

    const localPath = join(process.cwd(), 'uploads', 'media', relativePath);
    const localUrl  = `/uploads/media/${relativePath}`;

    mkdirSync(dirname(localPath), { recursive: true });

    // Écriture synchrone (taille généralement < 20 MB, acceptable ici)
    writeFileSync(localPath, buffer);

    this.logger.debug(`Média stocké localement : ${localPath}`);

    return { localPath, localUrl };
  }

  /**
   * Supprime un fichier local à partir de son chemin absolu stocké en DB.
   * Utilisé pour le GDPR opt-out et le nettoyage périodique.
   * Sans effet si le fichier n'existe pas (idempotent).
   */
  deleteFile(localPath: string): void {
    try {
      if (existsSync(localPath)) {
        unlinkSync(localPath);
        this.logger.debug(`Fichier supprimé : ${localPath}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Échec suppression fichier ${localPath} : ${msg}`);
    }
  }
}
