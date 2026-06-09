import {
  Controller,
  Get,
  NotFoundException,
  Req,
  Res,
} from '@nestjs/common';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, normalize } from 'path';
import { Request, Response } from 'express';

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
 * En production, Nginx peut court-circuiter ce contrôleur :
 *   location /media/ { alias /app/uploads/media/; }
 */
@Controller('media')
export class MediaFileController {
  @Get('*')
  serveMediaFile(
    @Req() req: Request,
    @Res() res: Response,
  ): Response | void {
    // En Express, req.params[0] capture le segment après le préfixe du contrôleur.
    // req.path est plus fiable : contient le chemin complet incluant /media/
    const rawPath: string = (req.params as Record<string, string>)[0]
      ?? req.path.replace(/^\/media\//, '')
      ?? '';

    // Protection path traversal : normaliser et rejeter tout '..'
    const cleaned = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
    const normalized = normalize(cleaned);
    if (normalized.includes('..')) {
      throw new NotFoundException('Chemin invalide');
    }

    const mediaRoot = join(process.cwd(), 'uploads', 'media');
    const absolutePath = join(mediaRoot, normalized);

    // S'assurer que le chemin reste dans le dossier media (double vérification)
    if (!absolutePath.startsWith(mediaRoot)) {
      throw new NotFoundException('Chemin invalide');
    }

    if (!existsSync(absolutePath)) {
      throw new NotFoundException('Fichier média introuvable');
    }

    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      throw new NotFoundException('Fichier média introuvable');
    }

    const ext = (absolutePath.split('.').pop() ?? '').toLowerCase();
    const contentType = extToMime(ext);
    const totalSize = stat.size;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    const isInline = contentType.startsWith('image/')
      || contentType.startsWith('video/')
      || contentType.startsWith('audio/');
    const filename = normalized.split('/').pop() ?? 'media';
    res.setHeader(
      'Content-Disposition',
      isInline ? 'inline' : `attachment; filename="${filename}"`,
    );

    // Support Range pour lecture audio/vidéo dans les navigateurs
    const rangeHeader = req.headers['range'];
    if (rangeHeader) {
      const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end   = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        const clampedEnd = Math.min(end, totalSize - 1);
        const chunkSize = clampedEnd - start + 1;

        const buffer = readFileSync(absolutePath);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${clampedEnd}/${totalSize}`);
        res.setHeader('Content-Length', chunkSize);
        return res.send(buffer.subarray(start, clampedEnd + 1));
      }
    }

    const buffer = readFileSync(absolutePath);
    res.setHeader('Content-Length', totalSize);
    return res.send(buffer);
  }
}
