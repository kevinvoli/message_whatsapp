import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationReport } from './entities/conversation-report.entity';
import { v4 as uuidv4 } from 'uuid';

export interface UpsertReportDto {
  clientInterest?: ConversationReport['clientInterest'];
  hasOrder?: boolean | null;
  nextAction?: ConversationReport['nextAction'];
  orderAmount?: number | null;
  nextActionAt?: string | null;
  objections?: string | null;
  notes?: string | null;
  commercialId?: string;
  posteId?: string;
}

@Injectable()
export class ConversationReportService {
  constructor(
    @InjectRepository(ConversationReport)
    private readonly repo: Repository<ConversationReport>,
  ) {}

  async findByChatId(chatId: string): Promise<ConversationReport | null> {
    return this.repo.findOne({ where: { chatId } });
  }

  async upsert(chatId: string, dto: UpsertReportDto): Promise<ConversationReport> {
    let report = await this.repo.findOne({ where: { chatId } });

    if (!report) {
      report = this.repo.create({ id: uuidv4(), chatId });
    }

    if (dto.clientInterest !== undefined) report.clientInterest = dto.clientInterest ?? null;
    if (dto.hasOrder !== undefined) report.hasOrder = dto.hasOrder ?? null;
    if (dto.nextAction !== undefined) report.nextAction = dto.nextAction ?? null;
    if (dto.orderAmount !== undefined) report.orderAmount = dto.orderAmount ?? null;
    if (dto.nextActionAt !== undefined) {
      report.nextActionAt = dto.nextActionAt ? new Date(dto.nextActionAt) : null;
    }
    if (dto.objections !== undefined) report.objections = dto.objections ?? null;
    if (dto.notes !== undefined) report.notes = dto.notes ?? null;
    if (dto.commercialId) report.commercialId = dto.commercialId;
    if (dto.posteId) report.posteId = dto.posteId;

    report.isComplete = this.computeComplete(report);

    return this.repo.save(report);
  }

  async validate(chatId: string, validatedById: string): Promise<ConversationReport> {
    const report = await this.repo.findOneOrFail({ where: { chatId } });
    if (!report.isComplete) {
      throw new Error('Rapport incomplet — impossible de valider');
    }
    report.isValidated = true;
    report.validatedAt = new Date();
    report.validatedById = validatedById;
    return this.repo.save(report);
  }

  async isReportComplete(chatId: string): Promise<boolean> {
    const report = await this.repo.findOne({ where: { chatId }, select: ['isComplete'] });
    return report?.isComplete ?? false;
  }

  private computeComplete(report: ConversationReport): boolean {
    return (
      report.clientInterest !== null &&
      report.hasOrder !== null &&
      report.nextAction !== null
    );
  }
}
