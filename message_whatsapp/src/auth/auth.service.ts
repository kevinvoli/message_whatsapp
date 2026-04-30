import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WhatsappCommercialService } from '../whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';
import { AuthUser } from './shared/base-auth-user.types';
import { BaseAuthService, UserLookupService } from './shared/base-auth.service';
import { SystemConfigService } from '../system-config/system-config.service';

@Injectable()
export class AuthService extends BaseAuthService<AuthUser, WhatsappCommercial> {
  constructor(
    private readonly usersService: WhatsappCommercialService,
    private readonly systemConfig: SystemConfigService,
    jwtService: JwtService,
  ) {
    super(jwtService, { accessTokenExpiry: '7d', refreshTokenExpiry: '7d' });
  }

  protected getUserService(): UserLookupService<WhatsappCommercial> {
    return this.usersService;
  }

  override async validate(email: string, password: string): Promise<AuthUser | null> {
    const entity = await this.usersService.findOneByEmailWithPassword(email);
    if (!entity) return null;

    const isValid = await entity.validatePassword(password);
    if (!isValid) return null;

    const [startRaw, endRaw] = await Promise.all([
      this.systemConfig.get('LOGIN_HOUR_START'),
      this.systemConfig.get('LOGIN_HOUR_END'),
    ]);
    const startHour = parseInt(startRaw ?? '5',  10);
    const endHour   = parseInt(endRaw   ?? '21', 10);

    const hour = new Date().getHours();
    const outsideHours = hour >= endHour || hour < startHour;
    if (outsideHours && !entity.allowOutsideHours) {
      throw new UnauthorizedException(
        `Connexion refusée — hors des heures de travail (${startHour}h–${endHour}h)`,
      );
    }

    return this.toAuthUser(entity);
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

  async getProfile(userId: string): Promise<AuthUser | null> {
    const user = await this.usersService.findOneById(userId);
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      posteId: user.poste?.id ?? null,
    };
  }
}
