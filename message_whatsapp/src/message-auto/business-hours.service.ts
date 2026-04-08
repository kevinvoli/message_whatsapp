import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessHoursConfig } from './entities/business-hours-config.entity';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateBusinessHoursDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  openHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  openMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  closeHour?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  closeMinute?: number;

  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}

@Injectable()
export class BusinessHoursService {
  constructor(
    @InjectRepository(BusinessHoursConfig)
    private readonly repo: Repository<BusinessHoursConfig>,
  ) {}

  getAll(): Promise<BusinessHoursConfig[]> {
    return this.repo.find({ order: { dayOfWeek: 'ASC' } });
  }

  async updateDay(dayOfWeek: number, dto: UpdateBusinessHoursDto): Promise<BusinessHoursConfig> {
    const entry = await this.repo.findOne({ where: { dayOfWeek } });
    if (!entry) {
      throw new NotFoundException(`Aucune configuration pour le jour ${dayOfWeek}`);
    }
    if (dto.openHour !== undefined)   entry.openHour   = dto.openHour;
    if (dto.openMinute !== undefined) entry.openMinute = dto.openMinute;
    if (dto.closeHour !== undefined)  entry.closeHour  = dto.closeHour;
    if (dto.closeMinute !== undefined) entry.closeMinute = dto.closeMinute;
    if (dto.isOpen !== undefined)     entry.isOpen     = dto.isOpen;
    return this.repo.save(entry);
  }

  /**
   * Vérifie si l'heure actuelle tombe dans la plage d'ouverture configurée.
   */
  async isCurrentlyOpen(): Promise<boolean> {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Dim … 6=Sam
    const entry = await this.repo.findOne({ where: { dayOfWeek } });

    if (!entry || !entry.isOpen) return false;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const openMinutes    = entry.openHour  * 60 + entry.openMinute;
    const closeMinutes   = entry.closeHour * 60 + entry.closeMinute;

    return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }
}
