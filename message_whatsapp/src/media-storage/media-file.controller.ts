import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Response } from 'express';

/** Table extension → Content-Type (suffisante pour les médias WhatsApp/Meta) */
const EXT_TO_MIME: Record<string, string> = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  gif:  'image/gif',
  webp: 'image/webp',
  mp4:  'video/mp4',
  webm: 'video/webm',
  mov:  'video/quicktime',
  ogg:  'audio/ogg',
  mp3:  'audio/mpeg',
  m4a:  'audio/mp4',
  aac:  'audio/aac',
  wav:  'audio/wav',
  pdf:  'application/pdf',
  bin:  'application/octet-stream',
};

function extToMime(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Sert les fichiers médias stockés localement dans uploads/media/**
 *
 * URL : GET /media/<yyyy>/<mm>/<dd>/<tenant>/<filename>
 *
 * Nginx peut prendre le relais en production avec un alias :
 *   location /media/ { alias /app/uploads/media/; }
 * Ce contrôleur est le fallback NestJS quand Nginx n'est pas configuré.
 */
@Controller('media')
export class MediaFileController {
  @Get('*')
  serveMediaFile(
    @Param('*') filePath: string,
    @Res() res: Response,
  ): void {
    // Sécurité : rejeter toute tentative de path traversal
    const normalized = filePath.replace(/\\/g, '/').replace(/\.\.+/g, '');

    const absolutePath = join(process.cwd(), 'uploads', 'media', normalized);

    if (!existsSync(absolutePath)) {
      throw new NotFoundException('Fichier média introuvable');
    }

    const buffer = readFileSync(absolutePath);
    const ext = absolutePath.split('.').pop() ?? '';
    const contentType = extToMime(ext);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }
}
