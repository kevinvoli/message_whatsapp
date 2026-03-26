import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { WhapiService } from './whapi.service';
import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { MetaWebhookPayload } from './interface/whatsapp-whebhook.interface';
import { TelegramWebhookPayload } from './interface/telegram-webhook.interface';
import { UnifiedIngressService } from 'src/webhooks/unified-ingress.service';
import { ChannelService } from 'src/channel/channel.service';
import { WebhookRateLimitService } from './webhook-rate-limit.service';
import { WebhookTrafficHealthService } from './webhook-traffic-health.service';
import { WebhookDegradedQueueService } from './webhook-degraded-queue.service';
import { WebhookMetricsService } from './webhook-metrics.service';
import { WebhookCryptoService } from './webhook-crypto.service';
import { WebhookPayloadValidationService } from './webhook-payload-validation.service';
import { MetaAccountEventService } from './meta-account-event.service';

@Controller('webhooks')
export class WhapiController {
  private readonly auditLogger = new Logger('WebhookAudit');

  constructor(
    private readonly whapiService: WhapiService,
    private readonly rateLimitService: WebhookRateLimitService,
    private readonly healthService: WebhookTrafficHealthService,
    private readonly degradedQueue: WebhookDegradedQueueService,
    private readonly metricsService: WebhookMetricsService,
    private readonly unifiedIngressService: UnifiedIngressService,
    private readonly channelService: ChannelService,
    private readonly cryptoService: WebhookCryptoService,
    private readonly payloadValidator: WebhookPayloadValidationService,
    private readonly metaAccountEventService: MetaAccountEventService,
  ) {}

  @Post('whapi')
  async handleWebhook(
    @Body() payload: WhapiWebhookPayload,
    @Req() request: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    
    const startedAt = Date.now();
    const provider = 'whapi';
    const requestId = this.cryptoService.headerValue(headers['x-request-id']) ?? randomUUID();
    this.assertPayloadSize(request.rawBody);

    this.cryptoService.assertWhapiSecret(headers, request.rawBody, payload);

    this.payloadValidator.assertWhapiPayload(payload);

    const tenantId = await this.resolveTenantOrReject(
      'whapi',
      payload.channel_id,
    );
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

  @Get('messenger')
  async verifyMessengerWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    console.log("verification de webhooks", mode, token, challenge);
    
    if (mode === 'subscribe') {
      const matchesDb = await this.channelService.hasMatchingVerifyToken('messenger', token);
    console.log("verification matchsDb", matchesDb);

      if (matchesDb) {
    console.log("verification token if:", challenge);

        return challenge;
      }
    }
    throw new ForbiddenException();
  }

  @Post('messenger')
  async handleMessengerWebhook(
    @Body() payload: unknown,
    @Req() request: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const startedAt = Date.now();
    const provider = 'messenger';
    const requestId = this.cryptoService.headerValue(headers['x-request-id']) ?? randomUUID();

    this.assertPayloadSize(request.rawBody);

    const messengerPayload = this.payloadValidator.assertMessengerPayload(payload);

    const pageId = messengerPayload.entry?.[0]?.id;
    if (!pageId) {
      return { status: 'ignored', reason: 'missing_page_id' };
    }

    // Résoudre le canal pour obtenir son meta_app_secret, puis valider la signature
    const channelRecord = await this.channelService.findByChannelId(pageId);
    this.cryptoService.assertMessengerSignature(headers, request.rawBody, payload, channelRecord?.meta_app_secret);

    const tenantId = await this.resolveTenantOrReject('messenger', pageId);
    const channel = await this.channelService.resolveTenantByProviderExternalId(
      'messenger',
      pageId,
    );
    const channelId = channelRecord?.channel_id ?? pageId;

    this.auditLogger.log(
      `WEBHOOK_ACCEPTED request_id=${requestId} provider=messenger tenant_id=${tenantId} page_id=${pageId}`,
    );

    this.rateLimitService.assertRateLimits(provider, null, tenantId);
    this.assertCircuitBreaker(provider);
    this.metricsService.recordReceived(provider, tenantId);

    const idempotency = await this.whapiService.isReplayEvent(
      messengerPayload,
      'messenger',
      tenantId,
    );

    if (idempotency === 'conflict') {
      throw new HttpException('Idempotency conflict', HttpStatus.CONFLICT);
    }
    if (idempotency === 'duplicate') {
      this.metricsService.recordDuplicate(provider, tenantId);
      this.healthService.record(provider, true, Date.now() - startedAt);
      this.metricsService.recordLatency(provider, Date.now() - startedAt);
      return { status: 'duplicate_ignored' };
    }

    try {
      await this.unifiedIngressService.ingestMessenger(messengerPayload, {
        provider: 'messenger',
        tenantId,
        channelId,
      });
    } catch (err) {
      if (err instanceof HttpException) {
        this.healthService.record(
          provider,
          err.getStatus() < 500,
          Date.now() - startedAt,
        );
        throw err;
      }
      this.healthService.record(provider, false, Date.now() - startedAt);
      this.metricsService.recordError(provider, tenantId, 'exception');
      throw err;
    }

    this.healthService.record(provider, true, Date.now() - startedAt);
    this.metricsService.recordLatency(provider, Date.now() - startedAt);
    return { status: 'ok' };
  }

  @Post('telegram/:botId')
  async handleTelegramWebhook(
    @Param('botId') botId: string,
    @Body() payload: TelegramWebhookPayload,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
  ) {
    const startedAt = Date.now();
    const provider = 'telegram';

    // Ignorer les updates sans message exploitable (channel_post, edited_message)
    const hasContent = payload.message || payload.callback_query;
    if (!hasContent) {
      return { status: 'ignored', reason: 'no_actionable_content' };
    }

    // Résoudre le canal pour obtenir son webhook_secret
    const channelRecord = await this.channelService.findByChannelId(botId);
    const expectedSecret = channelRecord?.webhook_secret;
    if (expectedSecret && secretToken !== expectedSecret) {
      this.metricsService.recordSignatureInvalid('telegram');                                                                                                                                                                        
      throw new ForbiddenException('Invalid Telegram secret token');
    }

    const tenantId = await this.resolveTenantOrReject('telegram', botId);
    const channelId = channelRecord?.channel_id ?? botId;

    this.auditLogger.log(
      `WEBHOOK_ACCEPTED provider=telegram bot_id=${botId} tenant_id=${tenantId} update_id=${payload.update_id}`,
    );

    this.rateLimitService.assertRateLimits(provider, null, tenantId);
    this.assertCircuitBreaker(provider);
    this.metricsService.recordReceived(provider, tenantId);

    const idempotency = await this.whapiService.isReplayEvent(
      payload,
      'telegram',
      tenantId,
    );

    if (idempotency === 'conflict') {
      throw new HttpException('Idempotency conflict', HttpStatus.CONFLICT);
    }
    if (idempotency === 'duplicate') {
      this.metricsService.recordDuplicate(provider, tenantId);
      this.healthService.record(provider, true, Date.now() - startedAt);
      this.metricsService.recordLatency(provider, Date.now() - startedAt);
      return { status: 'duplicate_ignored' };
    }

    try {
      await this.unifiedIngressService.ingestTelegram(payload, {
        provider: 'telegram',
        tenantId,
        channelId,
      });
    } catch (err) {
      if (err instanceof HttpException) {
        this.healthService.record(
          provider,
          err.getStatus() < 500,
          Date.now() - startedAt,
        );
        throw err;
      }
      this.healthService.record(provider, false, Date.now() - startedAt);
      this.metricsService.recordError(provider, tenantId, 'exception');
      throw err;
    }

    this.healthService.record(provider, true, Date.now() - startedAt);
    this.metricsService.recordLatency(provider, Date.now() - startedAt);
    return { status: 'ok' };
  }

  @Get('instagram')
  async verifyInstagramWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe') {
      const matchesDb = await this.channelService.hasMatchingVerifyToken('instagram', token);
      if (matchesDb) {
        return challenge;
      }
    }
    throw new ForbiddenException();
  }

  @Post('instagram')
  async handleInstagramWebhook(
    @Body() payload: unknown,
    @Req() request: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const startedAt = Date.now();
    const provider = 'instagram';
    const requestId = this.cryptoService.headerValue(headers['x-request-id']) ?? randomUUID();

    this.assertPayloadSize(request.rawBody);

    const igPayload = this.payloadValidator.assertInstagramPayload(payload);

    const igAccountId = igPayload.entry?.[0]?.id;
    if (!igAccountId) {
      return { status: 'ignored', reason: 'missing_ig_account_id' };
    }

    // Résoudre le canal pour obtenir son meta_app_secret, puis valider la signature
    const channelRecord = await this.channelService.findByChannelId(igAccountId);
    this.cryptoService.assertInstagramSignature(headers, request.rawBody, payload, channelRecord?.meta_app_secret);

    const tenantId = await this.resolveTenantOrReject('instagram', igAccountId);
    const channelId = channelRecord?.channel_id ?? igAccountId;

    this.auditLogger.log(
      `WEBHOOK_ACCEPTED request_id=${requestId} provider=instagram tenant_id=${tenantId} ig_account_id=${igAccountId}`,
    );

    this.rateLimitService.assertRateLimits(provider, null, tenantId);
    this.assertCircuitBreaker(provider);
    this.metricsService.recordReceived(provider, tenantId);

    const idempotency = await this.whapiService.isReplayEvent(
      igPayload,
      'instagram',
      tenantId,
    );

    if (idempotency === 'conflict') {
      throw new HttpException('Idempotency conflict', HttpStatus.CONFLICT);
    }
    if (idempotency === 'duplicate') {
      this.metricsService.recordDuplicate(provider, tenantId);
      this.healthService.record(provider, true, Date.now() - startedAt);
      this.metricsService.recordLatency(provider, Date.now() - startedAt);
      return { status: 'duplicate_ignored' };
    }

    try {
      await this.unifiedIngressService.ingestInstagram(igPayload, {
        provider: 'instagram',
        tenantId,
        channelId,
      });
    } catch (err) {
      if (err instanceof HttpException) {
        this.healthService.record(
          provider,
          err.getStatus() < 500,
          Date.now() - startedAt,
        );
        throw err;
      }
      this.healthService.record(provider, false, Date.now() - startedAt);
      this.metricsService.recordError(provider, tenantId, 'exception');
      throw err;
    }

    this.healthService.record(provider, true, Date.now() - startedAt);
    this.metricsService.recordLatency(provider, Date.now() - startedAt);
    return { status: 'ok' };
  }

  @Get('whatsapp')
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe') {
      const matchesDb = await this.channelService.hasMatchingVerifyToken('meta', token);
      if (matchesDb) {
        return challenge;
      }
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
    const requestId = this.cryptoService.headerValue(headers['x-request-id']) ?? randomUUID();
    // console.log("affichage du post:2",request);

    this.assertPayloadSize(request.rawBody);

    const metaPayload = this.payloadValidator.assertMetaPayload(payload);

    const entry = metaPayload?.entry?.[0];
    const change = entry?.changes?.[0];
    const field = change?.field;

    // Dispatcher les webhooks Meta non-messages (account_update, etc.)
    if (field !== 'messages') {
      this.auditLogger.log(
        `WEBHOOK_NON_MESSAGES provider=meta field=${field ?? 'unknown'} waba=${entry?.id ?? '-'}`,
      );
      await this.metaAccountEventService.dispatch(field ?? '', change?.value, entry?.id);
      return { status: 'EVENT_RECEIVED' };
    }

    const metaValue = change?.value;
    const wabaId = entry?.id;
    const phoneNumberId = metaValue?.metadata?.phone_number_id;

    // Résoudre le canal pour obtenir son meta_app_secret, puis valider la signature
    const channel = phoneNumberId
      ? await this.channelService.findByChannelId(phoneNumberId)
      : null;
    this.cryptoService.assertMetaSignature(headers, request.rawBody, payload, channel?.meta_app_secret);

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

  private rateLimit(
    provider: string,
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
    provider: string,
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
