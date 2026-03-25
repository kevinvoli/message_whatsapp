import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookMetricsService } from './webhook-metrics.service';

/**
 * Logique de vérification HMAC des signatures webhook.
 *
 * Extrait du WhapiController (Phase B3) pour être testable isolément
 * et potentiellement réutilisable dans des Guards NestJS.
 */
@Injectable()
export class WebhookCryptoService {
  constructor(
    private readonly metricsService: WebhookMetricsService,
    private readonly configService: ConfigService,
  ) {}

  assertWhapiSecret(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    payload: unknown,
  ): void {
    if (
      this.configService.get<string>('WHAPI_WEBHOOK_SKIP_SIGNATURE') === 'true'
    ) {
      return;
    }

    const isProd =
      this.configService.get<string>('NODE_ENV') === 'production';
    const configuredHeader = this.configService
      .get<string>('WHAPI_WEBHOOK_SECRET_HEADER')
      ?.trim()
      .toLowerCase();
    const configuredValue = this.configService
      .get<string>('WHAPI_WEBHOOK_SECRET_VALUE')
      ?.trim();
    const configuredPrevious = this.configService
      .get<string>('WHAPI_WEBHOOK_SECRET_VALUE_PREVIOUS')
      ?.trim();

    if (isProd && (!configuredHeader || !configuredValue)) {
      this.metricsService.recordSignatureInvalid('whapi');
      throw new UnauthorizedException('Webhook secret not configured');
    }

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

  assertMetaSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    payload: unknown,
    channelSecret?: string | null,
  ): void {
    this.assertHubSignature('meta', headers, rawBody, payload, channelSecret);
  }

  assertInstagramSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    payload: unknown,
    channelSecret?: string | null,
  ): void {
    this.assertHubSignature(
      'instagram',
      headers,
      rawBody,
      payload,
      channelSecret,
    );
  }

  assertMessengerSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    payload: unknown,
    channelSecret?: string | null,
  ): void {
    this.assertHubSignature(
      'messenger',
      headers,
      rawBody,
      payload,
      channelSecret,
    );
  }

  // ── Shared HMAC logic ─────────────────────────────────────────────────────

  private assertHubSignature(
    provider: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    payload: unknown,
    channelSecret?: string | null,
  ): void {
    const isProd =
      this.configService.get<string>('NODE_ENV') === 'production';

    const secrets: string[] = [];
    if (channelSecret) secrets.push(channelSecret.trim());

    if (secrets.length === 0) {
      if (isProd) {
        this.metricsService.recordSignatureInvalid(provider);
        throw new UnauthorizedException(
          `${provider} webhook signature secret not configured`,
        );
      }
      return;
    }

    const signatureHeader = this.headerValue(
      headers['x-hub-signature-256'],
    )?.trim();
    if (!signatureHeader) {
      this.metricsService.recordSignatureInvalid(provider);
      throw new UnauthorizedException(`Missing ${provider} signature`);
    }

    const valid = this.verifyHmacSignature(
      provider,
      secrets,
      rawBody,
      payload,
      signatureHeader,
      isProd,
    );

    if (!valid) {
      this.metricsService.recordSignatureInvalid(provider);
      throw new ForbiddenException(`Invalid ${provider} webhook signature`);
    }
  }

  verifyHmacSignature(
    provider: string,
    secrets: string[],
    rawBody: Buffer | undefined,
    payload: unknown,
    provided: string,
    requireRawBody: boolean,
  ): boolean {
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
        if (
          expectedBuffer.length === receivedBuffer.length &&
          timingSafeEqual(expectedBuffer, receivedBuffer)
        ) {
          return true;
        }
      }
    }
    return false;
  }

  headerValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
}
