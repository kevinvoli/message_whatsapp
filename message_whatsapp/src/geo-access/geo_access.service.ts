import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AllowedLocation } from './entities/allowed_location.entity';
import { WhatsappPoste } from '../whatsapp_poste/entities/whatsapp_poste.entity';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';

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
    @InjectRepository(WhatsappPoste)
    private readonly posteRepo: Repository<WhatsappPoste>,
    @InjectRepository(WhatsappCommercial)
    private readonly commercialRepo: Repository<WhatsappCommercial>,
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

  async isExempt(commercialId: string | null, posteId: string | null): Promise<boolean> {
    if (commercialId) {
      const commercial = await this.commercialRepo.findOne({ where: { id: commercialId } });
      if (commercial?.ipRestrictionExempt) return true;
    }
    if (posteId) {
      const poste = await this.posteRepo.findOne({ where: { id: posteId } });
      if (poste?.ipRestrictionExempt) return true;
    }
    return false;
  }

  async setPosteExempt(id: string, exempt: boolean): Promise<{ id: string; exempt: boolean }> {
    const poste = await this.posteRepo.findOne({ where: { id } });
    if (!poste) throw new NotFoundException(`Poste ${id} introuvable`);
    await this.posteRepo.update(id, { ipRestrictionExempt: exempt });
    return { id, exempt };
  }

  async setCommercialExempt(id: string, exempt: boolean): Promise<{ id: string; exempt: boolean }> {
    const commercial = await this.commercialRepo.findOne({ where: { id } });
    if (!commercial) throw new NotFoundException(`Commercial ${id} introuvable`);
    await this.commercialRepo.update(id, { ipRestrictionExempt: exempt });
    return { id, exempt };
  }

  /**
   * TODO métier : aucun stockage de plages IP/CIDR n'existe dans le système.
   * Le mécanisme de restriction actuel est géographique (lat/lng/rayon).
   * Pour activer une vraie restriction IP, il faudra créer une entité AllowedIpRange
   * (CIDR ou plage) et implémenter la vérification ici.
   * En attendant cette décision métier, toutes les IPs sont autorisées.
   */
  async isIpAllowed(_ip: string): Promise<boolean> {
    return true;
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
