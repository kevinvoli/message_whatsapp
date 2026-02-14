import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { WebhookEventLog } from 'src/whapi/entities/webhook-event.entity';
import { WhapiWebhookPayload } from 'src/whapi/interface/whapi-webhook.interface';
import { MetaWebhookPayload } from 'src/whapi/interface/whatsapp-whebhook.interface';
import { WebhookMetricsService } from 'src/whapi/webhook-metrics.service';

type ProviderId = 'whapi' | 'meta';

export type IdempotencyResult = 'accepted' | 'duplicate' | 'conflict';

@Injectable()
export class WebhookIdempotencyService {
  private readonly logger = new Logger(WebhookIdempotencyService.name);

  constructor(
    @InjectRepository(WebhookEventLog)
    private readonly webhookEventRepository: Repository<WebhookEventLog>,
    private readonly metricsService: WebhookMetricsService,
  ) {}

  async check(params: {
    payload: unknown;
    provider: ProviderId;
    tenantId?: string | null;
  }): Promise<IdempotencyResult> {
    const { payload, provider, tenantId } = params;
    const keys = this.buildIdempotencyKeys(payload, provider, tenantId ?? 'unknown');
    if (!keys.length) {
      return 'accepted';
    }

    const eventType = this.resolveEventType(payload, provider);
    const payloadHash = this.hashPayload(payload);
    let insertedCount = 0;
    let conflictDetected = false;
    for (const key of keys) {
      const inserted = await this.tryRegisterEventKey({
        eventKey: key,
        provider,
        tenantId,
        eventType,
        providerMessageId: this.extractProviderMessageId(payload, provider),
        direction: this.extractDirection(payload, provider),
        payloadHash,
      });
      if (inserted === 'accepted') {
        insertedCount += 1;
      } else if (inserted === 'conflict') {
        conflictDetected = true;
      }
    }

    if (conflictDetected) {
      return 'conflict';
    }
    return insertedCount === 0 ? 'duplicate' : 'accepted';
  }

  private buildIdempotencyKeys(
    payload: unknown,
    provider: ProviderId,
    tenantId: string,
  ): string[] {
    if (provider === 'whapi') {
      const whapiPayload = payload as WhapiWebhookPayload;
      const eventType = whapiPayload?.event?.type ?? 'unknown';

      const messageIds =
        whapiPayload?.messages
          ?.map((message) => message?.id)
          .filter((id): id is string => Boolean(id))
          .map((id) => {
            const direction = whapiPayload.messages?.find((m) => m.id === id)?.from_me
              ? 'out'
              : 'in';
            return `${id}:${eventType}:${direction}`;
          }) ?? [];

      const statusIds =
        whapiPayload?.statuses
          ?.map((status) =>
            status?.id
              ? `${status.id}:${eventType}:out`
              : null,
          )
          .filter((value): value is string => Boolean(value)) ?? [];

      const keys = [...messageIds, ...statusIds];
      if (keys.length > 0) {
        return keys;
      }

      const minuteBucket = this.resolveMinuteBucket(payload, provider);
      const direction = this.extractDirection(payload, provider) ?? 'unknown';
      return [
        `${tenantId}:${provider}:${this.hashPayload(whapiPayload)}:${eventType}:${direction}:${minuteBucket}`,
      ];
    }

    const metaPayload = payload as MetaWebhookPayload;
    const entry = metaPayload?.entry?.[0];
    const value = entry?.changes?.[0]?.value;
    const eventType = entry?.changes?.[0]?.field ?? 'unknown';

    const messageIds =
      value?.messages
        ?.map((message) => message?.id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        .map((id: string) => `${id}:${eventType}:in`) ?? [];

    const statusIds =
      value?.statuses
        ?.map((status) =>
            status?.id ? `${status.id}:${eventType}:out` : null,
        )
        .filter((value: unknown): value is string => Boolean(value)) ?? [];

    const keys = [...messageIds, ...statusIds];
    if (keys.length > 0) {
      return keys;
    }

    const minuteBucket = this.resolveMinuteBucket(payload, provider);
    const direction = this.extractDirection(payload, provider) ?? 'unknown';
    return [
      `${tenantId}:${provider}:${this.hashPayload(metaPayload)}:${eventType}:${direction}:${minuteBucket}`,
    ];
  }

  private resolveEventType(payload: unknown, provider: ProviderId): string | null {
    if (provider === 'whapi') {
      return (payload as WhapiWebhookPayload)?.event?.type ?? null;
    }
    const metaPayload = payload as MetaWebhookPayload;
    return metaPayload?.entry?.[0]?.changes?.[0]?.field ?? null;
  }

  private extractProviderMessageId(
    payload: unknown,
    provider: ProviderId,
  ): string | null {
    if (provider === 'whapi') {
      const whapiPayload = payload as WhapiWebhookPayload;
      return whapiPayload?.messages?.[0]?.id ?? null;
    }
    const metaPayload = payload as MetaWebhookPayload;
    const value = metaPayload?.entry?.[0]?.changes?.[0]?.value;
    return value?.messages?.[0]?.id ?? null;
  }

  private extractDirection(payload: unknown, provider: ProviderId): string | null {
    if (provider === 'whapi') {
      const whapiPayload = payload as WhapiWebhookPayload;
      if (whapiPayload?.messages?.length) {
        return whapiPayload.messages[0].from_me ? 'out' : 'in';
      }
      if (whapiPayload?.statuses?.length) {
        return 'out';
      }
      return null;
    }
    const metaPayload = payload as MetaWebhookPayload;
    const value = metaPayload?.entry?.[0]?.changes?.[0]?.value;
    if (value?.messages?.length) {
      return 'in';
    }
    if (value?.statuses?.length) {
      return 'out';
    }
    return null;
  }

  private resolveMinuteBucket(payload: unknown, provider: ProviderId): number {
    if (provider === 'whapi') {
      const whapiPayload = payload as WhapiWebhookPayload;
      const ts =
        whapiPayload?.messages?.[0]?.timestamp ??
        whapiPayload?.statuses?.[0]?.timestamp;
      const parsed = typeof ts === 'string' ? Number.parseInt(ts, 10) : ts;
      if (Number.isFinite(parsed)) {
        return Math.floor((Number(parsed) * 1000) / 60000);
      }
    }

    const metaPayload = payload as MetaWebhookPayload;
    const value = metaPayload?.entry?.[0]?.changes?.[0]?.value;
    const ts =
      value?.messages?.[0]?.timestamp ??
      value?.statuses?.[0]?.timestamp;
    const parsed = typeof ts === 'string' ? Number.parseInt(ts, 10) : ts;
    if (Number.isFinite(parsed)) {
      return Math.floor((Number(parsed) * 1000) / 60000);
    }

    return Math.floor(Date.now() / 60000);
  }

  private async tryRegisterEventKey(params: {
    eventKey: string;
    provider: string;
    tenantId?: string | null;
    eventType: string | null;
    providerMessageId: string | null;
    direction: string | null;
    payloadHash: string;
  }): Promise<IdempotencyResult> {
    try {
      await this.webhookEventRepository.save(
        this.webhookEventRepository.create({
          event_key: params.eventKey,
          provider: params.provider,
          tenant_id: params.tenantId ?? null,
          event_type: params.eventType ?? undefined,
          direction: params.direction ?? undefined,
          provider_message_id: params.providerMessageId ?? null,
          payload_hash: params.payloadHash,
        }),
      );
      return 'accepted';
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        typeof (error as any).driverError?.code === 'string' &&
        ['ER_DUP_ENTRY', '23505', 'SQLITE_CONSTRAINT'].includes(
          (error as any).driverError.code,
        )
      ) {
        const where =
          params.tenantId == null
            ? {
                event_key: params.eventKey,
                provider: params.provider,
                tenant_id: undefined,
              }
            : {
                event_key: params.eventKey,
                provider: params.provider,
                tenant_id: params.tenantId,
              };
        const existing = await this.webhookEventRepository.findOne({ where });
        if (existing && existing.payload_hash && existing.payload_hash !== params.payloadHash) {
          this.metricsService.recordIdempotencyConflict(params.provider, params.tenantId);
          return 'conflict';
        }
        return 'duplicate';
      }
      if (
        error instanceof QueryFailedError &&
        (error as any).driverError?.code === 'ER_NO_SUCH_TABLE'
      ) {
        this.logger.warn(
          'Webhook idempotency table missing, continuing without dedupe',
        );
        return 'accepted';
      }
      throw error;
    }
  }

  private hashPayload(payload: unknown): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }
}
