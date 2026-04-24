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
    @Query('search') search?: string,
  ) {
    return this.service.findAll(
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
      search,
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

  // ─── P7 — Portefeuille ─────────────────────────────────────────────────────

  /** Mon portefeuille (commercial connecté) */
  @Get('portfolio/mine')
  @UseGuards(AuthGuard('jwt'))
  getMyPortfolio(
    @Request() req: { user: { userId: string } },
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findPortfolioByCommercial(
      req.user.userId,
      search,
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  /** Assigner un contact à un commercial (admin) */
  @Patch(':id/portfolio')
  @UseGuards(AdminGuard)
  async assignPortfolio(
    @Param('id') id: string,
    @Body('commercial_id') commercial_id: string,
  ) {
    const contact = await this.service.assignPortfolio(id, commercial_id);
    await this.gateway.emitContactUpsert(contact);
    return contact;
  }

  /** Désattribuer un contact de son commercial (admin) */
  @Patch(':id/portfolio/unassign')
  @UseGuards(AdminGuard)
  async unassignPortfolio(@Param('id') id: string) {
    const contact = await this.service.unassignPortfolio(id);
    await this.gateway.emitContactUpsert(contact);
    return contact;
  }

  /** Vue admin : portefeuille d'un commercial ou tous les contacts attribués */
  @Get('portfolio/admin')
  @UseGuards(AdminGuard)
  getPortfolioAdmin(
    @Query('commercial_id') commercial_id?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findPortfolioAdmin(
      commercial_id,
      search,
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  // ─── Menus métier ─────────────────────────────────────────────────────────────

  /** Prospects à relancer : jamais_commande + commande_sans_livraison */
  @Get('business/prospects')
  @UseGuards(AuthGuard('jwt'))
  getProspects(
    @Request() req: { user: { userId: string } },
    @Query('limit') limit?: string,
  ) {
    return this.service.findByCategory(
      req.user.userId,
      ['jamais_commande', 'commande_sans_livraison'],
      limit ? Math.min(parseInt(limit, 10), 100) : 50,
    );
  }

  /** Commandes annulées */
  @Get('business/annulee')
  @UseGuards(AuthGuard('jwt'))
  getAnnulee(
    @Request() req: { user: { userId: string } },
    @Query('limit') limit?: string,
  ) {
    return this.service.findByCategory(
      req.user.userId,
      ['commande_annulee'],
      limit ? Math.min(parseInt(limit, 10), 100) : 50,
    );
  }

  /** Anciennes clientes : inactives depuis X jours (défaut 60) */
  @Get('business/anciennes')
  @UseGuards(AuthGuard('jwt'))
  getAnciennes(
    @Request() req: { user: { userId: string } },
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findInactive(
      req.user.userId,
      days ? parseInt(days, 10) : 60,
      limit ? Math.min(parseInt(limit, 10), 100) : 50,
    );
  }
}
