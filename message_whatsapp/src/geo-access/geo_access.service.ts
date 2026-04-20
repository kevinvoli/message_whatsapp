import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AllowedLocation } from './entities/allowed_location.entity';

export interface CreateLocationDto {
  label: string;
  latitude: number;
  longitude: number;
  radius_km?: number;
}

@Injectable()
export class GeoAccessService {
  constructor(
    @InjectRepository(AllowedLocation)
    private readonly repo: Repository<AllowedLocation>,
  ) {}

  findAll(): Promise<AllowedLocation[]> {
    return this.repo.find({ where: { deletedAt: IsNull() }, order: { createdAt: 'ASC' } });
  }

  create(dto: CreateLocationDto): Promise<AllowedLocation> {
    return this.repo.save(this.repo.create({ ...dto, radius_km: dto.radius_km ?? 200 }));
  }

  async update(id: string, dto: Partial<CreateLocationDto>): Promise<AllowedLocation> {
    await this.repo.update(id, dto);
    return this.repo.findOneOrFail({ where: { id } });
  }

  async remove(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  /**
   * Vérifie que la position (lat, lng) est dans le rayon d'au moins
   * une zone autorisée. Si aucune zone n'est définie, l'accès est libre.
   * Lance ForbiddenException si hors zone.
   */
  async assertPositionAllowed(lat: number, lng: number): Promise<void> {
    const zones = await this.findAll();
    if (zones.length === 0) return; // pas de restriction configurée

    const inRange = zones.some((z) => {
      const dist = this.haversineKm(lat, lng, Number(z.latitude), Number(z.longitude));
      return dist <= z.radius_km;
    });

    if (!inRange) {
      throw new ForbiddenException(
        'Connexion refusée : votre position géographique ne correspond à aucune zone autorisée.',
      );
    }
  }

  /** Formule Haversine — distance en km entre deux coordonnées */
  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
