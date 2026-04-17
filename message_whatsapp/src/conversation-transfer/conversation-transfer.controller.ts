import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ConversationTransferService } from './conversation-transfer.service';
import { TransferConversationDto } from './dto/transfer-conversation.dto';
import { OutboundConversationService } from './outbound-conversation.service';
import { AdminGuard } from 'src/auth/admin.guard';
import { AuthGuard } from '@nestjs/passport';

/**
 * POST /conversations/:chat_id/transfer  (JWT agent)
 * GET  /conversations/:chat_id/transfer/targets  (JWT agent)
 * POST /admin/conversations/:chat_id/transfer  (AdminGuard)
 * POST /conversations/outbound  (JWT agent) — démarre une conversation outbound
 */

@Controller('conversations/:chat_id/transfer')
@UseGuards(AuthGuard('jwt'))
export class ConversationTransferController {
  constructor(private readonly service: ConversationTransferService) {}

  @Post()
  transfer(
    @Param('chat_id') chatId: string,
    @Body() dto: TransferConversationDto,
  ) {
    return this.service.transfer(chatId, dto.target_poste_id, dto.reason);
  }

  @Get('targets')
  listTargets(
    @Query('tenant_id') tenantId: string,
    @Query('exclude_poste_id') excludePosteId?: string,
  ) {
    return this.service.listPossibleTargets(tenantId, excludePosteId);
  }
}

@Controller('admin/conversations/:chat_id/transfer')
@UseGuards(AdminGuard)
export class ConversationTransferAdminController {
  constructor(private readonly service: ConversationTransferService) {}

  @Post()
  transfer(
    @Param('chat_id') chatId: string,
    @Body() dto: TransferConversationDto,
  ) {
    return this.service.transfer(chatId, dto.target_poste_id, dto.reason);
  }
}

@Controller('conversations/outbound')
@UseGuards(AuthGuard('jwt'))
export class OutboundConversationController {
  constructor(private readonly service: OutboundConversationService) {}

  @Post()
  create(
    @Body() body: { phone: string; text: string },
    @Request() req: any,
  ) {
    return this.service.create({
      phone: body.phone,
      text: body.text,
      agentPosteId: req.user?.posteId ?? null,
    });
  }
}
