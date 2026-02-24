// src/admin/admin.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from './entities/admin.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
  ) {}

  async findOneByEmail(email: string): Promise<Admin | null> {
    return this.adminRepository.findOne({ where: { email } });
  }

  async findOneByEmailWithPassword(email: string): Promise<Admin | null> {
    return this.adminRepository
      .createQueryBuilder('admin')
      .addSelect(['admin.password', 'admin.salt'])
      .where('admin.email = :email', { email })
      .getOne();
  }

  async ensureAdminUserExists(): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminName = process.env.ADMIN_NAME || 'Admin';
    const adminPassword = process.env.ADMIN_PASSWORD;
    const isProduction = process.env.NODE_ENV === 'production';

    if (!adminEmail || !adminPassword) {
      if (isProduction) {
        throw new InternalServerErrorException(
          'ADMIN_EMAIL and ADMIN_PASSWORD must be set in production',
        );
      }
      return;
    }

    const existingAdmin = await this.findOneByEmail(adminEmail);
    if (existingAdmin) {
      return;
    }

    const admin = this.adminRepository.create({
      email: adminEmail,
      name: adminName,
      password: adminPassword,
    });
    await this.adminRepository.save(admin);
  }
}
