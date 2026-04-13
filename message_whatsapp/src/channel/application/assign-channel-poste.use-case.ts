/**
 * TICKET-05-C — Use case : assignation (ou désassignation) d'un poste à un canal.
 *
 *  - poste_id non null → mode dédié exclusif au poste.
 *  - poste_id null     → retour en mode pool global.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WhapiChannel } from '../entities/channel.entity';
import { WhatsappPoste } from 'src/whatsapp_poste/entities/whatsapp_poste.entity';
import { AppLogger } from 'src/logging/app-logger.service';

@Injectable()
export class AssignChannelPosteUseCase {
  constructor(
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    @InjectRepository(WhatsappPoste)
    private readonly posteRepository: Repository<WhatsappPoste>,
    private readonly logger: AppLogger,
  ) {}

  async execute(channelId: string, posteId: string | null): Promise<WhapiChannel> {
    if (posteId !== null) {
      const poste = await this.posteRepository.findOne({ where: { id: posteId } });
      if (!poste) {
        throw new NotFoundException(`Poste introuvable : ${posteId}`);
      }
    }

    await this.channelRepository.update(
      { channel_id: channelId },
      { poste_id: posteId },
    );

    this.logger.log(
      posteId
        ? `Channel "${channelId}" assigné au poste "${posteId}" (mode dédié)`
        : `Channel "${channelId}" désassigné — retour en mode pool global`,
      AssignChannelPosteUseCase.name,
    );

    const updated = await this.channelRepository.findOne({
      where: { channel_id: channelId },
      relations: ['poste'],
    });
    if (!updated) {
      throw new NotFoundException(`Channel introuvable : ${channelId}`);
    }
    return updated;
  }
}
