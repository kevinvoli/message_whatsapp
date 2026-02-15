import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminService } from '../admin/admin.service';
import { Admin } from '../admin/entities/admin.entity';
import { AuthAdminUser } from '../auth/shared/base-auth-user.types';
import { BaseAuthService, UserLookupService } from '../auth/shared/base-auth.service';

@Injectable()
export class AuthAdminService extends BaseAuthService<AuthAdminUser, Admin> {
  constructor(
    private readonly adminService: AdminService,
    jwtService: JwtService,
  ) {
    super(jwtService, { accessTokenExpiry: '15m', refreshTokenExpiry: '7d' });
  }

  protected getUserService(): UserLookupService<Admin> {
    return this.adminService;
  }

  protected toAuthUser(admin: Admin): AuthAdminUser {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
    };
  }

  async getProfile(email: string): Promise<AuthAdminUser | null> {
    const admin = await this.adminService.findOneByEmail(email);
    if (!admin) return null;

    return this.toAuthUser(admin);
  }
}
