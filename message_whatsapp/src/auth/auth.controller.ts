import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  UnauthorizedException,
  Res,
  Query,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './shared/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { Response, Request as ExpressRequest } from 'express';
import { createHash } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtCommercialPayload } from './shared/base-auth-user.types';
import { Throttle } from '@nestjs/throttler';
import { ConnectionLogService } from 'src/connection-log/connection-log.service';
import { CommercialStatsService } from 'src/whatsapp_commercial/commercial-stats.service';
import { WhatsappCommercialService } from 'src/whatsapp_commercial/whatsapp_commercial.service';
import { DispatchSettingsService } from 'src/dispatcher/services/dispatch-settings.service';
import { WhapiChannel } from 'src/channel/entities/channel.entity';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly connectionLogService: ConnectionLogService,
    private readonly commercialStatsService: CommercialStatsService,
    private readonly dispatchSettingsService: DispatchSettingsService,
    private readonly commercialService: WhatsappCommercialService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(WhapiChannel)
    private readonly channelRepository: Repository<WhapiChannel>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validate(
      loginDto.email,
      loginDto.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = await this.authService.loginAndStoreRefresh(user);

    void this.connectionLogService.logLogin(user.id, 'commercial');

    res.cookie('Authentication', accessToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    res.cookie('Refresh', refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return { user, accessToken };
  }

  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('refresh')
  async refresh(
    @Request() req: ExpressRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies?.['Refresh'] as string | undefined;
    if (!rawToken) {
      throw new UnauthorizedException('Refresh token manquant');
    }

    let payload: JwtCommercialPayload;
    try {
      payload = this.jwtService.verify<JwtCommercialPayload>(rawToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }

    const hash = createHash('sha256').update(rawToken).digest('hex');
    const tokenRecord = await this.refreshTokenRepo.findOne({
      where: { tokenHash: hash, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Refresh token révoqué ou expiré');
    }

    tokenRecord.revokedAt = new Date();
    await this.refreshTokenRepo.save(tokenRecord);

    const user = await this.authService.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    const { accessToken, refreshToken } = await this.authService.loginAndStoreRefresh(user);

    res.cookie('Authentication', accessToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    res.cookie('Refresh', refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return { ok: true };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me/settings')
  async getMySettings(@Request() req) {
    const s = await this.dispatchSettingsService.getSettings();

    const posteId: string | undefined = req.user?.posteId;
    const hasDedicatedChannel = posteId
      ? (await this.channelRepository.count({ where: { poste_id: posteId } })) > 0
      : false;

    return {
      readCooldownSeconds:   s.readCooldownSeconds   ?? 120,
      idleDisconnectMinutes: s.idleDisconnectMinutes  ?? 15,
      idleWarningSeconds:    s.idleWarningSeconds     ?? 10,
      hasDedicatedChannel,
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me/stats')
  async getMyStats(
    @Request() req,
    @Query('periode') periode = 'today',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.commercialStatsService.getStats(req.user.userId, periode, dateFrom, dateTo);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  async getProfile(@Request() req) {
    const user = await this.authService.getProfile(req.user.userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  async logout(
    @Request() req: ExpressRequest & { user: { userId: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    void this.connectionLogService.logLogout(req.user.userId, 'commercial');
    void this.commercialService.incrementTokenVersion(req.user.userId).catch(() => {});

    const rawToken = req.cookies?.['Refresh'] as string | undefined;
    if (rawToken) {
      const hash = createHash('sha256').update(rawToken).digest('hex');
      void this.refreshTokenRepo.update(
        { tokenHash: hash, revokedAt: IsNull() },
        { revokedAt: new Date() },
      ).catch(() => {});
    }

    res.clearCookie('Authentication');
    res.clearCookie('Refresh');
    return { message: 'Successfully logged out' };
  }
}
