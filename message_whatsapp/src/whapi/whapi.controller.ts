import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { WhapiService } from './whapi.service';
import { WhapiWebhookPayload } from './interface/whapi-webhook.interface';
import { MetaWebhookPayload } from './interface/whatsapp-whebhook.interface';
import { metaToWhapi } from './utile/meta-to-whapi.service';

@Controller('webhooks')
export class WhapiController {
  constructor(private readonly whapiService: WhapiService) {}

  @Post('whapi')
  async handleWebhook(@Body() payload: WhapiWebhookPayload) {
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
  async handleWebhooks(@Body() payload: unknown) {
    const transformedPayload = metaToWhapi(payload as MetaWebhookPayload);
    if (!transformedPayload) {
      return { status: 'ignored' };
    }

    await this.whapiService.handleIncomingMessage(
      transformedPayload as WhapiWebhookPayload,
    );

    return { status: 'EVENT_RECEIVED' };
  }
}
