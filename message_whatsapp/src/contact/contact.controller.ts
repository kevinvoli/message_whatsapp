import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ContactService } from './contact.service';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateContactDto } from './dto/create-contact.dto'; // Added import
import { UpdateContactCallDto } from './dto/update-contact-call.dto';
import { AdminGuard } from '../auth/admin.guard'; // Added import
import { AuthGuard } from '@nestjs/passport';
import { WhatsappMessageGateway } from 'src/whatsapp_message/whatsapp_message.gateway';

@Controller('contact')
export class ContactController {
  constructor(
    private readonly service: ContactService,
    private readonly gateway: WhatsappMessageGateway,
  ) {}

  @Post()
  @UseGuards(AdminGuard)
  async create(@Body() dto: CreateContactDto) {
    const contact = await this.service.create(dto);
    await this.gateway.emitContactUpsert(contact);
    return contact;
  }

  @Get()
  @UseGuards(AdminGuard)
  findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findAll(
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    const contact = await this.service.update(id, dto);
    await this.gateway.emitContactUpsert(contact);
    return contact;
  }

  @Patch(':id/call-status')
  @UseGuards(AuthGuard('jwt'))
  async updateCallStatus(
    @Param('id') id: string,
    @Body() dto: UpdateContactCallDto,
    @Request() req: { user: { userId: string } },
  ) {
    const { contact, callLog } = await this.service.updateCallStatus(
      id,
      dto,
      req.user.userId,
    );
    await this.gateway.emitContactCallStatusUpdated(contact);
    await this.gateway.emitCallLogNew(contact, callLog);
    return contact;
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  async remove(@Param('id') id: string) {
    const contact = await this.service.remove(id);
    await this.gateway.emitContactRemoved(contact);
    return contact;
  }
}
