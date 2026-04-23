import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GicopPlatformService } from './gicop-platform.service';

@ApiTags('GICOP Platform')
@Controller('gicop-platform')
export class GicopPlatformController {
  constructor(private readonly service: GicopPlatformService) {}

  /**
   * Envoie un numéro vers la plateforme GICOP (test manuel depuis le front commercial).
   * POST /gicop-platform/send
   */
  @Post('send')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Test — envoyer un numéro vers gicop.ci' })
  async send(
    @Body() body: { number: string; poste_id: number; type: string },
  ) {
    await this.service.sendNumberToCall({
      number:   body.number,
      poste_id: body.poste_id,
      type:     body.type,
    });
    return { ok: true, message: `Envoyé à gicop.ci — number=${body.number} poste_id=${body.poste_id} type=${body.type}` };
  }
}
