// src/admin/admin.service.ts
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
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
    return this.adminRepository.createQueryBuilder('admin')
      .addSelect(['admin.password', 'admin.salt'])
      .where('admin.email = :email', { email })
      .getOne();
  }

  async ensureAdminUserExists(): Promise<void> {
    const adminEmail = 'admin@admin.com';
    const adminName = 'Admin';
    const adminPassword = 'adminpassword';

    const existingAdmin = await this.findOneByEmail(adminEmail);

    if (existingAdmin) {
      console.log('✅ Admin user already exists.');
      return;
    }

    console.log('🔧 Creating default admin user...');
    const admin = this.adminRepository.create({
      email: adminEmail,
      name: adminName,
      password: adminPassword,
    });
    await this.adminRepository.save(admin);
    console.log('🎉 Default admin user created successfully.');
  }
}
