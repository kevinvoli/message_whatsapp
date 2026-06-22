import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Query,
  UnauthorizedException,
  ForbiddenException,
  Res,
  BadRequestException,
  DefaultValuePipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './shared/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { Response, Request as ExpressRequest } from 'express';

interface JwtUser {
  userId: string;
  email: string;
  posteId: string | null;
  isWorkingToday: boolean;
  absentToday: boolean;
  isReplacing: boolean;
}

interface AuthenticatedRequest extends ExpressRequest {
  user: JwtUser;
}
import { Throttle } from '@nestjs/throttler';
import { CommercialSessionService } from 'src/commercial-session/commercial_session.service';
import { GeoAccessService } from 'src/geo-access/geo_access.service';
import { LoginLogService } from './login-log.service';
import { CommercialStatsService } from 'src/whatsapp_commercial/commercial-stats.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly sessionService: CommercialSessionService,
    private readonly geoAccessService: GeoAccessService,
    private readonly loginLogService: LoginLogService,
    private readonly commercialStatsService: CommercialStatsService,
  ) {}

  // P1.4 — Brute force protection : max 10 tentatives / 15 min par IP
  @Throttle({ default: { ttl: 900_000, limit: 10 } })
  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Request() req: ExpressRequest,
  ) {
    // 4.10 — Restriction géographique
    const zones = await this.geoAccessService.findAll();
    if (zones.length > 0) {
      if (loginDto.latitude == null || loginDto.longitude == null) {
        throw new ForbiddenException(
          'Votre position géographique est requise pour vous connecter.',
        );
      }
      await this.geoAccessService.assertPositionAllowed(
        loginDto.latitude,
        loginDto.longitude,
      );
    }

    const user = await this.authService.validate(
      loginDto.email,
      loginDto.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken, refreshToken } = this.authService.login(user);

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

    // 4.9 — Logger la session de travail
    void this.sessionService.openSession(user.id, user.name).catch(() => {});

    // E10-T04 — Journal des connexions
    void this.loginLogService.record({
      userId:   user.id,
      userName: user.name,
      posteId:  user.posteId ?? null,
      ip:       LoginLogService.extractIp(req),
      device:   LoginLogService.extractDevice(req),
    }).catch(() => {});

    return { user, accessToken };
  }

  @Throttle({ default: { ttl: 900_000, limit: 20 } })
  @Post('auto-login')
  async autoLogin(
    @Body() body: { username: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.username) {
      throw new BadRequestException('username requis');
    }

    const user = await this.authService.autoLogin(body.username.trim());

    if (!user) {
      throw new UnauthorizedException('Commercial introuvable');
    }

    const { accessToken, refreshToken } = this.authService.login(user);
    

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

    void this.sessionService.openSession(user.id, user.name).catch(() => {});

    return { user, accessToken };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me/stats')
  async getMyStats(
    @Request() req: AuthenticatedRequest,
    @Query('periode') periode = 'today',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.commercialStatsService.getStats(req.user.userId, periode, dateFrom, dateTo);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile')
  async getProfile(
    @Request() req: AuthenticatedRequest,
    @Query('tenant_id', new DefaultValuePipe('default')) tenantId: string,
  ) {
    const user = await this.authService.getProfile(req.user.userId, tenantId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  async logout(@Request() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    // 4.9 — Fermer la session de travail
    if (req.user?.userId) {
      void this.sessionService.closeSession(req.user.userId).catch(() => {});
    }
    res.clearCookie('Authentication');
    res.clearCookie('Refresh');
    return { message: 'Successfully logged out' };
  }
}
