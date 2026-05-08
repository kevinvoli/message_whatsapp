import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallEvent } from '../entities/call-event.entity';

@Injectable()
export class CallEventService {
  private readonly logger = new Logger(CallEventService.name);

  constructor(
    @InjectRepository(CallEvent)
    private readonly callEventRepo: Repository<CallEvent>,
  ) {}

  /** Historique des appels (admin). */
  async findAll(limit = 50, offset = 0): Promise<[CallEvent[], number]> {
    return this.callEventRepo.findAndCount({
      order: { created_at: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Insère un appel provenant de DB2 dans la table call_event (DB1).
   * INSERT IGNORE via orIgnore() — idempotent sur l'index UNIQUE external_id.
   */
  async ingestFromDb2(params: {
    externalId:      string;
    commercialPhone: string;
    commercialId:    string | null;
    clientPhone:     string;
    callStatus:      string;
    durationSeconds: number;
    eventAt:         Date;
  }): Promise<void> {
    await this.callEventRepo
      .createQueryBuilder()
      .insert()
      .into(CallEvent)
      .values({
        external_id:      params.externalId,
        commercial_phone: params.commercialPhone,
        commercial_id:    params.commercialId,
        client_phone:     params.clientPhone,
        call_status:      params.callStatus,
        duration_seconds: params.durationSeconds,
        event_at:         params.eventAt,
      })
      .orIgnore()
      .execute();
  }
}
