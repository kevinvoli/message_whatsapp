import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { GdprOptout, OptOutReason } from './entities/gdpr-optout.entity';
import { RegisterOptOutDto } from './dto/register-optout.dto';

@Injectable()
export class GdprOptoutService {
  private readonly logger = new Logger(GdprOptoutService.name);

  constructor(
    @InjectRepository(GdprOptout)
    private readonly repo: Repository<GdprOptout>,
  ) {}

  /**
   * Enregistre un opt-out. Idempotent : si déjà actif, ne lève pas d'exception.
   */
  async register(dto: RegisterOptOutDto): Promise<GdprOptout> {
    const existing = await this.repo.findOne({
      where: {
        tenant_id: dto.tenant_id,
        phone_number: dto.phone_number,
        revoked_at: IsNull(),
      },
    });

    if (existing) {
      this.logger.warn(
        `Opt-out déjà actif pour ${dto.phone_number} (tenant ${dto.tenant_id})`,
      );
      return existing;
    }

    const entity = this.repo.create({
      ...dto,
      reason: dto.reason ?? OptOutReason.USER_REQUEST,
    });

    const saved = await this.repo.save(entity);
    this.logger.log(
      `Opt-out enregistré: ${dto.phone_number} (tenant ${dto.tenant_id}) — motif: ${saved.reason}`,
    );
    return saved;
  }

  /**
   * Vérifie si un numéro est opt-out actif pour un tenant.
   * Utilisé dans InboundMessageService pour bloquer le traitement.
   */
  async isOptedOut(tenantId: string, phoneNumber: string): Promise<boolean> {
    const count = await this.repo.count({
      where: {
        tenant_id: tenantId,
        phone_number: phoneNumber,
        revoked_at: IsNull(),
      },
    });
    return count > 0;
  }

  /**
   * Révoque un opt-out (droit à la rétractation / opt-in de nouveau).
   */
  async revoke(
    tenantId: string,
    phoneNumber: string,
    revokedBy: string,
  ): Promise<GdprOptout> {
    const entity = await this.repo.findOne({
      where: {
        tenant_id: tenantId,
        phone_number: phoneNumber,
        revoked_at: IsNull(),
      },
    });

    if (!entity) {
      throw new NotFoundException(
        `Aucun opt-out actif pour ${phoneNumber} (tenant ${tenantId})`,
      );
    }

    entity.revoked_at = new Date();
    entity.revoked_by = revokedBy;
    const saved = await this.repo.save(entity);
    this.logger.log(
      `Opt-out révoqué: ${phoneNumber} (tenant ${tenantId}) par ${revokedBy}`,
    );
    return saved;
  }

  /**
   * Liste tous les opt-outs actifs d'un tenant (pour l'export RGPD admin).
   */
  async findAll(tenantId: string, includeRevoked = false): Promise<GdprOptout[]> {
    const where: any = { tenant_id: tenantId };
    if (!includeRevoked) where.revoked_at = IsNull();
    return this.repo.find({ where, order: { optedOutAt: 'DESC' } });
  }

  /**
   * Suppression définitive (droit à l'oubli) — ne garde que l'entrée anonymisée.
   */
  async anonymize(tenantId: string, phoneNumber: string): Promise<void> {
    const entity = await this.repo.findOne({
      where: { tenant_id: tenantId, phone_number: phoneNumber },
    });
    if (!entity) return;

    // Anonymisation : on remplace le numéro par un hash non réversible
    await this.repo.update(entity.id, {
      phone_number: `ANONYMIZED_${entity.id.substring(0, 8)}`,
      notes: 'Anonymisé suite au droit à l\'oubli',
      registered_by: null,
      revoked_by: null,
    });

    this.logger.log(`Numéro anonymisé: ${phoneNumber} (tenant ${tenantId})`);
  }
}
