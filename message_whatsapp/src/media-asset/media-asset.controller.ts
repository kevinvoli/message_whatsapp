import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { Response } from 'express';
import { AdminGuard } from 'src/auth/admin.guard';
import { MediaAssetService } from './media-asset.service';
import { CreateMediaAssetDto } from './dto/create-media-asset.dto';
import { UpdateMediaAssetDto } from './dto/update-media-asset.dto';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

@Controller('media')
export class MediaPreviewController {
  constructor(private readonly service: MediaAssetService) {}

  @Get('preview/:id')
  async preview(
    @Param('id') id: string,
    @Res() res: Response,
    @Headers('accept') accept: string,
  ) {
    try {
      const asset = await this.service.findOne(id);

      // Requête d'un <img src="..."> : Accept commence par image/ → redirect 302 vers le fichier réel
      if (accept && accept.trim().startsWith('image/')) {
        return res.redirect(302, asset.publicUrl);
      }

      // Requête browser / crawler WhatsApp : servir la page HTML avec og:image
      const imageUrl = asset.mediaType === 'image' ? asset.publicUrl : '';
      const title = escapeHtml(asset.name);
      const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:url" content="${escapeHtml(asset.publicUrl)}">
  ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:type" content="${escapeHtml(asset.mimeType)}">` : ''}
  <meta http-equiv="refresh" content="0;url=${escapeHtml(asset.publicUrl)}">
</head>
<body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh">
  ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" style="max-width:100%;max-height:100vh;object-fit:contain" alt="${title}">` : `<p style="color:#fff;font-family:sans-serif">${title}</p>`}
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(html);
    } catch {
      return res.status(404).send('Not found');
    }
  }
}

const ALLOWED_MIMETYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'application/pdf',
];

const multerOptions = {
  storage: diskStorage({
    destination: './uploads/media-assets',
    filename: (_req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
      const ext = path.extname(file.originalname);
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Type MIME non autorisé : ${file.mimetype}`), false);
    }
  },
};

@UseGuards(AdminGuard)
@Controller('media-assets')
export class MediaAssetController {
  constructor(private readonly service: MediaAssetService) {}

  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('tags') tags?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    return this.service.findAll({
      type,
      category,
      search,
      tags,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      sort: sort ?? 'createdAt',
      order: (order === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
    });
  }

  @Get('categories')
  getCategories() {
    return this.service.getCategories();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateMediaAssetDto,
  ) {
    return this.service.upload(file, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMediaAssetDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id);
  }
}
