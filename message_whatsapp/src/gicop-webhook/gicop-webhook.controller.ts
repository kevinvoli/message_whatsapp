import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
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

  constructor(private readonly service: GicopWebhookService) {}

  /**
   * Vérification du webhook (challenge-response, même protocole que Meta/WhatsApp).
   * TODO (post-dev) : valider hub.verify_token contre GICOP_WEBHOOK_VERIFY_TOKEN.
   */
  @Get('gicop')
  @ApiOperation({ summary: 'Vérification webhook GICOP (hub challenge)' })
  verifyWebhook(
    @Query() query: Record<string, string>,
    @Headers() headers: Record<string, string>,
  ): string {
    this.logger.log('[GICOP][GET] ── Appel de vérification ──────────────────────');
    this.logger.log(`[GICOP][GET] Headers  : ${JSON.stringify(headers)}`);
    this.logger.log(`[GICOP][GET] Query    : ${JSON.stringify(query)}`);

    const challenge = query['hub.challenge'];
    this.logger.log(`[GICOP][GET] Challenge retourné : ${challenge ?? '(vide)'}`);
    return challenge ?? 'ok';
  }

  /**
   * Réception des événements GICOP (commandes + appels).
   * TODO (post-dev) : sécuriser via x-integration-secret.
   */
  @Post('gicop')
  @HttpCode(200)
  @ApiOperation({ summary: 'Réception événements GICOP (commandes + appels)' })
  async receiveEvents(
    @Headers() headers: Record<string, string>,
    @Body() payload: unknown,
  ) {
    this.logger.log('[GICOP][POST] ── Webhook entrant ──────────────────────────');
    this.logger.log(`[GICOP][POST] Headers : ${JSON.stringify(headers)}`);
    this.logger.log(`[GICOP][POST] Body    : ${JSON.stringify(payload, null, 2)}`);

    // Payload vide ou non-objet — log et retourner 200 sans crash
    if (!payload || typeof payload !== 'object') {
      this.logger.warn('[GICOP][POST] Body vide ou non-JSON — ignoré');
      return { ok: true, processed: 0, note: 'empty_body' };
    }

    const typed = payload as Partial<GicopWebhookPayload>;

    // Pas encore le bon format — on log et on retourne quand même 200
    if (!typed.messages || !Array.isArray(typed.messages)) {
      this.logger.warn(
        `[GICOP][POST] Format inattendu — pas de champ "messages". Structure reçue : ${JSON.stringify(Object.keys(typed))}`,
      );
      return { ok: true, processed: 0, note: 'unexpected_format', received_keys: Object.keys(typed) };
    }

    if (typed.messages.length === 0) {
      this.logger.log('[GICOP][POST] messages[] vide — rien à traiter');
      return { ok: true, processed: 0, results: [] };
    }

    this.logger.log(
      `[GICOP][POST] ${typed.messages.length} message(s) à traiter — types : [${typed.messages.map((m) => m.type).join(', ')}]`,
    );

    const results = await this.service.processMessages(typed.messages);
    const processed = results.filter((r) => r.processed).length;

    this.logger.log(
      `[GICOP][POST] Résultats : ${processed}/${results.length} traités — ${JSON.stringify(results)}`,
    );

    return { ok: true, processed, total: results.length, results };
  }
}
