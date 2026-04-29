import { Inject, Injectable } from '@nestjs/common';
import { DataSource, MoreThan } from 'typeorm';
import { ORDER_DB_AVAILABLE, ORDER_DB_DATA_SOURCE } from './order-db.constants';
import {
  OrderCallLog,
  ORDER_CALL_TYPE_MISSED,
} from 'src/order-read/entities/order-call-log.entity';
import { OrderCommand } from 'src/order-read/entities/order-command.entity';
import {
  GicopUser,
  GIOCOP_USER_TYPE_CLIENT,
} from 'src/order-read/entities/giocop-user.entity';

export interface CallLogCursorQuery {
  since: Date;
  lastId: string;
  batchSize: number;
}

export interface CancelledOrderRow {
  idClient: number;
  lastOrderDate: string;
  motifAnnulation: string | null;
}

export interface OrderDateRow {
  idClient: number;
  lastOrderDate: string;
}

@Injectable()
export class OrderDbRepository {
  constructor(
    @Inject(ORDER_DB_DATA_SOURCE)
    private readonly orderDb: DataSource | null,

    @Inject(ORDER_DB_AVAILABLE)
    private readonly dbAvailable: boolean,
  ) {}

  isAvailable(): boolean {
    return this.dbAvailable && this.orderDb !== null;
  }

  async findCallLogsAfterCursor(
    query: CallLogCursorQuery,
  ): Promise<OrderCallLog[]> {
    if (!this.orderDb) return [];

    return this.orderDb
      .getRepository(OrderCallLog)
      .createQueryBuilder('c')
      .where(
        '(c.call_timestamp > :since OR (c.call_timestamp = :since AND c.id > :lastId))',
        { since: query.since, lastId: query.lastId },
      )
      .orderBy('c.call_timestamp', 'ASC')
      .addOrderBy('c.id', 'ASC')
      .take(query.batchSize)
      .getMany();
  }

  async findMissedCallsSince(
    localNumber: string,
    since: Date,
    limit = 50,
  ): Promise<OrderCallLog[]> {
    if (!this.orderDb) return [];

    return this.orderDb.getRepository(OrderCallLog).find({
      where: {
        localNumber,
        callType:      ORDER_CALL_TYPE_MISSED,
        callTimestamp: MoreThan(since),
      },
      order: { callTimestamp: 'DESC' },
      take:  limit,
    });
  }

  async countMissedCallsSince(localNumber: string, since: Date): Promise<number> {
    if (!this.orderDb) return 0;

    return this.orderDb.getRepository(OrderCallLog).count({
      where: {
        localNumber,
        callType:      ORDER_CALL_TYPE_MISSED,
        callTimestamp: MoreThan(since),
      },
    });
  }

  async findClientByPhone(phoneNormalized: string): Promise<GicopUser | null> {
    if (!this.orderDb) return null;

    return this.orderDb
      .getRepository(GicopUser)
      .createQueryBuilder('u')
      .where('u.type = :type', { type: GIOCOP_USER_TYPE_CLIENT })
      .andWhere('(u.phone = :phone OR u.phone2 = :phone)', { phone: phoneNormalized })
      .andWhere('u.valid = 1')
      .select(['u.id'])
      .getOne();
  }

  async findLatestOrderByClient(clientIdDb2: number): Promise<OrderCommand | null> {
    if (!this.orderDb) return null;

    return this.orderDb
      .getRepository(OrderCommand)
      .createQueryBuilder('c')
      .where('c.idClient = :clientIdDb2', { clientIdDb2 })
      .andWhere('c.valid = 1')
      .orderBy('c.dateEnreg', 'DESC')
      .limit(1)
      .getOne();
  }

  async findCancelledOrdersByCommercial(
    idCommercial: number,
    limit = 50,
  ): Promise<CancelledOrderRow[]> {
    if (!this.orderDb) return [];

    return this.orderDb
      .getRepository(OrderCommand)
      .createQueryBuilder('c')
      .select('c.id_client', 'idClient')
      .addSelect('MAX(c.date_annulation)', 'lastOrderDate')
      .addSelect('MAX(c.motif_annulation)', 'motifAnnulation')
      .where('c.id_commercial = :idCommercial', { idCommercial })
      .andWhere('c.valid = 1')
      .andWhere('c.true_cancel = 1')
      .andWhere('c.id_client IS NOT NULL')
      .groupBy('c.id_client')
      .orderBy('lastOrderDate', 'DESC')
      .limit(limit)
      .getRawMany<CancelledOrderRow>();
  }

  async findOrdersWithoutDeliveryByCommercial(
    idCommercial: number,
    limit = 50,
  ): Promise<OrderDateRow[]> {
    if (!this.orderDb) return [];

    return this.orderDb
      .getRepository(OrderCommand)
      .createQueryBuilder('c')
      .select('c.id_client', 'idClient')
      .addSelect('MAX(c.date_enreg)', 'lastOrderDate')
      .where('c.id_commercial = :idCommercial', { idCommercial })
      .andWhere('c.valid = 1')
      .andWhere('c.true_cancel = 0')
      .andWhere('c.is_order_confirmed = 1')
      .andWhere('c.date_livree IS NULL')
      .andWhere('c.is_on_temp = 0')
      .andWhere('c.id_client IS NOT NULL')
      .groupBy('c.id_client')
      .orderBy('lastOrderDate', 'DESC')
      .limit(limit)
      .getRawMany<OrderDateRow>();
  }

  async findDormantClientsByCommercial(
    idCommercial: number,
    cutoff: Date,
    limit = 50,
  ): Promise<OrderDateRow[]> {
    if (!this.orderDb) return [];

    return this.orderDb
      .getRepository(OrderCommand)
      .createQueryBuilder('c')
      .select('c.id_client', 'idClient')
      .addSelect('MAX(c.date_enreg)', 'lastOrderDate')
      .where('c.id_commercial = :idCommercial', { idCommercial })
      .andWhere('c.valid = 1')
      .andWhere('c.true_cancel = 0')
      .andWhere('c.id_client IS NOT NULL')
      .groupBy('c.id_client')
      .having('MAX(c.date_enreg) < :cutoff', { cutoff })
      .orderBy('lastOrderDate', 'ASC')
      .limit(limit)
      .getRawMany<OrderDateRow>();
  }
}
