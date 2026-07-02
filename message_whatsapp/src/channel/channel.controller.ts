import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ChannelService } from './channel.service';
import { MetaTokenService } from './meta-token.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { AssignPosteDto } from './dto/assign-poste.dto';
import { AdminGuard } from '../auth/admin.guard'; // Import AdminGuard
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { AuditLog } from '../admin-audit/audit-log.decorator';

@Controller('channel')
@UseGuards(AdminGuard) // Use AdminGuard
export class ChannelController {
  private readonly logger = new Logger(ChannelController.name);

  constructor(
    private readonly communicationWhapiService: ChannelService,
    private readonly metaTokenService: MetaTokenService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Post()
  create(@Body() createCommunicationWhapiDto: CreateChannelDto) {
    return this.communicationWhapiService.create(createCommunicationWhapiDto);
  }

  @Get()
  async findAll() {
    const channels = await this.communicationWhapiService.findAll();
    return channels.map(c => this.communicationWhapiService.sanitizeChannel(c));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const channel = await this.communicationWhapiService.findOne(id);
    return channel ? this.communicationWhapiService.sanitizeChannel(channel) : null;
  }

  @Patch(':id')
  @AuditLog({
    action: 'UPDATE_CHANNEL',
    targetEntity: 'WhapiChannel',
    targetIdExtractor: (args) => (typeof args[0] === 'string' ? args[0] : null),
  })
  update(
    @Param('id') id: string,
    @Body() updateCommunicationWhapiDto: UpdateChannelDto,
    @Req() _req: { user: { userId: string } },
  ) {
    return this.communicationWhapiService.update(
      id,
      updateCommunicationWhapiDto,
    );
  }

  @Delete(':id')
  @AuditLog({
    action: 'DELETE_CHANNEL',
    targetEntity: 'WhapiChannel',
    targetIdExtractor: (args) => (typeof args[0] === 'string' ? args[0] : null),
  })
  remove(
    @Param('id') id: string,
    @Req() _req: { user: { userId: string } },
  ) {
    return this.communicationWhapiService.remove(id);
  }

  @Patch(':id/assign-poste')
  assignPoste(
    @Param('id') channelId: string,
    @Body() dto: AssignPosteDto,
  ) {
    return this.communicationWhapiService.assignPoste(channelId, dto.poste_id ?? null);
  }

  @Post(':id/refresh-token')
  async refreshToken(@Param('id') id: string) {
    try {
      return await this.metaTokenService.refreshChannelToken(id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`refresh-token failed for channel ${id}: ${message}`);
      throw new BadRequestException(message);
    }
  }
}
