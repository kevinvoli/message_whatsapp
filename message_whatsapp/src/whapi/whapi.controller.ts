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
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { WhapiService } from './whapi.service';
import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { MetaWebhookPayload } from './interface/whatsapp-whebhook.interface';
import { metaToWhapi } from './utile/meta-to-whapi.service';

@Controller('webhooks')
export class WhapiController {
  constructor(private readonly whapiService: WhapiService) {}

  @Post('whapi')
  async handleWebhook(
    @Body() payload: WhapiWebhookPayload,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    this.assertWhapiSecret(headers);
    if (await this.whapiService.isReplayEvent(payload, 'whapi')) {
      return { status: 'duplicate_ignored' };
    }

    const eventType = payload?.event?.type;

    try {
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
      const message =
        err instanceof Error ? err.message : 'Webhook processing failed';
      throw new HttpException(
        {
          status: 'error',
          message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

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
    this.assertMetaSignature(headers, request.rawBody, payload);

    const transformedPayload = metaToWhapi(payload as MetaWebhookPayload);
    if (!transformedPayload) {
      return { status: 'ignored' };
    }

    if (
      await this.whapiService.isReplayEvent(
        transformedPayload as WhapiWebhookPayload,
        'meta',
      )
    ) {
      return { status: 'duplicate_ignored' };
    }

    await this.whapiService.handleIncomingMessage(
      transformedPayload as WhapiWebhookPayload,
    );

    return { status: 'EVENT_RECEIVED' };
  }

  private assertWhapiSecret(
    headers: Record<string, string | string[] | undefined>,
  ): void {
    const expectedSecret = process.env.WEBHOOK_WHAPI_SECRET;
    if (!expectedSecret) {
      return;
    }

    const secretHeader = this.headerValue(headers['x-whapi-secret']);
    const fallbackHeader = this.headerValue(headers['x-webhook-secret']);
    const authHeader = this.headerValue(headers.authorization);
    const bearerSecret = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : null;

    const provided = secretHeader || fallbackHeader || bearerSecret;
    if (!provided || provided !== expectedSecret) {
      throw new ForbiddenException('Invalid webhook secret');
    }
  }

  private assertMetaSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    payload: unknown,
  ): void {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      return;
    }

    const signatureHeader = this.headerValue(headers['x-hub-signature-256']);
    if (!signatureHeader?.startsWith('sha256=')) {
      throw new ForbiddenException('Missing signature');
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
}
