import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ConversationReport, NextAction } from './entities/conversation-report.entity';
import { v4 as uuidv4 } from 'uuid';

export interface UpsertReportDto {
  // Nouvelles informations client
  clientName?: string | null;
  ville?: string | null;
  commune?: string | null;
  quartier?: string | null;
  productCategory?: string | null;
  otherPhones?: string | null;
  clientNeed?: string | null;
  interestScore?: number | null;
  isMaleNotInterested?: boolean;
  followUpAt?: string | null;
  nextAction?: NextAction | null;
  notes?: string | null;
  // Legacy
  clientInterest?: string | null;
  hasOrder?: boolean | null;
  orderAmount?: number | null;
  nextActionAt?: string | null;
  objections?: string | null;
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

    if (dto.clientName      !== undefined) report.clientName      = dto.clientName ?? null;
    if (dto.ville           !== undefined) report.ville           = dto.ville ?? null;
    if (dto.commune         !== undefined) report.commune         = dto.commune ?? null;
    if (dto.quartier        !== undefined) report.quartier        = dto.quartier ?? null;
    if (dto.productCategory !== undefined) report.productCategory = dto.productCategory ?? null;
    if (dto.otherPhones     !== undefined) report.otherPhones     = dto.otherPhones ?? null;
    if (dto.clientNeed      !== undefined) report.clientNeed      = dto.clientNeed ?? null;
    if (dto.interestScore   !== undefined) report.interestScore   = dto.interestScore ?? null;
    if (dto.isMaleNotInterested !== undefined) report.isMaleNotInterested = dto.isMaleNotInterested ?? false;
    if (dto.followUpAt      !== undefined) report.followUpAt      = dto.followUpAt ? new Date(dto.followUpAt) : null;
    if (dto.nextAction      !== undefined) report.nextAction      = dto.nextAction ?? null;
    if (dto.notes           !== undefined) report.notes           = dto.notes ?? null;
    // Legacy
    if (dto.clientInterest  !== undefined) report.clientInterest  = dto.clientInterest ?? null;
    if (dto.hasOrder        !== undefined) report.hasOrder        = dto.hasOrder ?? null;
    if (dto.orderAmount     !== undefined) report.orderAmount     = dto.orderAmount ?? null;
    if (dto.nextActionAt    !== undefined) report.nextActionAt    = dto.nextActionAt ? new Date(dto.nextActionAt) : null;
    if (dto.objections      !== undefined) report.objections      = dto.objections ?? null;
    if (dto.commercialId) report.commercialId = dto.commercialId;
    if (dto.posteId)       report.posteId     = dto.posteId;

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

  async getSubmissionStatusBulk(
    chatIds: string[],
  ): Promise<Map<string, 'pending' | 'sent' | 'failed' | null>> {
    if (chatIds.length === 0) return new Map();
    const reports = await this.repo.find({
      where:  { chatId: In(chatIds) },
      select: ['chatId', 'isSubmitted', 'submissionStatus'],
    });
    // Si le commercial a soumis (isSubmitted=true), on retourne 'sent' quel que soit
    // l'état de la sync DB2 — la sync se fait en arrière-plan.
    return new Map(reports.map((r) => [
      r.chatId,
      r.isSubmitted ? 'sent' : r.submissionStatus,
    ]));
  }

  async isReportComplete(chatId: string): Promise<boolean> {
    const report = await this.repo.findOne({ where: { chatId }, select: ['isComplete'] });
    return report?.isComplete ?? false;
  }

  private computeComplete(report: ConversationReport): boolean {
    return !!(
      report.clientName?.trim() &&
      report.clientNeed?.trim() &&
      report.interestScore !== null
    );
  }
}
