import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface BusinessHoursRow {
  day_of_week: number;
  open_hour: number;
  open_minute: number;
  close_hour: number;
  close_minute: number;
  is_open: boolean | number;
}

@Injectable()
export class BusinessHoursService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Retourne true si l'heure actuelle est dans les horaires d'ouverture.
   * Utilise la table business_hours_config (conservée de l'ancien système).
   * Si la table est absente ou vide pour ce jour → considère ouvert (fail-open).
   */
  async isCurrentlyOpen(): Promise<boolean> {
    try {
      const hasTable = await this.tableExists();
      if (!hasTable) return true;

      const now = new Date();
      const dayOfWeek = now.getDay(); // 0=Dim … 6=Sam

      const rows: BusinessHoursRow[] = await this.ds.query(
        'SELECT * FROM `business_hours_config` WHERE `day_of_week` = ? LIMIT 1',
        [dayOfWeek],
      );

      if (!rows.length) return true;

      const row = rows[0];
      if (!row.is_open) return false;

      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const openMinutes  = Number(row.open_hour)  * 60 + Number(row.open_minute ?? 0);
      const closeMinutes = Number(row.close_hour) * 60 + Number(row.close_minute ?? 0);

      return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
    } catch {
      return true; // fail-open : en cas d'erreur, ne pas bloquer l'envoi
    }
  }

  private async tableExists(): Promise<boolean> {
    const rows = await this.ds.query(
      "SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'business_hours_config'",
    );
    return Number(rows[0]?.cnt ?? 0) > 0;
  }
}
