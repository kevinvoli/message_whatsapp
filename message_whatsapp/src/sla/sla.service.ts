import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SlaRule, SlaMetric, SlaSeverity } from './entities/sla-rule.entity';
import { WhatsappChat, WhatsappChatStatus } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { WhatsappMessage } from 'src/whatsapp_message/entities/whatsapp_message.entity';
import Redis from 'ioredis';
import { REDIS_CLIENT } from 'src/redis/redis.module';
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

    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  // ─── Cache helpers ────────────────────────────────────────────────────────

  async getActiveRules(tenantId: string): Promise<SlaRule[]> {
    const cacheKey = `sla:rules:${tenantId}`;
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) return JSON.parse(cached) as SlaRule[];
      } catch { /* fallback DB */ }
    }
    const rules = await this.ruleRepo.find({
      where: { tenant_id: tenantId, is_active: true },
      order: { metric: 'ASC' },
    });
    if (this.redis) {
      try { await this.redis.setex(cacheKey, 300, JSON.stringify(rules)); } catch { /* ok */ }
    }
    return rules;
  }

  async invalidateSlaCache(tenantId: string): Promise<void> {
    if (!this.redis) return;
    try { await this.redis.del(`sla:rules:${tenantId}`); } catch { /* ok */ }
  }

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
    const rule = await this.ruleRepo.save(this.ruleRepo.create(dto));
    await this.invalidateSlaCache(dto.tenant_id);
    return rule;
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
    const saved = await this.ruleRepo.save(rule);
    await this.invalidateSlaCache(tenantId);
    return saved;
  }

  async removeRule(id: string, tenantId: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({ where: { id, tenant_id: tenantId } });
    if (!rule) throw new NotFoundException(`Règle SLA ${id} introuvable`);
    await this.ruleRepo.delete(rule.id);
    await this.invalidateSlaCache(tenantId);
  }

  // ─── Évaluation SLA ───────────────────────────────────────────────────────

  /**
   * Calcule les résultats SLA en mémoire sur des objets déjà chargés.
   * Zéro requête BDD — utilisé par checkAllOpenChats pour éviter le N+1.
   */
  private computeSlaResults(
    chat: WhatsappChat,
    rules: SlaRule[],
  ): SlaEvaluationResult[] {
    const now = Date.now();
    const results: SlaEvaluationResult[] = [];

    for (const rule of rules) {
      let currentValueSeconds = 0;

      switch (rule.metric) {
        case SlaMetric.FIRST_RESPONSE: {
          if (chat.last_client_message_at) {
            const refTime = chat.last_poste_message_at ?? new Date(now);
            currentValueSeconds = Math.floor(
              (refTime.getTime() - chat.last_client_message_at.getTime()) / 1000,
            );
          }
          break;
        }
        case SlaMetric.RESOLUTION: {
          currentValueSeconds = Math.floor(
            (now - chat.createdAt.getTime()) / 1000,
          );
          break;
        }
        case SlaMetric.REENGAGEMENT: {
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
        chatId: chat.id,
        currentValueSeconds,
        breached: currentValueSeconds > rule.threshold_seconds,
      });
    }

    return results;
  }

  /**
   * Évalue les règles SLA pour une conversation donnée.
   * Retourne tous les résultats (breached ou non).
   * Appelants externes utilisent cette méthode publique.
   */
  async evaluateChat(chatId: string, tenantId: string): Promise<SlaEvaluationResult[]> {
    const rules = await this.getActiveRules(tenantId);
    if (rules.length === 0) return [];

    const chat = await this.chatRepo.findOne({ where: { id: chatId } });
    if (!chat) return [];

    return this.computeSlaResults(chat, rules);
  }

  /**
   * Vérifie toutes les conversations ouvertes d'un tenant et retourne les violations.
   * Utilisé par le cron SLA checker.
   * 2 requêtes BDD au total (chats + règles en parallèle via cache Redis), zéro N+1.
   */
  async checkAllOpenChats(tenantId: string): Promise<SlaEvaluationResult[]> {
    const [openChats, rules] = await Promise.all([
      this.chatRepo.find({
        where: { tenant_id: tenantId, status: WhatsappChatStatus.ACTIF },
      }),
      this.getActiveRules(tenantId),
    ]);

    if (rules.length === 0) return [];

    const allViolations: SlaEvaluationResult[] = [];
    for (const chat of openChats) {
      const results = this.computeSlaResults(chat, rules);
      allViolations.push(...results.filter((r) => r.breached));
    }
    return allViolations;
  }
}
