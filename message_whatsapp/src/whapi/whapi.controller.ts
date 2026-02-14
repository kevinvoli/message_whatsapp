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
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { WhapiService } from './whapi.service';
import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { MetaWebhookPayload } from './interface/whatsapp-whebhook.interface';
import { metaToWhapi } from './utile/meta-to-whapi.service';
import { WebhookRateLimitService } from './webhook-rate-limit.service';
import { WebhookTrafficHealthService } from './webhook-traffic-health.service';
import { WebhookDegradedQueueService } from './webhook-degraded-queue.service';
import { WebhookMetricsService } from './webhook-metrics.service';

@Controller('webhooks')
export class WhapiController {
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
    const startedAt = Date.now();
    const provider = 'whapi';
    this.assertPayloadSize(request.rawBody);
    this.assertWhapiSecret(headers);
    const tenantId = await this.resolveTenantOrReject('whapi', payload.channel_id);
    this.rateLimit('whapi', request, tenantId);
    this.assertCircuitBreaker(provider);
    this.metricsService.recordReceived(provider, tenantId);
    const degraded = this.healthService.isDegraded(provider);
    if (await this.whapiService.isReplayEvent(payload, 'whapi')) {
      this.metricsService.recordDuplicate(provider, tenantId);
      this.healthService.record(provider, true, Date.now() - startedAt);
      this.metricsService.recordLatency(provider, Date.now() - startedAt);
      return { status: 'duplicate_ignored' };
    }

    const eventType = payload?.event?.type;

    try {
      if (degraded) {
        const queued = this.enqueueDegradedWhapi(provider, eventType, payload);
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
          await this.whapiService.handleIncomingMessage(payload);
          break;
        case 'statuses':
          await this.whapiService.updateStatusMessage(payload);
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

  @Get('whatsapp')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
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
    this.assertPayloadSize(request.rawBody);
    this.assertMetaSignature(headers, request.rawBody, payload);

    const metaPayload = payload as MetaWebhookPayload;
    const entry = metaPayload?.entry?.[0];
    const metaValue = entry?.changes?.[0]?.value;
    const wabaId = entry?.id;
    const phoneNumberId = metaValue?.metadata?.phone_number_id;

    const tenantId = await this.resolveTenantForMeta(wabaId, phoneNumberId);
    this.rateLimit('meta', request, tenantId);
    this.assertCircuitBreaker(provider);
    this.metricsService.recordReceived(provider, tenantId);
    const degraded = this.healthService.isDegraded(provider);

    const transformedPayload = metaToWhapi(payload as MetaWebhookPayload);
    if (!transformedPayload) {
      this.healthService.record(provider, true, Date.now() - startedAt);
      this.metricsService.recordLatency(provider, Date.now() - startedAt);
      return { status: 'ignored' };
    }

    if (
      await this.whapiService.isReplayEvent(
        transformedPayload as WhapiWebhookPayload,
        'meta',
      )
    ) {
      this.metricsService.recordDuplicate(provider, tenantId);
      this.healthService.record(provider, true, Date.now() - startedAt);
      this.metricsService.recordLatency(provider, Date.now() - startedAt);
      return { status: 'duplicate_ignored' };
    }

    try {
      if (degraded) {
        const queued = this.enqueueDegradedWhapi(
          provider,
          'messages',
          transformedPayload as WhapiWebhookPayload,
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

      await this.whapiService.handleIncomingMessage(
        transformedPayload as WhapiWebhookPayload,
      );
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
  ): void {
    const isProd = process.env.NODE_ENV === 'production';
    const configuredHeader =
      process.env.WHAPI_WEBHOOK_SECRET_HEADER?.trim().toLowerCase();
    const configuredValue = process.env.WHAPI_WEBHOOK_SECRET_VALUE?.trim();
    const legacySecret = process.env.WEBHOOK_WHAPI_SECRET?.trim();

    if (isProd && !configuredHeader && !configuredValue && !legacySecret) {
      this.metricsService.recordSignatureInvalid('whapi');
      throw new UnauthorizedException('Webhook secret not configured');
    }

    // New mode: explicit configurable header + value (preferred).
    if (configuredHeader && configuredValue) {
      const provided = this.headerValue(headers[configuredHeader])?.trim();
      if (!provided || provided !== configuredValue) {
        this.metricsService.recordSignatureInvalid('whapi');
        throw new UnauthorizedException('Invalid webhook secret header');
      }
      return;
    }

    // Legacy compatibility mode.
    if (!legacySecret) return;

    const secretHeader = this.headerValue(headers['x-whapi-secret']);
    const fallbackHeader = this.headerValue(headers['x-webhook-secret']);
    const authHeader = this.headerValue(headers.authorization);
    const bearerSecret = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : null;

    const provided = secretHeader || fallbackHeader || bearerSecret;
    if (!provided || provided !== legacySecret) {
      this.metricsService.recordSignatureInvalid('whapi');
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }

  private assertMetaSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    payload: unknown,
  ): void {
    const isProd = process.env.NODE_ENV === 'production';
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      if (isProd) {
        this.metricsService.recordSignatureInvalid('meta');
        throw new UnauthorizedException(
          'Webhook signature secret not configured',
        );
      }
      return;
    }

    if (!rawBody && isProd) {
      this.metricsService.recordSignatureInvalid('meta');
      throw new HttpException('Missing rawBody', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const signatureHeader = this.headerValue(headers['x-hub-signature-256']);
    if (!signatureHeader?.startsWith('sha256=')) {
      this.metricsService.recordSignatureInvalid('meta');
      throw new UnauthorizedException('Missing signature');
    }

    const payloadBuffer = rawBody ?? Buffer.from(JSON.stringify(payload));
    const digest = createHmac('sha256', appSecret)
      .update(payloadBuffer)
      .digest('hex');
    const expected = `sha256=${digest}`;

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(signatureHeader);
    const isValid =
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer);

    if (!isValid) {
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
  ): boolean {
    const handler = async () => {
      switch (eventType) {
        case 'messages':
          await this.whapiService.handleIncomingMessage(payload);
          break;
        case 'statuses':
          await this.whapiService.updateStatusMessage(payload);
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

  private async resolveTenantOrReject(
    provider: 'whapi' | 'meta',
    externalId?: string,
  ): Promise<string> {
    if (!externalId) {
      this.metricsService.recordTenantResolutionFailed(provider);
      throw new HttpException('Missing channel mapping', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const tenantId = await this.whapiService.resolveTenantByProviderExternalId(
      provider,
      externalId,
    );
    if (!tenantId) {
      this.metricsService.recordTenantResolutionFailed(provider);
      throw new HttpException('Unknown channel mapping', HttpStatus.UNPROCESSABLE_ENTITY);
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
      const channel = await this.whapiService.findChannelByExternalId(
        phoneNumberId,
      );
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
}
