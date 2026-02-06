// src/auth_admin/auth_admin.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminService } from '../admin/admin.service';
import { AuthAdminUser } from './types/auth_admin_user.types';
import { LoginAdminDto } from './dto/login_admin.dto';

@Injectable()
export class AuthAdminService {
  constructor(
    private adminService: AdminService,
    private jwtService: JwtService,
  ) {}

  async validateAdmin(email: string, pass: string): Promise<AuthAdminUser | null> {
    const admin = await this.adminService.findOneByEmailWithPassword(email);

    if (!admin) return null;

    const isValid = await admin.validatePassword(pass);
    if (!isValid) return null;

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    };
  }

  login(admin: AuthAdminUser) {
    const payload = {
      sub: admin.id,
      email: admin.email,
      name: admin.name,
    };

    return {
      access_token: this.jwtService.sign(payload),
      admin, // Return admin details
    };
  }

  async getProfile(adminId: string): Promise<AuthAdminUser | null> {
    const admin = await this.adminService.findOneByEmail(adminId);
    if (!admin) return null;

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    };
  }
}
