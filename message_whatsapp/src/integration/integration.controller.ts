import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from 'src/auth/admin.guard';
import { IntegrationService } from './integration.service';

@Controller('integration/mappings')
@UseGuards(AdminGuard)
export class IntegrationController {
  constructor(private readonly service: IntegrationService) {}

  // ─── Client mappings ──────────────────────────────────────────────────────

  @Get('clients')
  getClientMappings() {
    return this.service.findAllClientMappings();
  }

  @Post('clients')
  upsertClientMapping(
    @Body() body: { contact_id: string; external_id: number; phone?: string },
  ) {
    return this.service.upsertClientMapping(body.contact_id, body.external_id, body.phone);
  }

  @Put('clients/:id')
  updateClientMapping(
    @Param('id') id: string,
    @Body() body: { contact_id: string; external_id: number; phone?: string },
  ) {
    return this.service.upsertClientMapping(body.contact_id, body.external_id, body.phone);
  }

  @Delete('clients/:id')
  deleteClientMapping(@Param('id') id: string) {
    return this.service.deleteClientMapping(id);
  }

  // ─── Commercial mappings ──────────────────────────────────────────────────

  @Get('commercials')
  getCommercialMappings() {
    return this.service.findAllCommercialMappings();
  }

  @Post('commercials')
  upsertCommercialMapping(
    @Body() body: { commercial_id: string; external_id: number; name?: string },
  ) {
    return this.service.upsertCommercialMapping(body.commercial_id, body.external_id, body.name);
  }

  @Delete('commercials/:id')
  deleteCommercialMapping(@Param('id') id: string) {
    return this.service.deleteCommercialMapping(id);
  }
}
