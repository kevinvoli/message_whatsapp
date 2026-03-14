// src/admin/admin.service.ts
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from './entities/admin.entity';
import * as bcrypt from 'bcrypt';

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

  async findOneById(id: string): Promise<Admin | null> {
    return this.adminRepository.findOne({ where: { id } });
  }

  async updateProfile(id: string, name: string, email: string): Promise<Admin> {
    await this.adminRepository.update(id, { name, email });
    return this.adminRepository.findOneOrFail({ where: { id } });
  }

  async updatePassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const admin = await this.adminRepository
      .createQueryBuilder('admin')
      .addSelect(['admin.password', 'admin.salt'])
      .where('admin.id = :id', { id })
      .getOne();

    if (!admin) throw new InternalServerErrorException('Admin not found');

    const valid = await bcrypt.compare(currentPassword, admin.password);
    if (!valid) throw new InternalServerErrorException('Mot de passe actuel incorrect');

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);
    await this.adminRepository.update(id, { password: hashed, salt });
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
