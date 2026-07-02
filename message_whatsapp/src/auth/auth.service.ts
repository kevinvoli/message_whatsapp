import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { WhatsappCommercialService } from '../whatsapp_commercial/whatsapp_commercial.service';
import { WhatsappCommercial } from '../whatsapp_commercial/entities/user.entity';
import { AuthUser } from './shared/base-auth-user.types';
import { BaseAuthService, UserLookupService } from './shared/base-auth.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { RefreshToken } from './entities/refresh-token.entity';

@Injectable()
export class AuthService extends BaseAuthService<AuthUser, WhatsappCommercial> {
  constructor(
    private readonly usersService: WhatsappCommercialService,
    private readonly systemConfig: SystemConfigService,
    jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
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
      tokenVersion: user.tokenVersion,
    };
  }

  protected override buildPayload(user: AuthUser): Record<string, unknown> {
    return {
      ...super.buildPayload(user),
      posteId: user.posteId,
      tokenVersion: user.tokenVersion,
    };
  }

  async loginAndStoreRefresh(user: AuthUser): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.buildPayload(user);

    const accessExpiry =
      process.env.FF_SHORT_JWT_EXPIRY === 'true'
        ? '15m'
        : this.tokenConfig.accessTokenExpiry;

    const accessToken = this.jwtService.sign(payload, { expiresIn: accessExpiry } as JwtSignOptions);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.tokenConfig.refreshTokenExpiry,
    } as JwtSignOptions);

    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({ tokenHash, commercialId: user.id, expiresAt, revokedAt: null }),
    );

    return { accessToken, refreshToken };
  }

  async findUserById(userId: string): Promise<AuthUser | null> {
    const user = await this.usersService.findOneWithPoste(userId);
    if (!user) return null;
    return this.toAuthUser(user as WhatsappCommercial);
  }

  async getProfile(userId: string): Promise<AuthUser | null> {
    const user = await this.usersService.findOneById(userId);
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      posteId: user.poste?.id ?? null,
      tokenVersion: user.tokenVersion,
    };
  }
}
