import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InboundIntegrationService, InboundErpPayload } from './inbound-integration.service';

/**
 * Webhook entrant depuis l'ERP/plateforme externe.
 * Sécurisé par header `x-integration-secret` (clé partagée configurée dans SystemConfig / env).
 */
@Controller('integration')
export class InboundIntegrationController {
  private readonly logger = new Logger(InboundIntegrationController.name);

  constructor(
    private readonly service: InboundIntegrationService,
    private readonly config: ConfigService,
  ) {}

  @Post('erp')
  @HttpCode(200)
  async handleErpWebhook(
    @Headers('x-integration-secret') secret: string | undefined,
    @Body() body: InboundErpPayload & { event?: string },
  ) {
    const expectedSecret = this.config.get<string>('INTEGRATION_SECRET');
    if (expectedSecret && secret !== expectedSecret) {
      throw new UnauthorizedException('Invalid integration secret');
    }

    if (!body?.event) {
      throw new BadRequestException('Missing event field');
    }

    try {
      return await this.service.handleErpEvent(body);
    } catch (err) {
      this.logger.error(`ERP webhook error: ${(err as Error).message}`);
      throw err;
    }
  }
}
