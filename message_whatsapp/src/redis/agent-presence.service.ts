import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  Optional,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

export interface AgentPresenceInfo {
  commercialId: string;
  posteId: string;
  tenantId: string;
}

@Injectable()
export class AgentPresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentPresenceService.name);
  private readonly enabled = process.env['REDIS_PRESENCE_ENABLED'] === 'true';
  private readonly keyPrefix = process.env['REDIS_KEY_PREFIX'] || '';

  /** Fallback in-process — toujours maintenu pour getPresentAgents sans Redis */
  private readonly activeAgents = new Map<string, { posteId: string; tenantId: string }>();

  private subscriber: Redis | null = null;

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    @Optional() private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.redis || !this.enabled) return;
    try {
      await this.redis.config('SET', 'notify-keyspace-events', 'Ex');
      this.subscriber = this.redis.duplicate();
      await this.subscriber.subscribe('__keyevent@0__:expired');
      this.subscriber.on('message', (_channel: string, key: string) => {
        const stripped =
          this.keyPrefix && key.startsWith(this.keyPrefix)
            ? key.slice(this.keyPrefix.length)
            : key;
        if (stripped.startsWith('presence:commercial:')) {
          const commercialId = stripped.replace('presence:commercial:', '');
          this.logger.debug(`Présence expirée: ${commercialId}`);
          this.eventEmitter?.emit('agent.presence_expired', { commercialId });
        }
      });
      this.logger.log('AgentPresenceService: keyspace notifications activées');
    } catch (err) {
      this.logger.warn(`Keyspace notifications setup failed: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.subscriber?.quit();
    } catch { /* ignoré */ }
  }

  async setPresent(commercialId: string, posteId: string, tenantId: string): Promise<void> {
    this.activeAgents.set(commercialId, { posteId, tenantId });
    if (!this.redis || !this.enabled) return;
    const value = JSON.stringify({ posteId, tenantId, ts: Date.now() });
    await this.redis.setex(`presence:commercial:${commercialId}`, 45, value);
    await this.redis.setex(`presence:poste:${posteId}`, 45, '1');
  }

  async setAbsent(commercialId: string): Promise<void> {
    const data = this.activeAgents.get(commercialId);
    this.activeAgents.delete(commercialId);
    if (!this.redis || !this.enabled || !data) return;
    await this.redis.del(`presence:commercial:${commercialId}`);
    await this.redis.del(`presence:poste:${data.posteId}`);
  }

  async isPresent(commercialId: string): Promise<boolean> {
    if (!this.redis || !this.enabled) return this.activeAgents.has(commercialId);
    return (await this.redis.exists(`presence:commercial:${commercialId}`)) === 1;
  }

  getPresentAgents(): AgentPresenceInfo[] {
    return [...this.activeAgents.entries()].map(([commercialId, d]) => ({
      commercialId,
      posteId: d.posteId,
      tenantId: d.tenantId,
    }));
  }

  /** Rafraîchit le TTL de tous les agents actifs toutes les 40s via pipeline (1 round-trip) */
  @Interval(40_000)
  async refreshAll(): Promise<void> {
    if (!this.redis || !this.enabled || this.activeAgents.size === 0) return;
    const ts = Date.now();
    const pipeline = this.redis.pipeline();
    for (const [commercialId, { posteId, tenantId }] of this.activeAgents.entries()) {
      const value = JSON.stringify({ posteId, tenantId, ts });
      pipeline.setex(`presence:commercial:${commercialId}`, 45, value);
      pipeline.setex(`presence:poste:${posteId}`, 45, '1');
    }
    try {
      await pipeline.exec();
    } catch (err) {
      this.logger.warn(`refreshAll pipeline error: ${(err as Error).message}`);
    }
  }
}
