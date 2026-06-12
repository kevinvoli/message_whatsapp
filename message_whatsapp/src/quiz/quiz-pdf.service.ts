import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { QuizPdf } from './entities/quiz-pdf.entity';
import { CreatePdfDto } from './dto/create-pdf.dto';
import { UpdatePdfDto } from './dto/update-pdf.dto';

type QuizPdfPublic = Omit<QuizPdf, 'storagePath'>;

@Injectable()
export class QuizPdfService {
  constructor(
    @InjectRepository(QuizPdf)
    private readonly pdfRepo: Repository<QuizPdf>,
  ) {}

  async uploadPdf(
    file: Express.Multer.File,
    dto: CreatePdfDto,
  ): Promise<QuizPdfPublic> {
    const fileId = uuidv4();
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    const safeName = file.originalname
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_');

    const relativeDir = path.join('uploads', 'quiz-pdfs', year, month);
    const fileName = `${fileId}-${safeName}`;
    const storagePath = path.join(relativeDir, fileName).replace(/\\/g, '/');
    const absoluteDir = path.join(process.cwd(), relativeDir);

    await fs.promises.mkdir(absoluteDir, { recursive: true });
    await fs.promises.writeFile(path.join(absoluteDir, fileName), file.buffer);

    const entity = this.pdfRepo.create({
      sessionId: dto.sessionId ?? null,
      originalName: file.originalname,
      storagePath,
      fileSize: file.size,
      allowInlineView: dto.allowInlineView,
      isPermanent: dto.isPermanent,
      availableFrom: dto.availableFrom ?? null,
      availableUntil: dto.availableUntil ?? null,
      uploadedAt: now,
    });

    const saved = await this.pdfRepo.save(entity);
    return this.stripStoragePath(saved);
  }

  async findAll(): Promise<QuizPdfPublic[]> {
    const pdfs = await this.pdfRepo.find({
      where: { deletedAt: IsNull() },
      order: { uploadedAt: 'DESC' },
    });
    return pdfs.map((p) => this.stripStoragePath(p));
  }

  async findAccessibleForCommercial(): Promise<QuizPdfPublic[]> {
    const pdfs = await this.pdfRepo
      .createQueryBuilder('pdf')
      .leftJoin('pdf.session', 'session')
      .where('pdf.deletedAt IS NULL')
      .andWhere(
        `(
          (pdf.sessionId IS NOT NULL AND session.sessionDate <= CURDATE())
          OR (pdf.sessionId IS NULL AND pdf.isPermanent = 1)
          OR (
            pdf.sessionId IS NULL AND pdf.isPermanent = 0
            AND (pdf.availableFrom IS NULL OR pdf.availableFrom <= CURDATE())
            AND (pdf.availableUntil IS NULL OR pdf.availableUntil >= CURDATE())
          )
        )`,
      )
      .orderBy('pdf.uploadedAt', 'DESC')
      .getMany();

    return pdfs.map((p) => this.stripStoragePath(p));
  }

  async update(id: string, dto: UpdatePdfDto): Promise<QuizPdfPublic> {
    const pdf = await this.findActiveOrFail(id);

    if (dto.allowInlineView !== undefined) pdf.allowInlineView = dto.allowInlineView;
    if (dto.isPermanent !== undefined) pdf.isPermanent = dto.isPermanent;
    if ('availableFrom' in dto) pdf.availableFrom = dto.availableFrom ?? null;
    if ('availableUntil' in dto) pdf.availableUntil = dto.availableUntil ?? null;

    const saved = await this.pdfRepo.save(pdf);
    return this.stripStoragePath(saved);
  }

  async softDelete(id: string): Promise<void> {
    await this.findActiveOrFail(id);
    await this.pdfRepo.softDelete(id);
  }

  async streamPdf(id: string, inline: boolean, res: Response): Promise<void> {
    const pdf = await this.findActiveOrFail(id);

    if (inline && !pdf.allowInlineView) {
      throw new ForbiddenException(
        'Ce document ne peut pas être visualisé en ligne',
      );
    }

    const absolutePath = path.join(process.cwd(), pdf.storagePath);

    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('Fichier introuvable sur le serveur');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(pdf.originalName)}"`,
    );

    fs.createReadStream(absolutePath).pipe(res);
  }

  private async findActiveOrFail(id: string): Promise<QuizPdf> {
    const pdf = await this.pdfRepo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!pdf) throw new NotFoundException(`PDF ${id} introuvable`);
    return pdf;
  }

  private stripStoragePath(pdf: QuizPdf): QuizPdfPublic {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { storagePath: _sp, ...rest } = pdf;
    return rest;
  }
}
