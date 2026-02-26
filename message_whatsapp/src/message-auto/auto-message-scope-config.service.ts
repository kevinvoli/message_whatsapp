import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AutoMessageScopeConfig,
  AutoMessageScopeType,
} from './entities/auto-message-scope-config.entity';
import { UpsertAutoMessageScopeDto } from './dto/upsert-auto-message-scope.dto';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class AutoMessageScopeConfigService {
  constructor(
    @InjectRepository(AutoMessageScopeConfig)
    private readonly repo: Repository<AutoMessageScopeConfig>,
    private readonly logger: AppLogger,
  ) {}

  /** Récupère tous les overrides, triés par type puis scope_id */
  findAll(): Promise<AutoMessageScopeConfig[]> {
    return this.repo.find({
      order: { scope_type: 'ASC', scope_id: 'ASC' },
    });
  }

  /** Récupère les overrides pour un type donné (poste, canal, provider) */
  findByType(type: AutoMessageScopeType): Promise<AutoMessageScopeConfig[]> {
    return this.repo.find({
      where: { scope_type: type },
      order: { scope_id: 'ASC' },
    });
  }

  /**
   * Crée ou met à jour un override.
   * Si un override existe déjà pour (scope_type, scope_id), il est mis à jour.
   */
  async upsert(dto: UpsertAutoMessageScopeDto): Promise<AutoMessageScopeConfig> {
    const existing = await this.repo.findOne({
      where: { scope_type: dto.scope_type, scope_id: dto.scope_id },
    });

    if (existing) {
      existing.enabled = dto.enabled;
      if (dto.label !== undefined) existing.label = dto.label;
      const saved = await this.repo.save(existing);
      this.logger.log(
        `AutoMessageScope updated: ${dto.scope_type}/${dto.scope_id} → enabled=${dto.enabled}`,
        AutoMessageScopeConfigService.name,
      );
      return saved;
    }

    const created = this.repo.create(dto);
    const saved = await this.repo.save(created);
    this.logger.log(
      `AutoMessageScope created: ${dto.scope_type}/${dto.scope_id} → enabled=${dto.enabled}`,
      AutoMessageScopeConfigService.name,
    );
    return saved;
  }

  /** Supprime un override par son ID (retour au comportement global) */
  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`AutoMessageScopeConfig with ID ${id} not found`);
    }
    this.logger.log(
      `AutoMessageScope removed: id=${id}`,
      AutoMessageScopeConfigService.name,
    );
  }

  /**
   * Vérifie si les messages auto sont autorisés pour un contexte donné.
   *
   * Logique : on charge tous les overrides qui correspondent
   * au poste, au canal ou au provider passés en paramètre.
   * Si l'un d'eux a enabled=false → on retourne false.
   * Si aucun override ne désactive → on retourne true.
   *
   * @param posteId    ID du poste assigné au chat
   * @param channelId  channel_id du dernier message client
   * @param provider   nom du provider ('whapi', 'meta', etc.)
   */
  async isEnabledFor(
    posteId?: string | null,
    channelId?: string | null,
    provider?: string | null,
  ): Promise<boolean> {
    const conditions: { scope_type: AutoMessageScopeType; scope_id: string }[] = [];

    if (posteId) {
      conditions.push({ scope_type: AutoMessageScopeType.POSTE, scope_id: posteId });
    }
    if (channelId) {
      conditions.push({ scope_type: AutoMessageScopeType.CANAL, scope_id: channelId });
    }
    if (provider) {
      conditions.push({ scope_type: AutoMessageScopeType.PROVIDER, scope_id: provider });
    }

    if (conditions.length === 0) {
      return true;
    }

    const overrides = await this.repo.find({ where: conditions });

    const blocked = overrides.find((o) => !o.enabled);
    if (blocked) {
      this.logger.debug(
        `AutoMessage blocked by scope: ${blocked.scope_type}/${blocked.scope_id}`,
        AutoMessageScopeConfigService.name,
      );
      return false;
    }

    return true;
  }
}
