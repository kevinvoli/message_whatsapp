import { createHash, randomBytes } from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import { CampaignLink } from './entities/campaign-link.entity';
import { CampaignLinkClick } from './entities/campaign-link-click.entity';
import { WhapiChannel } from 'src/channel/entities/channel.entity';
import { WhatsappChat } from 'src/whatsapp_chat/entities/whatsapp_chat.entity';
import { CreateCampaignLinkDto } from './dto/create-campaign-link.dto';
import { UpdateCampaignLinkDto } from './dto/update-campaign-link.dto';

@Injectable()
export class CampaignLinkService {
  private readonly logger = new Logger(CampaignLinkService.name);

  constructor(
    @InjectRepository(CampaignLink)
    private readonly linkRepository: Repository<CampaignLink>,
    @InjectRepository(CampaignLinkClick)
    private readonly clickRepository: Repository<CampaignLinkClick>,
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    @InjectRepository(WhatsappChat)
    private readonly chatRepository: Repository<WhatsappChat>,
  ) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async generateShortCode(): Promise<string> {
    const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const LENGTH = 8;
    const MAX_ATTEMPTS = 5;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const bytes = randomBytes(LENGTH);
      let code = '';
      for (let i = 0; i < LENGTH; i++) {
        code += CHARS[bytes[i] % CHARS.length];
      }
      const existing = await this.linkRepository.findOne({
        where: { shortCode: code },
      });
      if (!existing) {
        return code;
      }
    }
    throw new Error('Impossible de générer un short code unique après 5 tentatives');
  }

  private buildUrls(
    phone: string,
    message: string,
    code: string,
  ): { directUrl: string; trackedUrl: string } {
    const digits = phone.replace(/\D/g, '');
    const directUrl = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
    const trackedUrl = `${process.env.APP_URL ?? ''}/api/campaign/t/${code}`;
    return { directUrl, trackedUrl };
  }

  private async resolvePhone(channel: WhapiChannel): Promise<string | null> {
    if (channel.phone_number) {
      return channel.phone_number;
    }
    if (channel.provider === 'whapi' && channel.channel_id) {
      return channel.channel_id.split('@')[0];
    }
    if (
      channel.provider &&
      ['meta', 'messenger', 'instagram'].includes(channel.provider) &&
      channel.channel_id &&
      channel.token
    ) {
      const phone = await this.fetchMetaPhoneNumber(channel.channel_id, channel.token);
      if (phone) {
        await this.channelRepository.update(channel.id, { phone_number: phone });
        channel.phone_number = phone;
        return phone;
      }
    }
    return null;
  }

  private async fetchMetaPhoneNumber(phoneNumberId: string, token: string): Promise<string | null> {
    try {
      const url = `https://graph.facebook.com/v18.0/${phoneNumberId}?fields=display_phone_number&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Meta API error ${res.status} pour phone_number_id=${phoneNumberId}`);
        return null;
      }
      const data = (await res.json()) as { display_phone_number?: string };
      if (!data.display_phone_number) return null;
      return data.display_phone_number.replace(/\D/g, '');
    } catch (err: unknown) {
      this.logger.warn(`Impossible de récupérer le numéro Meta : ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private detectDevice(userAgent: string | null): string | null {
    if (!userAgent) return null;
    const ua = userAgent.toLowerCase();
    if (/mobile|android|iphone|ipod/.test(ua)) return 'mobile';
    if (/tablet|ipad/.test(ua)) return 'tablet';
    if (/windows|macintosh|linux/.test(ua)) return 'desktop';
    return 'other';
  }

  private normalize(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async create(dto: CreateCampaignLinkDto): Promise<CampaignLink> {
    const channel = await this.channelRepository.findOne({
      where: { id: dto.channel_id },
    });
    if (!channel) {
      throw new NotFoundException(`Canal introuvable : ${dto.channel_id}`);
    }

    const phone = await this.resolvePhone(channel);
    if (!phone) {
      throw new NotFoundException(`Numéro de téléphone introuvable pour le canal ${dto.channel_id}. Renseignez le champ "Numéro de téléphone" dans la configuration du canal.`);
    }

    const shortCode = await this.generateShortCode();
    const { directUrl, trackedUrl } = this.buildUrls(phone, dto.predefined_message, shortCode);

    const link = this.linkRepository.create({
      name: dto.name,
      channelId: channel.channel_id,
      channel,
      predefinedMessage: dto.predefined_message,
      shortCode,
      directUrl,
      trackedUrl,
      isActive: dto.is_active ?? true,
    });

    return this.linkRepository.save(link);
  }

  async findAll(): Promise<CampaignLink[]> {
    return this.linkRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<CampaignLink> {
    const link = await this.linkRepository.findOne({ where: { id } });
    if (!link) {
      throw new NotFoundException(`Lien campagne introuvable : ${id}`);
    }
    return link;
  }

  async update(id: string, dto: UpdateCampaignLinkDto): Promise<CampaignLink> {
    const link = await this.findOne(id);

    const messageChanged = dto.predefined_message !== undefined && dto.predefined_message !== link.predefinedMessage;
    const channelChanged = dto.channel_id !== undefined && dto.channel_id !== link.channelId;

    if (dto.name !== undefined) link.name = dto.name;
    if (dto.is_active !== undefined) link.isActive = dto.is_active;

    if (channelChanged && dto.channel_id) {
      const channel = await this.channelRepository.findOne({
        where: { id: dto.channel_id },
      });
      if (!channel) {
        throw new NotFoundException(`Canal introuvable : ${dto.channel_id}`);
      }
      link.channelId = channel.channel_id;
      link.channel = channel;
    }

    if (messageChanged && dto.predefined_message !== undefined) {
      link.predefinedMessage = dto.predefined_message;
    }

    if (messageChanged || channelChanged) {
      const channel = link.channel ?? (await this.channelRepository.findOne({ where: { channel_id: link.channelId } }));
      const phone = channel ? await this.resolvePhone(channel) : null;
      if (phone) {
        const { directUrl, trackedUrl } = this.buildUrls(phone, link.predefinedMessage, link.shortCode);
        link.directUrl = directUrl;
        link.trackedUrl = trackedUrl;
      }
    }

    return this.linkRepository.save(link);
  }

  async remove(id: string): Promise<void> {
    const link = await this.findOne(id);
    await this.linkRepository.remove(link);
  }

  // ─── Tracking ────────────────────────────────────────────────────────────────

  async track(shortCode: string, rawIp: string, userAgent: string | null): Promise<string> {
    const link = await this.linkRepository.findOne({ where: { shortCode } });
    if (!link || !link.isActive) {
      throw new NotFoundException(`Lien campagne introuvable ou inactif : ${shortCode}`);
    }

    const ipHash = createHash('sha256')
      .update(rawIp + (process.env.IP_SALT ?? ''))
      .digest('hex');

    const deviceType = this.detectDevice(userAgent);

    void Promise.resolve()
      .then(async () => {
        const click = this.clickRepository.create({
          campaignLinkId: link.id,
          ipHash,
          userAgent,
          deviceType,
          converted: false,
        });
        await this.clickRepository.save(click);
      })
      .catch((err: Error) => {
        this.logger.error(`Erreur lors de la sauvegarde du click : ${err.message}`);
      });

    await this.linkRepository
      .createQueryBuilder()
      .update(CampaignLink)
      .set({ clickCount: () => 'click_count + 1' })
      .where('id = :id', { id: link.id })
      .execute();

    return link.directUrl;
  }

  // ─── Attribution ─────────────────────────────────────────────────────────────

  async tryAttribute(messageText: string, chatId: string): Promise<void> {
    const normalizedText = this.normalize(messageText);

    const links = await this.linkRepository.find({ where: { isActive: true } });
    const matchedLink = links.find(
      (l) => this.normalize(l.predefinedMessage) === normalizedText,
    );

    if (!matchedLink) return;

    const updateResult = await this.chatRepository
      .createQueryBuilder()
      .update(WhatsappChat)
      .set({ campaignLinkId: matchedLink.id })
      .where('chat_id = :chatId AND campaign_link_id IS NULL', { chatId })
      .execute();

    if (!updateResult.affected || updateResult.affected === 0) {
      return;
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentClick = await this.clickRepository.findOne({
      where: {
        campaignLinkId: matchedLink.id,
        converted: false,
        clickedAt: Between(since24h, new Date()),
        chatId: IsNull(),
      },
      order: { clickedAt: 'DESC' },
    });

    if (recentClick) {
      await this.clickRepository
        .createQueryBuilder()
        .update(CampaignLinkClick)
        .set({ converted: true, convertedAt: () => 'NOW()', chatId })
        .where('id = :id', { id: recentClick.id })
        .execute();

      await this.linkRepository
        .createQueryBuilder()
        .update(CampaignLink)
        .set({ conversionCount: () => 'conversion_count + 1' })
        .where('id = :id', { id: matchedLink.id })
        .execute();
    }
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  async getStats(
    linkId: string,
    from: Date,
    to: Date,
  ): Promise<{
    total_clicks: number;
    total_conversions: number;
    conversion_rate: number;
    unique_clicks: number;
    clicks_by_day: { date: string; clicks: number; conversions: number }[];
    clicks_by_device: { device_type: string; count: number }[];
  }> {
    const link = await this.findOne(linkId);

    const uniqueResult = await this.clickRepository
      .createQueryBuilder('click')
      .select('COUNT(DISTINCT click.ipHash)', 'unique_clicks')
      .where('click.campaignLinkId = :linkId', { linkId })
      .andWhere('click.clickedAt BETWEEN :from AND :to', { from, to })
      .getRawOne<{ unique_clicks: string }>();

    const uniqueClicks = parseInt(uniqueResult?.unique_clicks ?? '0', 10);

    const byDayRaw = await this.clickRepository
      .createQueryBuilder('click')
      .select("DATE_FORMAT(click.clickedAt, '%Y-%m-%d')", 'date')
      .addSelect('COUNT(*)', 'clicks')
      .addSelect('SUM(CASE WHEN click.converted = 1 THEN 1 ELSE 0 END)', 'conversions')
      .where('click.campaignLinkId = :linkId', { linkId })
      .andWhere('click.clickedAt BETWEEN :from AND :to', { from, to })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany<{ date: string; clicks: string; conversions: string }>();

    const clicksByDay = byDayRaw.map((row) => ({
      date: row.date,
      clicks: parseInt(row.clicks, 10),
      conversions: parseInt(row.conversions, 10),
    }));

    const byDeviceRaw = await this.clickRepository
      .createQueryBuilder('click')
      .select('click.deviceType', 'device_type')
      .addSelect('COUNT(*)', 'count')
      .where('click.campaignLinkId = :linkId', { linkId })
      .andWhere('click.clickedAt BETWEEN :from AND :to', { from, to })
      .groupBy('click.deviceType')
      .getRawMany<{ device_type: string; count: string }>();

    const clicksByDevice = byDeviceRaw.map((row) => ({
      device_type: row.device_type ?? 'unknown',
      count: parseInt(row.count, 10),
    }));

    const conversionRate =
      link.clickCount > 0
        ? Math.round((link.conversionCount / link.clickCount) * 100 * 100) / 100
        : 0;

    return {
      total_clicks: link.clickCount,
      total_conversions: link.conversionCount,
      conversion_rate: conversionRate,
      unique_clicks: uniqueClicks,
      clicks_by_day: clicksByDay,
      clicks_by_device: clicksByDevice,
    };
  }

  async getClickHistory(
    linkId: string,
    page: number,
  ): Promise<CampaignLinkClick[]> {
    const pageNum = page < 1 ? 1 : page;
    return this.clickRepository.find({
      where: { campaignLinkId: linkId },
      order: { clickedAt: 'DESC' },
      take: 20,
      skip: (pageNum - 1) * 20,
    });
  }
}
