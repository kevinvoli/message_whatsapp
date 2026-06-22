import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WhatsappCommercialService } from '../whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';
import { AuthUser } from './shared/base-auth-user.types';
import { BaseAuthService, UserLookupService } from './shared/base-auth.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { RbacService } from '../rbac/rbac.service';
import { Permission } from '../rbac/entities/role.entity';

export interface AuthProfileResponse extends AuthUser {
  rbacEnabled: boolean;
  permissions: Permission[];
}

@Injectable()
export class AuthService extends BaseAuthService<AuthUser, WhatsappCommercial> {
  constructor(
    private readonly usersService: WhatsappCommercialService,
    jwtService: JwtService,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly rbacService: RbacService,
  ) {
    super(jwtService, { accessTokenExpiry: '7d', refreshTokenExpiry: '7d' });
  }

  protected getUserService(): UserLookupService<WhatsappCommercial> {
    return this.usersService;
  }

  protected toAuthUser(user: WhatsappCommercial): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      posteId: user.poste?.id ?? null,
    };
  }

  protected override buildPayload(user: AuthUser): Record<string, unknown> {
    return {
      ...super.buildPayload(user),
      posteId: user.posteId,
    };
  }

  async autoLogin(token: string): Promise<AuthUser | null> {
    const user = await this.usersService.findOneByAutoLoginToken(token);
    if (!user) return null;
    return this.toAuthUser(user);
  }

  async getProfile(userId: string, tenantId: string): Promise<AuthProfileResponse | null> {
    const user = await this.usersService.findOneWithPoste(userId);
    if (!user) return null;

    const authUser = this.toAuthUser(user);
    const rbacEnabled = await this.platformSettingsService.isEnabled('rbac_enabled');
    const permissions = rbacEnabled
      ? await this.rbacService.getPermissions(userId, tenantId)
      : [];

    return { ...authUser, rbacEnabled, permissions };
  }
}
