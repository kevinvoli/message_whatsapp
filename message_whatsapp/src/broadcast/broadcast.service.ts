import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WhatsappBroadcast, BroadcastStatus } from './entities/broadcast.entity';
import {
  WhatsappBroadcastRecipient,
  RecipientStatus,
} from './entities/broadcast-recipient.entity';
import { CreateBroadcastDto, AddRecipientsDto } from './dto/create-broadcast.dto';

export const BROADCAST_QUEUE = 'broadcast-sending';

/** Taille d'un batch d'envoi */
const BATCH_SIZE = 50;

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    @InjectRepository(WhatsappBroadcast)
    private readonly broadcastRepo: Repository<WhatsappBroadcast>,

    @InjectRepository(WhatsappBroadcastRecipient)
    private readonly recipientRepo: Repository<WhatsappBroadcastRecipient>,

    @InjectQueue(BROADCAST_QUEUE)
    private readonly broadcastQueue: Queue,
  ) {}

  async create(dto: CreateBroadcastDto): Promise<WhatsappBroadcast> {
    const entity = this.broadcastRepo.create({
      ...dto,
      scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
      status: dto.scheduled_at ? BroadcastStatus.SCHEDULED : BroadcastStatus.DRAFT,
    });
    return this.broadcastRepo.save(entity);
  }

  async findAll(tenantId: string): Promise<WhatsappBroadcast[]> {
    return this.broadcastRepo.find({
      where: { tenant_id: tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId: string): Promise<WhatsappBroadcast> {
    const b = await this.broadcastRepo.findOne({ where: { id, tenant_id: tenantId } });
    if (!b) throw new NotFoundException(`Broadcast ${id} introuvable`);
    return b;
  }

  async addRecipients(
    broadcastId: string,
    tenantId: string,
    dto: AddRecipientsDto,
  ): Promise<{ added: number; duplicates: number }> {
    const broadcast = await this.findOne(broadcastId, tenantId);

    if (broadcast.status !== BroadcastStatus.DRAFT) {
      throw new BadRequestException('Les destinataires ne peuvent être ajoutés qu\'en statut DRAFT');
    }

    // Déduplication : E.164 normalisé
    const unique = new Map<string, AddRecipientsDto['recipients'][0]>();
    for (const r of dto.recipients) {
      const phone = this.normalizePhone(r.phone);
      if (phone) unique.set(phone, { ...r, phone });
    }

    const existing = await this.recipientRepo.find({ where: { broadcast_id: broadcastId } });
    const existingPhones = new Set(existing.map((r) => r.phone));

    const toInsert = [...unique.values()].filter((r) => !existingPhones.has(r.phone));
    const duplicates = unique.size - toInsert.length;

    if (toInsert.length > 0) {
      const entities = toInsert.map((r) =>
        this.recipientRepo.create({
          broadcast_id: broadcastId,
          phone: r.phone,
          variables: r.variables ?? null,
          status: RecipientStatus.PENDING,
        }),
      );
      await this.recipientRepo.save(entities);
    }

    // Mettre à jour le total
    const total = existing.length + toInsert.length;
    await this.broadcastRepo.update(broadcastId, { total_count: total });

    return { added: toInsert.length, duplicates };
  }

  async launch(id: string, tenantId: string): Promise<WhatsappBroadcast> {
    const broadcast = await this.findOne(id, tenantId);

    if (
      broadcast.status !== BroadcastStatus.DRAFT &&
      broadcast.status !== BroadcastStatus.SCHEDULED &&
      broadcast.status !== BroadcastStatus.PAUSED
    ) {
      throw new BadRequestException(
        `Impossible de lancer un broadcast en statut ${broadcast.status}`,
      );
    }

    await this.broadcastRepo.update(id, {
      status: BroadcastStatus.RUNNING,
      started_at: new Date(),
    });

    // Enqueue les jobs d'envoi par batch
    await this.enqueueBatches(id, tenantId, broadcast.channel_id, broadcast.template_id);

    this.logger.log(`Broadcast ${id} lancé — tenant=${tenantId}`);
    return this.findOne(id, tenantId);
  }

  async pause(id: string, tenantId: string): Promise<void> {
    const broadcast = await this.findOne(id, tenantId);
    if (broadcast.status !== BroadcastStatus.RUNNING) {
      throw new BadRequestException('Seul un broadcast RUNNING peut être mis en pause');
    }
    await this.broadcastRepo.update(id, { status: BroadcastStatus.PAUSED });
  }

  async cancel(id: string, tenantId: string): Promise<void> {
    const broadcast = await this.findOne(id, tenantId);
    if (broadcast.status === BroadcastStatus.COMPLETED) {
      throw new BadRequestException('Impossible d\'annuler un broadcast terminé');
    }
    await this.broadcastRepo.update(id, { status: BroadcastStatus.CANCELLED });
  }

  async getStats(id: string, tenantId: string) {
    const broadcast = await this.findOne(id, tenantId);
    const byStatus = await this.recipientRepo
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('r.broadcast_id = :id', { id })
      .groupBy('r.status')
      .getRawMany<{ status: string; count: string }>();

    return {
      id: broadcast.id,
      name: broadcast.name,
      status: broadcast.status,
      total_count: broadcast.total_count,
      sent_count: broadcast.sent_count,
      delivered_count: broadcast.delivered_count,
      read_count: broadcast.read_count,
      failed_count: broadcast.failed_count,
      byStatus,
      progress: broadcast.total_count > 0
        ? Math.round((broadcast.sent_count / broadcast.total_count) * 100)
        : 0,
    };
  }

  async getRecipients(
    id: string,
    tenantId: string,
    statusFilter?: RecipientStatus,
    limit = 100,
    offset = 0,
  ): Promise<{ recipients: WhatsappBroadcastRecipient[]; total: number }> {
    await this.findOne(id, tenantId); // vérif tenant

    const where: any = { broadcast_id: id };
    if (statusFilter) where.status = statusFilter;

    const [recipients, total] = await this.recipientRepo.findAndCount({
      where,
      take: limit,
      skip: offset,
      order: { createdAt: 'ASC' },
    });

    return { recipients, total };
  }

  // ─── Helpers privés ──────────────────────────────────────────────────────────

  private async enqueueBatches(
    broadcastId: string,
    tenantId: string,
    channelId: string,
    templateId: string,
  ): Promise<void> {
    const pendingRecipients = await this.recipientRepo.find({
      where: { broadcast_id: broadcastId, status: RecipientStatus.PENDING },
    });

    for (let i = 0; i < pendingRecipients.length; i += BATCH_SIZE) {
      const batch = pendingRecipients.slice(i, i + BATCH_SIZE);
      await this.broadcastQueue.add(
        'send-batch',
        {
          broadcastId,
          tenantId,
          channelId,
          templateId,
          recipientIds: batch.map((r) => r.id),
        },
        {
          // Délai de 1s entre chaque batch pour respecter le rate-limit Meta (1000/min)
          delay: Math.floor(i / BATCH_SIZE) * 1000,
          attempts: 2,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
    }

    this.logger.log(
      `Broadcast ${broadcastId}: ${pendingRecipients.length} destinataires → ${Math.ceil(pendingRecipients.length / BATCH_SIZE)} batches`,
    );
  }

  private normalizePhone(phone: string): string | null {
    // Accepte E.164 (+33612345678) ou local avec code pays
    const cleaned = phone.replace(/\s/g, '').replace(/[^\d+]/g, '');
    if (cleaned.length < 8 || cleaned.length > 16) return null;
    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  }
}
