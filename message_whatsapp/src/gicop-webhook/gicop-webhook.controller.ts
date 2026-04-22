import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { GicopWebhookService } from './gicop-webhook.service';
import { GicopWebhookPayload } from './dto/gicop-webhook.dto';

/**
 * Webhook unifié GICOP — commandes ERP + notifications d'appels.
 *
 * GET  /webhooks/gicop  → vérification (hub.mode / hub.verify_token / hub.challenge)
 * POST /webhooks/gicop  → réception des événements (x-integration-secret)
 *
 * Format payload : modèle Whapi
 * {
 *   "channel_id": "gicop",
 *   "event": { "type": "messages", "event": "added" },
 *   "messages": [
 *     {
 *       "id": "EVT-001",
 *       "type": "order_created" | "call_event" | ...,
 *       "from": "2250700000000",
 *       "timestamp": 1745596800,
 *       "data": { ... }
 *     }
 *   ]
 * }
 */
@ApiTags('GICOP Webhook')
@SkipThrottle()
@Controller('webhooks')
export class GicopWebhookController {
  private readonly logger = new Logger(GicopWebhookController.name);

  constructor(
    private readonly service: GicopWebhookService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Vérification du webhook (challenge-response, même protocole que Meta/WhatsApp).
   * La plateforme externe appelle cette URL pour enregistrer le webhook.
   */
  @Get('gicop')
  @ApiOperation({ summary: 'Vérification webhook GICOP (hub challenge)' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    if (mode !== 'subscribe') {
      throw new ForbiddenException('hub.mode must be "subscribe"');
    }

    const expectedToken =
      this.config.get<string>('GICOP_WEBHOOK_VERIFY_TOKEN') ??
      this.config.get<string>('INTEGRATION_SECRET');

    if (!expectedToken || token !== expectedToken) {
      this.logger.warn(`GICOP verify_token invalide — token reçu: ${token}`);
      throw new ForbiddenException('Invalid verify_token');
    }

    this.logger.log('GICOP webhook vérifié avec succès');
    return challenge;
  }

  /**
   * Réception des événements GICOP (commandes + appels).
   * Sécurisé par le header x-integration-secret.
   */
  @Post('gicop')
  @HttpCode(200)
  @ApiOperation({ summary: 'Réception événements GICOP (commandes + appels)' })
  async receiveEvents(
    @Headers('x-integration-secret') secret: string | undefined,
    @Body() payload: GicopWebhookPayload,
  ) {
    const expectedSecret = this.config.get<string>('INTEGRATION_SECRET');
    if (expectedSecret && secret !== expectedSecret) {
      this.logger.warn(`GICOP x-integration-secret invalide`);
      throw new ForbiddenException('Invalid integration secret');
    }

    if (!payload?.messages || !Array.isArray(payload.messages)) {
      throw new BadRequestException('Le champ "messages" est requis et doit être un tableau');
    }

    if (payload.messages.length === 0) {
      return { ok: true, processed: 0, results: [] };
    }

    this.logger.log(
      `GICOP webhook reçu — channel_id=${payload.channel_id ?? 'n/a'} messages=${payload.messages.length}`,
    );

    const results = await this.service.processMessages(payload.messages);
    const processed = results.filter((r) => r.processed).length;

    return { ok: true, processed, total: results.length, results };
  }
}
