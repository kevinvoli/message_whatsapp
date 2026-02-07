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

  login(admin: AuthAdminUser): { accessToken: string; refreshToken: string } {
    const payload = {
      sub: admin.id,
      email: admin.email,
      name: admin.name,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' }); // Short-lived access token
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' }); // Long-lived refresh token

    return { accessToken, refreshToken };
  }
  async getProfile(adminId: string): Promise<AuthAdminUser | null> {
    const admin = await this.adminService.findOneByEmail(adminId);
    // console.log("mon administrateur ", admin);
    if (!admin) return null;
    
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    };
  }
}
