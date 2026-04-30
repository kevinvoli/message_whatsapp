import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WhatsappCommercialService } from '../whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';
import { AuthUser } from './shared/base-auth-user.types';
import { BaseAuthService, UserLookupService } from './shared/base-auth.service';

@Injectable()
export class AuthService extends BaseAuthService<AuthUser, WhatsappCommercial> {
  constructor(
    private readonly usersService: WhatsappCommercialService,
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

    const hour = new Date().getHours();
    if (hour >= 21 || hour < 5) {
      if (!entity.allowOutsideHours) {
        throw new UnauthorizedException(
          'Connexion refusée — hors des heures de travail (5h–21h)',
        );
      }
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
