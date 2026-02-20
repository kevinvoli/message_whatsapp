import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { WhapiService } from './whapi.service';
import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { MetaWebhookPayload } from './interface/whatsapp-whebhook.interface';
import { WebhookRateLimitService } from './webhook-rate-limit.service';
import { WebhookTrafficHealthService } from './webhook-traffic-health.service';
import { WebhookDegradedQueueService } from './webhook-degraded-queue.service';
import { WebhookMetricsService } from './webhook-metrics.service';
import { json } from 'stream/consumers';

@Controller('webhooks')
export class WhapiController {
  private readonly auditLogger = new Logger('WebhookAudit');

  constructor(
    private readonly whapiService: WhapiService,
    private readonly rateLimitService: WebhookRateLimitService,
    private readonly healthService: WebhookTrafficHealthService,
    private readonly degradedQueue: WebhookDegradedQueueService,
    private readonly metricsService: WebhookMetricsService,
  ) {}

  @Post('whapi')
  async handleWebhook(
    @Body() payload: WhapiWebhookPayload,
    @Req() request: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    console.log("===========================================================", payload,headers, request.rawBody);
    
    const startedAt = Date.now();
    const provider = 'whapi';
    const requestId = this.headerValue(headers['x-request-id']) ?? randomUUID();
    this.assertPayloadSize(request.rawBody);
    console.log("===========================================================1");

    // this.assertWhapiSecret(headers, request.rawBody, payload);
    console.log("===========================================================2");

    this.assertWhapiPayload(payload);
    console.log("===========================================================3");

    const tenantId = await this.resolveTenantOrReject(
      'whapi',
      payload.channel_id,
    );
    console.log("===========================================================4");
    const auditEventKey = this.buildAuditEventKey('whapi', payload);
    this.auditLogger.log(
      `WEBHOOK_ACCEPTED request_id=${requestId} provider=whapi tenant_id=${tenantId} event_key=${auditEventKey}`,
    );
    this.rateLimit('whapi', request, tenantId);
    this.assertCircuitBreaker(provider);
    this.metricsService.recordReceived(provider, tenantId);
    const degraded = this.healthService.isDegraded(provider);
    const idempotency = await this.whapiService.isReplayEvent(
      payload,
      'whapi',
      tenantId,
    );
    console.log("===========================================================5");

    if (idempotency === 'conflict') {
      throw new HttpException('Idempotency conflict', HttpStatus.CONFLICT);
    }
    const eventType = payload?.event?.type;
    if (idempotency === 'duplicate') {
      const replayedId = payload?.messages?.[0]?.id;
      if (
        eventType === 'messages' &&
        replayedId &&
        !(await this.whapiService.hasPersistedIncomingMessage(
          'whapi',
          replayedId,
        ))
      ) {
        this.auditLogger.warn(
          `WEBHOOK_DUPLICATE_REPROCESS provider=whapi tenant_id=${tenantId} provider_message_id=${replayedId}`,
        );
      } else {
        this.metricsService.recordDuplicate(provider, tenantId);
        this.healthService.record(provider, true, Date.now() - startedAt);
        this.metricsService.recordLatency(provider, Date.now() - startedAt);
        return { status: 'duplicate_ignored' };
      }
    }

    try {
      if (degraded) {
        const queued = this.enqueueDegradedWhapi(
          provider,
          eventType,
          payload,
          tenantId,
        );
        if (!queued) {
          throw new HttpException(
            'Degraded queue overloaded',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        this.healthService.record(provider, true, Date.now() - startedAt);
        this.metricsService.recordLatency(provider, Date.now() - startedAt);
        throw new HttpException(
          { status: 'accepted', mode: 'degraded' },
          HttpStatus.ACCEPTED,
        );
      }

      switch (eventType) {
        case 'messages':
          await this.whapiService.handleIncomingMessage(payload, tenantId);
          break;
        case 'statuses':
          await this.whapiService.updateStatusMessage(payload, tenantId);
          break;
        case 'events':
        case 'polls':
        case 'interactive':
        case 'contacts':
        case 'locations':
        case 'live_locations':
        case 'orders':
        case 'products':
        case 'catalogs':
          break;
        default:
          throw new HttpException(
            `Unsupported event type: ${eventType}`,
            HttpStatus.BAD_REQUEST,
          );
      }
    } catch (err) {
      console.log("erreur whapippppppppppppppppppppppppppppppppppp", err);
      
      if (err instanceof HttpException) {
        this.healthService.record(
          provider,
          err.getStatus() < 500,
          Date.now() - startedAt,
        );
        if (err.getStatus() >= 500) {
          this.metricsService.recordError(
            provider,
            tenantId,
            `http_${err.getStatus()}`,
          );
        }
        throw err;
      }
      const message =
        err instanceof Error ? err.message : 'Webhook processing failed';
      this.healthService.record(provider, false, Date.now() - startedAt);
      this.metricsService.recordError(provider, tenantId, 'exception');
      throw new HttpException(
        {
          status: 'error',
          message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.healthService.record(provider, true, Date.now() - startedAt);
    this.metricsService.recordLatency(provider, Date.now() - startedAt);
    return { status: 'ok' };
  }

  @Get('whatsapp')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    console.log('affichage des message ');

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return challenge;
    }
    throw new ForbiddenException();
  }

  @Post('whatsapp')
  async handleWebhooks(
    @Body() payload: unknown,
    @Req() request: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const startedAt = Date.now();
    const provider = 'meta';
    const requestId = this.headerValue(headers['x-request-id']) ?? randomUUID();
    // console.log("affichage du post:2",request);

    this.assertPayloadSize(request.rawBody);

    this.assertMetaSignature(headers, request.rawBody, payload);

    const metaPayload = this.assertMetaPayload(payload);

    const entry = metaPayload?.entry?.[0];
    const change = entry?.changes?.[0];
    const field = change?.field;

    // P3: Ignorer les webhooks Meta non-messages (account_update, etc.)
    if (field !== 'messages') {
      this.auditLogger.log(
        `WEBHOOK_IGNORED provider=meta field=${field ?? 'unknown'}`,
      );
      return { status: 'ignored', reason: `unsupported_field:${field}` };
    }

    const metaValue = change?.value;
    const wabaId = entry?.id;
    const phoneNumberId = metaValue?.metadata?.phone_number_id;

    const tenantId = await this.resolveTenantForMeta(wabaId, phoneNumberId);
    const auditEventKey = this.buildAuditEventKey('meta', metaPayload);
    this.auditLogger.log(
      `WEBHOOK_ACCEPTED request_id=${requestId} provider=meta tenant_id=${tenantId} event_key=${auditEventKey}`,
    );
    this.rateLimit('meta', request, tenantId);
    this.assertCircuitBreaker(provider);
    this.metricsService.recordReceived(provider, tenantId);
    const degraded = this.healthService.isDegraded(provider);

    if (!metaPayload) {
      this.healthService.record(provider, true, Date.now() - startedAt);
      this.metricsService.recordLatency(provider, Date.now() - startedAt);
      return { status: 'ignored' };
    }

    const idempotency = await this.whapiService.isReplayEvent(
      metaPayload as any,
      'meta',
      tenantId,
    );
    if (idempotency === 'conflict') {
      throw new HttpException('Idempotency conflict', HttpStatus.CONFLICT);
    }
    if (idempotency === 'duplicate') {
      const replayedId = metaValue?.messages?.[0]?.id;
      if (
        replayedId &&
        !(await this.whapiService.hasPersistedIncomingMessage(
          'meta',
          replayedId,
        ))
      ) {
        this.auditLogger.warn(
          `WEBHOOK_DUPLICATE_REPROCESS provider=meta tenant_id=${tenantId} provider_message_id=${replayedId}`,
        );
      } else {
        this.metricsService.recordDuplicate(provider, tenantId);
        this.healthService.record(provider, true, Date.now() - startedAt);
        this.metricsService.recordLatency(provider, Date.now() - startedAt);
        return { status: 'duplicate_ignored' };
      }
    }

    try {
      if (degraded) {
        const queued = this.enqueueDegradedMeta(
          provider,
          tenantId,
          metaPayload,
        );
        if (!queued) {
          throw new HttpException(
            'Degraded queue overloaded',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        this.healthService.record(provider, true, Date.now() - startedAt);
        this.metricsService.recordLatency(provider, Date.now() - startedAt);
        throw new HttpException(
          { status: 'accepted', mode: 'degraded' },
          HttpStatus.ACCEPTED,
        );
      }

      await this.whapiService.handleMetaWebhook(metaPayload, tenantId);
    } catch (err) {
      if (err instanceof HttpException) {
        this.healthService.record(
          provider,
          err.getStatus() < 500,
          Date.now() - startedAt,
        );
        if (err.getStatus() >= 500) {
          this.metricsService.recordError(
            provider,
            tenantId,
            `http_${err.getStatus()}`,
          );
        }
        throw err;
      }
      this.healthService.record(provider, false, Date.now() - startedAt);
      this.metricsService.recordError(provider, tenantId, 'exception');
      throw err;
    }

    this.healthService.record(provider, true, Date.now() - startedAt);
    this.metricsService.recordLatency(provider, Date.now() - startedAt);
    return { status: 'EVENT_RECEIVED' };
  }

  private assertWhapiSecret(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    payload: unknown,
  ): void {
    if (process.env.WHAPI_WEBHOOK_SKIP_SIGNATURE === 'true') {
      return;
    }

    const isProd = process.env.NODE_ENV === 'production';
    const configuredHeader =
      process.env.WHAPI_WEBHOOK_SECRET_HEADER?.trim().toLowerCase();
    const configuredValue = process.env.WHAPI_WEBHOOK_SECRET_VALUE?.trim();
    const configuredPrevious =
      process.env.WHAPI_WEBHOOK_SECRET_VALUE_PREVIOUS?.trim();

    if (isProd && (!configuredHeader || !configuredValue)) {
      this.metricsService.recordSignatureInvalid('whapi');
      throw new UnauthorizedException('Webhook secret not configured');
    }

    // New mode: explicit configurable header + value (preferred).
    if (!configuredHeader || !configuredValue) {
      return;
    }

    const provided = this.headerValue(headers[configuredHeader])?.trim();
    if (!provided) {
      this.metricsService.recordSignatureInvalid('whapi');
      throw new UnauthorizedException('Missing webhook signature');
    }
    const secrets = [configuredValue, configuredPrevious].filter(
      (value): value is string => Boolean(value),
    );
    const valid = this.verifyHmacSignature(
      'whapi',
      secrets,
      rawBody,
      payload,
      provided,
      isProd,
    );
    if (!valid) {
      this.metricsService.recordSignatureInvalid('whapi');
      throw new ForbiddenException('Invalid webhook signature');
    }
  }

  private assertMetaSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    payload: unknown,
  ): void {
    const isProd = process.env.NODE_ENV === 'production';
    const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
    const previousSecret = process.env.WHATSAPP_APP_SECRET_PREVIOUS?.trim();
    if (!appSecret && !previousSecret) {
      if (isProd) {
        this.metricsService.recordSignatureInvalid('meta');
        throw new UnauthorizedException(
          'Webhook signature secret not configured',
        );
      }
      return;
    }

    const signatureHeader = this.headerValue(
      headers['x-hub-signature-256'],
    )?.trim();
    if (!signatureHeader) {
      this.metricsService.recordSignatureInvalid('meta');
      throw new UnauthorizedException('Missing signature');
    }

    const secrets = [appSecret, previousSecret].filter(
      (value): value is string => Boolean(value),
    );

    const valid = this.verifyHmacSignature(
      'meta',
      secrets,
      rawBody,
      payload,
      signatureHeader,
      isProd,
    );

    if (!valid) {
      this.metricsService.recordSignatureInvalid('meta');
      throw new ForbiddenException('Invalid webhook signature');
    }
  }

  private headerValue(
    value: string | string[] | undefined,
  ): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private assertWhapiPayload(payload: WhapiWebhookPayload): void {
    if (!payload || typeof payload !== 'object') {
      throw new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);
    }
    if (!payload.channel_id || typeof payload.channel_id !== 'string') {
      throw new HttpException('Invalid channel_id', HttpStatus.BAD_REQUEST);
    }
    if (!payload.event || typeof payload.event.type !== 'string') {
      throw new HttpException('Invalid event', HttpStatus.BAD_REQUEST);
    }
    const hasMessages = Array.isArray(payload.messages);
    const hasStatuses = Array.isArray(payload.statuses);
    if (!hasMessages && !hasStatuses) {
      throw new HttpException(
        'Missing messages/statuses',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (hasMessages) {
      for (const message of payload.messages ?? []) {
        if (!message?.id || typeof message.id !== 'string') {
          throw new HttpException('Invalid message id', HttpStatus.BAD_REQUEST);
        }
        if (!message.chat_id || typeof message.chat_id !== 'string') {
          throw new HttpException('Invalid chat_id', HttpStatus.BAD_REQUEST);
        }
        if (!message.type || typeof message.type !== 'string') {
          throw new HttpException(
            'Invalid message type',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
    if (hasStatuses) {
      for (const status of payload.statuses ?? []) {
        if (!status?.id || typeof status.id !== 'string') {
          throw new HttpException('Invalid status id', HttpStatus.BAD_REQUEST);
        }
        if (!status.recipient_id || typeof status.recipient_id !== 'string') {
          throw new HttpException(
            'Invalid recipient_id',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
  }

  private assertMetaPayload(payload: unknown): MetaWebhookPayload {
    if (!payload || typeof payload !== 'object') {
      throw new HttpException('Invalid payload', HttpStatus.BAD_REQUEST);
    }
    const metaPayload = payload as MetaWebhookPayload;
    if (metaPayload.object !== 'whatsapp_business_account') {
      throw new HttpException('Invalid meta object', HttpStatus.BAD_REQUEST);
    }
    const entry = metaPayload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const metadata = value?.metadata;
    if (!entry?.id || typeof entry.id !== 'string') {
      throw new HttpException('Invalid entry id', HttpStatus.BAD_REQUEST);
    }
    if (
      !metadata?.phone_number_id ||
      typeof metadata.phone_number_id !== 'string'
    ) {
      throw new HttpException(
        'Invalid phone_number_id',
        HttpStatus.BAD_REQUEST,
      );
    }
    const hasMessages = Array.isArray(value?.messages);
    const hasStatuses = Array.isArray(value?.statuses);
    if (!hasMessages && !hasStatuses) {
      throw new HttpException(
        'Missing messages/statuses',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (hasMessages) {
      for (const message of value?.messages ?? []) {
        if (!message?.id || typeof message.id !== 'string') {
          throw new HttpException('Invalid message id', HttpStatus.BAD_REQUEST);
        }
        if (!message?.from || typeof message.from !== 'string') {
          throw new HttpException(
            'Invalid message from',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
    if (hasStatuses) {
      for (const status of value?.statuses ?? []) {
        if (!status?.id || typeof status.id !== 'string') {
          throw new HttpException('Invalid status id', HttpStatus.BAD_REQUEST);
        }
        if (!status?.recipient_id || typeof status.recipient_id !== 'string') {
          throw new HttpException(
            'Invalid recipient_id',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }
    return metaPayload;
  }

  private verifyHmacSignature(
    provider: 'whapi' | 'meta',
    secrets: string[],
    rawBody: Buffer | undefined,
    payload: unknown,
    provided: string,
    requireRawBody: boolean,
  ): boolean {
    // console.log("affichage du post:1",provider);

    if (requireRawBody && !rawBody) {
      this.metricsService.recordSignatureInvalid(provider);
      throw new HttpException(
        'Missing rawBody',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const payloadBuffer = rawBody ?? Buffer.from(JSON.stringify(payload));
    const normalizedProvided = provided.trim().toLowerCase();
    const receivedBuffer = Buffer.from(normalizedProvided);
    for (const secret of secrets) {
      const digest = createHmac('sha256', secret)
        .update(payloadBuffer)
        .digest('hex');
      const candidates = [`sha256=${digest}`, digest];
      for (const candidate of candidates) {
        const expectedBuffer = Buffer.from(candidate.toLowerCase());
        // console.log("affichage du post:4.7",candidate, receivedBuffer);

        if (
          expectedBuffer.length === receivedBuffer.length &&
          timingSafeEqual(expectedBuffer, receivedBuffer)
        ) {
          // console.log("affichage du post:10");

          return true;
        }
      }
    }
    return false;
  }

  private rateLimit(
    provider: 'whapi' | 'meta',
    request: Request,
    tenantId?: string | null,
  ): void {
    const ipHeader = request.headers['x-forwarded-for'];
    const ip = Array.isArray(ipHeader)
      ? ipHeader[0]
      : typeof ipHeader === 'string'
        ? ipHeader.split(',')[0]?.trim()
        : null;
    const resolvedIp = ip || request.ip || null;
    this.rateLimitService.assertRateLimits(provider, resolvedIp, tenantId);
  }

  private assertPayloadSize(rawBody?: Buffer): void {
    if (!rawBody) return;
    const maxBytes = 1024 * 1024;
    if (rawBody.length > maxBytes) {
      throw new HttpException(
        'Payload too large',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
  }

  private assertCircuitBreaker(provider: string): void {
    if (this.healthService.isCircuitOpen(provider)) {
      throw new HttpException(
        'Circuit breaker open',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private enqueueDegradedWhapi(
    provider: 'whapi' | 'meta',
    eventType: string | undefined,
    payload: WhapiWebhookPayload,
    tenantId: string,
  ): boolean {
    const handler = async () => {
      switch (eventType) {
        case 'messages':
          await this.whapiService.handleIncomingMessage(payload, tenantId);
          break;
        case 'statuses':
          await this.whapiService.updateStatusMessage(payload, tenantId);
          break;
        case 'events':
        case 'polls':
        case 'interactive':
        case 'contacts':
        case 'locations':
        case 'live_locations':
        case 'orders':
        case 'products':
        case 'catalogs':
          break;
        default:
          throw new HttpException(
            `Unsupported event type: ${eventType}`,
            HttpStatus.BAD_REQUEST,
          );
      }
    };

    return this.degradedQueue.enqueue(provider, { run: handler });
  }

  private enqueueDegradedMeta(
    provider: 'whapi' | 'meta',
    tenantId: string,
    payload: MetaWebhookPayload,
  ): boolean {
    const handler = async () => {
      await this.whapiService.handleMetaWebhook(payload, tenantId);
    };

    return this.degradedQueue.enqueue(provider, { run: handler });
  }

  private async resolveTenantOrReject(
    provider: 'whapi' | 'meta',
    externalId?: string,
  ): Promise<string> {
    if (!externalId) {
      this.metricsService.recordTenantResolutionFailed(provider);
      throw new HttpException(
        'Missing channel mapping',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const tenantId = await this.whapiService.resolveTenantByProviderExternalId(
      provider,
      externalId,
    );
    if (!tenantId) {
      this.metricsService.recordTenantResolutionFailed(provider);
      throw new HttpException(
        'Unknown channel mapping',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return tenantId;
  }

  private async resolveTenantForMeta(
    wabaId?: string,
    phoneNumberId?: string,
  ): Promise<string> {
    if (wabaId) {
      const existingTenant =
        await this.whapiService.resolveTenantByProviderExternalId(
          'meta',
          wabaId,
        );
      if (existingTenant) {
        return existingTenant;
      }
    }

    if (wabaId && phoneNumberId) {
      const channel =
        await this.whapiService.findChannelByExternalId(phoneNumberId);
      if (channel) {
        const tenantId = await this.whapiService.ensureTenantId(channel);
        await this.whapiService.upsertProviderMapping({
          tenant_id: tenantId,
          provider: 'meta',
          external_id: wabaId,
          channel_id: phoneNumberId,
        });
        return tenantId;
      }
    }

    this.metricsService.recordTenantResolutionFailed('meta');
    throw new HttpException(
      'Unknown channel mapping',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private buildAuditEventKey(
    provider: 'whapi' | 'meta',
    payload: WhapiWebhookPayload | MetaWebhookPayload,
  ): string {
    if (provider === 'whapi') {
      const whapiPayload = payload as WhapiWebhookPayload;
      const id =
        whapiPayload.messages?.[0]?.id ??
        whapiPayload.statuses?.[0]?.id ??
        'unknown';
      return `${provider}:${whapiPayload.channel_id}:${whapiPayload.event?.type ?? 'unknown'}:${id}`;
    }
    const metaPayload = payload as MetaWebhookPayload;
    const entry = metaPayload.entry?.[0];
    const value = entry?.changes?.[0]?.value;
    const id =
      value?.messages?.[0]?.id ?? value?.statuses?.[0]?.id ?? 'unknown';
    const channelId = value?.metadata?.phone_number_id ?? 'unknown';
    return `${provider}:${channelId}:${entry?.changes?.[0]?.field ?? 'unknown'}:${id}`;
  }
}
