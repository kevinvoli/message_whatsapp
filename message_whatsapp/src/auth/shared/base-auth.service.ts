import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { BaseAuthUser } from './base-auth-user.types';

export interface AuthenticableEntity {
  validatePassword(password: string): Promise<boolean>;
}

export interface UserLookupService<TEntity extends AuthenticableEntity> {
  findOneByEmailWithPassword(email: string): Promise<TEntity | null>;
}

export interface AuthTokenConfig {
  accessTokenExpiry: number | string;
  refreshTokenExpiry: number | string;
}

export abstract class BaseAuthService<
  TUser extends BaseAuthUser,
  TEntity extends AuthenticableEntity,
> {
  constructor(
    protected readonly jwtService: JwtService,
    protected readonly tokenConfig: AuthTokenConfig,
  ) {}

  protected abstract getUserService(): UserLookupService<TEntity>;
  protected abstract toAuthUser(entity: TEntity): TUser;

  async validate(email: string, password: string): Promise<TUser | null> {
    const entity =
      await this.getUserService().findOneByEmailWithPassword(email);
    if (!entity) return null;

    const isValid = await entity.validatePassword(password);
    if (!isValid) return null;

    return this.toAuthUser(entity);
  }

  login(user: TUser): { accessToken: string; refreshToken: string } {
    const payload = this.buildPayload(user);

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.tokenConfig.accessTokenExpiry,
    } as JwtSignOptions);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: this.tokenConfig.refreshTokenExpiry,
    } as JwtSignOptions);

    return { accessToken, refreshToken };
  }

  protected buildPayload(user: TUser): Record<string, unknown> {
    return {
      sub: user.id,
      email: user.email,
      name: user.name,
    };
  }
}
