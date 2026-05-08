import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CallDevice } from './entities/call-device.entity';

export interface UpdateCallDeviceDto {
  label?: string | null;
  posteId?: string | null;
}

@Injectable()
export class CallDeviceService {
  private readonly logger = new Logger(CallDeviceService.name);

  constructor(
    @InjectRepository(CallDevice)
    private readonly callDeviceRepo: Repository<CallDevice>,
  ) {}

  /** Retourne tous les appareils connus, triés par last_seen DESC. */
  async findAll(): Promise<CallDevice[]> {
    return this.callDeviceRepo.find({
      order: { lastSeen: 'DESC' },
    });
  }

  /**
   * Met a jour le label et/ou le poste associe a un device.
   * Cree l entree si elle n existe pas encore.
   */
  async updateDevice(deviceId: string, dto: UpdateCallDeviceDto): Promise<CallDevice> {
    const device = await this.callDeviceRepo.findOne({ where: { deviceId } });
    if (!device) {
      throw new NotFoundException(`Device introuvable : ${deviceId}`);
    }

    if (dto.label !== undefined) device.label   = dto.label ?? null;
    if (dto.posteId !== undefined) device.posteId = dto.posteId ?? null;

    const saved = await this.callDeviceRepo.save(device);
    this.logger.log(`CallDevice mis a jour deviceId=${deviceId} posteId=${device.posteId} label=${device.label}`);
    return saved;
  }

  /** Dissocie le poste d un device (poste_id = null). */
  async dissociate(deviceId: string): Promise<CallDevice> {
    const device = await this.callDeviceRepo.findOne({ where: { deviceId } });
    if (!device) {
      throw new NotFoundException(`Device introuvable : ${deviceId}`);
    }

    device.posteId = null;
    const saved = await this.callDeviceRepo.save(device);
    this.logger.log(`CallDevice dissocie deviceId=${deviceId}`);
    return saved;
  }
}
