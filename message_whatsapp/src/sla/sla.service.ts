import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SlaRule, SlaMetric, SlaSeverity } from './entities/sla-rule.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsBoolean,
  Min,
} from 'class-validator';

export class CreateSlaRuleDto {
  @IsString()
  tenant_id: string;

  @IsString()
  name: string;

  @IsEnum(['first_response', 'resolution', 'reengagement'])
  metric: SlaMetric;

  @IsNumber()
  @Min(1)
  threshold_seconds: number;

  @IsOptional()
  @IsEnum(['warning', 'breach'])
  severity?: SlaSeverity;

  @IsOptional()
  @IsBoolean()
  notify_admin?: boolean;
}

export class UpdateSlaRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  threshold_seconds?: number;

  @IsOptional()
  @IsEnum(['warning', 'breach'])
  severity?: SlaSeverity;

  @IsOptional()
  @IsBoolean()
  notify_admin?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export interface SlaEvaluationResult {
  rule: SlaRule;
  chatId: string;
  currentValueSeconds: number;
  breached: boolean;
}

@Injectable()
export class SlaService {
  constructor(
    @InjectRepository(SlaRule)
    private readonly ruleRepo: Repository<SlaRule>,

    @InjectRepository(WhatsappChat)
    private readonly chatRepo: Repository<WhatsappChat>,

    @InjectRepository(WhatsappMessage)
    private readonly messageRepo: Repository<WhatsappMessage>,
  ) {}

  // ─── CRUD Règles ──────────────────────────────────────────────────────────

  async createRule(dto: CreateSlaRuleDto): Promise<SlaRule> {
    const existing = await this.ruleRepo.findOne({
      where: { tenant_id: dto.tenant_id, metric: dto.metric },
    });
    if (existing) {
      throw new ConflictException(
        `Une règle SLA pour la métrique "${dto.metric}" existe déjà pour ce tenant`,
      );
    }
    return this.ruleRepo.save(this.ruleRepo.create(dto));
  }

  async findAllRules(tenantId: string): Promise<SlaRule[]> {
    return this.ruleRepo.find({
      where: { tenant_id: tenantId },
      order: { metric: 'ASC' },
    });
  }

  async updateRule(id: string, tenantId: string, dto: UpdateSlaRuleDto): Promise<SlaRule> {
    const rule = await this.ruleRepo.findOne({ where: { id, tenant_id: tenantId } });
    if (!rule) throw new NotFoundException(`Règle SLA ${id} introuvable`);
    Object.assign(rule, dto);
    return this.ruleRepo.save(rule);
  }

  async removeRule(id: string, tenantId: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({ where: { id, tenant_id: tenantId } });
    if (!rule) throw new NotFoundException(`Règle SLA ${id} introuvable`);
    await this.ruleRepo.delete(rule.id);
  }

  // ─── Évaluation SLA ───────────────────────────────────────────────────────

  /**
   * Évalue les règles SLA pour une conversation donnée.
   * Retourne toutes les violations (breached=true).
   */
  async evaluateChat(chatId: string, tenantId: string): Promise<SlaEvaluationResult[]> {
    const rules = await this.ruleRepo.find({
      where: { tenant_id: tenantId, is_active: true },
    });
    if (rules.length === 0) return [];

    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) return [];

    const now = Date.now();
    const results: SlaEvaluationResult[] = [];

    for (const rule of rules) {
      let currentValueSeconds = 0;

      switch (rule.metric) {
        case SlaMetric.FIRST_RESPONSE: {
          // Temps depuis le premier message client jusqu'à la première réponse agent
          // ou depuis maintenant si pas encore répondu
          if (chat.last_client_message_at) {
            const refTime = chat.last_poste_message_at ?? new Date(now);
            currentValueSeconds = Math.floor(
              (refTime.getTime() - chat.last_client_message_at.getTime()) / 1000,
            );
          }
          break;
        }
        case SlaMetric.RESOLUTION: {
          // Temps depuis la création de la conversation
          currentValueSeconds = Math.floor(
            (now - chat.createdAt.getTime()) / 1000,
          );
          break;
        }
        case SlaMetric.REENGAGEMENT: {
          // Temps depuis le dernier message client sans réponse
          if (chat.last_client_message_at && !chat.last_poste_message_at) {
            currentValueSeconds = Math.floor(
              (now - chat.last_client_message_at.getTime()) / 1000,
            );
          } else if (
            chat.last_client_message_at &&
            chat.last_poste_message_at &&
            chat.last_client_message_at > chat.last_poste_message_at
          ) {
            currentValueSeconds = Math.floor(
              (now - chat.last_client_message_at.getTime()) / 1000,
            );
          }
          break;
        }
      }

      results.push({
        rule,
        chatId,
        currentValueSeconds,
        breached: currentValueSeconds > rule.threshold_seconds,
      });
    }

    return results;
  }

  /**
   * Vérifie toutes les conversations ouvertes d'un tenant et retourne les violations.
   * Utilisé par le cron SLA checker.
   */
  async checkAllOpenChats(tenantId: string): Promise<SlaEvaluationResult[]> {
    const rules = await this.ruleRepo.find({
      where: { tenant_id: tenantId, is_active: true },
    });
    if (rules.length === 0) return [];

    const openChats = await this.chatRepo.find({
      where: { tenant_id: tenantId, status: 'actif' as any },
    });

    const allViolations: SlaEvaluationResult[] = [];
    for (const chat of openChats) {
      const results = await this.evaluateChat(chat.id, tenantId);
      allViolations.push(...results.filter((r) => r.breached));
    }
    return allViolations;
  }
}
